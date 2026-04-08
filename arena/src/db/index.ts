import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const DEFAULT_DATABASE_URL = "postgresql://djimoserodio@localhost:5432/coordination_games";

let warnedMissingUrl = false;

export type DrizzleClient = NodePgDatabase<typeof schema>;

export function resolveDatabaseUrl(allowDefault = false): string | null {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  if (allowDefault) return DEFAULT_DATABASE_URL;
  return null;
}

export function createDatabaseClient(options?: { allowDefault?: boolean }): DrizzleClient | null {
  const url = resolveDatabaseUrl(options?.allowDefault ?? false);
  if (!url) {
    if (!warnedMissingUrl) {
      console.warn("[event-store] DATABASE_URL not set; persistence disabled.");
      warnedMissingUrl = true;
    }
    return null;
  }

  const pool = new pg.Pool({ connectionString: url });
  return drizzle(pool, { schema });
}

export const db = createDatabaseClient();
