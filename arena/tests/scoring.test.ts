import { describe, expect, it } from "vitest";
import { AgentId } from "../src/core/types.js";
import {
  computeAllianceVPUpdates,
  computeBonusHolderUpdates,
  computePlayerScores,
  getAllianceVPFromMap,
} from "../src/games/nexus/scoring.js";
import { ComedyGameState, ComedyPlayerState, EMPTY_INVENTORY } from "../src/games/nexus/types.js";

function makePlayer(id: AgentId, overrides: Partial<ComedyPlayerState> = {}): ComedyPlayerState {
  return {
    id,
    resources: { ...EMPTY_INVENTORY },
    influence: 0,
    structures: {
      villages: [],
      townships: [],
      cities: [],
      beacons: [],
      tradePosts: [],
      roads: [],
    },
    armies: [],
    vp: 0,
    longestRoad: 0,
    revealedHexes: new Set(),
    ...overrides,
  };
}

function makeState(playerStates: Map<AgentId, ComedyPlayerState>): ComedyGameState {
  return {
    gameId: "g",
    round: 2,
    phase: "resolution",
    players: Array.from(playerStates.keys()),
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
    playerStates,
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
    actualMaxRounds: 30,
    allianceCooperationRounds: new Map(),
    allianceVP: new Map(),
  };
}

describe("scoring module", () => {
  it("computePlayerScores returns VP map", () => {
    const players = new Map<AgentId, ComedyPlayerState>([
      ["a", makePlayer("a", { vp: 4 })],
      ["b", makePlayer("b", { vp: 7 })],
    ]);
    expect(computePlayerScores(players)).toEqual({ a: 4, b: 7 });
  });

  it("computeAllianceVPUpdates awards VP at sustained cooperation threshold", () => {
    const players = new Map<AgentId, ComedyPlayerState>([
      ["a", makePlayer("a")],
      ["b", makePlayer("b")],
    ]);
    const state = makeState(players);
    state.allianceCooperationRounds.set("a", new Map([["b", 2]]));
    state.allianceCooperationRounds.set("b", new Map([["a", 2]]));

    const result = computeAllianceVPUpdates(
      state,
      [{ from: "a", to: "b", round: 3 }],
      [],
      [],
    );

    expect(result.allianceVP.get("a")).toBe(1);
    expect(result.allianceVP.get("b")).toBe(1);
    expect(result.formedAlliances).toHaveLength(1);
  });

  it("computeAllianceVPUpdates applies sabotage break penalty", () => {
    const players = new Map<AgentId, ComedyPlayerState>([
      ["a", makePlayer("a")],
      ["b", makePlayer("b")],
    ]);
    const state = makeState(players);
    state.allianceVP.set("a", 3);
    state.allianceCooperationRounds.set("a", new Map([["b", 3]]));
    state.allianceCooperationRounds.set("b", new Map([["a", 3]]));

    const result = computeAllianceVPUpdates(
      state,
      [],
      [{ from: "a", to: "b", round: 4 }],
      [],
    );

    expect(result.allianceVP.get("a")).toBe(1);
    expect(result.allianceCooperationRounds.get("a")?.get("b")).toBe(0);
    expect(result.brokenAlliances).toHaveLength(1);
  });

  it("computeBonusHolderUpdates picks longest road and most influence", () => {
    const players = new Map<AgentId, ComedyPlayerState>([
      ["a", makePlayer("a", { longestRoad: 6, influence: 1 })],
      ["b", makePlayer("b", { longestRoad: 2, influence: 5 })],
    ]);

    const updates = computeBonusHolderUpdates(players);
    expect(updates).toContainEqual({ kind: "longestRoad", holder: "a", thresholdMet: true });
    expect(updates).toContainEqual({ kind: "mostInfluence", holder: "b", thresholdMet: true });
  });

  it("getAllianceVPFromMap defaults to zero", () => {
    expect(getAllianceVPFromMap(new Map(), "missing")).toBe(0);
  });
});
