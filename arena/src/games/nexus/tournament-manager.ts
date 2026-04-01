/**
 * Tournament Manager
 *
 * Manages a tournament session across multiple games:
 * - Tracks cumulative scores across games
 * - Hidden tournament end (geometric continuation probability)
 * - Prize pool accumulation and distribution
 * - Trust scores persist across games
 */

import { AgentId, GameId } from "../../core/types.js";
import { TournamentState, TournamentConfig, DEFAULT_TOURNAMENT_CONFIG } from "./types.js";
import { v4 as uuid } from "uuid";

export class TournamentManager {
  private state: TournamentState;
  private config: TournamentConfig;

  constructor(config: Partial<TournamentConfig> = {}) {
    this.config = { ...DEFAULT_TOURNAMENT_CONFIG, ...config };
    this.state = {
      sessionId: uuid(),
      gamesPlayed: 0,
      continuationProbability: this.config.continuationProbability,
      tournamentPrizePool: BigInt(0),
      cumulativeScores: {},
      currentGameId: null,
      isActive: true,
    };
  }

  getState(): TournamentState {
    return { ...this.state };
  }

  getAgentView(): { tournamentDay: number; tournamentPrizePool: string; cumulativeScores: Record<AgentId, number> } {
    return {
      tournamentDay: this.state.gamesPlayed + 1, // Day 1, Day 2, etc (hidden that we use gamesPlayed)
      tournamentPrizePool: this.state.tournamentPrizePool.toString(),
      cumulativeScores: { ...this.state.cumulativeScores },
    };
  }

  initGame(gameId: GameId, players: AgentId[]): void {
    this.state.currentGameId = gameId;
    for (const player of players) {
      if (!(player in this.state.cumulativeScores)) {
        this.state.cumulativeScores[player] = 0;
      }
    }
  }

  recordGameResult(scores: Record<AgentId, number>, prizePoolWei: bigint): boolean {
    this.state.gamesPlayed++;
    
    // Update cumulative scores
    for (const [player, score] of Object.entries(scores)) {
      const prev = this.state.cumulativeScores[player] || 0;
      this.state.cumulativeScores[player] = prev + score;
    }
    
    // Add to tournament prize pool
    this.state.tournamentPrizePool += prizePoolWei;
    
    // Determine if tournament continues (geometric distribution)
    const continueTournament = Math.random() < this.state.continuationProbability;
    
    if (!continueTournament) {
      this.endTournament();
    }
    
    return this.state.isActive;
  }

  private endTournament(): void {
    this.state.isActive = false;
  }

  isActive(): boolean {
    return this.state.isActive;
  }

  getSessionId(): string {
    return this.state.sessionId;
  }

  getCumulativeScores(): Record<AgentId, number> {
    return { ...this.state.cumulativeScores };
  }

  getWinners(): AgentId[] {
    const scores = this.getCumulativeScores();
    const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
    return sorted.map(([id]) => id);
  }

  distributePrizes(): Map<AgentId, bigint> {
    const winners = this.getWinners();
    const distribution = new Map<AgentId, bigint>();
    
    const prizes = [
      { agents: winners.slice(0, 1), bps: this.config.prizeDistribution.first },
      { agents: winners.slice(1, 2), bps: this.config.prizeDistribution.second },
      { agents: winners.slice(2, 3), bps: this.config.prizeDistribution.third },
      { agents: winners.slice(3, 4), bps: this.config.prizeDistribution.fourth },
    ];
    
    for (const { agents, bps } of prizes) {
      if (agents.length === 0) continue;
      const amountPerAgent = (this.state.tournamentPrizePool * BigInt(bps)) / BigInt(10000) / BigInt(agents.length);
      for (const agent of agents) {
        distribution.set(agent, (distribution.get(agent) || BigInt(0)) + amountPerAgent);
      }
    }
    
    return distribution;
  }

  static create(): TournamentManager {
    return new TournamentManager();
  }
}
