/**
 * Observatory Server
 *
 * WebSocket + HTTP server for spectators to watch games in real-time.
 * Serves the event bus stream to connected clients.
 *
 * Features:
 * - Static frontend serving (public/)
 * - Real-time game state streaming via WebSocket
 * - Private message feed (spectators see all 1-1 comms)
 * - Trust graph heatmap data
 * - REST API for game history and replay
 * - POST /api/simulate to trigger a game simulation
 */

import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { EventBus } from "../core/event-bus.js";
import { ArenaEvent, GameId } from "../core/types.js";
import { TrustGraph } from "../trust/trust-graph.js";
import { createComedyWorldMap } from "../games/nexus/world-map.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SpectatorConnection {
  ws: WebSocket;
  gameFilter: GameId | null;
  connectedAt: number;
}

export class ObservatoryServer {
  private app: express.Application;
  private wss: WebSocketServer | null = null;
  private eventBus: EventBus;
  private trustGraph: TrustGraph;
  private worldTemplate = createComedyWorldMap();
  private spectators: Map<string, SpectatorConnection> = new Map();
  private nextId = 0;
  private simulationRunning = false;

  constructor(eventBus: EventBus, trustGraph: TrustGraph) {
    this.eventBus = eventBus;
    this.trustGraph = trustGraph;
    this.app = express();
    this.setupRoutes();
    this.subscribeToEvents();
  }

