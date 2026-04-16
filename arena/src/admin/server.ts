/**
 * Admin Dashboard Server
 *
 * Separate Express server on port 3001 for game administration.
 * Features:
 * - Real-time game event log (all events, including agent-only)
 * - Agent decision inspector (reasoning, API call logs)
 * - Game state inspector (raw JSON)
 * - Pause / resume / restart games
 * - Per-agent activity log
 * - Round-by-round replay data
 * - Trust graph raw data
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { EventBus } from "../core/event-bus.js";
import { ArenaEvent, AgentId } from "../core/types.js";
import { TrustGraph } from "../trust/trust-graph.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AdminConnection {
  ws: WebSocket;
  connectedAt: number;
}

/**
 * Collected log entry for agent decisions, API calls, etc.
 */
interface AgentLogEntry {
  timestamp: number;
  agentId: AgentId;
  round: number;
  phase: string;
  type: "decision" | "api_call" | "message" | "action" | "error";
  data: unknown;
}

export class AdminServer {
  private app: express.Application;
  private wss: WebSocketServer | null = null;
  private eventBus: EventBus;
  private trustGraph: TrustGraph;
  private admins: Map<string, AdminConnection> = new Map();
  private nextId = 0;

  /** Full event log (all events, not filtered) */
  private eventLog: ArenaEvent[] = [];
  /** Per-agent decision/activity logs */
  private agentLogs: Map<AgentId, AgentLogEntry[]> = new Map();
  /** Current game state snapshot (updated each round) */
  private currentGameState: unknown = null;
  /** Game control state */
  private paused = false;
  private pauseResolve: (() => void) | null = null;

  constructor(eventBus: EventBus, trustGraph: TrustGraph) {
    this.eventBus = eventBus;
    this.trustGraph = trustGraph;
    this.app = express();
    this.setupRoutes();
    this.subscribeToEvents();
  }

