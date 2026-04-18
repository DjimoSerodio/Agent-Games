import { v4 as uuid } from "uuid";
import { EventBus } from "../core/event-bus.js";
import { ArenaEvent, GameConfig, RoundResult } from "../core/types.js";
import { SimpleAgent, AgentStrategy } from "../agents/simple-agent.js";
import { TrustGraph } from "../trust/trust-graph.js";
import { ComedyEngine } from "../games/nexus/comedy-engine.js";
import { ComedyGameState } from "../games/nexus/types.js";

export interface LocalComedyBotConfig {
  name?: string;
  strategy: AgentStrategy;
}

export interface LocalComedyHarnessConfig {
  gameConfig?: Partial<GameConfig>;
  bots?: LocalComedyBotConfig[];
  paceDelayMs?: number;
  preTrusted?: string[];
  onSpectatorEvent?: (event: ArenaEvent) => void;
}

export interface LocalComedyHarnessResult {
  config: GameConfig;
  agents: SimpleAgent[];
  engine: ComedyEngine;
  trustGraph: TrustGraph;
  eventLog: ArenaEvent[];
  results: RoundResult[];
  finalState: ComedyGameState;
}

export const DEFAULT_LOCAL_COMEDY_BOTS: LocalComedyBotConfig[] = [
  { name: "Alice_Cooperator", strategy: "cooperator" },
  { name: "Bob_TitForTat", strategy: "tit_for_tat" },
  { name: "Charlie_Diplomat", strategy: "diplomat" },
  { name: "Dave_Defector", strategy: "defector" },
];

export function createDefaultComedyGameConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    id: `comedy_${uuid().slice(0, 8)}`,
    type: "comedy_commons",
    maxPlayers: 4,
    minPlayers: 4,
    maxRounds: 25,
    entryFeeWei: BigInt("50000000000000000"),
    moveFeeWei: BigInt("5000000000000000"),
    messageFeeWei: BigInt("1000000000000000"),
    timeouts: {
      negotiationMs: 30000,
      actionMs: 15000,
    },
    ...overrides,
  };
}

export async function runLocalComedyHarness(config: LocalComedyHarnessConfig = {}): Promise<LocalComedyHarnessResult> {
  const eventBus = new EventBus();
  const trustGraph = new TrustGraph({
    preTrusted: config.preTrusted ?? [],
  });
  const eventLog: ArenaEvent[] = [];

  eventBus.subscribeSpectator((event) => {
    eventLog.push(event);
    config.onSpectatorEvent?.(event);
  });

  const gameConfig = createDefaultComedyGameConfig(config.gameConfig);
  const engine = new ComedyEngine(gameConfig, eventBus, trustGraph);
  engine.paceDelayMs = config.paceDelayMs ?? 0;

  const botConfigs = config.bots && config.bots.length > 0 ? config.bots : DEFAULT_LOCAL_COMEDY_BOTS;
  const agents = botConfigs.map((bot) => new SimpleAgent(uuid(), bot.strategy, bot.name));
  for (const agent of agents) {
    engine.registerAgent(agent);
  }

  const results = await engine.run();
  return {
    config: gameConfig,
    agents,
    engine,
    trustGraph,
    eventLog,
    results,
    finalState: engine.getState() as ComedyGameState,
  };
}
