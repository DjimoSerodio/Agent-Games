/**
 * Tragedy of the Commons Simulation
 *
 * Run a complete game with simple AI agents for testing and demonstration.
 * Usage: npx tsx src/games/nexus/simulate.ts
 */

import { v4 as uuid } from "uuid";
import { EventBus } from "../../core/event-bus.js";
import { GameConfig, ArenaEvent } from "../../core/types.js";
import { TragedyEngine } from "./tragedy-engine.js";
import { TrustGraph } from "../../trust/trust-graph.js";
import { SimpleAgent, AgentStrategy } from "../../agents/simple-agent.js";

// ============================================================
// Configuration
// ============================================================

const GAME_CONFIG: GameConfig = {
  id: `tragedy_${uuid().slice(0, 8)}`,
  type: "tragedy_commons",
  maxPlayers: 4,
  minPlayers: 4,
  maxRounds: 25, // Hidden from agents
  entryFeeWei: BigInt("50000000000000000"), // 0.05 ETH
  moveFeeWei: BigInt("5000000000000000"), // 0.005 ETH
  messageFeeWei: BigInt("1000000000000000"), // 0.001 ETH
  timeouts: {
    negotiationMs: 30000, // 30s per negotiation sub-round
    actionMs: 15000, // 15s for action submission
  },
};

// Agent strategies to test
const AGENT_STRATEGIES: { name: string; strategy: AgentStrategy }[] = [
  { name: "Alice_Cooperator", strategy: "cooperator" },
  { name: "Bob_Builder", strategy: "builder" },
  { name: "Charlie_Opportunist", strategy: "opportunist" },
  { name: "Dave_Defector", strategy: "defector" },
];

// ============================================================
// Simulation
// ============================================================

