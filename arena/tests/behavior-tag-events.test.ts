import { describe, expect, it } from "vitest";
import { EventBus } from "../src/core/event-bus.js";
import type { GameConfig } from "../src/core/types.js";
import { TragedyEngine } from "../src/games/nexus/tragedy-engine.js";
import { TrustGraph } from "../src/trust/trust-graph.js";

function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    id: "test-game",
    type: "nexus",
    maxPlayers: 4,
    minPlayers: 2,
    maxRounds: 25,
    entryFeeWei: 0n,
    moveFeeWei: 0n,
    messageFeeWei: 0n,
    timeouts: {
      negotiationMs: 5000,
      actionMs: 5000,
    },
    ...overrides,
  };
}

describe("behavior.tagged spectator events", () => {
  it("projects live behavior tags to the visible spectator shape", () => {
    const events: Array<{ type: string; data: unknown }> = [];
    const eventBus = new EventBus();
    const trustGraph = new TrustGraph();
    const engine = new TragedyEngine(makeConfig(), eventBus, trustGraph);

    eventBus.subscribeSpectator((event) => {
      events.push({ type: event.type, data: event.data });
    });

    const recordBehaviorTag = Reflect.get(engine, "recordBehaviorTag") as
      | ((
          actor: string,
          kind: string,
          relatedAgentId: string | undefined,
          description: string,
          severity: string,
          trustDeltaHint?: number,
        ) => unknown)
      | undefined;

    expect(recordBehaviorTag).toBeTypeOf("function");

    recordBehaviorTag?.call(
      engine,
      "agent-1",
      "sabotage",
      "agent-2",
      "Damaged a shared ecosystem.",
      "high",
      -0.25,
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("behavior.tagged");

    const emittedTag = events[0]?.data as Record<string, unknown>;

    expect(Object.keys(emittedTag).sort()).toEqual([
      "actor",
      "description",
      "id",
      "kind",
      "round",
      "severity",
    ]);
    expect(emittedTag.id).toMatch(/^behavior-\d+$/);
    expect(emittedTag.round).toBe(0);
    expect(emittedTag.actor).toBe("agent-1");
    expect(emittedTag.kind).toBe("sabotage");
    expect(emittedTag.severity).toBe("high");
    expect(emittedTag.description).toBe("Damaged a shared ecosystem.");
  });
});
