/**
 * Comedy of the Commons — Minimax LLM Agent Simulation
 *
 * Run a complete game with Minimax-powered LLM agents for testing.
 * Uses the Minimax OpenAI-compatible API (set MINIMAX_API_KEY env var).
 *
 * Usage:
 *   MINIMAX_API_KEY=sk-cp-... npx tsx src/games/nexus/simulate-minimax.ts
 *
 * Or with Anthropic:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx src/games/nexus/simulate-minimax.ts
 */

import { resolve } from "path";
import { v4 as uuid } from "uuid";
import { EventBus } from "../../core/event-bus.js";
import { GameConfig, ArenaEvent } from "../../core/types.js";
import { ComedyEngine } from "./comedy-engine.js";
import { TrustGraph } from "../../trust/trust-graph.js";
import { LLMAgent } from "../../agents/llm-agent.js";
import { createProviderFromEnv } from "../../harness/llm-runtime.js";
import type { GameAgent } from "../../core/types.js";

// ============================================================
// Configuration
// ============================================================

const GAME_CONFIG: GameConfig = {
  id: `comedy_${uuid().slice(0, 8)}`,
  type: "comedy_commons",
  maxPlayers: 4,
  minPlayers: 4,
  maxRounds: 25,
  entryFeeWei: BigInt("50000000000000000"),
  moveFeeWei: BigInt("5000000000000000"),
  messageFeeWei: BigInt("1000000000000000"),
  timeouts: {
    negotiationMs: 60_000, // 60s for LLM agents
    actionMs: 60_000,
  },
};

// Use existing persona files
const PERSONAS = [
  { name: "Alice", path: resolve(import.meta.dirname, "../../../personas/alice-cooperator.md") },
  { name: "Bob",   path: resolve(import.meta.dirname, "../../../personas/bob-strategist.md") },
  { name: "Carol", path: resolve(import.meta.dirname, "../../../personas/carol-opportunist.md") },
  { name: "Dave",  path: resolve(import.meta.dirname, "../../../personas/dave-builder.md") },
];

// ============================================================
// Simulation
// ============================================================

async function runSimulation() {
  console.log();
  console.log("  ╔══════════════════════════════════════════════════╗");
  console.log("  ║   COMEDY OF THE COMMONS: MINIMAX LLM SIMULATION ║");
  console.log("  ║         Powered by Minimax 2.7 (OpenAI API)      ║");
  console.log("  ╚══════════════════════════════════════════════════╝");
  console.log();

  // Detect provider
  const provider = createProviderFromEnv();
  console.log(`  Provider: ${provider.constructor.name}`);
  console.log();

  // Initialize components
  const eventBus = new EventBus();
  const trustGraph = new TrustGraph({ preTrusted: [] });

  // Set up event logging
  const eventLog: ArenaEvent[] = [];
  let publicMsgCount = 0;
  let privateMsgCount = 0;
  let crisisCount = 0;

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
        const text = msg.content.length > 80 ? msg.content.slice(0, 80) + "..." : msg.content;
        console.log(`  📢 [PUBLIC] ${msg.sender.slice(0, 8)}: "${text}"`);
        break;
      }

      case "chat.private": {
        const msg = (event.data as any).message;
        privateMsgCount++;
        console.log(`  🔒 [PRIVATE] ${msg.sender.slice(0, 8)} → ${String(msg.recipient).slice(0, 8)}`);
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
          console.log(`  ✅ Crisis resolved!`);
        } else {
          console.log(`  ❌ Crisis failed! Penalty: ${data.penalty}`);
        }
        break;
      }

      case "trust.updated": {
        const updates = (event.data as any).updates;
        for (const u of updates) {
          const emoji = u.delta > 0 ? "📈" : "📉";
          console.log(`  ${emoji} Trust: ${u.from.slice(0, 8)} → ${u.to.slice(0, 8)} (${u.delta >= 0 ? "+" : ""}${u.delta.toFixed(2)})`);
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
          const persona = PERSONAS.find((p) => id.includes(p.name));
          const name = persona ? persona.name : id.slice(0, 8);
          console.log(`    ${name}: ${score} VP`);
        }
        break;
      }
    }
  });

  // Create game engine
  const engine = new ComedyEngine(GAME_CONFIG, eventBus, trustGraph);

  // Create and register LLM agents
  const agents: GameAgent[] = [];
  for (const persona of PERSONAS) {
    const agentId = uuid();
    const agent = new LLMAgent(persona.path, agentId, provider);
    agents.push(agent);
    engine.registerAgent(agent);
  }

  // Run the game
  console.log("Players:");
  for (const agent of agents) {
    console.log(`  - ${agent.identity.name} [${agent.id.slice(0, 8)}]`);
  }
  console.log();

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
    return agent ? agent.identity.name : id.slice(0, 6);
  });

  console.log(`  ${"".padEnd(12)} ${agentNames.map((n) => n.padEnd(8)).join(" ")}`);
  for (let i = 0; i < trustAgents.length; i++) {
    const row = matrix[i].map((v) => {
      if (v === 0) return "  ·   ";
      return (v > 0 ? "+" : "") + v.toFixed(2);
    });
    console.log(`  ${agentNames[i].padEnd(12)} ${row.map((r) => r.padEnd(8)).join(" ")}`);
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

  // API log summary
  const llmAgents = agents.filter((a) => a instanceof LLMAgent) as LLMAgent[];
  console.log("\n  LLM API Calls:");
  for (const agent of llmAgents) {
    const log = agent.getApiLog();
    const totalMs = log.reduce((s, l) => s + l.latencyMs, 0);
    console.log(`    ${agent.identity.name}: ${log.length} calls, ${totalMs}ms total`);
  }

  console.log("\n✨ Simulation complete!\n");
}

// ============================================================
// Run
// ============================================================

runSimulation().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
