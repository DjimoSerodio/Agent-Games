/**
 * Coordination Olympiad - Arena Entry Point
 *
 * Starts the arena platform with:
 * - Event bus for all game events
 * - Trust graph computation
 * - Observatory server for spectators (serves frontend UI)
 *
 * Usage:
 *   npx tsx src/index.ts
 *   Then open http://localhost:3000 in your browser
 *   Click "RUN SIMULATION" to start a game
 */

import { EventBus } from "./core/event-bus.js";
import { TrustGraph } from "./trust/trust-graph.js";
import { ObservatoryServer } from "./observatory/server.js";

async function main() {
  console.log();
  console.log("  ╔══════════════════════════════════════════════════╗");
  console.log("  ║       NEXUS OBSERVATORY                          ║");
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

  const port = parseInt(process.env.PORT || "3000");
  const observatory = new ObservatoryServer(eventBus, trustGraph);
  observatory.start(port);

  console.log(`  Open http://localhost:${port} in your browser`);
  console.log(`  Click "RUN SIMULATION" to start a game`);
  console.log();
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
