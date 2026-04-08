import { v4 as uuid } from "uuid";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { EventBus } from "../core/event-bus.js";
import { ArenaEvent, GameConfig, GameId } from "../core/types.js";
import { DrizzleClient } from "./index.js";
import { gameEvents, games, players, trustScores } from "./schema.js";

export interface PersistedGame {
  id: string;
  config: unknown;
  status: string;
  winner: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface PersistedGameEvent {
  id: string;
  gameId: string;
  round: number | null;
  phase: string | null;
  eventType: string;
  payload: unknown;
  timestamp: Date;
}

function toJsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_, nestedValue) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  );
}

function extractRound(event: ArenaEvent): number | null {
  if (event.data && typeof event.data === "object") {
    const fromData = (event.data as { round?: unknown }).round;
    if (typeof fromData === "number") return fromData;

    const fromMessage = (event.data as { message?: { round?: unknown } }).message?.round;
    if (typeof fromMessage === "number") return fromMessage;
  }
  return null;
}

function extractPhase(event: ArenaEvent): string | null {
  if (event.data && typeof event.data === "object") {
    const fromData = (event.data as { phase?: unknown }).phase;
    if (typeof fromData === "string") return fromData;

    const fromMessage = (event.data as { message?: { phase?: unknown } }).message?.phase;
    if (typeof fromMessage === "string") return fromMessage;
  }
  return null;
}

export class EventStore {
  private knownGames = new Set<string>();

  constructor(
    private readonly db: DrizzleClient | null,
    private readonly eventBus: EventBus,
  ) {
    this.eventBus.subscribe({}, (event) => {
      void this.handleEvent(event);
    });
  }

  isEnabled(): boolean {
    return this.db !== null;
  }

  async createGame(config: GameConfig): Promise<string> {
    if (!this.db) return config.id;

    const gameId = config.id;
    await this.db
      .insert(games)
      .values({
        id: gameId,
        config: toJsonSafe(config),
        status: "created",
      })
      .onConflictDoNothing({ target: games.id });

    this.knownGames.add(gameId);
    return gameId;
  }

  async recordEvent(gameId: string, event: ArenaEvent): Promise<string> {
    if (!this.db) return "";

    await this.ensureGame(gameId, event);
    const id = uuid();

    await this.db.insert(gameEvents).values({
      id,
      gameId,
      round: extractRound(event),
      phase: extractPhase(event),
      eventType: event.type,
      payload: toJsonSafe({
        data: event.data,
        visibility: event.visibility,
        agentId: event.agentId ?? null,
      }),
      timestamp: new Date(event.timestamp),
    });

    return id;
  }

  async recordPlayer(
    gameId: string,
    agentId: string,
    faction: string,
    isHuman: boolean,
    walletAddress?: string,
  ): Promise<string> {
    if (!this.db) return "";

    const id = uuid();
    await this.db.insert(players).values({
      id,
      gameId,
      agentId,
      faction,
      isHuman,
      walletAddress,
    });
    return id;
  }