  /**
   * Start the admin server
   */
  start(port: number = 3001): void {
    const server = this.app.listen(port, () => {
      console.log(`  Admin Dashboard: http://localhost:${port}`);
    });

    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", (ws) => {
      this.handleConnection(ws);
    });
  }

  /**
   * Check if the game is paused (called by game engine)
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Wait until unpaused (game engine calls this between phases)
   */
  async waitIfPaused(): Promise<void> {
    if (!this.paused) return;
    return new Promise<void>((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  /**
   * Log an agent decision or API call
   */
  logAgentActivity(entry: AgentLogEntry): void {
    if (!this.agentLogs.has(entry.agentId)) {
      this.agentLogs.set(entry.agentId, []);
    }
    this.agentLogs.get(entry.agentId)!.push(entry);

    // Broadcast to admin clients
    this.broadcastToAdmins({
      type: "agent_log",
      data: entry,
    });
  }

  // ============================================================
  // WebSocket handling
  // ============================================================

  private handleConnection(ws: WebSocket): void {
    const id = `admin_${this.nextId++}`;
    this.admins.set(id, { ws, connectedAt: Date.now() });

    console.log(`  Admin connected: ${id}`);

    // Send current state snapshot
    this.sendToAdmin(id, {
      type: "welcome",
      data: {
        adminId: id,
        eventCount: this.eventLog.length,
        agentCount: this.agentLogs.size,
        paused: this.paused,
        currentGameState: this.currentGameState,
        trustMatrix: this.trustGraph.getTrustMatrix(),
      },
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleAdminMessage(id, msg);
      } catch {
        // ignore
      }
    });

    ws.on("close", () => {
      this.admins.delete(id);
    });
  }

  private handleAdminMessage(adminId: string, msg: any): void {
    switch (msg.type) {
      case "pause":
        this.paused = true;
        this.broadcastToAdmins({ type: "status", data: { paused: true } });
        break;
      case "resume":
        this.paused = false;
        if (this.pauseResolve) {
          this.pauseResolve();
          this.pauseResolve = null;
        }
        this.broadcastToAdmins({ type: "status", data: { paused: false } });
        break;
      case "get_events":
        this.sendToAdmin(adminId, {
          type: "event_log",
          data: {
            events: this.eventLog.slice(-(msg.limit || 100)),
            total: this.eventLog.length,
          },
        });
        break;
      case "get_agent_log":
        this.sendToAdmin(adminId, {
          type: "agent_log_history",
          data: {
            agentId: msg.agentId,
            entries: this.agentLogs.get(msg.agentId) || [],
          },
        });
        break;
      case "get_state":
        this.sendToAdmin(adminId, {
          type: "game_state",
          data: this.currentGameState,
        });
        break;
      case "get_trust":
        this.sendToAdmin(adminId, {
          type: "trust_data",
          data: {
            matrix: this.trustGraph.getTrustMatrix(),
            snapshots: this.trustGraph.getAllSnapshots(),
            readModels: this.trustGraph.getAllReadModels(),
            dossiers: this.trustGraph.getAllTrustDossiers(),
            projections: this.trustGraph.getAllGraduatedProjections(),
            snapshotArtifact: this.trustGraph.getSnapshotArtifact(),
            exported: this.trustGraph.export(),
          },
        });
        break;
    }
  }

  // ============================================================
  // Event subscription
  // ============================================================

  private subscribeToEvents(): void {
    // Subscribe as spectator to get ALL events
    this.eventBus.subscribeSpectator((event) => {
      this.eventLog.push(event);

      // Track game state updates
      if (event.type === "game.state_update") {
        this.currentGameState = event.data;
      }

      // Broadcast to all admin connections
      this.broadcastToAdmins({
        type: "game_event",
        event,
      });
    });
  }

  private broadcastToAdmins(data: any): void {
    const payload = JSON.stringify(data);
    for (const [_, conn] of this.admins) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(payload);
      }
    }
  }

  private sendToAdmin(id: string, data: any): void {
    const conn = this.admins.get(id);
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
    this.app.use((_req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
      next();
    });

    // Serve admin frontend
    const publicDir = path.resolve(__dirname, "../../public/admin");
    this.app.use(express.static(publicDir));

    // Health
    this.app.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        admins: this.admins.size,
        events: this.eventLog.length,
        paused: this.paused,
      });
    });

    // Event log
    this.app.get("/api/events", (req, res) => {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const typeFilter = req.query.type as string;

      let events = this.eventLog;
      if (typeFilter) {
        events = events.filter(e => e.type === typeFilter);
      }

      res.json({
        events: events.slice(offset, offset + limit),
        total: events.length,
        offset,
        limit,
      });
    });

    // Agent logs
    this.app.get("/api/agents", (_req, res) => {
      const agents: Record<string, { entries: number; lastActivity: number }> = {};
      for (const [agentId, entries] of this.agentLogs) {
        agents[agentId] = {
          entries: entries.length,
          lastActivity: entries.length > 0 ? entries[entries.length - 1].timestamp : 0,
        };
      }
      res.json({ agents });
    });

    this.app.get("/api/agents/:agentId/log", (req, res) => {
      const entries = this.agentLogs.get(req.params.agentId) || [];
      const round = req.query.round ? parseInt(req.query.round as string) : undefined;
      const type = req.query.type as string;

      let filtered = entries;
      if (round !== undefined) {
        filtered = filtered.filter(e => e.round === round);
      }
      if (type) {
        filtered = filtered.filter(e => e.type === type);
      }

      res.json({ agentId: req.params.agentId, entries: filtered, total: entries.length });
    });

    // Game state inspector
    this.app.get("/api/state", (_req, res) => {
      res.json({ state: this.currentGameState });
    });

    // Trust graph data (detailed)
    this.app.get("/api/trust", (_req, res) => {
      res.json({
        matrix: this.trustGraph.getTrustMatrix(),
        snapshots: this.trustGraph.getAllSnapshots(),
        readModels: this.trustGraph.getAllReadModels(),
        dossiers: this.trustGraph.getAllTrustDossiers(),
        projections: this.trustGraph.getAllGraduatedProjections(),
        snapshotArtifact: this.trustGraph.getSnapshotArtifact(),
        exported: this.trustGraph.export(),
      });
    });

    // Pause / resume controls
    this.app.post("/api/pause", (_req, res) => {
      this.paused = true;
      this.broadcastToAdmins({ type: "status", data: { paused: true } });
      res.json({ ok: true, paused: true });
    });

    this.app.post("/api/resume", (_req, res) => {
      this.paused = false;
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
      }
      this.broadcastToAdmins({ type: "status", data: { paused: false } });
      res.json({ ok: true, paused: false });
    });

    // Round-by-round replay data
    this.app.get("/api/replay", (req, res) => {
      const round = parseInt(req.query.round as string);
      if (isNaN(round)) {
        // Return all rounds grouped
        const rounds: Record<number, ArenaEvent[]> = {};
        for (const event of this.eventLog) {
          const eventRound = (event.data as any)?.round || 0;
          if (!rounds[eventRound]) rounds[eventRound] = [];
          rounds[eventRound].push(event);
        }
        res.json({ rounds, totalEvents: this.eventLog.length });
      } else {
        // Return events for specific round
        const events = this.eventLog.filter(e => {
          const d = e.data as any;
          return d?.round === round;
        });
        res.json({ round, events });
      }
    });

    // Fallback to admin index.html for SPA routing
    this.app.get("*", (_req, res) => {
      res.sendFile(path.resolve(publicDir, "index.html"));
    });
  }
}
