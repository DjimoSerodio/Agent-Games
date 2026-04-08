/**
 * LLM Agent - LLM-powered agent for the Coordination Olympiad
 *
 * Supports Anthropic (Claude), Minimax (OpenAI-compatible), or any custom provider.
 * Set MINIMAX_API_KEY or ANTHROPIC_API_KEY to select the backend.
 */

import { readFileSync } from "fs";
import { v4 as uuid } from "uuid";
import {
  LLMProvider,
  createProvider,
  ProviderTool,
  ToolCall,
} from "./providers.js";
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

// ============================================================
// Tool schemas for structured output
// ============================================================

const SUBMIT_ACTIONS_TOOL: ProviderTool = {
  name: "submit_actions",
  description:
    "Submit your chosen actions for this round. You may submit 1-2 actions. " +
    "Each action must have a valid type and appropriate params.",
  input_schema: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "build_road", "build_village", "upgrade_township", "upgrade_city",
                "build_beacon", "build_trade_post", "build_army", "move_army",
                "attack_structure", "trade_player", "trade_bank", "explore",
                "extract_commons", "restore_ecosystem", "sabotage",
                "crisis_contribute", "pass",
              ],
            },
            params: {
              type: "object",
              properties: {
                partnerId: { type: "string" },
                give: { type: "object", additionalProperties: { type: "number" } },
                receive: { type: "object", additionalProperties: { type: "number" } },
                bankGiveType: { type: "string", enum: ["grain", "timber", "ore", "fish", "water", "energy"] },
                bankReceiveType: { type: "string", enum: ["grain", "timber", "ore", "fish", "water", "energy"] },
                bankGiveAmount: { type: "number" },
                contribution: { type: "object", additionalProperties: { type: "number" } },
                ecosystemId: { type: "string" },
                extractionLevel: { type: "string", enum: ["low", "medium", "high"] },
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

const SEND_MESSAGES_TOOL: ProviderTool = {
  name: "send_messages",
  description:
    "Send messages to other agents. Use 'broadcast' as recipient for public messages, " +
    "or an agent ID for private messages.",
  input_schema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            recipient: { type: "string" },
            content: { type: "string" },
            type: { type: "string", enum: ["public", "private"] },
          },
          required: ["recipient", "content", "type"],
        },
      },
    },
    required: ["messages"],
  },
};

