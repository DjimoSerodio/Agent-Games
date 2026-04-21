import { describe, expect, it } from "vitest";
import { AgentId } from "../src/core/types.js";
import { SimpleAgent } from "../src/agents/simple-agent.js";
import {
  EMPTY_INVENTORY,
  EcosystemState,
  HexVertex,
  TragedyAgentView,
  WorldMap,
} from "../src/games/nexus/types.js";

function makeWorldMap(): WorldMap {
  return {
    id: "world-1",
    name: "test world",
    regions: [
      {
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
        ecosystemIds: ["eco-weak", "eco-rich"],
        flavor: "",
      },
    ],
    ecosystems: [],
    assets: {
      frame: "",
      compass: "",
      underlay: "",
      resourceIcons: { grain: "", timber: "", ore: "", fish: "", water: "", energy: "" },
      ecosystemIcons: { fishery: "", forest: "", aquifer: "", wetland: "" },
    },
    startingRegionIds: ["r1"],
    hexSize: 1,
  };
}

function ecosystem(overrides: Partial<EcosystemState>): EcosystemState {
  return {
    id: "eco-weak",
    name: "Ecosystem",
    kind: "forest",
    resource: "timber",
    regionIds: ["r1"],
    label: { x: 0, y: 0 },
    health: 55,
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

function controlledBeacon(owner: AgentId): HexVertex {
  return {
    hexes: [],
    structure: "beacon",
    owner,
    regionId: "r1",
  };
}

function makeView(myId: AgentId): TragedyAgentView {
  return {
    gameId: "g-1",
    round: 6,
    phase: "action",
    myId,
    visibleHexes: [],
    worldMap: makeWorldMap(),
    ecosystemStates: [
      ecosystem({ id: "eco-weak", name: "Weak Grove", health: 55, status: "stable" }),
      ecosystem({ id: "eco-rich", name: "Rich Grove", health: 92, status: "flourishing" }),
    ],
    visibleVertices: [],
    visibleEdges: [],
    myResources: {
      ...EMPTY_INVENTORY,
      water: 1,
      energy: 1,
      ore: 1,
    },
    myInfluence: 0,
    myVP: 5,
    myStructures: {
      villages: [],
      townships: [],
      cities: [],
      beacons: [controlledBeacon(myId), controlledBeacon(myId)],
      tradePosts: [],
      roads: [],
    },
    allScores: {
      [myId]: 5,
      leader: 8,
      rival: 4,
    },
    allInfluence: {
      [myId]: 0,
      leader: 3,
      rival: 1,
    },
    trustScores: {
      [myId]: 0.5,
      leader: 0.35,
      rival: 0.55,
    },
    productionWheel: [5, 6, 8],
    wheelPosition: 0,
    nextProduction: [5, 6, 8],
    activeCrisis: null,
    visibleArmies: [],
    visibleCommitments: [],
    visibleAttestations: [],
    visibleBehaviorTags: [],
    messageHistory: [],
    prizePool: "0",
    payablePrizePool: "0",
    slashedPrizePool: "0",
    carryoverPrizePool: "0",
    currentCommonsHealth: {
      round: 6,
      score: 88,
      payableFraction: 0.88,
      reasons: [],
      payablePrizePoolWei: "0",
      slashedPrizePoolWei: "0",
      carryoverPrizePoolWei: "0",
    },
    tournamentDay: 1,
    tournamentPrizePool: "0",
    allianceInfo: {
      myAllianceVP: 0,
      alliancePartners: [],
    },
    cumulativeScores: {
      [myId]: 5,
      leader: 8,
      rival: 4,
    },
  };
}

describe("SimpleAgent divergence", () => {
  it("chooses meaningfully different actions across simple demo strategies", async () => {
    const agentId = "agent-a" as AgentId;
    const view = makeView(agentId);

    const cooperator = new SimpleAgent(agentId, "cooperator", "Cooperator");
    const builder = new SimpleAgent(agentId, "builder", "Builder");
    const opportunist = new SimpleAgent(agentId, "opportunist", "Opportunist");
    const defector = new SimpleAgent(agentId, "defector", "Defector");

    const [cooperatorActions, builderActions, opportunistActions, defectorActions] = await Promise.all([
      cooperator.act(view, 6, []),
      builder.act(view, 6, []),
      opportunist.act(view, 6, []),
      defector.act(view, 6, []),
    ]);

    expect(cooperatorActions[0]).toMatchObject({
      type: "restore_ecosystem",
      params: { ecosystemId: "eco-weak" },
    });
    expect(builderActions[0]).toMatchObject({ type: "explore" });
    expect(opportunistActions[0]).toMatchObject({
      type: "sabotage",
      params: { targetAgent: "leader" },
    });
    expect(defectorActions[0]).toMatchObject({
      type: "sabotage",
      params: { targetAgent: "leader" },
    });
  });
});
