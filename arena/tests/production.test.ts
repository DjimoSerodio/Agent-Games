import { describe, expect, it } from "vitest";
import { AgentId } from "../src/core/types.js";
import { computeProductionYields, getRegionProductionModifier } from "../src/games/nexus/production.js";
import { TragedyGameState, TragedyPlayerState, EMPTY_INVENTORY } from "../src/games/nexus/types.js";

function player(id: AgentId): TragedyPlayerState {
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

function makeState(playerStates: Map<AgentId, TragedyPlayerState>): TragedyGameState {
  const hexGrid = new Map<string, any>();
  hexGrid.set("0,0", { coord: { q: 0, r: 0 }, terrain: "plains", productionNumber: 6, revealed: true, revealedBy: [], regionId: "r1" });
  return {
    gameId: "g",
    round: 2,
    phase: "production",
    players: Array.from(playerStates.keys()),
    scores: {},
    isFinished: false,
    winner: null,
    hexGrid,
    worldMap: {
      id: "w",
      name: "w",
      regions: [{
        id: "r1",
        name: "R1",
        coord: { q: 0, r: 0 },
        biome: "farmland",
        primaryResource: "grain",
        secondaryResources: [],
        productionNumber: 6,
        anchor: { x: 0, y: 0 },
        polygon: [],
        label: { x: 0, y: 0 },
        adjacentRegionIds: [],
        ecosystemIds: ["eco-1"],
        flavor: "",
      }],
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
    playerStates,
    productionWheel: [6],
    wheelPosition: 0,
    activeCrisis: null,
    crisisHistory: [],
    crisisCooldown: 0,
    ecosystems: [{
      id: "eco-1",
      name: "eco",
      kind: "forest",
      resource: "timber",
      regionIds: ["r1"],
      label: { x: 0, y: 0 },
      health: 80,
      maxHealth: 100,
      collapseThreshold: 20,
      flourishThreshold: 70,
      baseRegeneration: 1,
      extractionProfiles: [],
      lastPressure: 0,
      lastYield: 0,
      lastDelta: 0,
      status: "stable",
      asset: "",
      description: "",
    }],
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
    actualMaxRounds: 25,
    allianceCooperationRounds: new Map(),
    allianceVP: new Map(),
  };
}

describe("production module", () => {
  it("computes base yield when adjacent structure exists", () => {
    const a = player("a");
    a.structures.villages.push({ hexes: [{ q: 0, r: 0 }], structure: "village", owner: "a", regionId: "r1" });
    const state = makeState(new Map([["a", a]]));
    const yields = computeProductionYields(state, 6);
    expect(yields.get("a")?.grain).toBe(1);
  });

  it("adds city bonus yield", () => {
    const a = player("a");
    a.structures.cities.push({ hexes: [{ q: 0, r: 0 }], structure: "city", owner: "a", regionId: "r1" });
    const state = makeState(new Map([["a", a]]));
    const yields = computeProductionYields(state, 6);
    expect(yields.get("a")?.grain).toBe(2);
  });

  it("adds flourishing ecosystem region modifier", () => {
    const a = player("a");
    a.structures.villages.push({ hexes: [{ q: 0, r: 0 }], structure: "village", owner: "a", regionId: "r1" });
    const state = makeState(new Map([["a", a]]));
    state.ecosystems[0].status = "flourishing";
    const yields = computeProductionYields(state, 6);
    expect(yields.get("a")?.grain).toBe(2);
  });

  it("respects resource cap while granting yields", () => {
    const a = player("a");
    a.resources = { grain: 14, timber: 0, ore: 0, fish: 0, water: 0, energy: 0 };
    a.structures.villages.push({ hexes: [{ q: 0, r: 0 }], structure: "village", owner: "a", regionId: "r1" });
    const state = makeState(new Map([["a", a]]));
    const yields = computeProductionYields(state, 6);
    expect(yields.get("a")?.grain || 0).toBe(0);
  });

  it("getRegionProductionModifier reflects ecosystem status", () => {
    const modifier = getRegionProductionModifier("r1", [
      { ...makeState(new Map()).ecosystems[0], status: "flourishing" },
      { ...makeState(new Map()).ecosystems[0], id: "eco-2", status: "collapsed", regionIds: ["r1"] },
    ]);
    expect(modifier).toBe(0);
  });
});