const REFLECT_SUMMARY_TOOL: ProviderTool = {
  name: "reflect_summary",
  description: "Summarize your observations and strategy adjustments after seeing round results.",
  input_schema: {
    type: "object",
    properties: {
      observations: { type: "string" },
      trust_updates: { type: "object", additionalProperties: { type: "number" } },
      strategy_adjustment: { type: "string" },
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

  private provider: LLMProvider;
  private persona: string;
  private config: GameConfig | null = null;
  private memory: RoundMemory[] = [];
  private currentRound = 0;
  private trustMap: Record<AgentId, number> = {};
  private apiLog: ApiCallLog[] = [];

  private static readonly GAME_RULES_SUMMARY = `
# Comedy of the Commons — Coordination Game Rules

## Overview
Comedy of the Commons is a multiplayer resource-trading strategy game on a living world map. Players gather regional resources, build structures, trade with each other, steward shared ecosystems, and collectively respond to crises. Victory points (VP) determine the winner, but the commons determines how much prize money survives.

## Resources
Six types: Grain, Timber, Ore, Fish, Water, Energy. Max 14 total resources per player.

## Structures & Costs
- Road: 1G+1T | Village: 1G+1T+1O+1W (1 VP) | Township: 2G+1T+1O+1W (2 VP)
- City: 2G+2O+1W (3 VP) | Beacon: 1O+1W+1E (1 VP) | Trade Post: 1T+1F+1W

## Actions (max 2 per round)
build/upgrade structures, trade, extract/restore ecosystems, armies, crises, explore, sabotage, pass.

## Ecosystems
Shared across regions. Over-extraction degrades; restoration heals. Flourishing boosts production.

## Crises
Random events needing collective resources. Contributors earn VP/influence; non-contributors face penalties.

## Trust
Public. Keeping promises builds trust. Breaking deals and sabotage erode it.

## Winning
Hidden rounds. Highest VP wins. Commons health determines prize survival.
`;

  constructor(personaPath: string, agentId: string, provider?: LLMProvider) {
    this.id = agentId;
    this.identity = {
      id: agentId,
      name: `LLM_${agentId.slice(0, 6)}`,
      address: `0x${agentId.replace(/-/g, "").slice(0, 40).padEnd(40, "0")}`,
      skillsHash: "",
      registeredAt: Date.now(),
    };

    this.persona = readFileSync(personaPath, "utf-8");
    this.provider = provider ?? createProvider();
  }

  // ============================================================
  // GameAgent interface
  // ============================================================

  async initialize(config: GameConfig, _state: unknown, identity: AgentIdentity): Promise<void> {
    this.config = config;
    this.identity = identity;
    this.memory = [];
    this.trustMap = {};
    this.currentRound = 0;
  }

  async negotiate(state: unknown, incomingMessages: Message[], round: number): Promise<Message[]> {
    this.currentRound = round;
    const view = state as ComedyAgentView;
    const systemPrompt = this.buildSystemPrompt("negotiation");
    const userPrompt = this.buildNegotiationPrompt(view, incomingMessages);

    try {
      const result = await this.callProvider({
        model: MODEL_SMART,
        system: systemPrompt,
        userMessage: userPrompt,
        tools: [SEND_MESSAGES_TOOL],
        method: "negotiate",
      });

      const toolInput = this.extractToolInput<{
        messages: Array<{ recipient: string; content: string; type: "public" | "private" }>;
      }>(result, "send_messages");

      if (!toolInput?.messages) return [];

      const messages = toolInput.messages.map((msg) =>
        this.makeMessage(view.gameId, msg.recipient, msg.content, msg.type),
      );
      this.updateMemoryMessages(round, incomingMessages, messages);
      return messages;
    } catch (err) {
      console.error(`[LLMAgent ${this.id}] negotiate error:`, err);
      return [];
    }
  }

  async act(state: unknown, round: number, _legalActions: Action[]): Promise<Action[]> {
    this.currentRound = round;
    const view = state as ComedyAgentView;
    const systemPrompt = this.buildSystemPrompt("action");
    const userPrompt = this.buildActionPrompt(view);

    try {
      const result = await this.callProvider({
        model: MODEL_FAST,
        system: systemPrompt,
        userMessage: userPrompt,
        tools: [SUBMIT_ACTIONS_TOOL],
        method: "act",
      });

      const toolInput = this.extractToolInput<{
        actions: Array<{ type: string; params: Record<string, unknown> }>;
      }>(result, "submit_actions");

      if (!toolInput?.actions?.length) return this.fallbackActions(round);

      const actions = this.parseActions(toolInput.actions, round);
      if (actions.length === 0) {
        const retryActions = await this.retryAction(view, round);
        if (retryActions.length > 0) return retryActions;
        return this.fallbackActions(round);
      }

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
      const result = await this.callProvider({
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
        for (const [agentId, delta] of Object.entries(toolInput.trust_updates)) {
          const current = this.trustMap[agentId] ?? 0;
          this.trustMap[agentId] = Math.max(-1, Math.min(1, current + delta));
        }
        this.updateMemoryReflection(
          results.round,
          results.scoreChanges[this.id] ?? 0,
          toolInput.observations,
          toolInput.trust_updates,
        );
      }
    } catch (err) {
      console.error(`[LLMAgent ${this.id}] reflect error:`, err);
    }

    this.trimMemory();
  }

  // ============================================================
  // Provider call
  // ============================================================

  private async callProvider(opts: {
    model: string;
    system: string;
    userMessage: string;
    tools: ProviderTool[];
    method: string;
  }): Promise<{ toolCalls: ToolCall[] }> {
    const start = Date.now();
    const response = await this.provider.complete({
      model: opts.model,
      system: opts.system,
      userMessage: opts.userMessage,
      tools: opts.tools,
    });
    const latencyMs = Date.now() - start;

    const inputTokens = Math.ceil((opts.system.length + opts.userMessage.length) / 4);
    const outputTokens = 0;

    let actionSummary = opts.method;
    if (response.toolCalls.length > 0) {
      actionSummary = `${opts.method}:${response.toolCalls[0].name}`;
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
      `[LLMAgent ${this.id}] ${opts.method} | model=${opts.model} | in~${inputTokens} | ${latencyMs}ms | ${actionSummary}`,
    );

    return response;
  }

  // ============================================================
  // Tool output extraction
  // ============================================================

  private extractToolInput<T>(response: { toolCalls: ToolCall[] }, toolName: string): T | null {
    const block = response.toolCalls.find((tc) => tc.name === toolName);
    return block ? (block.input as T) : null;
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
      `- Your agent ID is: ${this.id}`,
    ].join("\n");
  }

  private buildNegotiationPrompt(view: ComedyAgentView, incomingMessages: Message[]): string {
    const parts: string[] = [
      `## Round ${view.round} — Negotiation Phase`,
      "",
      "### Your State",
      `Resources: ${JSON.stringify(view.myResources)}`,
      `VP: ${view.myVP} | Influence: ${view.myInfluence}`,
      "",
      "### Scores",
      ...Object.entries(view.allScores).map(
        ([id, score]) =>
          `  ${id === this.id ? "(you)" : id}: ${score} VP, trust=${view.trustScores[id]?.toFixed(2) ?? "?"}`,
      ),
      "",
    ];

    if (view.activeCrisis) {
      parts.push(
        "### Active Crisis",
        `${view.activeCrisis.name}: ${view.activeCrisis.description}`,
        `Threshold: ${JSON.stringify(view.activeCrisis.threshold)}`,
        "",
      );
    }

    if (view.ecosystemStates.length > 0) {
      parts.push("### Shared Ecosystems");
      for (const e of view.ecosystemStates) {
        parts.push(`- ${e.name}: ${e.health}/${e.maxHealth} (${e.status})`);
      }
      parts.push("");
    }

    if (incomingMessages.length > 0) {
      parts.push("### Incoming Messages");
      for (const msg of incomingMessages.slice(-10)) {
        const label = msg.type === "public" ? "[PUBLIC]" : `[PRIVATE from ${msg.sender}]`;
        parts.push(`  ${label} ${msg.sender}: ${msg.content}`);
      }
      parts.push("");
    }

    if (this.memory.length > 0) {
      parts.push("### Memory (recent rounds)", this.formatMemory(), "");
    }

    parts.push(
      "### Your Task",
      "Send negotiation messages. Use send_messages with recipient='broadcast' or a player ID.",
    );

    return parts.join("\n");
  }

  private buildActionPrompt(view: ComedyAgentView): string {
    const r = view.myResources;
    const affordability: string[] = [];
    if (r.grain >= 1 && r.timber >= 1) affordability.push("build_road (1G+1T)");
    if (r.grain >= 1 && r.timber >= 1 && r.ore >= 1 && r.water >= 1)
      affordability.push("build_village (1G+1T+1O+1W)");
    if (r.energy >= 1 && r.ore >= 1) affordability.push("sabotage (1E+1O)");
    if (view.ecosystemStates.length > 0) affordability.push("extract_commons (low/medium/high)");
    affordability.push("explore (free)", "pass (free)");

    const parts: string[] = [
      `## Round ${view.round} — Action Phase`,
      "",
      "### Your State",
      `Resources: ${JSON.stringify(view.myResources)}`,
      `VP: ${view.myVP} | Influence: ${view.myInfluence}`,
      "",
      "### What You Can Afford",
      ...affordability.map((a) => `  - ${a}`),
      "",
      "### Scores",
      ...Object.entries(view.allScores).map(
        ([id, score]) => `  ${id === this.id ? "(you)" : id}: ${score} VP`,
      ),
      "",
    ];

    if (view.activeCrisis && !view.activeCrisis.resolved) {
      parts.push(
        "### Active Crisis (UNRESOLVED)",
        `${view.activeCrisis.name}: ${view.activeCrisis.description}`,
        "",
      );
    }

    parts.push(
      "### Your Task",
      "Choose 1-2 actions. For trade_player: { partnerId, give, receive }. For extract_commons: { ecosystemId, extractionLevel }.",
    );

    return parts.join("\n");
  }

  private buildReflectPrompt(results: RoundResult): string {
    const parts: string[] = [
      `## Round ${results.round} — Results & Reflection`,
      "",
      "### Score Changes",
      ...Object.entries(results.scoreChanges).map(
        ([id, delta]) => `  ${id === this.id ? "(you)" : id}: ${delta >= 0 ? "+" : ""}${delta}`,
      ),
      "",
    ];

    if (results.trustUpdates.length > 0) {
      parts.push("### Trust Changes");
      for (const u of results.trustUpdates) {
        if (u.from === this.id || u.to === this.id) {
          parts.push(`  ${u.from} → ${u.to}: ${u.delta >= 0 ? "+" : ""}${u.delta.toFixed(2)} (${u.reason})`);
        }
      }
      parts.push("");
    }

    parts.push(
      "### Your Task",
      "Use reflect_summary to record observations, trust adjustments, and strategy changes.",
    );

    return parts.join("\n");
  }

  // ============================================================
  // Action parsing
  // ============================================================

  private readonly VALID_ACTION_TYPES = new Set([
    "build_road", "build_village", "upgrade_township", "upgrade_city",
    "build_beacon", "build_trade_post", "build_army", "move_army",
    "attack_structure", "trade_player", "trade_bank", "explore",
    "extract_commons", "restore_ecosystem", "sabotage", "crisis_contribute", "pass",
  ]);

  private parseActions(raw: Array<{ type: string; params: Record<string, unknown> }>, round: number): ComedyAction[] {
    return raw
      .filter((item) => this.VALID_ACTION_TYPES.has(item.type))
      .map((item) => ({
        type: item.type as ComedyActionType,
        agentId: this.id,
        params: item.params ?? {},
        round,
        timestamp: Date.now(),
      }));
  }

  private fallbackActions(round: number): ComedyAction[] {
    return [
      { type: "explore", agentId: this.id, params: {}, round, timestamp: Date.now() },
      { type: "pass", agentId: this.id, params: {}, round, timestamp: Date.now() },
    ];
  }

  private async retryAction(view: ComedyAgentView, round: number): Promise<ComedyAction[]> {
    try {
      const result = await this.callProvider({
        model: MODEL_FAST,
        system: this.buildSystemPrompt("action"),
        userMessage: [
          "Your previous action response was invalid. Use submit_actions with valid action types.",
          this.buildActionPrompt(view),
        ].join("\n"),
        tools: [SUBMIT_ACTIONS_TOOL],
        method: "act_retry",
      });
      const toolInput = this.extractToolInput<{
        actions: Array<{ type: string; params: Record<string, unknown> }>;
      }>(result, "submit_actions");
      if (!toolInput?.actions) return [];
      return this.parseActions(toolInput.actions, round);
    } catch {
      return [];
    }
  }

  // ============================================================
  // Memory management
  // ============================================================

  private updateMemoryMessages(round: number, incoming: Message[], sent: Message[]): void {
    const e = this.getOrCreateMemoryEntry(round);
    e.messagesReceived = incoming.map((m) => ({ sender: m.sender, content: m.content, type: m.type }));
    e.messagesSent = sent.map((m) => ({ recipient: String(m.recipient), content: m.content, type: m.type }));
  }

  private updateMemoryActions(round: number, actions: ComedyAction[]): void {
    this.getOrCreateMemoryEntry(round).myActions = actions.map((a) => ({ type: a.type, params: a.params }));
  }

  private updateMemoryReflection(round: number, scoreChange: number, observations: string, trustUpdates: Record<string, number>): void {
    const e = this.getOrCreateMemoryEntry(round);
    e.scoreChange = scoreChange;
    e.observations = observations;
    e.trustUpdates = trustUpdates;
  }

  private getOrCreateMemoryEntry(round: number): RoundMemory {
    let e = this.memory.find((m) => m.round === round);
    if (!e) {
      e = { round, myActions: [], messagesReceived: [], messagesSent: [], scoreChange: 0, observations: "", trustUpdates: {} };
      this.memory.push(e);
    }
    return e;
  }

  private trimMemory(): void {
    if (this.memory.length > MAX_MEMORY_ROUNDS) this.memory = this.memory.slice(-MAX_MEMORY_ROUNDS);
  }

  private formatMemory(): string {
    if (!this.memory.length) return "  (no memory yet)";
    return this.memory.map((m) => {
      const lines = [`  Round ${m.round}:`];
      if (m.myActions.length) lines.push(`    Actions: ${m.myActions.map((a) => a.type).join(", ")}`);
      if (m.scoreChange !== 0) lines.push(`    Score: ${m.scoreChange >= 0 ? "+" : ""}${m.scoreChange}`);
      if (m.observations) lines.push(`    Notes: ${m.observations.slice(0, 100)}`);
      return lines.join("\n");
    }).join("\n");
  }

  // ============================================================
  // Message helpers
  // ============================================================

  private makeMessage(gameId: string, recipient: string, content: string, type: "public" | "private"): Message {
    return { id: uuid(), gameId, round: this.currentRound, phase: "negotiation", sender: this.id, recipient: recipient as AgentId | "broadcast", content, type, timestamp: Date.now() };
  }

  // ============================================================
  // Public accessors
  // ============================================================

  getApiLog(): ApiCallLog[] { return [...this.apiLog]; }
  getTrustMap(): Record<AgentId, number> { return { ...this.trustMap }; }
  getMemory(): RoundMemory[] { return [...this.memory]; }
}

// ============================================================
// Factory
// ============================================================

export function createLLMAgent(personaPath: string, agentId: string, provider?: LLMProvider): GameAgent {
  return new LLMAgent(personaPath, agentId, provider);
}
