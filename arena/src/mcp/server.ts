import { v4 as uuid } from "uuid";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MCPAgentAdapter } from "./adapter.js";
import { TRAGEDY_OF_COMMONS_RULES } from "./rules.js";

const resourcePatchSchema = z.object({
  grain: z.number().int().nonnegative().optional(),
  timber: z.number().int().nonnegative().optional(),
  ore: z.number().int().nonnegative().optional(),
  fish: z.number().int().nonnegative().optional(),
  water: z.number().int().nonnegative().optional(),
  energy: z.number().int().nonnegative().optional(),
});

const toolText = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  structuredContent: payload as Record<string, unknown>,
});

const jsonResource = (uri: string, payload: unknown) => ({
  contents: [{ uri, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
});

const buildGuidePayload = () => ({
  game: "tragedy-of-the-commons",
  rules: TRAGEDY_OF_COMMONS_RULES,
  tools: MCP_TOOL_NAMES,
  resources: MCP_RESOURCE_URIS,
});

function normalizeSubmittedMove(action: Record<string, unknown>) {
  const { type, ...params } = action;
  if (typeof type !== "string" || type.length === 0) {
    throw new Error("submit_move requires an action object with a string 'type' field");
  }
  return {
    actionType: type,
    params,
  };
}

export const MCP_TOOL_NAMES = [
  "get_guide",
  "get_game_state",
  "get_state",
  "get_behavior",
  "submit_action",
  "submit_move",
  "send_message",
  "propose_trade",
  "respond_trade",
  "extract_ecosystem",
  "contribute_crisis",
  "form_alliance",
  "break_alliance",
  "build",
  "pass_turn",
] as const;

export const MCP_RESOURCE_URIS = [
  "game://rules",
  "game://state",
  "game://behavior",
  "game://players",
  "game://ecosystems",
  "game://trust",
  "game://messages",
] as const;

export interface TragedyMcpRuntime {
  mcpServer: McpServer;
  adapter: MCPAgentAdapter;
}

export function createTragedyMcpServer(adapter?: MCPAgentAdapter): TragedyMcpRuntime {
  const boundAdapter = adapter ?? new MCPAgentAdapter(uuid());

  const mcpServer = new McpServer(
    { name: "tragedy-of-the-commons", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  mcpServer.registerTool(
    "get_guide",
    { description: "Get the game rules, current tool surface, and MCP resources" },
    async () => toolText(buildGuidePayload()),
  );

  mcpServer.registerTool(
    "get_game_state",
    { description: "Get your current filtered game state" },
    async () => toolText({ state: boundAdapter.getGameState(), lastRoundResult: boundAdapter.getLastRoundResult() }),
  );

  mcpServer.registerTool(
    "get_state",
    { description: "Get your current filtered game state (coordination-games compatible alias)" },
    async () => toolText({ state: boundAdapter.getGameState(), lastRoundResult: boundAdapter.getLastRoundResult() }),
  );

  mcpServer.registerTool(
    "get_behavior",
    { description: "Get the visible projected behavior timeline for this agent" },
    async () => toolText({ behaviorTags: boundAdapter.getVisibleBehaviorTags() }),
  );

  mcpServer.registerTool(
    "submit_action",
    {
      description: "Submit an action during action phase",
      inputSchema: {
        action_type: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ action_type, params }) => toolText({ action: boundAdapter.submitAction(action_type, params ?? {}) }),
  );

  mcpServer.registerTool(
    "submit_move",
    {
      description: "Submit an action object directly (coordination-games compatible alias)",
      inputSchema: {
        action: z.record(z.string(), z.unknown()),
      },
    },
    async ({ action }) => {
      const normalized = normalizeSubmittedMove(action);
      return toolText({ action: boundAdapter.submitAction(normalized.actionType, normalized.params) });
    },
  );

  mcpServer.registerTool(
    "send_message",
    {
      description: "Send a negotiation message",
      inputSchema: {
        channel: z.enum(["public", "private", "broadcast", "diary"]),
        recipient: z.string().optional(),
        text: z.string().min(1),
      },
    },
    async ({ channel, recipient, text }) =>
      toolText({ message: boundAdapter.sendMessage(channel, recipient, text) }),
  );

  mcpServer.registerTool(
    "propose_trade",
    {
      description: "Propose a resource trade to a partner",
      inputSchema: {
        partner: z.string(),
        offer: resourcePatchSchema,
        request: resourcePatchSchema,
      },
    },
    async ({ partner, offer, request }) =>
      toolText({ proposal: boundAdapter.proposeTrade(partner, offer, request) }),
  );

  mcpServer.registerTool(
    "respond_trade",
    {
      description: "Accept or reject a pending trade proposal",
      inputSchema: {
        trade_id: z.string(),
        accept: z.boolean(),
      },
    },
    async ({ trade_id, accept }) => toolText(boundAdapter.respondTrade(trade_id, accept)),
  );

  mcpServer.registerTool(
    "extract_ecosystem",
    {
      description: "Extract from a shared ecosystem",
      inputSchema: {
        ecosystem_id: z.string(),
        level: z.enum(["low", "medium", "high"]),
      },
    },
    async ({ ecosystem_id, level }) =>
      toolText({ action: boundAdapter.extractEcosystem(ecosystem_id, level) }),
  );

  mcpServer.registerTool(
    "contribute_crisis",
    {
      description: "Contribute resources to an active crisis",
      inputSchema: {
        crisis_id: z.string(),
        resources: resourcePatchSchema,
      },
    },
    async ({ crisis_id, resources }) =>
      toolText({ action: boundAdapter.contributeCrisis(crisis_id, resources) }),
  );

  mcpServer.registerTool(
    "form_alliance",
    {
      description: "Send an alliance formation proposal",
      inputSchema: {
        partner_id: z.string(),
      },
    },
    async ({ partner_id }) => toolText({ message: boundAdapter.formAlliance(partner_id) }),
  );

  mcpServer.registerTool(
    "break_alliance",
    {
      description: "Send an alliance break notice",
      inputSchema: {
        partner_id: z.string(),
      },
    },
    async ({ partner_id }) => toolText({ message: boundAdapter.breakAlliance(partner_id) }),
  );

  mcpServer.registerTool(
    "build",
    {
      description: "Build or upgrade a structure",
      inputSchema: {
        structure_type: z.enum(["road", "village", "township", "city", "beacon", "trade_post"]),
        location: z.unknown().optional(),
      },
    },
    async ({ structure_type, location }) =>
      toolText({ action: boundAdapter.build(structure_type, location) }),
  );

  mcpServer.registerTool(
    "pass_turn",
    { description: "Pass the current turn" },
    async () => toolText({ action: boundAdapter.passTurn() }),
  );

  mcpServer.registerResource(
    "rules",
    "game://rules",
    { description: "Tragedy of the Commons rules", mimeType: "text/plain" },
    async (uri) => ({
      contents: [{ uri: uri.toString(), mimeType: "text/plain", text: TRAGEDY_OF_COMMONS_RULES }],
    }),
  );

  mcpServer.registerResource(
    "state",
    "game://state",
    { description: "Current visible state for this agent", mimeType: "application/json" },
    async (uri) => jsonResource(uri.toString(), { state: boundAdapter.getGameState() }),
  );

  mcpServer.registerResource(
    "behavior",
    "game://behavior",
    { description: "Visible projected behavior timeline for this agent", mimeType: "application/json" },
    async (uri) => jsonResource(uri.toString(), { behaviorTags: boundAdapter.getVisibleBehaviorTags() }),
  );

  mcpServer.registerResource(
    "players",
    "game://players",
    { description: "Public player information", mimeType: "application/json" },
    async (uri) => jsonResource(uri.toString(), { players: boundAdapter.getPublicPlayers() }),
  );

  mcpServer.registerResource(
    "ecosystems",
    "game://ecosystems",
    { description: "Visible ecosystem states", mimeType: "application/json" },
    async (uri) => jsonResource(uri.toString(), { ecosystems: boundAdapter.getEcosystems() }),
  );

  mcpServer.registerResource(
    "trust",
    "game://trust",
    { description: "Visible trust graph for this agent", mimeType: "application/json" },
    async (uri) => jsonResource(uri.toString(), { trust: boundAdapter.getVisibleTrustScores() }),
  );

  mcpServer.registerResource(
    "messages",
    "game://messages",
    { description: "Visible message history for this agent", mimeType: "application/json" },
    async (uri) => jsonResource(uri.toString(), { messages: boundAdapter.getVisibleMessages() }),
  );

  return { mcpServer, adapter: boundAdapter };
}

export async function startMcpServer(adapter?: MCPAgentAdapter): Promise<void> {
  const runtime = createTragedyMcpServer(adapter);
  const transport = new StdioServerTransport();
  await runtime.mcpServer.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer().catch((error) => {
    console.error("Failed to start Tragedy MCP server", error);
    process.exit(1);
  });
}
