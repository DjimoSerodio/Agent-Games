import { describe, expect, it } from "vitest";
import { computeCrisisPenalties, computeCrisisResolution, selectCrisisType } from "../src/games/nexus/crisis.js";
import { ComedyPlayerState, CrisisEvent, EMPTY_INVENTORY } from "../src/games/nexus/types.js";

function makeCrisis(type: CrisisEvent["type"]): CrisisEvent {
  return {
    type,
    name: "Crisis",
    description: "",
    threshold: { grain: 2, timber: 0, ore: 0, fish: 0, water: 0, energy: 0 },
    rewardVP: 1,
    rewardInfluence: 1,
    penaltyDescription: "",
    contributions: {},
    resolved: false,
    triggeredRound: 1,
  };
}

function makePlayer(id: string): ComedyPlayerState {
  return {
    id,
    resources: { ...EMPTY_INVENTORY },
    influence: 0,
    structures: { villages: [], townships: [], cities: [], beacons: [], tradePosts: [], roads: [] },
    armies: [],
    vp: 0,
    longestRoad: 0,
    revealedHexes: new Set(),
  };
}

describe("crisis module", () => {
  it("selectCrisisType uses rng index", () => {
    const type = selectCrisisType(["blight", "storm"], () => 0.99);
    expect(type).toBe("storm");
  });

  it("computeCrisisResolution resolves when threshold met", () => {
    const crisis = makeCrisis("blight");
    const contributions = new Map([
      ["a", { ...EMPTY_INVENTORY, grain: 2 }],
      ["b", { ...EMPTY_INVENTORY, grain: 1 }],
    ]);
    const result = computeCrisisResolution(crisis, contributions);
    expect(result.resolved).toBe(true);
    expect(result.totalContrib.grain).toBe(3);
  });

  it("computeCrisisResolution stays unresolved when short", () => {
    const crisis = makeCrisis("blight");
    const contributions = new Map([
      ["a", { ...EMPTY_INVENTORY, grain: 1 }],
    ]);
    const result = computeCrisisResolution(crisis, contributions);
    expect(result.resolved).toBe(false);
  });

  it("computeCrisisPenalties penalizes everyone for the rift", () => {
    const crisis = makeCrisis("the_rift");
    const players = new Map([["a", makePlayer("a")], ["b", makePlayer("b")]]);
    const penalties = computeCrisisPenalties(crisis, players);
    expect(penalties.get("a")).toBe(-1);
    expect(penalties.get("b")).toBe(-1);
  });

  it("computeCrisisPenalties no score penalties for non-rift crises", () => {
    const crisis = makeCrisis("storm");
    const players = new Map([["a", makePlayer("a")]]);
    const penalties = computeCrisisPenalties(crisis, players);
    expect(penalties.size).toBe(0);
  });
});
