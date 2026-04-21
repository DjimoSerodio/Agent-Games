/**
 * Abstract Game Engine
 *
 * Base class for all coordination games in the arena.
 * Handles the turn lifecycle, communication routing, and event emission.
 * Specific games (Tragedy of the Commons, Crab Bucket, etc.) extend this.
 */

import { v4 as uuid } from "uuid";
import {
  GameConfig,
  GameState,
  GamePhase,
  GameAgent,
  AgentId,
  Message,
  Action,
  RoundResult,
  TrustUpdate,
  ArenaEvent,
} from "./types.js";
import { EventBus } from "./event-bus.js";

export abstract class GameEngine<TState extends GameState = GameState> {
  protected config: GameConfig;
  protected state: TState;
  protected agents: Map<AgentId, GameAgent> = new Map();
  protected eventBus: EventBus;
  protected messageLog: Message[] = [];
  protected roundResults: RoundResult[] = [];
  protected pauseGate?: () => Promise<void>;

  constructor(config: GameConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.state = this.createInitialState(config);
  }

  // ============================================================
  // Abstract methods - game-specific implementations
  // ============================================================

  /** Create the initial game state */
  protected abstract createInitialState(config: GameConfig): TState;

  /** Get the game state visible to a specific agent */
  protected abstract getAgentView(agentId: AgentId): unknown;

  /** Get all legal actions for an agent in the current state */
  protected abstract getLegalActions(agentId: AgentId): Action[];

  /** Execute the production phase (resource generation, etc.) */
  protected abstract executeProduction(): void;

  /** Resolve submitted actions and return outcomes */
  protected abstract resolveActions(actions: Map<AgentId, Action[]>): RoundResult;

  /** Check if the game should end */
  protected abstract checkGameEnd(): boolean;

  /** Compute final scores and determine winner */
  protected abstract computeFinalScores(): Record<AgentId, number>;

  // ============================================================
  // Core game loop
  // ============================================================

  /**
   * Register an agent to play in this game
   */
  registerAgent(agent: GameAgent): void {
    if (this.agents.size >= this.config.maxPlayers) {
      throw new Error(`Game ${this.config.id} is full`);
    }
    this.agents.set(agent.id, agent);
    this.state.players.push(agent.id);

    this.emitEvent("agent.joined", { agentId: agent.id }, {
      agents: "all",
      spectators: true,
    });
  }

  /**
   * Run the complete game loop
   */
  async run(): Promise<RoundResult[]> {
    // Initialize all agents
    await this.initializeAgents();

    this.emitEvent("game.started", {
      players: this.state.players,
      config: {
        type: this.config.type,
        maxPlayers: this.config.maxPlayers,
        entryFeeWei: this.config.entryFeeWei.toString(),
      },
    }, { agents: "all", spectators: true });

    // Hook for subclasses to emit post-start data (e.g. map data)
    this.onGameStarted();

    // Main game loop
    while (!this.state.isFinished) {
      await this.executeRound();

      if (this.checkGameEnd()) {
        this.state.isFinished = true;
      }
    }

    // Finalize
    const finalScores = this.computeFinalScores();
    this.state.scores = finalScores;

    const winner = this.determineWinner(finalScores);
    this.state.winner = winner;

    this.emitEvent("game.ended", {
      scores: finalScores,
      winner,
      rounds: this.state.round,
    }, { agents: "all", spectators: true });

    return this.roundResults;
  }

  /** Pace delay between phases (ms). Set > 0 for observable games. */
  public paceDelayMs = 0;

  /**
   * Execute a single round of the game
   */
  protected async executeRound(): Promise<void> {
    await this.waitIfPaused();
    this.state.round++;

    this.emitEvent("game.round.start", {
      round: this.state.round,
    }, { agents: "all", spectators: true });

    // Phase 1: Production
    await this.waitIfPaused();
    this.setPhase("production");
    this.executeProduction();
    if (this.paceDelayMs > 0) await this.delay(this.paceDelayMs);

    // Phase 2: Negotiation
    await this.waitIfPaused();
    this.setPhase("negotiation");
    const messages = await this.executeNegotiation();
    if (this.paceDelayMs > 0) await this.delay(this.paceDelayMs);

    // Phase 3: Action
    await this.waitIfPaused();
    this.setPhase("action");
    const actions = await this.collectActions();
    if (this.paceDelayMs > 0) await this.delay(this.paceDelayMs);

    // Phase 4: Resolution
    await this.waitIfPaused();
    this.setPhase("resolution");
    const result = this.resolveActions(actions);
    this.roundResults.push(result);

    // Notify agents of results
    await this.waitIfPaused();
    await this.notifyResults(result);
    if (this.paceDelayMs > 0) await this.delay(this.paceDelayMs);
  }

  setPauseGate(pauseGate?: () => Promise<void>): void {
    this.pauseGate = pauseGate;
  }

