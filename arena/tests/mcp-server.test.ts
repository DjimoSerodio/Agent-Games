import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCPAgentAdapter } from "../src/mcp/adapter.js";
import {
  createComedyMcpServer,
  MCP_RESOURCE_URIS,
  MCP_TOOL_NAMES,
} from "../src/mcp/server.js";
import { AgentIdentity, GameConfig } from "../src/core/types.js";
import { ComedyAgentView } from "../src/games/nexus/types.js";

function makeConfig(): GameConfig {
  return {
    id: "game-1",
    type: "comedy_commons",
    maxPlayers: 4,
    minPlayers: 2,
    maxRounds: 12,
    entryFeeWei: 0n,
    moveFeeWei: 0n,
    messageFeeWei: 0n,
    timeouts: {
      negotiationMs: 10_000,
      actionMs: 10_000,
    },
  };
}

function makeIdentity(id: string): AgentIdentity {
  return {
    id,
    name: "MCP Test Agent",
    address: "0x0000000000000000000000000000000000000001",
    skillsHash: "",
    registeredAt: Date.now(),
  };
}

function makeView(myId: string): ComedyAgentView {
  return {
    gameId: "game-1",
    round: 1,
    phase: "negotiation",
    myId,
    visibleHexes: [],
    worldMap: {
      id: "world",
      name: "World",
      regions: [],
      ecosystems: [],
      assets: {
        frame: "",
        compass: "",
        underlay: "",
        resourceIcons: {
          grain: "",
          timber: "",
          ore: "",
          fish: "",
          water: "",
          energy: "",
        },
        ecosystemIcons: {
          fishery: "",
          forest: "",
          aquifer: "",
          wetland: "",
        },
      },
      startingRegionIds: [],
      hexSize: 1,
    },
    ecosystemStates: [],
    visibleVertices: [],
    visibleEdges: [],
    myResources: {
      grain: 2,
      timber: 2,
      ore: 1,
      fish: 1,
      water: 1,
      energy: 1,
    },
    myInfluence: 0,
    myVP: 0,
    myStructures: {
      villages: [],
      townships: [],
      cities: [],
      beacons: [],
      tradePosts: [],
      roads: [],
    },
    allScores: {
      [myId]: 0,
      "agent-b": 0,
    },
    allInfluence: {
      [myId]: 0,
      "agent-b": 0,
    },
    trustScores: {
      [myId]: 0.5,
      "agent-b": 0.5,
    },
    productionWheel: [2, 3, 4],
    wheelPosition: 0,
    nextProduction: [3, 4, 2],
    activeCrisis: null,
    visibleArmies: [],
    visibleCommitments: [],
    visibleAttestations: [],
    messageHistory: [],
    prizePool: "0",
    payablePrizePool: "0",
    slashedPrizePool: "0",
    carryoverPrizePool: "0",
    currentCommonsHealth: {
      round: 1,
      score: 1,
      payableFraction: 1,
      reasons: [],
      payablePrizePoolWei: "0",
      slashedPrizePoolWei: "0",
      carryoverPrizePoolWei: "0",
    },
    tournamentDay: 1,
    tournamentPrizePool: "0",
    cumulativeScores: {
      [myId]: 0,
      "agent-b": 0,
    },
    allianceInfo: {
      myAllianceVP: 0,
      alliancePartners: [],
    },
  };
}

describe("Comedy MCP server", () => {
  it("registers expected tools and resources", async () => {
    const adapter = new MCPAgentAdapter("agent-a");
    await adapter.initialize(makeConfig(), makeView("agent-a"), makeIdentity("agent-a"));

    const { mcpServer } = createComedyMcpServer(adapter);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);
    expect(toolNames.sort()).toEqual([...MCP_TOOL_NAMES].sort());
    for (const tool of tools.tools) {
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
    }

    const resources = await client.listResources();
    const resourceUris = resources.resources.map((resource) => resource.uri);
    expect(resourceUris.sort()).toEqual([...MCP_RESOURCE_URIS].sort());

    await client.close();
    await mcpServer.close();
  });

  it("supports basic negotiation and action flow via tools", async () => {
    const adapter = new MCPAgentAdapter("agent-a", "agent-a", 2_000);
    const state = makeView("agent-a");
    await adapter.initialize(makeConfig(), state, makeIdentity("agent-a"));

    const { mcpServer } = createComedyMcpServer(adapter);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);

    const guideResult = await client.callTool({ name: "get_guide", arguments: {} });
    const guideBlocks = guideResult.content as Array<{ type: string; text?: string }>;
    const guidePayload = JSON.parse(guideBlocks[0]?.type === "text" ? guideBlocks[0].text ?? "{}" : "{}");
    expect(guidePayload.game).toBe("comedy-of-the-commons");
    expect(guidePayload.tools).toContain("submit_move");

    const stateResult = await client.callTool({ name: "get_state", arguments: {} });
    const stateBlocks = stateResult.content as Array<{ type: string; text?: string }>;
    const statePayload = JSON.parse(stateBlocks[0]?.type === "text" ? stateBlocks[0].text ?? "{}" : "{}");
    expect(statePayload.state.myId).toBe("agent-a");

    const negotiatePromise = adapter.negotiate(state, [], 1);
    await client.callTool({
      name: "send_message",
      arguments: { channel: "public", text: "hello table" },
    });
    const outgoing = adapter.submitNegotiationMessages();
    const negotiated = await negotiatePromise;
    expect(outgoing[0].content).toBe("hello table");
    expect(negotiated[0].content).toBe("hello table");

    const legalActions = [
      {
        type: "pass",
        agentId: "agent-a",
        params: {},
        round: 1,
        timestamp: Date.now(),
      },
    ];

    const actPromise = adapter.act(state, 1, legalActions);
    await client.callTool({ name: "submit_move", arguments: { action: { type: "pass" } } });
    const submitted = adapter.submitCurrentActions();
    const acted = await actPromise;
    expect(submitted[0].type).toBe("pass");
    expect(acted[0].type).toBe("pass");

    await client.close();
    await mcpServer.close();
  });
});
