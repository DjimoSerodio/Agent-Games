/**
 * Trust Graph - EigenTrust-based trust computation
 *
 * Implements a modified EigenTrust algorithm with:
 * - Temporal decay (trust fades without interaction)
 * - Asymmetric penalties (betrayal costs more than cooperation gains)
 * - Cross-game aggregation
 * - Pre-trusted seed nodes
 */

import { AgentId, GameId, TrustEdge, TrustSnapshot, TrustUpdate } from "../core/types.js";

export interface TrustGraphConfig {
  /** Damping factor (like PageRank). 0.15 = 15% chance of jumping to pre-trusted set */
  alpha: number;
  /** Decay rate per time unit (half-life = ln(2) / decayRate) */
  decayRate: number;
  /** Maximum iterations for convergence */
  maxIterations: number;
  /** Convergence threshold */
  convergenceThreshold: number;
  /** Trust gained from cooperation */
  cooperationReward: number;
  /** Trust lost from defection (should be > cooperationReward for asymmetry) */
  defectionPenalty: number;
  /** Pre-trusted agent IDs (seed nodes) */
  preTrusted: AgentId[];
}

const DEFAULT_CONFIG: TrustGraphConfig = {
  alpha: 0.15,
  decayRate: 0.07, // Half-life of ~10 rounds
  maxIterations: 50,
  convergenceThreshold: 1e-6,
  cooperationReward: 0.3,
  defectionPenalty: 0.4, // Asymmetric: betrayal costs more
  preTrusted: [],
};

export class TrustGraph {
  private edges: Map<AgentId, Map<AgentId, TrustEdge>> = new Map();
  private agents: Set<AgentId> = new Set();
  private globalScores: Map<AgentId, number> = new Map();
  private config: TrustGraphConfig;
  private currentTime: number = 0;

  constructor(config: Partial<TrustGraphConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================
  // Graph mutation
  // ============================================================

  /**
   * Register a new agent in the trust graph
   */
  addAgent(agentId: AgentId): void {
    this.agents.add(agentId);
    if (!this.edges.has(agentId)) {
      this.edges.set(agentId, new Map());
    }
  }

  /**
   * Record an interaction between two agents
   */
  recordInteraction(
    from: AgentId,
    to: AgentId,
    cooperated: boolean,
    gameId: GameId,
  ): void {
    this.addAgent(from);
    this.addAgent(to);

    const fromEdges = this.edges.get(from)!;
    let edge = fromEdges.get(to);

    if (!edge) {
      edge = {
        from,
        to,
        weight: 0,
        interactions: 0,
        cooperations: 0,
        defections: 0,
        lastInteraction: this.currentTime,
        gameContexts: [],
      };
      fromEdges.set(to, edge);
    }

    edge.interactions++;
    if (cooperated) {
      edge.cooperations++;
      edge.weight = Math.min(1.0, edge.weight + this.config.cooperationReward);
    } else {
      edge.defections++;
      edge.weight = Math.max(-1.0, edge.weight - this.config.defectionPenalty);
    }

    edge.lastInteraction = this.currentTime;
    if (!edge.gameContexts.includes(gameId)) {
      edge.gameContexts.push(gameId);
    }
  }

  /**
   * Apply trust updates from a game round
   */
  applyUpdates(updates: TrustUpdate[], gameId: GameId): void {
    for (const update of updates) {
      if (update.delta > 0) {
        this.recordInteraction(update.from, update.to, true, gameId);
      } else if (update.delta < 0) {
        this.recordInteraction(update.from, update.to, false, gameId);
      }
    }
    this.recompute();
  }

  /**
   * Advance time (for decay)
   */
  tick(): void {
    this.currentTime++;
  }

  // ============================================================
  // EigenTrust computation
  // ============================================================

  /**
   * Recompute global trust scores using modified EigenTrust
   */
  recompute(): void {
    const agentList = Array.from(this.agents);
    const n = agentList.length;
    if (n === 0) return;

    const agentIndex = new Map(agentList.map((a, i) => [a, i]));

    // Step 1: Build normalized local trust matrix C with decay
    const C = this.buildLocalTrustMatrix(agentList, agentIndex);

    // Step 2: Pre-trusted distribution vector
    const p = new Float64Array(n);
    const preTrustedIndices = this.config.preTrusted
      .map((a) => agentIndex.get(a))
      .filter((i): i is number => i !== undefined);

    if (preTrustedIndices.length > 0) {
      for (const idx of preTrustedIndices) {
        p[idx] = 1.0 / preTrustedIndices.length;
      }
    } else {
      // Uniform if no pre-trusted nodes
      for (let i = 0; i < n; i++) {
        p[i] = 1.0 / n;
      }
    }

    // Step 3: Power iteration
    let t = new Float64Array(p);
    const alpha = this.config.alpha;

    for (let iter = 0; iter < this.config.maxIterations; iter++) {
      const tNew = new Float64Array(n);

      // t_new = (1 - alpha) * C^T * t + alpha * p
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let i = 0; i < n; i++) {
          sum += C[i * n + j] * t[i]; // C^T multiplication
        }
        tNew[j] = (1 - alpha) * sum + alpha * p[j];
      }

      // Check convergence
      let diff = 0;
      for (let i = 0; i < n; i++) {
        diff += Math.abs(tNew[i] - t[i]);
      }

      t = tNew;

      if (diff < this.config.convergenceThreshold) {
        break;
      }
    }