async function runSimulation() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║      TRAGEDY OF THE COMMONS: WORLD SIM           ║");
  console.log("║         Coordination Olympiad Prototype          ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log();

  // Initialize components
  const eventBus = new EventBus();
  const trustGraph = new TrustGraph({
    preTrusted: [], // No pre-trusted agents in this simulation
  });

  // Set up event logging for spectators
  const eventLog: ArenaEvent[] = [];
  let messageCount = 0;
  let publicMsgCount = 0;
  let privateMsgCount = 0;
  let crisisCount = 0;
  let tradeCount = 0;

  eventBus.subscribeSpectator((event) => {
    eventLog.push(event);

    switch (event.type) {
      case "game.started":
        console.log(`\n🎮 Game started with ${(event.data as any).players.length} players\n`);
        break;

      case "game.round.start": {
        const data = event.data as any;
        console.log(`\n${"─".repeat(50)}`);
        console.log(`  ROUND ${data.round}`);
        console.log(`${"─".repeat(50)}`);
        break;
      }

      case "chat.public": {
        const msg = (event.data as any).message;
        publicMsgCount++;
        console.log(`  📢 [PUBLIC] ${msg.sender.slice(0, 8)}: "${msg.content.slice(0, 80)}"`);
        break;
      }

      case "chat.private": {
        const msg = (event.data as any).message;
        privateMsgCount++;
        console.log(`  🔒 [PRIVATE ${msg.sender.slice(0, 8)} → ${(msg.recipient as string).slice(0, 8)}]: "${msg.content.slice(0, 80)}"`);
        break;
      }

      case "crisis.triggered": {
        const crisis = (event.data as any).crisis;
        crisisCount++;
        console.log(`\n  ⚠️  CRISIS: ${crisis.name}`);
        console.log(`     ${crisis.description}`);
        break;
      }

      case "crisis.resolved": {
        const data = event.data as any;
        if (data.resolved) {
          console.log(`  ✅ Crisis resolved! Contributors: ${data.contributors.map((c: string) => c.slice(0, 8)).join(", ")}`);
        } else {
          console.log(`  ❌ Crisis failed! Penalty: ${data.penalty}`);
        }
        break;
      }

      case "trust.updated": {
        const updates = (event.data as any).updates;
        for (const u of updates) {
          const emoji = u.delta > 0 ? "📈" : "📉";
          console.log(`  ${emoji} Trust: ${u.from.slice(0, 8)} → ${u.to.slice(0, 8)} (${u.delta > 0 ? "+" : ""}${u.delta.toFixed(2)}) [${u.reason}]`);
        }
        break;
      }

      case "game.ended": {
        const data = event.data as any;
        console.log(`\n${"═".repeat(50)}`);
        console.log("  GAME OVER");
        console.log(`${"═".repeat(50)}`);
        console.log(`  Rounds played: ${data.rounds}`);
        console.log(`  Winner: ${data.winner?.slice(0, 8) || "None"}`);
        console.log("\n  Final Scores:");
        for (const [id, score] of Object.entries(data.scores as Record<string, number>)) {
          const agent = AGENT_STRATEGIES.find((a) => id.includes(a.name.split("_")[0].toLowerCase()));
          const name = agent ? agent.name : id.slice(0, 8);
          console.log(`    ${name}: ${score} VP`);
        }
        break;
      }
    }
  });

  // Create game engine
  const engine = new TragedyEngine(GAME_CONFIG, eventBus, trustGraph);

  // Create and register agents
  const agents: SimpleAgent[] = [];
  for (const { name, strategy } of AGENT_STRATEGIES) {
    const agent = new SimpleAgent(uuid(), strategy, name);
    agents.push(agent);
    engine.registerAgent(agent);
  }

  // Run the game
  console.log("Players:");
  for (const agent of agents) {
    console.log(`  - ${agent.identity.name} (${agent.strategy}) [${agent.id.slice(0, 8)}]`);
  }

  const startTime = Date.now();
  const results = await engine.run();
  const elapsed = Date.now() - startTime;

  // Print summary
  console.log(`\n${"═".repeat(50)}`);
  console.log("  SIMULATION SUMMARY");
  console.log(`${"═".repeat(50)}`);
  console.log(`  Duration: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`  Total events: ${eventLog.length}`);
  console.log(`  Public messages: ${publicMsgCount}`);
  console.log(`  Private messages: ${privateMsgCount}`);
  console.log(`  Crises: ${crisisCount}`);
  console.log(`  Rounds: ${results.length}`);

  // Trust graph final state
  console.log("\n  Trust Graph (final):");
  const { agents: trustAgents, matrix } = trustGraph.getTrustMatrix();
  const agentNames = trustAgents.map((id) => {
    const agent = agents.find((a) => a.id === id);
    return agent ? agent.identity.name.split("_")[0] : id.slice(0, 6);
  });

  // Print header
  console.log(`  ${"".padEnd(10)} ${agentNames.map((n) => n.padEnd(8)).join(" ")}`);
  for (let i = 0; i < trustAgents.length; i++) {
    const row = matrix[i].map((v) => {
      if (v === 0) return "  ·   ";
      return (v > 0 ? "+" : "") + v.toFixed(2);
    });
    console.log(`  ${agentNames[i].padEnd(10)} ${row.map((r) => r.padEnd(8)).join(" ")}`);
  }

  // Global trust scores
  console.log("\n  Global Trust Scores (EigenTrust):");
  const snapshots = trustGraph.getAllSnapshots();
  for (const snap of snapshots.sort((a, b) => b.globalScore - a.globalScore)) {
    const agent = agents.find((a) => a.id === snap.agentId);
    const name = agent ? agent.identity.name : snap.agentId.slice(0, 8);
    const bar = "█".repeat(Math.round(snap.globalScore * 20));
    console.log(`    ${name.padEnd(20)} ${snap.globalScore.toFixed(3)} ${bar}`);
  }

  // Prize pool
  const finalState = engine.getState();
  const poolEth = Number(finalState.prizePool) / 1e18;
  console.log(`\n  Prize Pool: ${poolEth.toFixed(4)} ETH`);
  console.log(`  Total Moves: ${finalState.moveCount}`);
  console.log(`  Total Messages: ${finalState.messageCount}`);

  console.log("\n✨ Simulation complete!\n");
}

// ============================================================
// Run
// ============================================================

runSimulation().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
