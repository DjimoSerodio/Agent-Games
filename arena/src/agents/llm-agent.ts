/**
 * LLM Agent - Claude-powered agent for the Coordination Olympiad
 *
 * Replaces the scripted SimpleAgent with real LLM reasoning.
 * Uses the Anthropic SDK to call Claude for negotiation, action, and reflection.
 */

import { readFileSync } from "fs";
import { v4 as uuid } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import {
  GameAgent,
  GameConfig,
  AgentId,
  AgentIdentity,
  Message,
  Action,
  RoundResult,
} from "../core/types.js";
import {
  ComedyAgentView,
  ComedyAction,
  ComedyActionType,
  ResourceType,
  RESOURCE_NAMES,
} from "../games/nexus/types.js";

// ============================================================
// Constants
// ============================================================

const MODEL_FAST = "claude-haiku-4-20250414";
const MODEL_SMART = "claude-sonnet-4-20250514";
const MAX_MEMORY_ROUNDS = 5;
const MAX_RETRIES = 1;

// ============================================================
// Tool schemas for structured output
// ============================================================

const SUBMIT_ACTIONS_TOOL: Anthropic.Tool = {
  name: "submit_actions",
  description:
    "Submit your chosen actions for this round. You may submit 1-2 actions. " +
    "Each action must have a valid type and appropriate params.",
  input_schema: {
    type: "object" as const,
    properties: {
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "build_road",
                "build_village",
                "upgrade_township",
                "upgrade_city",
                "build_beacon",
                "build_trade_post",
                "build_army",
                "move_army",
                "attack_structure",
                "trade_player",
                "trade_bank",
                "explore",
                "extract_commons",
                "restore_ecosystem",
                "sabotage",
                "crisis_contribute",
                "pass",
              ],
            },
            params: {
              type: "object",
              properties: {
                partnerId: { type: "string" },
                give: {
                  type: "object",
                  properties: {
                    grain: { type: "number" },
                    timber: { type: "number" },
                    ore: { type: "number" },
                    fish: { type: "number" },
                    water: { type: "number" },
                    energy: { type: "number" },
                  },
                },
                receive: {
                  type: "object",
                  properties: {
                    grain: { type: "number" },
                    timber: { type: "number" },
                    ore: { type: "number" },
                    fish: { type: "number" },
                    water: { type: "number" },
                    energy: { type: "number" },
                  },
                },
                bankGiveType: {
                  type: "string",
                  enum: ["grain", "timber", "ore", "fish", "water", "energy"],
                },
                bankReceiveType: {
                  type: "string",
                  enum: ["grain", "timber", "ore", "fish", "water", "energy"],
                },
                bankGiveAmount: { type: "number" },
                contribution: {
                  type: "object",
                  properties: {
                    grain: { type: "number" },
                    timber: { type: "number" },
                    ore: { type: "number" },
                    fish: { type: "number" },
                    water: { type: "number" },
                    energy: { type: "number" },
                  },
                },
                ecosystemId: { type: "string" },
                extractionLevel: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                },
              },
            },
          },
          required: ["type", "params"],
        },
        minItems: 1,
        maxItems: 2,
      },
    },
    required: ["actions"],
  },
};

const SEND_MESSAGES_TOOL: Anthropic.Tool = {
  name: "send_messages",
  description:
    "Send messages to other agents. Use 'broadcast' as recipient for public messages, " +
    "or an agent ID for private messages. You may send 0 or more messages.",
  input_schema: {
    type: "object" as const,
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            recipient: {
              type: "string",
              description: "Agent ID for private message, or 'broadcast' for public.",
            },
            content: {
              type: "string",
              description: "The message content. Keep it concise.",
            },
            type: {
              type: "string",
              enum: ["public", "private"],
            },
          },
          required: ["recipient", "content", "type"],
        },
      },
    },
    required: ["messages"],
  },
};

