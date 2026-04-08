import { describe, expect, it, vi } from "vitest";
import { resolveArmyAttack, resolveArmyBuild, resolveArmyMove } from "../src/games/nexus/combat.js";
import { ComedyGameState, ComedyPlayerState, EMPTY_INVENTORY } from "../src/games/nexus/types.js";

function player(id: string): ComedyPlayerState {
  return {
    id,
    resources: { ...EMPTY_INVENTORY, ore: 2, energy: 4 },
    influence: 0,
    structures: { villages: [], townships: [], cities: [], beacons: [], tradePosts: [], roads: [] },
    armies: [],
    vp: 0,
    longestRoad: 0,
    revealedHexes: new Set(),
  };
}

function makeState(a: ComedyPlayerState, b: ComedyPlayerState): ComedyGameState {
  return {
    gameId: "g",
    round: 3,
    phase: "action",
    players: ["a", "b"],
    scores: {},
    isFinished: false,
    winner: null,
    hexGrid: new Map(),
    worldMap: {
      id: "w",
      name: "w",
      regions: [],
      ecosystems: [],
      assets: {
        frame: "",
        compass: "",
        underlay: "",
        resourceIcons: { grain: "", timber: "", ore: "", fish: "", water: "", energy: "" },
        ecosystemIcons: { fishery: "", forest: "", aquifer: "", wetland: "" },
      },
      startingRegionIds: [],
      hexSize: 1,
    },
    vertices: [],
    edges: [],
    playerStates: new Map([["a", a], ["b", b]]),
    productionWheel: [],
    wheelPosition: 0,
    activeCrisis: null,
    crisisHistory: [],
    crisisCooldown: 0,
    ecosystems: [],
    ecosystemExtractions: [],
    longestRoadHolder: null,
    mostInfluenceHolder: null,
    mostCrisisContribHolder: null,
    prizePool: 0n,
    payablePrizePool: 0n,
    slashedPrizePool: 0n,
    carryoverPrizePool: 0n,
    moveCount: 0,
    messageCount: 0,
    commitmentCandidates: [],
    commitments: [],
    attestations: [],
    contestedClaims: [],
    behaviorTags: [],
    payoutReceipts: [],
    commonsHealthHistory: [],
    currentCommonsHealth: {
      round: 0,
      score: 100,
      payableFraction: 1,
      reasons: [],
      payablePrizePoolWei: "0",
      slashedPrizePoolWei: "0",
      carryoverPrizePoolWei: "0",
    },
    actualMaxRounds: 20,
    allianceCooperationRounds: new Map(),
    allianceVP: new Map(),
  };
}

describe("combat module", () => {
  it("builds an army when resources are sufficient", () => {
    const a = player("a");
    a.structures.villages.push({ hexes: [{ q: 0, r: 0 }], structure: "village", owner: "a" });
    const state = makeState(a, player("b"));
    const result = resolveArmyBuild("a", a, {}, state);
    expect(result.success).toBe(true);
    expect(a.armies.length).toBe(1);
  });

  it("moves an army one hex", () => {
    const a = player("a");
    a.armies.push({ id: "army-1", owner: "a", position: { q: 0, r: 0 }, count: 1 });
    const state = makeState(a, player("b"));
    const result = resolveArmyMove("a", "army-1", { q: 1, r: 0 }, state);
    expect(result.success).toBe(true);
    expect(a.armies[0].position).toEqual({ q: 1, r: 0 });
  });

  it("rejects moves longer than one hex", () => {
    const a = player("a");
    a.armies.push({ id: "army-1", owner: "a", position: { q: 0, r: 0 }, count: 1 });
    const state = makeState(a, player("b"));
    const result = resolveArmyMove("a", "army-1", { q: 2, r: 0 }, state);
    expect(result.success).toBe(false);
  });

  it("resolves successful attack and emits trust penalties", () => {
    const a = player("a");
    const b = player("b");
    a.armies.push({ id: "army-1", owner: "a", position: { q: 0, r: 0 }, count: 2 });
    b.structures.townships.push({ hexes: [{ q: 0, r: 1 }], structure: "township", owner: "b" });
    const state = makeState(a, b);
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const result = resolveArmyAttack("a", "army-1", "b", state);
    expect(result.success).toBe(true);
    expect(result.trustUpdates.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});