  async updateGameStatus(gameId: string, status: string, winner?: string): Promise<void> {
    if (!this.db) return;

    await this.db
      .update(games)
      .set({
        status,
        winner: winner ?? null,
        completedAt: status === "completed" ? new Date() : null,
      })
      .where(eq(games.id, gameId));

    if (status === "completed") {
      const latestScoreEvent = await this.db
        .select({ payload: gameEvents.payload })
        .from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.eventType, "game.ended")))
        .orderBy(desc(gameEvents.timestamp))
        .limit(1);

      const scores = latestScoreEvent[0]?.payload && typeof latestScoreEvent[0].payload === "object"
        ? ((latestScoreEvent[0].payload as { data?: { scores?: Record<string, number> } }).data?.scores ?? {})
        : {};

      for (const [agentId, score] of Object.entries(scores)) {
        await this.db
          .update(players)
          .set({ finalScore: Math.round(score), finalVp: Math.round(score) })
          .where(and(eq(players.gameId, gameId), eq(players.agentId, agentId)));
      }
    }
  }

  async recordTrustScore(
    fromAgent: string,
    toAgent: string,
    gameId: string,
    score: number,
    attestationUid?: string,
  ): Promise<void> {
    if (!this.db) return;

    await this.db.insert(trustScores).values({
      id: uuid(),
      fromAgent,
      toAgent,
      gameId,
      score,
      attestationUid: attestationUid ?? null,
    });
  }

  async getGameEvents(gameId: string, limit?: number, offset?: number): Promise<PersistedGameEvent[]> {
    if (!this.db) return [];

    const baseQuery = this.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.gameId, gameId))
      .orderBy(asc(gameEvents.timestamp));

    let rows;
    if (typeof limit === "number" && typeof offset === "number") {
      rows = await baseQuery.limit(limit).offset(offset);
    } else if (typeof limit === "number") {
      rows = await baseQuery.limit(limit);
    } else if (typeof offset === "number") {
      rows = await baseQuery.limit(1000000).offset(offset);
    } else {
      rows = await baseQuery;
    }

    return rows.map((row) => ({
      id: row.id,
      gameId: row.gameId,
      round: row.round,
      phase: row.phase,
      eventType: row.eventType,
      payload: row.payload,
      timestamp: row.timestamp,
    }));
  }

  async listGames(limit = 50, offset = 0): Promise<PersistedGame[]> {
    if (!this.db) return [];

    const rows = await this.db
      .select()
      .from(games)
      .orderBy(desc(games.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({
      id: row.id,
      config: row.config,
      status: row.status,
      winner: row.winner,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    }));
  }

  async getGameById(gameId: string): Promise<PersistedGame | null> {
    if (!this.db) return null;

    const rows = await this.db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      config: row.config,
      status: row.status,
      winner: row.winner,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    };
  }

  async countGameEvents(gameId: string): Promise<number> {
    if (!this.db) return 0;

    const result = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(gameEvents)
      .where(eq(gameEvents.gameId, gameId));

    return result[0]?.value ?? 0;
  }

  private async handleEvent(event: ArenaEvent): Promise<void> {
    if (!this.db || !event.gameId) return;

    await this.recordEvent(event.gameId, event);

    if (event.type === "game.started") {
      await this.updateGameStatus(event.gameId, "running");
    }

    if (event.type === "agent.joined") {
      const joinedAgentId =
        event.data && typeof event.data === "object"
          ? ((event.data as { agentId?: string }).agentId ?? event.agentId)
          : event.agentId;

      if (joinedAgentId) {
        const existing = await this.db
          .select({ id: players.id })
          .from(players)
          .where(and(eq(players.gameId, event.gameId), eq(players.agentId, joinedAgentId)))
          .limit(1);

        if (existing.length === 0) {
          await this.recordPlayer(event.gameId, joinedAgentId, "unknown", false);
        }
      }
    }

    if (event.type === "trust.updated" && event.data && typeof event.data === "object") {
      const updates = (event.data as { updates?: Array<{ from?: string; to?: string; delta?: number }> }).updates;
      if (Array.isArray(updates)) {
        for (const update of updates) {
          if (typeof update.from === "string" && typeof update.to === "string" && typeof update.delta === "number") {
            await this.recordTrustScore(update.from, update.to, event.gameId, update.delta);
          }
        }
      }
    }

    if (event.type === "game.ended") {
      const winner = event.data && typeof event.data === "object"
        ? (event.data as { winner?: string | null }).winner ?? undefined
        : undefined;
      await this.updateGameStatus(event.gameId, "completed", winner ?? undefined);
    }
  }

  private async ensureGame(gameId: GameId, event: ArenaEvent): Promise<void> {
    if (!this.db || this.knownGames.has(gameId)) return;

    const configFromEvent =
      event.type === "game.started" && event.data && typeof event.data === "object"
        ? (event.data as { config?: unknown }).config
        : {};

    await this.db
      .insert(games)
      .values({
        id: gameId,
        config: toJsonSafe(configFromEvent),
        status: event.type === "game.ended" ? "completed" : "running",
      })
      .onConflictDoNothing({ target: games.id });

    this.knownGames.add(gameId);
  }
}
