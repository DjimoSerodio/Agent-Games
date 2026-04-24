/**
 * Tragedy of the Commons — Minimax LLM Agent Simulation
 *
 * Run a complete game with MiniMax-powered LLM agents for testing.
 * Uses the MiniMax Anthropic-compatible API (set MINIMAX_API_KEY env var).
 *
 * Usage:
 *   MINIMAX_API_KEY=sk-cp-... npm run simulate:minimax
 *   MINIMAX_API_KEY=sk-cp-... npm run simulate:minimax -- --rounds=8
 *   MINIMAX_API_KEY=sk-cp-... npm run simulate:minimax -- \
 *     --personas=alice-cooperator,bob-strategist,carol-opportunist,dave-builder \
 *     --output=./tmp/minimax-run.json
 *
 * Or with Anthropic:
 *   ANTHROPIC_API_KEY=sk-ant-... npm run simulate:minimax
 */

import { mkdir, writeFile } from "fs/promises";
import { basename, dirname, extname, isAbsolute, resolve } from "path";
import { v4 as uuid } from "uuid";
import { EventBus } from "../../core/event-bus.js";
import { GameConfig, ArenaEvent } from "../../core/types.js";
import { TragedyEngine } from "./tragedy-engine.js";
import { TrustGraph } from "../../trust/trust-graph.js";
import { LLMAgent } from "../../agents/llm-agent.js";
import { createProvider } from "../../agents/providers.js";
import type { GameAgent } from "../../core/types.js";

// ============================================================
// Configuration
// ============================================================

interface PersonaSpec {
  name: string;
  path: string;
}

interface SimulationCliConfig {
  rounds: number;
  personas: PersonaSpec[];
  outputPath?: string;
}

interface FinalScore {
  agentId: string;
  name: string;
  score: number;
}

const DEFAULT_PERSONAS: PersonaSpec[] = [
  { name: "Alice", path: resolve(import.meta.dirname, "../../../personas/alice-cooperator.md") },
  { name: "Bob", path: resolve(import.meta.dirname, "../../../personas/bob-strategist.md") },
  { name: "Carol", path: resolve(import.meta.dirname, "../../../personas/carol-opportunist.md") },
  { name: "Dave", path: resolve(import.meta.dirname, "../../../personas/dave-builder.md") },
];

const PERSONA_DIR = resolve(import.meta.dirname, "../../../personas");

function createGameConfig(maxRounds: number): GameConfig {
  return {
    id: `tragedy_${uuid().slice(0, 8)}`,
    type: "tragedy_commons",
    maxPlayers: 4,
    minPlayers: 4,
    maxRounds,
    entryFeeWei: BigInt("50000000000000000"),
    moveFeeWei: BigInt("5000000000000000"),
    messageFeeWei: BigInt("1000000000000000"),
    timeouts: {
      negotiationMs: 60_000,
      actionMs: 60_000,
    },
  };
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const trimmed = arg.slice(2);
    const [key, inlineValue] = trimmed.split("=", 2);
    if (inlineValue !== undefined) {
      args.set(key, inlineValue);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
      continue;
    }

    args.set(key, "true");
  }

  return args;
}

function titleCase(input: string): string {
  return input
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolvePersonaPath(value: string): string {
  if (isAbsolute(value)) return value;
  if (value.includes("/") || value.endsWith(".md")) {
    return resolve(process.cwd(), value);
  }

  return resolve(PERSONA_DIR, `${value}.md`);
}

function buildPersonaSpec(value: string): PersonaSpec {
  const trimmed = value.trim();
  const path = resolvePersonaPath(trimmed);
  const fileName = basename(path, extname(path));
  const firstSegment = fileName.split("-")[0] ?? fileName;

  return {
    name: titleCase(firstSegment),
    path,
  };
}

function getSimulationConfig(): SimulationCliConfig {
  const args = parseArgs(process.argv.slice(2));
  const roundsRaw = args.get("rounds") ?? process.env.SIM_MAX_ROUNDS ?? "25";
  const rounds = Number.parseInt(roundsRaw, 10);

  if (!Number.isFinite(rounds) || rounds < 1) {
    throw new Error(`Invalid rounds value: ${roundsRaw}`);
  }

  const personasRaw = args.get("personas") ?? process.env.SIM_PERSONAS;
  const personas = personasRaw
    ? personasRaw.split(",").map(buildPersonaSpec)
    : DEFAULT_PERSONAS;

  if (personas.length !== 4) {
    throw new Error(`Tragedy of the Commons requires exactly 4 personas; received ${personas.length}`);
  }

  const outputPath = args.get("output") ?? process.env.SIM_OUTPUT_PATH;

  return {
    rounds,
    personas,
    outputPath: outputPath ? resolve(process.cwd(), outputPath) : undefined,
  };
}

async function writeSummary(outputPath: string, summary: unknown): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
}

