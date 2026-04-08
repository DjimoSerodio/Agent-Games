import { describe, expect, it } from "vitest";
import { AgentId } from "../src/core/types.js";
import {
  computeCommonsCycleEffects,
  computeCommonsHealthRefresh,
  computeEcosystemStatus,
  getEcosystemYieldMultiplier,
  getRestorationCost,
} from "../src/games/nexus/ecosystem.js";
import { ComedyGameState, ComedyPlayerState, EcosystemState, EMPTY_INVENTORY } from "../src/games/nexus/types.js";

function ecosystem(overrides: Partial<EcosystemState> = {}): EcosystemState {
  return {
    id: "eco-1",
    name: "Test Eco",
    kind: "forest",
    resource: "timber",
    regionIds: ["r1"],
    label: { x: 0, y: 0 },
    health: 50,
    maxHealth: 100,
    collapseThreshold: 20,
    flourishThreshold: 70,
    baseRegeneration: 2,
    extractionProfiles: [],
    lastPressure: 0,
    lastYield: 0,
    lastDelta: 0,
    status: "stable",
    asset: "",
    description: "",
    ...overrides,
  };
}

function player(id: AgentId): ComedyPlayerState {
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

function makeState(ecosystems: EcosystemState[], players: Map<AgentId, ComedyPlayerState>): ComedyGameState {
  return {
    gameId: "g",
    round: 3,
    phase: "resolution",
    players: Array.from(players.keys()),
    scores: {},
    isFinished: false,
    winner: null,
    hexGrid: new Map(),
    worldMap: {
      id: "w",
      name: "w",
      regions: [{
        id: "r1",
        name: "Region 1",
        coord: { q: 0, r: 0 },
        biome: "taiga",
        primaryResource: "timber",
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
    playerStates: players,
    productionWheel: [],
    wheelPosition: 0,
    activeCrisis: null,
    crisisHistory: [],
    crisisCooldown: 0,
    ecosystems,
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
    actualMaxRounds: 30,
    allianceCooperationRounds: new Map(),
    allianceVP: new Map(),
  };
}

describe("ecosystem module", () => {
  it("computes ecosystem status across thresholds", () => {
    expect(computeEcosystemStatus(ecosystem({ health: 20 }))).toBe("collapsed");
    expect(computeEcosystemStatus(ecosystem({ health: 80 }))).toBe("flourishing");
    expect(computeEcosystemStatus(ecosystem({ health: 45 }))).toBe("strained");
    expect(computeEcosystemStatus(ecosystem({ health: 60 }))).toBe("stable");
  });

  it("returns expected yield multipliers", () => {
    expect(getEcosystemYieldMultiplier(ecosystem({ status: "flourishing" }))).toBe(1.35);
    expect(getEcosystemYieldMultiplier(ecosystem({ status: "collapsed" }))).toBe(0.45);
    expect(getEcosystemYieldMultiplier(ecosystem({ status: "stable" }))).toBe(1);
  });

  it("returns restoration costs by ecosystem kind", () => {
    expect(getRestorationCost("fishery")).toEqual({ grain: 0, timber: 0, ore: 0, fish: 0, water: 1, energy: 1 });
    expect(getRestorationCost("wetland")).toEqual({ grain: 1, timber: 0, ore: 0, fish: 0, water: 1, energy: 0 });
  });

  it("computes commons cycle pressure from extraction and armies", () => {
    const p = player("a");
    p.armies.push({ id: "army-1", owner: "a", count: 2, position: { q: 0, r: 1 } });
    const players = new Map<AgentId, ComedyPlayerState>([["a", p]]);
    const state = makeState([ecosystem({ health: 50 })], players);
    state.ecosystemExtractions.push({ ecosystemId: "eco-1", agentId: "a", level: "medium", pressure: 1, yield: 2, round: 3 });

    const result = computeCommonsCycleEffects(state, players);
    expect(result.ecosystems[0].lastPressure).toBeCloseTo(1.1, 5);
    expect(result.ecosystems[0].health).toBeCloseTo(50.9, 5);
  });

  it("computes commons health refresh summary", () => {
    const refresh = computeCommonsHealthRefresh([
      ecosystem({ health: 90, status: "flourishing" }),
      ecosystem({ health: 10, status: "collapsed" }),
      ecosystem({ health: 40, status: "strained" }),
    ]);
    expect(refresh.ecosystemAverage).toBe(47);
    expect(refresh.flourishing).toBe(1);
    expect(refresh.collapsed).toBe(1);
    expect(refresh.strained).toBe(1);
  });
});
