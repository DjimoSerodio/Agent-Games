import { AgentStrategy } from "../agents/simple-agent.js";
import { ArenaEvent } from "../core/types.js";
import { DEFAULT_LOCAL_COMEDY_BOTS, runLocalComedyHarness } from "./comedy-local.js";

function parseStrategies(): AgentStrategy[] {
  const raw = process.env.BOT_STRATEGIES?.trim();
  if (!raw) return DEFAULT_LOCAL_COMEDY_BOTS.map((bot) => bot.strategy);
  return raw.split(",").map((value) => value.trim()).filter(Boolean) as AgentStrategy[];
}

function logEvent(event: ArenaEvent): void {
  switch (event.type) {
    case "game.started":
      console.log(`\n🎮 Local Comedy game started`);
      break;
    case "game.round.start":
      console.log(`\n── Round ${(event.data as any).round} ──`);
      break;
    case "chat.public": {
      const message = (event.data as any).message;
      console.log(`📢 ${String(message.sender).slice(0, 8)}: ${message.content}`);
      break;
    }
    case "crisis.triggered": {
      const crisis = (event.data as any).crisis;
      console.log(`⚠️ Crisis: ${crisis.name}`);
      break;
    }
    case "trust.updated": {
      const updates = (event.data as any).updates ?? [];
      for (const update of updates) {
        console.log(`📈 Trust ${String(update.from).slice(0, 8)} -> ${String(update.to).slice(0, 8)} ${update.delta > 0 ? "+" : ""}${update.delta.toFixed(2)} [${update.reason}]`);
      }
      break;
    }
    case "game.ended": {
      const data = event.data as any;
      console.log(`\n🏁 Game ended after ${data.rounds} rounds. Winner: ${data.winner ?? "None"}`);
      break;
    }
  }
}

async function main(): Promise<void> {
  const strategies = parseStrategies();
  const paceDelayMs = Number.parseInt(process.env.PACE_MS ?? "0", 10) || 0;
  const maxRounds = Number.parseInt(process.env.MAX_ROUNDS ?? "25", 10) || 25;

  const result = await runLocalComedyHarness({
    bots: strategies.map((strategy, index) => ({
      strategy,
      name: DEFAULT_LOCAL_COMEDY_BOTS[index]?.name ?? `Emu_${index + 1}_${strategy}`,
    })),
    paceDelayMs,
    gameConfig: { maxRounds },
    onSpectatorEvent: logEvent,
  });

  console.log(`\n══ Local Comedy Harness Summary ══`);
  console.log(`Rounds: ${result.results.length}`);
  console.log(`Winner: ${result.finalState.winner ?? "None"}`);
  console.log(`Prize Pool: ${Number(result.finalState.prizePool) / 1e18} ETH`);
  console.log(`Trust snapshots:`);
  for (const snapshot of result.trustGraph.getAllSnapshots().sort((a, b) => b.globalScore - a.globalScore)) {
    const agent = result.agents.find((candidate) => candidate.id === snapshot.agentId);
    console.log(`  ${agent?.identity.name ?? snapshot.agentId}: ${snapshot.globalScore.toFixed(3)}`);
  }
}

main().catch((err) => {
  console.error("Local Comedy harness failed:", err);
  process.exit(1);
});