// ============================================================
// Simulation
// ============================================================

async function runSimulation() {
  const simulationConfig = getSimulationConfig();

  console.log();
  console.log("  ╔══════════════════════════════════════════════════╗");
  console.log("  ║   TRAGEDY OF THE COMMONS: MINIMAX LLM SIMULATION ║");
  console.log("  ║    Powered by MiniMax 2.7 (Anthropic API)       ║");
  console.log("  ╚══════════════════════════════════════════════════╝");
  console.log();

  // Detect provider
  const provider = createProvider();
  console.log(`  Provider: ${provider.constructor.name}`);
  console.log(`  Max rounds: ${simulationConfig.rounds}`);
  console.log(`  Personas: ${simulationConfig.personas.map((persona) => persona.name).join(", ")}`);
  if (simulationConfig.outputPath) {
    console.log(`  Output: ${simulationConfig.outputPath}`);
  }
  console.log();

  // Initialize components
  const eventBus = new EventBus();
  const trustGraph = new TrustGraph({ preTrusted: [] });

  // Set up event logging
  const eventLog: ArenaEvent[] = [];
  let publicMsgCount = 0;
  let privateMsgCount = 0;
  let crisisCount = 0;
  let roundsPlayed = 0;
  let finalScores: FinalScore[] = [];

  // Create and register LLM agents
  const agents: GameAgent[] = [];

  eventBus.subscribeSpectator((event) => {
    eventLog.push(event);

    switch (event.type) {
      case "game.started":
        console.log(`\n🎮 Game started with ${(event.data as { players: string[] }).players.length} players\n`);
        break;

      case "game.round.start": {
        const data = event.data as { round: number };
        console.log(`\n${"─".repeat(50)}`);
        console.log(`  ROUND ${data.round}`);
        console.log(`${"─".repeat(50)}`);
        break;
      }

      case "chat.public": {
        const msg = (event.data as { message: { sender: string; content: string } }).message;
        publicMsgCount++;
        const text = msg.content.length > 80 ? msg.content.slice(0, 80) + "..." : msg.content;
        console.log(`  📢 [PUBLIC] ${msg.sender.slice(0, 8)}: "${text}"`);
        break;
      }

      case "chat.private": {
        const msg = (event.data as { message: { sender: string; recipient?: string; content: string } }).message;
        privateMsgCount++;
        console.log(`  🔒 [PRIVATE] ${msg.sender.slice(0, 8)} → ${String(msg.recipient).slice(0, 8)}`);
        break;
      }

      case "crisis.triggered": {
        const crisis = (event.data as { crisis: { name: string; description: string } }).crisis;
        crisisCount++;
        console.log(`\n  ⚠️  CRISIS: ${crisis.name}`);
        console.log(`     ${crisis.description}`);
        break;
      }

      case "crisis.resolved": {
        const data = event.data as { resolved: boolean; penalty?: number };
        if (data.resolved) {
          console.log("  ✅ Crisis resolved!");
        } else {
          console.log(`  ❌ Crisis failed! Penalty: ${data.penalty}`);
        }
        break;
      }

      case "trust.updated": {
        const updates = (event.data as { updates: Array<{ from: string; to: string; delta: number }> }).updates;
        for (const update of updates) {
          const emoji = update.delta > 0 ? "📈" : "📉";
          console.log(`  ${emoji} Trust: ${update.from.slice(0, 8)} → ${update.to.slice(0, 8)} (${update.delta >= 0 ? "+" : ""}${update.delta.toFixed(2)})`);
        }
        break;
      }

      case "game.ended": {
        const data = event.data as { rounds: number; winner?: string; scores: Record<string, number> };
        roundsPlayed = data.rounds;
        console.log(`\n${"═".repeat(50)}`);
        console.log("  GAME OVER");
        console.log(`${"═".repeat(50)}`);
        console.log(`  Rounds played: ${data.rounds}`);
        console.log(`  Winner: ${data.winner?.slice(0, 8) || "None"}`);
        console.log("\n  Final Scores:");

        finalScores = Object.entries(data.scores).map(([agentId, score]) => {
          const agent = agents.find((candidate) => candidate.id === agentId);
          const name = agent ? agent.identity.name : agentId.slice(0, 8);
          console.log(`    ${name}: ${score} VP`);
          return { agentId, name, score };
        });
        break;
      }
    }
  });

  // Create game engine
  const engine = new TragedyEngine(createGameConfig(simulationConfig.rounds), eventBus, trustGraph);

  for (const persona of simulationConfig.personas) {
    const agentId = uuid();
    const agent = new LLMAgent(persona.path, agentId, { provider, name: persona.name });
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
  console.log(`  Rounds: ${roundsPlayed || results.length}`);

  // Trust graph final state
  console.log("\n  Trust Graph (final):");
  const { agents: trustAgents, matrix } = trustGraph.getTrustMatrix();
  const agentNames = trustAgents.map((agentId) => {
    const agent = agents.find((candidate) => candidate.id === agentId);
    return agent ? agent.identity.name : agentId.slice(0, 6);
  });

  console.log(`  ${"".padEnd(12)} ${agentNames.map((name) => name.padEnd(8)).join(" ")}`);
  for (let i = 0; i < trustAgents.length; i++) {
    const row = matrix[i].map((value) => {
      if (value === 0) return "  ·   ";
      return (value > 0 ? "+" : "") + value.toFixed(2);
    });
    console.log(`  ${agentNames[i].padEnd(12)} ${row.map((entry) => entry.padEnd(8)).join(" ")}`);
  }

  // Global trust scores
  console.log("\n  Global Trust Scores (EigenTrust):");
  const trustSnapshots = trustGraph.getAllSnapshots();
  for (const snapshot of trustSnapshots.sort((a, b) => b.globalScore - a.globalScore)) {
    const agent = agents.find((candidate) => candidate.id === snapshot.agentId);
    const name = agent ? agent.identity.name : snapshot.agentId.slice(0, 8);
    const bar = "█".repeat(Math.round(snapshot.globalScore * 20));
    console.log(`    ${name.padEnd(20)} ${snapshot.globalScore.toFixed(3)} ${bar}`);
  }

  // Prize pool
  const finalState = engine.getState();
  const poolEth = Number(finalState.prizePool) / 1e18;
  console.log(`\n  Prize Pool: ${poolEth.toFixed(4)} ETH`);
  console.log(`  Total Moves: ${finalState.moveCount}`);
  console.log(`  Total Messages: ${finalState.messageCount}`);

  // API log summary
  const llmAgents = agents.filter((agent): agent is LLMAgent => agent instanceof LLMAgent);
  console.log("\n  LLM API Calls:");
  for (const agent of llmAgents) {
    const log = agent.getApiLog();
    const totalMs = log.reduce((sum, entry) => sum + entry.latencyMs, 0);
    console.log(`    ${agent.identity.name}: ${log.length} calls, ${totalMs}ms total`);
  }

  const summary = {
    provider: provider.constructor.name,
    roundsConfigured: simulationConfig.rounds,
    roundsPlayed: roundsPlayed || results.length,
    durationMs: elapsed,
    personas: agents.map((agent, index) => ({
      agentId: agent.id,
      identityName: agent.identity.name,
      personaName: simulationConfig.personas[index]?.name ?? agent.identity.name,
      personaPath: simulationConfig.personas[index]?.path ?? null,
    })),
    messageCounts: {
      public: publicMsgCount,
      private: privateMsgCount,
      total: finalState.messageCount,
    },
    crisisCount,
    moveCount: finalState.moveCount,
    prizePoolWei: finalState.prizePool.toString(),
    scores: finalScores,
    trust: trustSnapshots.map((snapshot) => ({
      agentId: snapshot.agentId,
      name: agents.find((agent) => agent.id === snapshot.agentId)?.identity.name ?? snapshot.agentId,
      globalScore: snapshot.globalScore,
      rank: snapshot.rank,
      gamesPlayed: snapshot.gamesPlayed,
      timestamp: snapshot.timestamp,
      directScores: snapshot.directScores,
    })),
    apiCalls: llmAgents.map((agent) => ({
      agentId: agent.id,
      name: agent.identity.name,
      calls: agent.getApiLog().length,
      totalLatencyMs: agent.getApiLog().reduce((sum, entry) => sum + entry.latencyMs, 0),
    })),
  };

  if (simulationConfig.outputPath) {
    await writeSummary(simulationConfig.outputPath, summary);
    console.log(`\n  Wrote summary to ${simulationConfig.outputPath}`);
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
