import { sql } from "drizzle-orm";
import { createDatabaseClient } from "./index.js";

async function migrate(): Promise<void> {
  const db = createDatabaseClient({ allowDefault: true });
  if (!db) {
    throw new Error("Unable to initialize database client for migration");
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS games (
      id text PRIMARY KEY,
      config jsonb NOT NULL,
      status text NOT NULL DEFAULT 'created',
      winner text,
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS game_events (
      id text PRIMARY KEY,
      game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      round integer,
      phase text,
      event_type text NOT NULL,
      payload jsonb NOT NULL,
      timestamp timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS players (
      id text PRIMARY KEY,
      game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      agent_id text NOT NULL,
      faction text NOT NULL,
      is_human boolean NOT NULL DEFAULT false,
      wallet_address text,
      final_score integer,
      final_vp integer
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trust_scores (
      id text PRIMARY KEY,
      from_agent text NOT NULL,
      to_agent text NOT NULL,
      game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      score real NOT NULL,
      attestation_uid text
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS game_events_game_id_idx ON game_events (game_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS game_events_timestamp_idx ON game_events (timestamp);
  `);

  console.log("Database migration complete.");
}

migrate().catch((err) => {
  console.error("Database migration failed:", err);
  process.exit(1);
});
