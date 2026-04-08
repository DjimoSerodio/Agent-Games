import { boolean, index, integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

export const games = pgTable("games", {
  id: text("id").primaryKey(),
  config: jsonb("config").notNull(),
  status: text("status").notNull().default("created"),
  winner: text("winner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const gameEvents = pgTable(
  "game_events",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    round: integer("round"),
    phase: text("phase"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("game_events_game_id_idx").on(table.gameId),
    index("game_events_timestamp_idx").on(table.timestamp),
  ],
);

export const players = pgTable("players", {
  id: text("id").primaryKey(),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  agentId: text("agent_id").notNull(),
  faction: text("faction").notNull(),
  isHuman: boolean("is_human").notNull().default(false),
  walletAddress: text("wallet_address"),
  finalScore: integer("final_score"),
  finalVp: integer("final_vp"),
});

export const trustScores = pgTable("trust_scores", {
  id: text("id").primaryKey(),
  fromAgent: text("from_agent").notNull(),
  toAgent: text("to_agent").notNull(),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  score: real("score").notNull(),
  attestationUid: text("attestation_uid"),
});

export type GameRow = typeof games.$inferSelect;
export type GameEventRow = typeof gameEvents.$inferSelect;