  protected async waitIfPaused(): Promise<void> {
    if (!this.pauseGate) return;
    await this.pauseGate();
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Phase 2: Negotiation - agents exchange messages
   */
  protected async executeNegotiation(): Promise<Message[]> {
    const roundMessages: Message[] = [];

    // Negotiation sub-rounds (agents can respond to each other)
    const NEGOTIATION_ROUNDS = 1;

    for (let subRound = 0; subRound < NEGOTIATION_ROUNDS; subRound++) {
      const newMessages: Message[] = [];

      // Collect messages from all agents in parallel
      const messagePromises = Array.from(this.agents.entries()).map(
        async ([agentId, agent]) => {
          const visibleMessages = this.filterMessagesForAgent(agentId, roundMessages);
          const agentView = this.getAgentView(agentId);

          try {
            const msgs = await Promise.race([
              agent.negotiate(agentView, visibleMessages, this.state.round),
              this.timeout(this.config.timeouts.negotiationMs / NEGOTIATION_ROUNDS),
            ]) as Message[];

            return msgs.map((msg) => ({
              ...msg,
              id: uuid(),
              gameId: this.config.id,
              round: this.state.round,
              phase: "negotiation" as GamePhase,
              sender: agentId,
              timestamp: Date.now(),
            }));
          } catch {
            return []; // Timeout or error = no messages
          }
        },
      );

      const allNewMessages = await Promise.all(messagePromises);
      for (const msgs of allNewMessages) {
        newMessages.push(...msgs);
      }

      // Route messages and emit events (with pacing for observability)
      for (const msg of newMessages) {
        this.routeMessage(msg);
        roundMessages.push(msg);
        if (this.paceDelayMs > 0) await this.delay(Math.min(this.paceDelayMs / 4, 40));
      }
    }

    this.messageLog.push(...roundMessages);
    return roundMessages;
  }

  /**
   * Phase 3: Collect actions from all agents simultaneously
   */
  protected async collectActions(): Promise<Map<AgentId, Action[]>> {
    const allActions = new Map<AgentId, Action[]>();

    const actionPromises = Array.from(this.agents.entries()).map(
      async ([agentId, agent]) => {
        const agentView = this.getAgentView(agentId);
        const legalActions = this.getLegalActions(agentId);

        try {
          const actions = await Promise.race([
            agent.act(agentView, this.state.round, legalActions),
            this.timeout(this.config.timeouts.actionMs),
          ]) as Action[];

          return { agentId, actions };
        } catch {
          return { agentId, actions: [] }; // Timeout = no action
        }
      },
    );

    const results = await Promise.all(actionPromises);
    for (const { agentId, actions } of results) {
      allActions.set(agentId, actions);
    }

    return allActions;
  }

  // ============================================================
  // Message routing
  // ============================================================

  /**
   * Route a message to the appropriate channels
   */
  protected routeMessage(msg: Message): void {
    if (msg.type === "public" || msg.recipient === "broadcast") {
      // Public: all agents + spectators
      this.emitEvent("chat.public", { message: msg }, {
        agents: "all",
        spectators: true,
      });
    } else if (msg.type === "private") {
      // Private: sender + recipient only for agents, BUT spectators CAN see
      this.emitEvent("chat.private", { message: msg }, {
        agents: [msg.sender, msg.recipient as AgentId],
        spectators: true, // THE KEY FEATURE: spectators see private msgs
      });
    } else if (msg.type === "diary") {
      // Diary: only the agent themselves (spectators see post-game)
      this.emitEvent("chat.diary", { message: msg }, {
        agents: [msg.sender],
        spectators: true, // Spectators see reasoning in real-time too
      });
    }
  }

  /**
   * Filter messages to only those an agent should see
   */
  protected filterMessagesForAgent(agentId: AgentId, messages: Message[]): Message[] {
    return messages.filter((msg) => {
      if (msg.type === "public" || msg.recipient === "broadcast") return true;
      if (msg.sender === agentId) return true;
      if (msg.recipient === agentId) return true;
      return false; // Private messages between other agents are hidden
    });
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * Hook called after game.started is emitted. Override in subclasses
   * to emit data that the frontend needs after processing game.started.
   */
  protected onGameStarted(): void {
    // default no-op
  }

  protected async initializeAgents(): Promise<void> {
    const initPromises = Array.from(this.agents.entries()).map(
      ([_, agent]) =>
        agent.initialize(this.config, this.getAgentView(agent.id), agent.identity),
    );
    await Promise.all(initPromises);
  }

  protected async notifyResults(result: RoundResult): Promise<void> {
    const reflectPromises = Array.from(this.agents.values()).map((agent) =>
      agent.reflect(result).catch((err) =>
        console.error(`Agent ${agent.id} reflect error:`, err),
      ),
    );
    await Promise.all(reflectPromises);
  }

  protected setPhase(phase: GamePhase): void {
    this.state.phase = phase;
    this.emitEvent("game.phase.change", {
      phase,
      round: this.state.round,
    }, { agents: "all", spectators: true });
  }

  protected emitEvent(
    type: ArenaEvent["type"],
    data: unknown,
    visibility: ArenaEvent["visibility"],
  ): void {
    this.eventBus.emit({
      type,
      gameId: this.config.id,
      data,
      timestamp: Date.now(),
      visibility,
    });
  }

  protected determineWinner(scores: Record<AgentId, number>): AgentId | null {
    let maxScore = -Infinity;
    let winner: AgentId | null = null;
    for (const [agentId, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        winner = agentId;
      }
    }
    return winner;
  }

  protected timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms),
    );
  }

  // ============================================================
  // Accessors
  // ============================================================

  getState(): TState {
    return { ...this.state };
  }

  getConfig(): GameConfig {
    return { ...this.config };
  }

  getMessageLog(): Message[] {
    return [...this.messageLog];
  }

  getRoundResults(): RoundResult[] {
    return [...this.roundResults];
  }
}
