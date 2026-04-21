/**
 * Coordination Olympiad - Arena Entry Point
 *
 * Starts the arena platform with:
 * - Event bus for all game events
 * - Trust graph computation
 * - Observatory server for spectators (port 3000)
 * - Admin dashboard for game management (port 3001)
 *
 * Usage:
 *   npx tsx src/index.ts
 *   Then open http://localhost:3000 (Observatory) or http://localhost:3001 (Admin)
 *   Click "RUN SIMULATION" in the Observatory to start a game
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EventBus } from "./core/event-bus.js";
import { TrustGraph } from "./trust/trust-graph.js";
import { ObservatoryServer } from "./observatory/server.js";
import { AdminServer } from "./admin/server.js";

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const source = readFileSync(envPath, "utf-8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadLocalEnv();

  console.log();
  console.log("  ╔══════════════════════════════════════════════════╗");
  console.log("  ║   TRAGEDY OF THE COMMONS OBSERVATORY + ADMIN       ║");
  console.log("  ║       Coordination Olympiad Arena                 ║");
  console.log("  ╚══════════════════════════════════════════════════╝");
  console.log();

  const eventBus = new EventBus();
  const trustGraph = new TrustGraph({
    alpha: 0.15,
    decayRate: 0.07,
    maxIterations: 50,
    convergenceThreshold: 1e-6,
    cooperationReward: 0.3,
    defectionPenalty: 0.4,
    preTrusted: [],
  });

  // Admin dashboard on port 3001
  const adminPort = parseInt(process.env.ADMIN_PORT || "3001");
  const admin = new AdminServer(eventBus, trustGraph);
  admin.start(adminPort);

  // Observatory (spectator UI) on port 3000
  const observatoryPort = parseInt(process.env.PORT || "3000");
  const observatory = new ObservatoryServer(
    eventBus,
    trustGraph,
    (entry) => {
      admin.logAgentActivity(entry);
    },
    () => admin.waitIfPaused(),
  );
  observatory.start(observatoryPort);

  console.log();
  console.log(`  Observatory: http://localhost:${observatoryPort}`);
  console.log(`  Admin:       http://localhost:${adminPort}`);
  console.log();
  console.log(`  Click "RUN SIMULATION" in the Observatory to start a game`);
  console.log();
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