    // Normalize to [0, 1]
    let maxScore = 0;
    for (let i = 0; i < n; i++) {
      if (t[i] > maxScore) maxScore = t[i];
    }

    // Store results
    this.globalScores.clear();
    for (let i = 0; i < n; i++) {
      this.globalScores.set(agentList[i], maxScore > 0 ? t[i] / maxScore : 0);
    }
  }

  /**
   * Build the normalized local trust matrix with temporal decay
   */
  private buildLocalTrustMatrix(
    agentList: AgentId[],
    agentIndex: Map<AgentId, number>,
  ): Float64Array {
    const n = agentList.length;
    const C = new Float64Array(n * n);

    for (let i = 0; i < n; i++) {
      const from = agentList[i];
      const fromEdges = this.edges.get(from);
      if (!fromEdges) continue;

      let rowSum = 0;
      const rowValues: { j: number; value: number }[] = [];

      for (const [to, edge] of fromEdges) {
        const j = agentIndex.get(to);
        if (j === undefined) continue;

        // Raw trust from interactions
        const raw =
          edge.interactions > 0
            ? (edge.cooperations - edge.defections) / edge.interactions
            : 0;

        // Apply temporal decay
        const age = this.currentTime - edge.lastInteraction;
        const decayed = raw * Math.exp(-this.config.decayRate * age);

        // Clip negative values (EigenTrust uses non-negative matrix)
        const clipped = Math.max(decayed, 0);
        if (clipped > 0) {
          rowValues.push({ j, value: clipped });
          rowSum += clipped;
        }
      }

      // Normalize row
      if (rowSum > 0) {
        for (const { j, value } of rowValues) {
          C[i * n + j] = value / rowSum;
        }
      }
    }

    return C;
  }

  // ============================================================
  // Queries
  // ============================================================

  /**
   * Get global trust score for an agent
   */
  getGlobalScore(agentId: AgentId): number {
    return this.globalScores.get(agentId) ?? 0;
  }

  /**
   * Get direct trust score from one agent to another
   */
  getDirectTrust(from: AgentId, to: AgentId): number {
    const edge = this.edges.get(from)?.get(to);
    if (!edge) return 0;
    return edge.weight;
  }

  /**
   * Get effective trust (weighted blend of direct + global)
   */
  getEffectiveTrust(from: AgentId, to: AgentId): number {
    const direct = this.getDirectTrust(from, to);
    const global = this.getGlobalScore(to);
    return 0.6 * direct + 0.4 * global;
  }

  /**
   * Get trust snapshot for an agent
   */
  getSnapshot(agentId: AgentId): TrustSnapshot {
    const directScores: Record<AgentId, number> = {};
    const fromEdges = this.edges.get(agentId);
    if (fromEdges) {
      for (const [to, edge] of fromEdges) {
        directScores[to] = edge.weight;
      }
    }

    // Compute rank
    const sortedScores = Array.from(this.globalScores.entries())
      .sort((a, b) => b[1] - a[1]);
    const rank = sortedScores.findIndex(([id]) => id === agentId) + 1;

    return {
      agentId,
      globalScore: this.getGlobalScore(agentId),
      directScores,
      rank: rank || sortedScores.length + 1,
      gamesPlayed: this.getGamesPlayed(agentId),
      timestamp: this.currentTime,
    };
  }

  /**
   * Get all trust snapshots (for spectator display)
   */
  getAllSnapshots(): TrustSnapshot[] {
    return Array.from(this.agents).map((id) => this.getSnapshot(id));
  }

  /**
   * Get the trust matrix (for heatmap visualization)
   */
  getTrustMatrix(): { agents: AgentId[]; matrix: number[][] } {
    const agentList = Array.from(this.agents);
    const matrix = agentList.map((from) =>
      agentList.map((to) => this.getDirectTrust(from, to)),
    );
    return { agents: agentList, matrix };
  }

  /**
   * Get number of games an agent has participated in
   */
  private getGamesPlayed(agentId: AgentId): number {
    const gameSet = new Set<GameId>();
    const fromEdges = this.edges.get(agentId);
    if (fromEdges) {
      for (const edge of fromEdges.values()) {
        for (const g of edge.gameContexts) gameSet.add(g);
      }
    }
    // Also check incoming edges
    for (const [_, edgeMap] of this.edges) {
      const edge = edgeMap.get(agentId);
      if (edge) {
        for (const g of edge.gameContexts) gameSet.add(g);
      }
    }
    return gameSet.size;
  }

  /**
   * Export the full graph (for persistence)
   */
  export(): {
    agents: AgentId[];
    edges: TrustEdge[];
    globalScores: Record<AgentId, number>;
  } {
    const allEdges: TrustEdge[] = [];
    for (const edgeMap of this.edges.values()) {
      for (const edge of edgeMap.values()) {
        allEdges.push({ ...edge });
      }
    }

    const scores: Record<AgentId, number> = {};
    for (const [id, score] of this.globalScores) {
      scores[id] = score;
    }

    return {
      agents: Array.from(this.agents),
      edges: allEdges,
      globalScores: scores,
    };
  }

  /**
   * Import from exported data (for restoration)
   */
  import(data: ReturnType<TrustGraph["export"]>): void {
    this.agents = new Set(data.agents);
    this.edges = new Map();

    for (const agentId of data.agents) {
      this.edges.set(agentId, new Map());
    }

    for (const edge of data.edges) {
      this.edges.get(edge.from)?.set(edge.to, { ...edge });
    }

    this.globalScores = new Map(Object.entries(data.globalScores));
  }
}