const REFLECT_SUMMARY_TOOL: Anthropic.Tool = {
  name: "reflect_summary",
  description:
    "Summarize your observations and strategy adjustments after seeing the round results.",
  input_schema: {
    type: "object" as const,
    properties: {
      observations: {
        type: "string",
        description: "Key observations from this round's results.",
      },
      trust_updates: {
        type: "object",
        description:
          "Map of agent ID to trust adjustment (-1.0 to 1.0). " +
          "Positive = more trustworthy, negative = less trustworthy.",
        additionalProperties: { type: "number" },
      },
      strategy_adjustment: {
        type: "string",
        description: "How you plan to adjust your strategy going forward.",
      },
    },
    required: ["observations", "trust_updates", "strategy_adjustment"],
  },
};

// ============================================================
// Types
// ============================================================

interface RoundMemory {
  round: number;
  myActions: Array<{ type: string; params: Record<string, unknown> }>;
  messagesReceived: Array<{ sender: string; content: string; type: string }>;
  messagesSent: Array<{ recipient: string; content: string; type: string }>;
  scoreChange: number;
  observations: string;
  trustUpdates: Record<string, number>;
}

interface ApiCallLog {
  timestamp: number;
  method: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  action: string;
}

// ============================================================
// LLMAgent class
// ============================================================

export class LLMAgent implements GameAgent {
  id: AgentId;
  identity: AgentIdentity;

  private client: Anthropic;
  private persona: string;
  private config: GameConfig | null = null;
  private memory: RoundMemory[] = [];
  private currentRound = 0;
  private trustMap: Record<AgentId, number> = {};
  private apiLog: ApiCallLog[] = [];

  /** Comedy of the Commons rules summary embedded in system prompt */
  private static readonly GAME_RULES_SUMMARY = `
# Comedy of the Commons — Coordination Game Rules

## Overview
Comedy of the Commons is a multiplayer resource-trading strategy game on a living world map. Players gather regional resources, build structures, trade with each other, steward shared ecosystems, and collectively respond to crises. Victory points (VP) determine the winner, but the commons determines how much prize money survives.

## Resources
Six types: Grain, Timber, Ore, Fish, Water, Energy. Max 14 total resources per player.
Regions produce one primary resource each round based on the production wheel and your village/township/city locations.

## Structures & Costs
- Road: 1 Grain + 1 Timber (0 VP)
- Village: 1 Grain + 1 Timber + 1 Ore + 1 Water (1 VP)
- Township (upgrade from village): 2 Grain + 1 Timber + 1 Ore + 1 Water (2 VP total, requires 3 villages)
- City (upgrade from township): 2 Grain + 2 Ore + 1 Water (3 VP total, requires 2 townships)
- Beacon: 1 Ore + 1 Water + 1 Energy (1 VP, boosts visibility and influence)
- Trade Post: 1 Timber + 1 Fish + 1 Water (0 VP, improves bank trades)

## Actions (max 2 per round)
- build_road, build_village, upgrade_township, upgrade_city, build_beacon, build_trade_post
- build_army, move_army, attack_structure (armies cost 1 Ore + 1 Energy to build)
- trade_player: exchange resources with another player (both must agree)
- trade_bank: trade 4 of one resource for 1 of another (trade posts improve rate)
- explore: scout the map edge / reveal regional context
- extract_commons: take fish, timber, water, or grain from a shared ecosystem at low/medium/high intensity
- restore_ecosystem: spend resources to heal a shared ecosystem
- sabotage: destroy an opponent's road (costs 1 Energy + 1 Ore, hurts trust)
- crisis_contribute: contribute resources to resolve a shared crisis
- pass: do nothing

## Commons Layer
Shared ecosystems span multiple regions. If total extraction is lower than regeneration, the ecosystem heals and may flourish. If extraction exceeds regeneration for too long, it degrades or collapses. Flourishing ecosystems improve regional production; collapsed ecosystems suppress it and slash the payable prize pool.

## Crises
Random events that threaten all players. Require collective resource contributions.
Contributors share VP and influence rewards. Non-contributors face penalties.
Types: Blight, Storm, Famine, Current Surge, The Rift.

## Trading
Player trades: both sides must agree (negotiate first, then submit matching trade actions).
Bank trades: 4:1 ratio by default, improved by trade posts.

## Trust, Commitments, and Influence
Trust is public and informational only. It does NOT directly add VP.
The game extracts commitment IDs from dialogue. You can later attest them in chat using messages like:
- "ATTEST commitment-3 exists"
- "ATTEST commitment-3 fulfilled"
- "ATTEST commitment-3 breached"
Keeping commitments, avoiding sabotage, and contributing during crises improve future trust.
Breaking deals, sabotage, and free-riding on crises erode trust.
Influence comes from beacons and crisis contributions.

## Negotiation
Each round has a negotiation phase where you can send public broadcasts and private DMs.
Everything you say publicly is seen by all agents. Private messages are only seen by the recipient in-game, but spectators can watch them live.
Make promises, propose trades, form alliances — but you choose whether to follow through.

## Winning
The game runs for a hidden number of rounds. Highest VP at the end wins.
VP comes from structures, crisis contributions, longest road, and most influence bonuses.
Damaging the commons can slash the final payable prize pool and roll that amount into the next game.
`;