  /**
   * Start the observatory server
   */
  start(port: number = 3000): void {
    const server = this.app.listen(port, () => {
      console.log(`Observatory: http://localhost:${port}`);
    });

    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });
  }

  // ============================================================
  // WebSocket handling
  // ============================================================

  private handleConnection(ws: WebSocket, req: any): void {
    const id = `spectator_${this.nextId++}`;
    const gameFilter = new URL(req.url || "/", "http://localhost").searchParams.get("game");

    const connection: SpectatorConnection = {
      ws,
      gameFilter,
      connectedAt: Date.now(),
    };
    this.spectators.set(id, connection);

    console.log(`Spectator connected: ${id}`);

    // Send welcome message with current state
    this.sendToSpectator(id, {
      type: "welcome",
        data: {
          spectatorId: id,
          trustGraph: this.trustGraph.getTrustMatrix(),
          worldMap: {
            id: this.worldTemplate.id,
            name: this.worldTemplate.name,
            assets: this.worldTemplate.assets,
            regions: this.worldTemplate.regions,
            ecosystems: this.worldTemplate.ecosystems.map((ecosystem) => ({
              ...ecosystem,
              health: ecosystem.maxHealth,
              status: "stable",
            })),
          },
          timestamp: Date.now(),
        },
      });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleSpectatorMessage(id, msg);
      } catch {
        // ignore
      }
    });

    ws.on("close", () => {
      this.spectators.delete(id);
    });
  }

  private handleSpectatorMessage(spectatorId: string, msg: any): void {
    switch (msg.type) {
      case "subscribe_game": {
        const conn = this.spectators.get(spectatorId);
        if (conn) conn.gameFilter = msg.gameId;
        break;
      }
      case "get_trust_matrix":
        this.sendToSpectator(spectatorId, {
          type: "trust_matrix",
          data: this.trustGraph.getTrustMatrix(),
        });
        break;
      case "get_trust_snapshots":
        this.sendToSpectator(spectatorId, {
          type: "trust_snapshots",
          data: {
            snapshots: this.trustGraph.getAllSnapshots(),
            readModels: this.trustGraph.getAllReadModels(),
            dossiers: this.trustGraph.getAllTrustDossiers(),
            projections: this.trustGraph.getAllGraduatedProjections(),
            snapshotArtifact: this.trustGraph.getSnapshotArtifact(),
          },
        });
        break;
    }
  }

  // ============================================================
  // Event subscription
  // ============================================================

  private subscribeToEvents(): void {
    this.eventBus.subscribeSpectator((event) => {
      this.broadcastToSpectators(event);
    });
  }

  private broadcastToSpectators(event: ArenaEvent): void {
    const payload = JSON.stringify({
      type: "game_event",
      event: {
        ...event,
        isPrivateMessage: event.type === "chat.private",
      },
    });

    for (const [id, conn] of this.spectators) {
      if (conn.gameFilter && event.gameId && event.gameId !== conn.gameFilter) {
        continue;
      }
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(payload);
      }
    }
  }

  private sendToSpectator(id: string, data: any): void {
    const conn = this.spectators.get(id);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(data));
    }
  }

  // ============================================================
  // REST API + Static file serving
  // ============================================================

  private setupRoutes(): void {
    this.app.use(express.json());

    // CORS
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      next();
    });

    // Block non-rules routes when accessed via Cloudflare tunnel
    this.app.use((req, res, next) => {
      const isTunnel = req.headers["cf-connecting-ip"] || req.headers["cf-ray"];
      if (isTunnel && !req.path.startsWith("/rules")) {
        res.status(404).send("Not found");
        return;
      }
      next();
    });

    // Serve static frontend
    const publicDir = path.resolve(__dirname, "../../public");

    // Serve /rules without trailing slash (before static middleware)
    this.app.get("/rules", (_, res) => {
      res.sendFile(path.join(publicDir, "rules", "index.html"));
    });

    this.app.use(express.static(publicDir));

    // Health check
    this.app.get("/health", (_, res) => {
      res.json({
        status: "ok",
        spectators: this.spectators.size,
        simulationRunning: this.simulationRunning,
        uptime: process.uptime(),
      });
    });

    // Trigger a simulation
    this.app.post("/api/simulate", async (_, res) => {
      if (this.simulationRunning) {
        res.json({ ok: false, error: "Simulation already running" });
        return;
      }
      this.simulationRunning = true;
      res.json({ ok: true, message: "Simulation starting..." });

      // Run simulation asynchronously (import dynamically to avoid circular deps)
      try {
        await this.runSimulation();
      } catch (err: any) {
        console.error("Simulation error:", err);
      } finally {
        this.simulationRunning = false;
      }
    });

    // Game events
    this.app.get("/api/games/:gameId/events", (req, res) => {
      const events = this.eventBus.getHistory({
        gameId: req.params.gameId,
        spectator: true,
      });
      res.json({ events });
    });

    // All messages
    this.app.get("/api/games/:gameId/messages", (req, res) => {
      const events = this.eventBus.getHistory({
        gameId: req.params.gameId,
        spectator: true,
        types: ["chat.public", "chat.private", "chat.diary"],
      });
      const messages = events.map((e) => (e.data as any).message);
      res.json({ messages });
    });

    // Private messages only
    this.app.get("/api/games/:gameId/messages/private", (req, res) => {
      const events = this.eventBus.getHistory({
        gameId: req.params.gameId,
        spectator: true,
        types: ["chat.private"],
      });
      const messages = events.map((e) => (e.data as any).message);
      res.json({ messages });
    });

    // Commitment ledger activity
    this.app.get("/api/games/:gameId/commitments", (req, res) => {
      const events = this.eventBus.getHistory({
        gameId: req.params.gameId,
        spectator: true,
        types: ["commitment.detected", "commitment.attested", "commitment.resolved"],
      });
      res.json({ events });
    });

    this.app.get("/api/games/:gameId/behavior-memory", (req, res) => {
      const events = this.eventBus.getHistory({
        gameId: req.params.gameId,
        spectator: true,
        types: ["game.state_update"],
      });
      if (events.length === 0) {
        res.status(404).json({ error: "Game not found or no state updates yet" });
        return;
      }
      const latestState = events[events.length - 1].data as any;
      const memory = latestState?.behaviorMemoryByAgent ?? {};
      const agentId = req.query.agentId as string | undefined;
      if (agentId) {
        res.json({ agentId, behaviorMemory: memory[agentId] ?? null });
        return;
      }
      res.json({ behaviorMemoryByAgent: memory });
    });

    // Commons-health and prize-slash activity
    this.app.get("/api/games/:gameId/commons-health", (req, res) => {
      const slashEvents = this.eventBus.getHistory({
        gameId: req.params.gameId,
        spectator: true,
        types: ["prize.slashed"],
      });
      const stateEvents = this.eventBus.getHistory({
        gameId: req.params.gameId,
        spectator: true,
        types: ["game.state_update"],
      }).map((event) => ({
        round: (event.data as any).round,
        commonsHealth: (event.data as any).commonsHealth,
      }));
      res.json({ slashEvents, stateEvents });
    });

    // Trust graph
    this.app.get("/api/trust/matrix", (_, res) => {
      res.json(this.trustGraph.getTrustMatrix());
    });

    // Game state snapshot (for browser refresh recovery)
    this.app.get("/api/games/:gameId/snapshot", (req, res) => {
      const events = this.eventBus.getHistory({
        gameId: req.params.gameId,
        spectator: true,
        types: ["game.state_update"],
      });
      
      if (events.length === 0) {
        res.status(404).json({ error: "Game not found or no state updates yet" });
        return;
      }

      const latestState = events[events.length - 1].data as any;
      const agentInfoEvents = this.eventBus.getHistory({
        gameId: req.params.gameId,
        spectator: true,
        types: ["game.agent_info"],
      });
      const agentInfo = agentInfoEvents.length > 0 ? agentInfoEvents[0].data : null;

      res.json({
        snapshot: latestState,
        agentInfo,
        timestamp: Date.now(),
      });
    });

    this.app.get("/api/trust/snapshots", (_, res) => {
      res.json({
        snapshots: this.trustGraph.getAllSnapshots(),
        readModels: this.trustGraph.getAllReadModels(),
        dossiers: this.trustGraph.getAllTrustDossiers(),
        projections: this.trustGraph.getAllGraduatedProjections(),
        snapshotArtifact: this.trustGraph.getSnapshotArtifact(),
      });
    });

    this.app.get("/api/trust/agent/:agentId", (req, res) => {
      const snapshot = this.trustGraph.getSnapshot(req.params.agentId);
      const readModel = this.trustGraph.getReadModel(req.params.agentId);
      const dossier = this.trustGraph.getTrustDossier(req.params.agentId);
      const projection = this.trustGraph.getGraduatedProjection(req.params.agentId);
      res.json({ snapshot, readModel, dossier, projection });
    });

    // Prediction markets (placeholder)
    this.app.get("/api/markets/:gameId", (req, res) => {
      res.json({
        gameId: req.params.gameId,
        markets: [],
        message: "Prediction market integration pending on-chain deployment",
      });
    });
  }

  // ============================================================
  // Simulation runner
  // ============================================================

  private async runSimulation(): Promise<void> {
    const { v4: uuid } = await import("uuid");
    const { ComedyEngine } = await import("../games/nexus/comedy-engine.js");
    const { SimpleAgent } = await import("../agents/simple-agent.js");

    const config = {
      id: `comedy_${uuid().slice(0, 8)}`,
      type: "comedy_commons",
      maxPlayers: 4,
      minPlayers: 4,
      maxRounds: 25,
      entryFeeWei: BigInt("50000000000000000"),
      moveFeeWei: BigInt("5000000000000000"),
      messageFeeWei: BigInt("1000000000000000"),
      timeouts: {
        negotiationMs: 30000,
        actionMs: 15000,
      },
    };

    const strategies = [
      { name: "Alice_Cooperator", strategy: "cooperator" as const },
      { name: "Bob_TitForTat", strategy: "tit_for_tat" as const },
      { name: "Charlie_Diplomat", strategy: "diplomat" as const },
      { name: "Dave_Defector", strategy: "defector" as const },
    ];

    const engine = new ComedyEngine(config, this.eventBus, this.trustGraph);
    // No artificial delays — game runs at agent response speed.
    // Events stream to Observatory via WebSocket in real-time.
    engine.paceDelayMs = 60;

    const agentInfo: Array<{ id: string; name: string; strategy: string }> = [];
    for (const { name, strategy } of strategies) {
      const agentId = uuid();
      const agent = new SimpleAgent(agentId, strategy, name);
      engine.registerAgent(agent);
      agentInfo.push({ id: agentId, name, strategy });
    }

    // Broadcast agent info so frontend can display names and strategies
    this.broadcastToSpectators({
      type: "game.agent_info",
      gameId: config.id,
      data: { agents: agentInfo },
      timestamp: Date.now(),
      visibility: { agents: "all", spectators: true },
    });

    await engine.run();
  }
}
