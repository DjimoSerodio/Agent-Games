import { beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../src/core/event-bus.js";
import type {
  Action,
  ActionOutcome,
  AgentIdentity,
  GameAgent,
  GameConfig,
  GameEffect,
  GameState,
  Message,
  RoundResult,
  TrustUpdate,
} from "../src/core/types.js";
import { GameEngine } from "../src/core/game-engine.js";

function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    id: "pause-test-game",
    type: "pause-test",
    maxPlayers: 2,
    minPlayers: 1,
    maxRounds: 2,
    entryFeeWei: 0n,
    moveFeeWei: 0n,
    messageFeeWei: 0n,
    timeouts: {
      negotiationMs: 100,
      actionMs: 100,
    },
    ...overrides,
  };
}

class MockAgent implements GameAgent {
  id: string;
  identity: AgentIdentity;

  constructor(id: string) {
    this.id = id;
    this.identity = {
      id,
      name: id,
      address: `0x${id.padEnd(40, "0")}`,
      skillsHash: "mock",
      registeredAt: Date.now(),
    };
  }

  async initialize(): Promise<void> {}
  async negotiate(): Promise<Message[]> {
    return [];
  }
  async act(): Promise<Action[]> {
    return [];
  }
  async reflect(): Promise<void> {}
}

interface TestState extends GameState {
  productionRuns: number;
}

class TestEngine extends GameEngine<TestState> {
  public async runOneRound(): Promise<void> {
    await this.executeRound();
  }

  protected createInitialState(config: GameConfig): TestState {
    return {
      gameId: config.id,
      round: 0,
      phase: "setup",
      players: [],
      scores: {},
      isFinished: false,
      winner: null,
      productionRuns: 0,
    };
  }

  protected getAgentView(): unknown {
    return {};
  }

  protected getLegalActions(): Action[] {
    return [];
  }

  protected executeProduction(): void {
    this.state.productionRuns += 1;
  }

  protected resolveActions(actions: Map<string, Action[]>): RoundResult {
    const emptyOutcomes: ActionOutcome[] = [];
    const emptyTrust: TrustUpdate[] = [];
    const emptyMessages: Message[] = [];
    return {
      gameId: this.state.gameId,
      round: this.state.round,
      actions: Object.fromEntries(actions.entries()),
      outcomes: emptyOutcomes,
      scoreChanges: {},
      trustUpdates: emptyTrust,
      messages: emptyMessages,
    };
  }

  protected checkGameEnd(): boolean {
    return false;
  }

  protected computeFinalScores(): Record<string, number> {
    return {};
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("GameEngine pause gate", () => {
  let eventBus: EventBus;
  let engine: TestEngine;

  beforeEach(() => {
    eventBus = new EventBus();
    engine = new TestEngine(makeConfig(), eventBus);
    engine.registerAgent(new MockAgent("agent-1"));
  });

  it("blocks before starting the next phase when the pause gate is unresolved", async () => {
    const phaseEvents: string[] = [];
    eventBus.subscribeSpectator((event) => {
      if (event.type === "game.phase.change") {
        phaseEvents.push((event.data as { phase: string }).phase);
      }
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    let calls = 0;
    engine.setPauseGate(() => {
      calls += 1;
      return calls === 1 ? gate : Promise.resolve();
    });

    const roundPromise = engine.runOneRound();
    await delay(25);

    expect(phaseEvents).toEqual([]);
    expect(engine.getState().round).toBe(0);

    release();
    await roundPromise;

    expect(engine.getState().round).toBe(1);
    expect(phaseEvents).toEqual(["production", "negotiation", "action", "resolution"]);
  });

  it("checks the pause gate at each phase boundary", async () => {
    let calls = 0;
    engine.setPauseGate(async () => {
      calls += 1;
    });

    await engine.runOneRound();

    expect(calls).toBe(6);
    expect(engine.getState().productionRuns).toBe(1);
  });

  it("can pause mid-round before a later phase begins", async () => {
    const phaseEvents: string[] = [];
    eventBus.subscribeSpectator((event) => {
      if (event.type === "game.phase.change") {
        phaseEvents.push((event.data as { phase: string }).phase);
      }
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    let calls = 0;
    engine.setPauseGate(() => {
      calls += 1;
      return calls === 3 ? gate : Promise.resolve();
    });

    const roundPromise = engine.runOneRound();
    await delay(25);

    expect(phaseEvents).toEqual(["production"]);

    release();
    await roundPromise;

    expect(phaseEvents).toEqual(["production", "negotiation", "action", "resolution"]);
  });
});