  constructor(personaPath: string, agentId: string) {
    this.id = agentId;
    this.identity = {
      id: agentId,
      name: `LLM_${agentId.slice(0, 6)}`,
      address: `0x${agentId.replace(/-/g, "").slice(0, 40).padEnd(40, "0")}`,
      skillsHash: "",
      registeredAt: Date.now(),
    };

    // Read persona
    this.persona = readFileSync(personaPath, "utf-8");

    // Initialize Anthropic client
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required for LLMAgent",
      );
    }
    this.client = new Anthropic({ apiKey });
  }

  // ============================================================
  // GameAgent interface
  // ============================================================

  async initialize(
    config: GameConfig,
    _state: unknown,
    identity: AgentIdentity,
  ): Promise<void> {
    this.config = config;
    this.identity = identity;
    this.memory = [];
    this.trustMap = {};
    this.currentRound = 0;
  }

  async negotiate(
    state: unknown,
    incomingMessages: Message[],
    round: number,
  ): Promise<Message[]> {
    this.currentRound = round;
    const view = state as ComedyAgentView;

    const systemPrompt = this.buildSystemPrompt("negotiation");
    const userPrompt = this.buildNegotiationPrompt(view, incomingMessages);

    try {
      const result = await this.callClaude({
        model: MODEL_SMART,
        system: systemPrompt,
        userMessage: userPrompt,
        tools: [SEND_MESSAGES_TOOL],
        method: "negotiate",
      });

      const toolInput = this.extractToolInput<{
        messages: Array<{
          recipient: string;
          content: string;
          type: "public" | "private";
        }>;
      }>(result, "send_messages");

      if (!toolInput || !toolInput.messages) {
        return [];
      }

      const messages = toolInput.messages.map((msg) =>
        this.makeMessage(
          view.gameId,
          msg.recipient,
          msg.content,
          msg.type,
        ),
      );

      // Store sent messages in current round memory
      this.updateMemoryMessages(round, incomingMessages, messages);

      return messages;
    } catch (err) {
      console.error(`[LLMAgent ${this.id}] negotiate error:`, err);
      return [];
    }
  }

  async act(
    state: unknown,
    round: number,
    _legalActions: Action[],
  ): Promise<Action[]> {
    this.currentRound = round;
    const view = state as ComedyAgentView;

    const systemPrompt = this.buildSystemPrompt("action");
    const userPrompt = this.buildActionPrompt(view);

    try {
      const result = await this.callClaude({
        model: MODEL_FAST,
        system: systemPrompt,
        userMessage: userPrompt,
        tools: [SUBMIT_ACTIONS_TOOL],
        method: "act",
      });

      const toolInput = this.extractToolInput<{
        actions: Array<{ type: string; params: Record<string, unknown> }>;
      }>(result, "submit_actions");

      if (!toolInput || !toolInput.actions || toolInput.actions.length === 0) {
        return this.fallbackActions(round);
      }

      const actions = this.parseActions(toolInput.actions, round);

      if (actions.length === 0) {
        // Retry once with correction prompt
        const retryActions = await this.retryAction(view, round);
        if (retryActions.length > 0) return retryActions;
        return this.fallbackActions(round);
      }

      // Store actions in memory
      this.updateMemoryActions(round, actions);

      return actions;
    } catch (err) {
      console.error(`[LLMAgent ${this.id}] act error:`, err);
      return this.fallbackActions(round);
    }
  }

  async reflect(results: RoundResult): Promise<void> {
    const systemPrompt = this.buildSystemPrompt("reflection");
    const userPrompt = this.buildReflectPrompt(results);

    try {
      const result = await this.callClaude({
        model: MODEL_SMART,
        system: systemPrompt,
        userMessage: userPrompt,
        tools: [REFLECT_SUMMARY_TOOL],
        method: "reflect",
      });

      const toolInput = this.extractToolInput<{
        observations: string;
        trust_updates: Record<string, number>;
        strategy_adjustment: string;
      }>(result, "reflect_summary");

      if (toolInput) {
        // Update trust map
        for (const [agentId, delta] of Object.entries(
          toolInput.trust_updates,
        )) {
          const current = this.trustMap[agentId] ?? 0;
          this.trustMap[agentId] = Math.max(
            -1,
            Math.min(1, current + delta),
          );
        }

        // Store observations in memory
        this.updateMemoryReflection(
          results.round,
          results.scoreChanges[this.id] ?? 0,
          toolInput.observations,
          toolInput.trust_updates,
        );
      }
    } catch (err) {
      console.error(`[LLMAgent ${this.id}] reflect error:`, err);
      // Reflection failure is non-critical; agent continues
    }

    // Trim memory to last N rounds
    this.trimMemory();
  }

  // ============================================================
  // Prompt builders
  // ============================================================

  private buildSystemPrompt(phase: string): string {
    return [
      "You are an AI agent playing Comedy of the Commons.",
      "",
      "## Game Rules",
      LLMAgent.GAME_RULES_SUMMARY,
      "",
      "## Your Persona",
      this.persona,
      "",
      `## Current Phase: ${phase}`,
      "",
      "## Important Instructions",
      "- You MUST use the provided tool to respond. Do not output raw text.",
      "- Make decisions consistent with your persona.",
      "- Consider your memory of past rounds when making choices.",
      `- Your agent ID is: ${this.id}`,
    ].join("\n");
  }

  private buildNegotiationPrompt(
    view: ComedyAgentView,
    incomingMessages: Message[],
  ): string {
    const parts: string[] = [
      `## Round ${view.round} — Negotiation Phase`,
      "",
      "### Your State",
      `Resources: ${JSON.stringify(view.myResources)}`,
      `VP: ${view.myVP} | Influence: ${view.myInfluence}`,
      `Structures: villages=${view.myStructures.villages.length}, townships=${view.myStructures.townships.length}, cities=${view.myStructures.cities.length}, beacons=${view.myStructures.beacons.length}, tradePosts=${view.myStructures.tradePosts.length}, roads=${view.myStructures.roads.length}`,
      "",
      "### Scores",
      ...Object.entries(view.allScores).map(
        ([id, score]) =>
          `  ${id === this.id ? "(you)" : id}: ${score} VP, influence=${view.allInfluence[id] ?? 0}, trust=${view.trustScores[id] ?? "?"}`,
      ),
      "",
    ];

    if (view.activeCrisis) {
      parts.push(
        "### Active Crisis",
        `${view.activeCrisis.name}: ${view.activeCrisis.description}`,
        `Threshold: ${JSON.stringify(view.activeCrisis.threshold)}`,
        `Contributions so far: ${JSON.stringify(view.activeCrisis.contributions)}`,
        `Resolved: ${view.activeCrisis.resolved}`,
        "",
      );
    }

    parts.push("### Production Wheel");
    parts.push(
      `Next 5 production numbers: ${view.nextProduction.join(", ")}`,
      "",
    );

    parts.push("### Commons Health");
    parts.push(
      `Score: ${view.currentCommonsHealth.score}/100`,
      `Prize pool: ${view.prizePool} wei | payable: ${view.payablePrizePool} wei | slashed: ${view.slashedPrizePool} wei`,
      "",
    );

    if (view.ecosystemStates.length > 0) {
      parts.push("### Shared Ecosystems");
      for (const ecosystem of view.ecosystemStates) {
        parts.push(
          `- ${ecosystem.name}: ${ecosystem.health}/${ecosystem.maxHealth} health, ${ecosystem.resource}, status=${ecosystem.status}`,
        );
      }
      parts.push("");
    }

    if (view.visibleCommitments.length > 0) {
      parts.push("### Visible Commitments");
      for (const commitment of view.visibleCommitments.slice(-8)) {
        parts.push(
          `- ${commitment.id}: ${commitment.summary} [${commitment.resolutionStatus}]`,
        );
      }
      parts.push("");
    }

    if (incomingMessages.length > 0) {
      parts.push("### Incoming Messages");
      for (const msg of incomingMessages) {
        const label =
          msg.type === "public" ? "[PUBLIC]" : `[PRIVATE from ${msg.sender}]`;
        parts.push(`  ${label} ${msg.sender}: ${msg.content}`);
      }
      parts.push("");
    } else {
      parts.push("### Incoming Messages", "  (none)", "");
    }

    if (this.memory.length > 0) {
      parts.push("### Memory (recent rounds)");
      parts.push(this.formatMemory());
      parts.push("");
    }

    parts.push(
      "### Your Task",
      "Decide what messages to send. You can:",
      "- Broadcast public messages (recipient='broadcast', type='public')",
      "- Send private DMs (recipient=<agentId>, type='private')",
      "- Send no messages at all (empty array)",
      "",
      "Use the send_messages tool to respond.",
    );

    return parts.join("\n");
  }

  private buildActionPrompt(view: ComedyAgentView): string {
    const parts: string[] = [
      `## Round ${view.round} — Action Phase`,
      "",
      "### Your State",
      `Resources: ${JSON.stringify(view.myResources)}`,
      `VP: ${view.myVP} | Influence: ${view.myInfluence}`,
      `Structures: villages=${view.myStructures.villages.length}, townships=${view.myStructures.townships.length}, cities=${view.myStructures.cities.length}, beacons=${view.myStructures.beacons.length}, tradePosts=${view.myStructures.tradePosts.length}, roads=${view.myStructures.roads.length}`,
      "",
      "### What You Can Afford",
    ];

    // Help the model understand what's buildable
    const r = view.myResources;
    const affordability: string[] = [];
    if (r.grain >= 1 && r.timber >= 1) affordability.push("road (1G+1T)");
    if (r.grain >= 1 && r.timber >= 1 && r.ore >= 1 && r.water >= 1)
      affordability.push("village (1G+1T+1O+1W)");
    if (r.grain >= 2 && r.timber >= 1 && r.ore >= 1 && r.water >= 1 && view.myStructures.villages.length >= 3)
      affordability.push("township (2G+1T+1O+1W, upgrade 3 villages)");
    if (r.grain >= 2 && r.ore >= 2 && r.water >= 1 && view.myStructures.townships.length >= 2)
      affordability.push("city (2G+2O+1W, upgrade 2 townships)");
    if (r.ore >= 1 && r.energy >= 1 && r.water >= 1) affordability.push("beacon (1O+1W+1E)");
    if (r.timber >= 1 && r.fish >= 1 && r.water >= 1)
      affordability.push("trade_post (1T+1F+1W)");
    if (r.energy >= 1 && r.ore >= 1) affordability.push("sabotage (1E+1O)");
    if (view.ecosystemStates.some((ecosystem) => ecosystem.health > 0)) {
      affordability.push("extract_commons (low/medium/high)");
    }
    if (r.water >= 1 && (r.energy >= 1 || r.grain >= 1)) {
      affordability.push("restore_ecosystem (1W + support resource)");
    }
    affordability.push("explore (free)");
    affordability.push("pass (free)");

    // Bank trade if enough surplus
    for (const res of RESOURCE_NAMES) {
      if (r[res] >= 4) {
        affordability.push(
          `trade_bank: trade 4 ${res} for 1 of another resource`,
        );
      }
    }

    parts.push(
      affordability.map((a) => `  - ${a}`).join("\n"),
      "",
    );

    parts.push(
      "### Scores",
      ...Object.entries(view.allScores).map(
        ([id, score]) =>
          `  ${id === this.id ? "(you)" : id}: ${score} VP`,
      ),
      "",
    );

    if (view.activeCrisis && !view.activeCrisis.resolved) {
      parts.push(
        "### Active Crisis (UNRESOLVED)",
        `${view.activeCrisis.name}: ${view.activeCrisis.description}`,
        `Threshold: ${JSON.stringify(view.activeCrisis.threshold)}`,
        `Contributions so far: ${JSON.stringify(view.activeCrisis.contributions)}`,
        "",
      );
    }

    if (view.ecosystemStates.length > 0) {
      parts.push(
        "### Shared Ecosystems",
        ...view.ecosystemStates.map(
          (ecosystem) => `  - ${ecosystem.name}: ${ecosystem.health}/${ecosystem.maxHealth} (${ecosystem.status})`,
        ),
        "",
      );
    }

    if (this.memory.length > 0) {
      parts.push("### Memory (recent rounds)");
      parts.push(this.formatMemory());
      parts.push("");
    }

    parts.push(
      "### Your Task",
      "Choose 1-2 actions to take this round. Use the submit_actions tool.",
      "Each action needs a 'type' and 'params' object.",
      "For trade_player, include partnerId, give, and receive in params.",
      "For trade_bank, include bankGiveType, bankReceiveType, bankGiveAmount.",
      "For crisis_contribute, include contribution (resource amounts).",
      "For extract_commons, include ecosystemId and extractionLevel.",
      "For restore_ecosystem, include ecosystemId.",
      "For build/explore/pass/sabotage, params can be empty {}.",
    );

    return parts.join("\n");
  }

  private buildReflectPrompt(results: RoundResult): string {
    const parts: string[] = [
      `## Round ${results.round} — Results & Reflection`,
      "",
      "### Score Changes",
      ...Object.entries(results.scoreChanges).map(
        ([id, delta]) =>
          `  ${id === this.id ? "(you)" : id}: ${delta >= 0 ? "+" : ""}${delta}`,
      ),
      "",
      "### Action Outcomes",
    ];

    for (const outcome of results.outcomes) {
      const isMe = outcome.action.agentId === this.id;
      parts.push(
        `  ${isMe ? "(you)" : outcome.action.agentId}: ${outcome.action.type} → ${outcome.success ? "SUCCESS" : "FAILED"}: ${outcome.description}`,
      );
    }

    parts.push("");

    if (results.trustUpdates.length > 0) {
      parts.push("### Trust Changes");
      for (const update of results.trustUpdates) {
        const involves =
          update.from === this.id || update.to === this.id;
        if (involves) {
          parts.push(
            `  ${update.from} → ${update.to}: ${update.delta >= 0 ? "+" : ""}${update.delta} (${update.reason})`,
          );
        }
      }
      parts.push("");
    }

    if (results.messages.length > 0) {
      parts.push("### Messages This Round");
      const relevant = results.messages.filter(
        (m) =>
          m.type === "public" ||
          m.sender === this.id ||
          m.recipient === this.id,
      );
      for (const msg of relevant.slice(0, 20)) {
        const label =
          msg.type === "public"
            ? "[PUBLIC]"
            : `[PRIVATE ${msg.sender === this.id ? "to " + msg.recipient : "from " + msg.sender}]`;
        parts.push(`  ${label} ${msg.sender}: ${msg.content}`);
      }
      parts.push("");
    }

    if (this.memory.length > 0) {
      parts.push("### Your Recent Memory");
      parts.push(this.formatMemory());
      parts.push("");
    }

    parts.push(
      "### Your Task",
      "Analyze what happened. Use the reflect_summary tool to record:",
      "1. Key observations about other agents' behavior",
      "2. Trust adjustments for specific agents (-1.0 to 1.0 deltas)",
      "3. How you plan to adjust your strategy going forward",
    );

    return parts.join("\n");
  }

  // ============================================================
  // Claude API call
  // ============================================================

  private async callClaude(opts: {
    model: string;
    system: string;
    userMessage: string;
    tools: Anthropic.Tool[];
    method: string;
  }): Promise<Anthropic.Message> {
    const start = Date.now();

    const response = await this.client.messages.create({
      model: opts.model,
      max_tokens: 1024,
      system: opts.system,
      tools: opts.tools,
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: opts.userMessage }],
    });

    const latencyMs = Date.now() - start;
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;

    // Determine action summary for logging
    let actionSummary = opts.method;
    const toolBlock = response.content.find(
      (b): b is Anthropic.ContentBlock & { type: "tool_use" } =>
        b.type === "tool_use",
    );
    if (toolBlock) {
      actionSummary = `${opts.method}:${toolBlock.name}`;
    }

    this.apiLog.push({
      timestamp: Date.now(),
      method: opts.method,
      model: opts.model,
      inputTokens,
      outputTokens,
      latencyMs,
      action: actionSummary,
    });

    console.log(
      `[LLMAgent ${this.id}] ${opts.method} | model=${opts.model} | in=${inputTokens} out=${outputTokens} | ${latencyMs}ms | ${actionSummary}`,
    );

    return response;
  }

  // ============================================================
  // Tool output extraction
  // ============================================================

  private extractToolInput<T>(
    response: Anthropic.Message,
    toolName: string,
  ): T | null {
    const toolBlock = response.content.find(
      (b): b is Anthropic.ContentBlock & { type: "tool_use"; input: unknown } =>
        b.type === "tool_use" && (b as { name?: string }).name === toolName,
    );
    if (!toolBlock) return null;
    return toolBlock.input as T;
  }

  // ============================================================
  // Action parsing & validation
  // ============================================================

  private readonly VALID_ACTION_TYPES: Set<string> = new Set([
    "build_road",
    "build_village",
    "upgrade_township",
    "upgrade_city",
    "build_beacon",
    "build_trade_post",
    "build_army",
    "move_army",
    "attack_structure",
    "trade_player",
    "trade_bank",
    "explore",
    "extract_commons",
    "restore_ecosystem",
    "sabotage",
    "crisis_contribute",
    "pass",
  ]);

  private parseActions(
    raw: Array<{ type: string; params: Record<string, unknown> }>,
    round: number,
  ): ComedyAction[] {
    const actions: ComedyAction[] = [];

    for (const item of raw) {
      if (!this.VALID_ACTION_TYPES.has(item.type)) continue;

      actions.push({
        type: item.type as ComedyActionType,
        agentId: this.id,
        params: item.params ?? {},
        round,
        timestamp: Date.now(),
      });
    }

    return actions;
  }

  private fallbackActions(round: number): ComedyAction[] {
    console.log(
      `[LLMAgent ${this.id}] Falling back to safe default actions (explore + pass)`,
    );
    return [
      {
        type: "explore",
        agentId: this.id,
        params: {},
        round,
        timestamp: Date.now(),
      },
      {
        type: "pass",
        agentId: this.id,
        params: {},
        round,
        timestamp: Date.now(),
      },
    ];
  }

  private async retryAction(
    view: ComedyAgentView,
    round: number,
  ): Promise<ComedyAction[]> {
    const systemPrompt = this.buildSystemPrompt("action");
    const userPrompt = [
      "Your previous action response was invalid. Please try again.",
      "Remember: each action must have a valid 'type' (one of: build_road, build_village, upgrade_township, upgrade_city, build_beacon, build_trade_post, build_army, move_army, attack_structure, trade_player, trade_bank, explore, extract_commons, restore_ecosystem, sabotage, crisis_contribute, pass).",
      "And a 'params' object (can be {} for simple actions, or {armyId: string, targetHex: {q,r}} for move_army, or {targetAgent: string} for attack_structure).",
      "",
      this.buildActionPrompt(view),
    ].join("\n");

    try {
      const result = await this.callClaude({
        model: MODEL_FAST,
        system: systemPrompt,
        userMessage: userPrompt,
        tools: [SUBMIT_ACTIONS_TOOL],
        method: "act_retry",
      });

      const toolInput = this.extractToolInput<{
        actions: Array<{ type: string; params: Record<string, unknown> }>;
      }>(result, "submit_actions");

      if (!toolInput || !toolInput.actions) return [];
      return this.parseActions(toolInput.actions, round);
    } catch (err) {
      console.error(`[LLMAgent ${this.id}] retry act error:`, err);
      return [];
    }
  }

  // ============================================================
  // Memory management
  // ============================================================

  private updateMemoryMessages(
    round: number,
    incoming: Message[],
    sent: Message[],
  ): void {
    const entry = this.getOrCreateMemoryEntry(round);
    entry.messagesReceived = incoming.map((m) => ({
      sender: m.sender,
      content: m.content,
      type: m.type,
    }));
    entry.messagesSent = sent.map((m) => ({
      recipient:
        typeof m.recipient === "string" ? m.recipient : String(m.recipient),
      content: m.content,
      type: m.type,
    }));
  }

  private updateMemoryActions(round: number, actions: ComedyAction[]): void {
    const entry = this.getOrCreateMemoryEntry(round);
    entry.myActions = actions.map((a) => ({ type: a.type, params: a.params }));
  }

  private updateMemoryReflection(
    round: number,
    scoreChange: number,
    observations: string,
    trustUpdates: Record<string, number>,
  ): void {
    const entry = this.getOrCreateMemoryEntry(round);
    entry.scoreChange = scoreChange;
    entry.observations = observations;
    entry.trustUpdates = trustUpdates;
  }

  private getOrCreateMemoryEntry(round: number): RoundMemory {
    let entry = this.memory.find((m) => m.round === round);
    if (!entry) {
      entry = {
        round,
        myActions: [],
        messagesReceived: [],
        messagesSent: [],
        scoreChange: 0,
        observations: "",
        trustUpdates: {},
      };
      this.memory.push(entry);
    }
    return entry;
  }

  private trimMemory(): void {
    if (this.memory.length > MAX_MEMORY_ROUNDS) {
      this.memory = this.memory.slice(-MAX_MEMORY_ROUNDS);
    }
  }

  private formatMemory(): string {
    if (this.memory.length === 0) return "  (no memory yet)";

    return this.memory
      .map((m) => {
        const lines = [`  Round ${m.round}:`];
        if (m.myActions.length > 0) {
          lines.push(
            `    Actions: ${m.myActions.map((a) => a.type).join(", ")}`,
          );
        }
        if (m.scoreChange !== 0) {
          lines.push(
            `    Score change: ${m.scoreChange >= 0 ? "+" : ""}${m.scoreChange}`,
          );
        }
        if (m.observations) {
          lines.push(`    Observations: ${m.observations.slice(0, 150)}`);
        }
        if (Object.keys(m.trustUpdates).length > 0) {
          const updates = Object.entries(m.trustUpdates)
            .map(([id, d]) => `${id}:${d >= 0 ? "+" : ""}${d}`)
            .join(", ");
          lines.push(`    Trust updates: ${updates}`);
        }
        return lines.join("\n");
      })
      .join("\n");
  }

  // ============================================================
  // Message helpers
  // ============================================================

  private makeMessage(
    gameId: string,
    recipient: string,
    content: string,
    type: "public" | "private",
  ): Message {
    return {
      id: uuid(),
      gameId,
      round: this.currentRound,
      phase: "negotiation",
      sender: this.id,
      recipient: recipient as AgentId | "broadcast",
      content,
      type,
      timestamp: Date.now(),
    };
  }

  // ============================================================
  // Public accessors (for admin dashboard / logging)
  // ============================================================

  getApiLog(): ApiCallLog[] {
    return [...this.apiLog];
  }

  getTrustMap(): Record<AgentId, number> {
    return { ...this.trustMap };
  }

  getMemory(): RoundMemory[] {
    return [...this.memory];
  }
}

// ============================================================
// Factory function
// ============================================================

/**
 * Create an LLM-powered agent for the Comedy of the Commons coordination game.
 *
 * @param personaPath - Path to a markdown file containing the agent's persona/personality
 * @param agentId - Unique identifier for this agent
 * @returns A GameAgent implementation powered by Claude
 */
export function createLLMAgent(
  personaPath: string,
  agentId: string,
): GameAgent {
  return new LLMAgent(personaPath, agentId);
}
