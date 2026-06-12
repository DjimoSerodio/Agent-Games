#!/usr/bin/env tsx
/**
 * Lightweight model-agnostic harness for local Coordination Games testing.
 *
 * Boundary: the game engine remains model-agnostic. This script owns provider
 * calls, decision parsing, reasoning publication, and action retries.
 *
 * Example MiniMax/OpenAI-compatible run:
 *   GAME_SERVER=http://127.0.0.1:3101 \
 *   PROVIDER=openai-compatible \
 *   OPENAI_BASE_URL=https://api.minimax.io/v1 \
 *   OPENAI_API_KEY=... \
 *   MODEL=MiniMax-M2.7-highspeed \
 *   tsx scripts/run-model-harness.ts
 *
 * Safe dry-run without model calls:
 *   PROVIDER=scripted GAME_SERVER=http://127.0.0.1:3101 tsx scripts/run-model-harness.ts
 */

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ethers } from 'ethers';
import { api, authenticate } from './lib/bot-agent.js';

const RUN_ID = sanitizeRunId(process.env.HARNESS_RUN_ID ?? randomUUID());
const SERVER = process.env.GAME_SERVER ?? 'http://127.0.0.1:3101';
const GAME_TYPE = process.env.GAME_TYPE ?? 'tragedy-of-the-commons';
const BOT_COUNT = Number.parseInt(process.env.BOT_COUNT ?? '4', 10);
const TEAM_SIZE = Number.parseInt(process.env.TEAM_SIZE ?? '2', 10);
const MAX_ROUNDS = Number.parseInt(process.env.HARNESS_ROUNDS ?? '24', 10);
const COMMUNICATION_SWEEPS = Number.parseInt(process.env.HARNESS_COMMUNICATION_SWEEPS ?? '1', 10);
const PROVIDER_NAME = process.env.PROVIDER ?? 'scripted';
const MODEL = process.env.MODEL ?? process.env.MINIMAX_MODEL ?? 'MiniMax-M2.7-highspeed';
const MODEL_CALL_TIMEOUT_MS = Number.parseInt(process.env.HARNESS_MODEL_TIMEOUT_MS ?? '90000', 10);
const MODEL_CALL_RETRIES = Number.parseInt(process.env.HARNESS_MODEL_RETRIES ?? '1', 10);
const ARTIFACTS_ENABLED = process.env.HARNESS_ARTIFACTS !== '0';
const ARTIFACT_ROOT = process.env.HARNESS_RESULTS_DIR ?? 'runs/model-harness';
const RUN_DIR = path.join(ARTIFACT_ROOT, RUN_ID);
const MAX_COST_USD = Number.parseFloat(process.env.HARNESS_MAX_COST_USD ?? '0');
const PROMPT_USD_PER_1M = Number.parseFloat(process.env.HARNESS_PROMPT_USD_PER_1M ?? '0');
const COMPLETION_USD_PER_1M = Number.parseFloat(process.env.HARNESS_COMPLETION_USD_PER_1M ?? '0');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: npm run harness:model -- [--help]

Environment:
  GAME_SERVER       Server URL (default http://127.0.0.1:3101)
  GAME_TYPE         Game slug (default tragedy-of-the-commons)
  BOT_COUNT         Number of agents (default 4)
  TEAM_SIZE         Lobby team size (default 2)
  HARNESS_ROUNDS   Max game decision cycles before stopping (default 24; lower for smoke tests)
  HARNESS_COMMUNICATION_SWEEPS  Non-turn chat/DM wake sweeps after each action (default 1)
  HARNESS_MODEL_TIMEOUT_MS      Per-model-call timeout (default 90000)
  HARNESS_MODEL_RETRIES         Retries after timeout/provider errors (default 1)
  HARNESS_ARTIFACTS             0 disables run artifact files (default enabled)
  HARNESS_RESULTS_DIR           Artifact root directory (default runs/model-harness)
  HARNESS_MAX_COST_USD          Optional hard stop when estimated cost exceeds this value
  HARNESS_PROMPT_USD_PER_1M     Optional prompt-token rate for cost estimates
  HARNESS_COMPLETION_USD_PER_1M Optional completion-token rate for cost estimates
  PROVIDER         scripted | openai-compatible | minimax (default scripted)
  OPENAI_BASE_URL   OpenAI-compatible base URL (MiniMax: https://api.minimax.io/v1)
  OPENAI_API_KEY    API key for openai-compatible/minimax
  MODEL             Model name (MiniMax: MiniMax-M2.7-highspeed)

Examples:
  PROVIDER=scripted GAME_SERVER=http://127.0.0.1:3101 npm run harness:model
  PROVIDER=minimax OPENAI_BASE_URL=https://api.minimax.io/v1 OPENAI_API_KEY=... MODEL=MiniMax-M2.7-highspeed npm run harness:model
`);
  process.exit(0);
}

interface HarnessBot {
  name: string;
  token: string;
  playerId: string;
  privateKey: string;
  persona: BotPersona;
}

interface BotPersona {
  id: string;
  title: string;
  instruction: string;
  publicStyle: string;
  privateStyle: string;
}

interface ModelDecision {
  reasoning: string;
  publicMessage: string;
  privateMessage: string;
  dmRecipient?: string;
  action: Record<string, unknown>;
}

interface ModelDecisionInput {
  bot: HarnessBot;
  visibleState: unknown;
  tools: unknown[];
  round: number;
  mode: 'turn' | 'communication';
  wakeContext?: WakeContext;
}

interface ProviderUsage {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

interface ModelProvider {
  readonly name: string;
  decide(input: ModelDecisionInput): Promise<ModelDecision>;
  usage?(): ProviderUsage;
}

interface HarnessArtifact {
  schema: 1;
  runId: string;
  timestamp: string;
  type: string;
  [key: string]: unknown;
}

interface HarnessArtifactPayload {
  type: string;
  [key: string]: unknown;
}

interface DecisionLabel {
  type: 'turn' | 'communication';
  sweep?: number;
  relayCursor?: string;
}

class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

interface WakeContext {
  reason: 'turn' | 'public' | 'private' | 'mixed';
  summary: string;
  privateReplyTo?: string;
  messages: Record<string, unknown>[];
}

interface BotContext {
  visibleState: Record<string, unknown>;
  tools: unknown[];
  relayMessages: Record<string, unknown>[];
  nextRelayCursor: number;
}

const BOT_PERSONAS: BotPersona[] = [
  {
    id: 'anti-overextractor',
    title: 'Aggressive anti-overextraction enforcer',
    instruction:
      'Be assertive and confrontational about commons protection. Do not initiate trades. Do not over-extract. Focus on calling out, deterring, and punishing over-extraction while preserving your own position.',
    publicStyle:
      'I will not trade. I am watching extraction closely, and I will call out anyone pushing the commons too hard.',
    privateStyle:
      'I am not trading. If someone over-extracts, I want pressure on them immediately.',
  },
  {
    id: 'peaceful-mediator',
    title: 'Very peaceful mediator',
    instruction:
      'Be cooperative, patient, and peace-seeking. Prefer restraint, de-escalation, public agreements, fair trades, and keeping everyone talking before conflict forms.',
    publicStyle:
      'I want us to keep this peaceful and sustainable. Let us agree on restraint before anyone panics.',
    privateStyle: 'I am trying to keep the table calm. Can we build a quiet cooperation pact?',
  },
  {
    id: 'win-focused-builder',
    title: 'Win-focused builder',
    instruction:
      'Be singularly focused on winning through efficient building and positioning. Cooperate only when it improves your score. Prefer trades or restraint only if they accelerate your path to victory.',
    publicStyle:
      'I am playing to win efficiently. I will cooperate when it creates a better path to points.',
    privateStyle:
      'I will back deals that help me build faster. What can you offer that improves my position?',
  },
  {
    id: 'win-focused-opportunist',
    title: 'Win-focused opportunist',
    instruction:
      'Be singularly focused on winning through opportunistic leverage. Watch for weak positions, negotiate hard, and take advantage of openings while avoiding reckless collapse.',
    publicStyle:
      'I am here to win. I will support the table when it benefits my position, but I will not play charity.',
    privateStyle:
      'I am looking for leverage. If we coordinate, it needs to put me closer to winning.',
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeRunId(value: string): string {
  const sanitized = value
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80);
  return sanitized || randomUUID();
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, 'sk-[REDACTED]')
    .replace(
      /\b[A-Za-z0-9_-]*api[_-]?key[A-Za-z0-9_-]*\s*[:=]\s*["']?[^"'\s,}]+/gi,
      'apiKey=[REDACTED]',
    );
}

function jsonPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2).slice(0, 12_000);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return redactSensitiveText(error.stack ?? error.message);
  return redactSensitiveText(String(error));
}

async function ensureRunDir(): Promise<void> {
  if (!ARTIFACTS_ENABLED) return;
  await mkdir(RUN_DIR, { recursive: true });
}

async function writeJsonArtifact(fileName: string, value: unknown): Promise<void> {
  if (!ARTIFACTS_ENABLED) return;
  await writeFile(path.join(RUN_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

async function appendJsonlArtifact(fileName: string, value: HarnessArtifactPayload): Promise<void> {
  if (!ARTIFACTS_ENABLED) return;
  const event: HarnessArtifact = {
    schema: 1,
    runId: RUN_ID,
    timestamp: new Date().toISOString(),
    ...value,
  };
  await appendFile(path.join(RUN_DIR, fileName), `${JSON.stringify(event)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function emptyUsage(): ProviderUsage {
  return { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}

function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens / 1_000_000) * PROMPT_USD_PER_1M +
    (completionTokens / 1_000_000) * COMPLETION_USD_PER_1M
  );
}

function providerUsage(provider: ModelProvider): ProviderUsage {
  return provider.usage?.() ?? emptyUsage();
}

function assertCostBudget(provider: ModelProvider): void {
  if (MAX_COST_USD <= 0) return;
  const usage = providerUsage(provider);
  if (usage.estimatedCostUsd > MAX_COST_USD) {
    throw new BudgetExceededError(
      `Harness estimated cost ${usage.estimatedCostUsd.toFixed(6)} exceeded HARNESS_MAX_COST_USD=${MAX_COST_USD}`,
    );
  }
}

async function decideWithRetries(
  provider: ModelProvider,
  input: ModelDecisionInput,
  label: DecisionLabel,
): Promise<ModelDecision> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MODEL_CALL_RETRIES; attempt++) {
    try {
      assertCostBudget(provider);
      const decision = await withTimeout(
        provider.decide(input),
        MODEL_CALL_TIMEOUT_MS,
        `${provider.name} ${input.bot.name} ${label.type} round=${input.round}`,
      );
      assertCostBudget(provider);
      await appendJsonlArtifact('turns.jsonl', {
        type: 'decision',
        decisionType: label.type,
        sweep: label.sweep,
        relayCursor: label.relayCursor,
        attempt: attempt + 1,
        bot: input.bot.name,
        playerId: input.bot.playerId,
        persona: input.bot.persona.id,
        provider: provider.name,
        model: MODEL,
        round: input.round,
        action: decision.action,
        publicMessageChars: decision.publicMessage.length,
        privateMessageChars: decision.privateMessage.length,
        usage: providerUsage(provider),
      });
      return decision;
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        await appendJsonlArtifact('errors.jsonl', {
          type: 'budget_exceeded',
          decisionType: label.type,
          sweep: label.sweep,
          relayCursor: label.relayCursor,
          attempt: attempt + 1,
          bot: input.bot.name,
          playerId: input.bot.playerId,
          provider: provider.name,
          model: MODEL,
          round: input.round,
          usage: providerUsage(provider),
          error: formatError(error),
        });
        throw error;
      }
      lastError = error;
      await appendJsonlArtifact('errors.jsonl', {
        type: 'decision_error',
        decisionType: label.type,
        sweep: label.sweep,
        relayCursor: label.relayCursor,
        attempt: attempt + 1,
        bot: input.bot.name,
        playerId: input.bot.playerId,
        provider: provider.name,
        model: MODEL,
        round: input.round,
        error: formatError(error),
      });
      if (attempt >= MODEL_CALL_RETRIES) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isMessagingRelay(message: unknown): message is Record<string, unknown> {
  return isRecord(message) && message.type === 'messaging';
}

function isSystemRelay(message: Record<string, unknown>): boolean {
  return message.sender === 'system';
}

function isDmRelay(message: Record<string, unknown>): boolean {
  return isRecord(message.scope) && message.scope.kind === 'dm';
}

function relayFeedStateForModelPrompt(
  visibleState: unknown,
  wakeContext: WakeContext | undefined,
): unknown {
  if (!isRecord(visibleState)) return visibleState;

  const newRelayMessages = Array.isArray(visibleState.newRelayMessages)
    ? visibleState.newRelayMessages.filter(isRecord)
    : [];
  const feedMessages = wakeContext?.messages ?? newRelayMessages;

  return {
    ...visibleState,
    relayMessages: feedMessages,
    newRelayMessages: feedMessages,
    relayFeed: {
      deliveredMessages: feedMessages.length,
      fromIndex: feedMessages.length > 0 ? relayIndex(feedMessages[0] ?? {}) : undefined,
      toIndex: feedMessages.length > 0 ? relayIndex(feedMessages.at(-1) ?? {}) : undefined,
      order: 'oldest-to-newest',
      wakeReason: wakeContext?.reason ?? 'turn',
      note: 'relayMessages is a live feed delta after this bot’s last delivered relay cursor. It is not memory and not full history; agents must store their own memory if they need it.',
    },
  };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeDecision(raw: unknown): ModelDecision {
  const record = isRecord(raw) ? raw : {};
  const reasoning =
    typeof record.reasoning === 'string'
      ? record.reasoning
      : typeof record.rationale === 'string'
        ? record.rationale
        : 'No explicit reasoning returned; defaulting to pass.';
  const action = isRecord(record.action) ? record.action : { type: 'pass' };
  const type = typeof action.type === 'string' ? action.type : 'pass';
  const publicMessage =
    typeof record.publicMessage === 'string'
      ? record.publicMessage
      : typeof record.message === 'string'
        ? record.message
        : '';
  const privateMessage = typeof record.privateMessage === 'string' ? record.privateMessage : '';
  const dmRecipient = typeof record.dmRecipient === 'string' ? record.dmRecipient : undefined;
  return { reasoning, publicMessage, privateMessage, dmRecipient, action: { ...action, type } };
}

function visibleSetupIntersectionId(visibleState: unknown): string | null {
  if (!isRecord(visibleState) || visibleState.phase !== 'waiting') return null;
  const intersections = Array.isArray(visibleState.intersections)
    ? visibleState.intersections.filter(isRecord)
    : [];
  const structures = Array.isArray(visibleState.structures)
    ? visibleState.structures.filter(isRecord)
    : [];
  const occupied = new Set(
    structures
      .map((structure) =>
        typeof structure.intersectionId === 'string' ? structure.intersectionId : '',
      )
      .filter(Boolean),
  );
  const hexKeys = (intersection: Record<string, unknown>): Set<string> => {
    const hexes = Array.isArray(intersection.hexes) ? intersection.hexes.filter(isRecord) : [];
    return new Set(
      hexes
        .map((hex) =>
          typeof hex.q === 'number' && typeof hex.r === 'number' ? `${hex.q},${hex.r}` : '',
        )
        .filter(Boolean),
    );
  };
  const intersectionsById = new Map(
    intersections.flatMap((intersection) =>
      typeof intersection.id === 'string' ? ([[intersection.id, intersection]] as const) : [],
    ),
  );
  const isAdjacentToOccupied = (intersection: Record<string, unknown>): boolean => {
    const currentHexes = hexKeys(intersection);
    for (const occupiedId of occupied) {
      const occupiedIntersection = intersectionsById.get(occupiedId);
      if (!occupiedIntersection) continue;
      const shared = [...hexKeys(occupiedIntersection)].filter((key) => currentHexes.has(key));
      if (shared.length >= 2) return true;
    }
    return false;
  };
  const legalIntersection = intersections.find(
    (intersection) =>
      typeof intersection.id === 'string' &&
      !occupied.has(intersection.id) &&
      intersection.occupantStructureId === undefined &&
      !isAdjacentToOccupied(intersection),
  );
  return typeof legalIntersection?.id === 'string' ? legalIntersection.id : null;
}

function normalizeSetupAction(decision: ModelDecision, visibleState: unknown): ModelDecision {
  const intersectionId = visibleSetupIntersectionId(visibleState);
  if (!intersectionId) return decision;
  const currentAction = decision.action;
  const currentIntersectionId = isRecord(currentAction) ? currentAction.intersectionId : undefined;
  if (currentAction.type === 'place_starting_camp' && typeof currentIntersectionId === 'string') {
    return decision;
  }
  return {
    ...decision,
    reasoning: `${decision.reasoning}\n\n[harness setup guardrail] MiniMax returned an invalid setup action; using legal place_starting_camp to keep the live game moving.`,
    action: { type: 'place_starting_camp', intersectionId },
  };
}

class ScriptedProvider implements ModelProvider {
  readonly name = 'scripted';

  async decide(input: ModelDecisionInput): Promise<ModelDecision> {
    if (input.mode === 'communication') {
      return {
        reasoning: `${input.bot.name}: ${input.bot.persona.title}; scripted communication wake for round ${input.round}; respond according to persona without taking a game action.`,
        publicMessage: input.bot.persona.publicStyle,
        privateMessage: input.bot.persona.privateStyle,
        dmRecipient: input.wakeContext?.privateReplyTo,
        action: { type: 'pass' },
      };
    }

    if (isRecord(input.visibleState) && input.visibleState.phase === 'waiting') {
      const intersectionId = visibleSetupIntersectionId(input.visibleState) ?? 'northWest';
      return {
        reasoning: `${input.bot.name}: ${input.bot.persona.title}; scripted setup placement using first visible legal-looking empty intersection.`,
        publicMessage: input.bot.persona.publicStyle,
        privateMessage: input.bot.persona.privateStyle,
        action: { type: 'place_starting_camp', intersectionId },
      };
    }

    return {
      reasoning: `${input.bot.name}: ${input.bot.persona.title}; scripted baseline for round ${input.round}; pass to validate harness, reasoning relay, and persona-specific communication without model spend.`,
      publicMessage: input.bot.persona.publicStyle,
      privateMessage: input.bot.persona.privateStyle,
      action: { type: 'pass' },
    };
  }
}

class OpenAICompatibleProvider implements ModelProvider {
  private readonly usageStats: ProviderUsage = emptyUsage();

  constructor(
    readonly name: 'openai-compatible' | 'minimax',
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  usage(): ProviderUsage {
    return { ...this.usageStats };
  }

  private recordUsage(body: unknown): void {
    if (!isRecord(body) || !isRecord(body.usage)) return;
    const promptTokens = getNumber(body.usage.prompt_tokens, 0);
    const completionTokens = getNumber(body.usage.completion_tokens, 0);
    const totalTokens = getNumber(body.usage.total_tokens, promptTokens + completionTokens);
    this.usageStats.requests += 1;
    this.usageStats.promptTokens += promptTokens;
    this.usageStats.completionTokens += completionTokens;
    this.usageStats.totalTokens += totalTokens;
    this.usageStats.estimatedCostUsd += estimateCostUsd(promptTokens, completionTokens);
  }

  async decide(input: ModelDecisionInput): Promise<ModelDecision> {
    const communicationOnly = input.mode === 'communication';
    const modeInstruction = communicationOnly
      ? 'COMMUNICATION-ONLY WAKE: You are responding to new public chat, DM, or relay updates outside your action turn. Your action field will be ignored. If the wake context includes privateReplyTo, normally answer with privateMessage addressed to privateReplyTo. Use an empty string only when you intentionally decline to respond.'
      : 'ACTION TURN: Choose one legal game action. You may also send publicMessage/privateMessage, or use empty strings if silence is strategically better.';
    const wakeContextText = input.wakeContext
      ? `\nWake context:\n${jsonPrompt(input.wakeContext)}`
      : '';
    const promptVisibleState = relayFeedStateForModelPrompt(input.visibleState, input.wakeContext);
    const setupInstruction =
      isRecord(input.visibleState) && input.visibleState.phase === 'waiting'
        ? '\n\nSETUP PHASE: You MUST choose the place_starting_camp tool. pass is invalid during setup. Pick an empty non-adjacent intersection id from visibleState.intersections.'
        : '';
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 1,
        top_p: 0.95,
        max_completion_tokens: 1024,
        reasoning_split: true,
        messages: [
          {
            role: 'system',
            content: `You are an autonomous game-playing agent in a Tragedy of the Commons negotiation game.\n\n${modeInstruction}${setupInstruction}\n\nPersona for this agent:\n${input.bot.persona.title}\n${input.bot.persona.instruction}\n\nReturn ONLY compact JSON with this exact shape:\n{"reasoning":"private decision trace, not chat","publicMessage":"short natural public negotiation message to all players, or empty string","privateMessage":"short direct message to one other player, or empty string","dmRecipient":"exact player name/handle you want to DM (optional)","action":{"type":"tool_name","argumentName":"argumentValue"}}\n\nValid game actions:
- The live Available tools block in the user message is authoritative. Choose only from those tool names and schemas.
- Return the selected tool as action.type, with the rest of the tool arguments inside action.
- During Tragedy V2 setup/waiting, choose place_starting_camp with an intersectionId. pass is invalid during setup.
- During Tragedy V2 playing rounds this usually means pass, extract_tile, build_road, build_structure, upgrade_structure, convert_timber_to_energy, or offer_trade, when those tools are listed.

Rules:\n1. Use ONLY the fields from the live Available tools block for the chosen action type.
2. Do not invent extra fields, legacy fields, or wrong types. Never use any tool or argument that is absent from the live Available tools block.
3. Prefer simple legal actions over complex invalid ones. In setup, place_starting_camp is the simple legal action; in playing rounds, pass is safer than guessing IDs.\n4. publicMessage/privateMessage must read like chat between agents, not action justifications. Use an empty string to stay silent.\n5. Do not include provider reasoning in chat messages.\n6. READ the relayMessages in your state carefully. The handles map converts UUIDs to player names. Reference what other players said — respond to proposals, counter-offers, threats, and alliances when useful. Be conversational and strategic.\n7. If trustCards are present, treat them as compact evidence summaries over viewer-visible game state only. They are not final reputation scores, and they do not reveal private DMs, hidden strategy, or model reasoning. Use their evidence refs and caveats to inform questions, caution, and cooperation strategy.\n8. dmRecipient: use the EXACT player name/handle (e.g. "Alicia Commons") if you want to send a private DM. If omitted, no DM is sent.\n9. Coordinate with other players according to your persona: propose extraction limits, warn about defectors, negotiate trades, form coalitions, or refuse deals when your persona requires it.`,
          },
          {
            role: 'user',
            content: `Agent: ${input.bot.name}\nPersona: ${input.bot.persona.title}\nPersona instructions: ${input.bot.persona.instruction}\nRound: ${input.round}\nMode: ${input.mode}${setupInstruction}\nAvailable tools:\n${jsonPrompt(input.tools)}\nVisible state:\n${jsonPrompt(promptVisibleState)}${wakeContextText}\n\nIMPORTANT: Your visible state contains only the latest relay feed delivered after your last relay cursor. relayMessages and newRelayMessages are NOT full history and NOT memory. READ Wake context and relayMessages first. Respond directly to the latest delivered message(s) when useful. If you need long-term memory, that is future agent storage, not the relay feed. Use trustCards only as compact, viewer-visible evidence summaries with caveats — not as hidden knowledge or final reputation scores.\n\n${modeInstruction}\n\npublicMessage goes to all players. privateMessage + dmRecipient go to one specific player (use their EXACT name from handles/scoreboard). When wakeContext.privateReplyTo is present, set dmRecipient to privateReplyTo and put the reply in privateMessage unless you intentionally decline to answer. Negotiate according to your persona. Do not include provider reasoning in chat messages.`,
          },
        ],
      }),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(
        `${this.name} ${this.model} HTTP ${response.status} for ${input.bot.name} ${input.mode} round ${input.round}: ${bodyText.slice(0, 500)}`,
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(bodyText) as unknown;
    } catch (error) {
      throw new Error(
        `${this.name} ${this.model} returned invalid JSON for ${input.bot.name} ${input.mode} round ${input.round}: ${formatError(error)}; body=${bodyText.slice(0, 500)}`,
      );
    }
    this.recordUsage(body);
    const choice = isRecord(body)
      ? Array.isArray(body.choices)
        ? body.choices[0]
        : undefined
      : undefined;
    const message = isRecord(choice) ? choice.message : undefined;
    const messageRecord = isRecord(message) ? message : {};
    const content = typeof messageRecord.content === 'string' ? messageRecord.content : '';
    const parsed = extractJsonObject(content);
    const decision = normalizeDecision(parsed);
    const reasoningDetails = Array.isArray(messageRecord.reasoning_details)
      ? messageRecord.reasoning_details
          .map((item) => (isRecord(item) && typeof item.text === 'string' ? item.text : ''))
          .filter(Boolean)
          .join('\n')
      : '';
    return {
      ...decision,
      reasoning: reasoningDetails
        ? `${decision.reasoning}\n\n[provider reasoning summary]\n${reasoningDetails}`
        : decision.reasoning,
    };
  }
}

function createProvider(): ModelProvider {
  if (PROVIDER_NAME === 'scripted') return new ScriptedProvider();
  if (PROVIDER_NAME === 'openai-compatible' || PROVIDER_NAME === 'minimax') {
    const apiKey = process.env.OPENAI_API_KEY ?? process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY or MINIMAX_API_KEY is required for openai-compatible/minimax provider',
      );
    }
    const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.minimax.io/v1';
    return new OpenAICompatibleProvider(PROVIDER_NAME, baseUrl, apiKey, MODEL);
  }
  throw new Error(`Unknown PROVIDER=${PROVIDER_NAME}`);
}

async function createBots(): Promise<HarnessBot[]> {
  const bots: HarnessBot[] = [];
  const defaultNames = ['Alicia Commons', 'Bob Timber', 'Carol Current', 'Dave Ore'];
  for (let i = 0; i < BOT_COUNT; i++) {
    const wallet = ethers.Wallet.createRandom();
    const baseName = defaultNames[i] ?? `Harness Bot ${i + 1}`;
    const persona = BOT_PERSONAS[i % BOT_PERSONAS.length] ?? BOT_PERSONAS[0];
    const name = `${baseName} ${wallet.address.slice(2, 10)}`;
    const auth = await authenticate(SERVER, wallet.privateKey, name);
    bots.push({
      name,
      token: auth.token,
      playerId: auth.playerId,
      privateKey: wallet.privateKey,
      persona,
    });
  }
  return bots;
}

async function inspect(sessionId: string): Promise<Record<string, unknown>> {
  const token = process.env.INSPECTOR_TOKEN ?? 'local-inspector-token';
  const res = await fetch(`${SERVER}/api/admin/session/${sessionId}/inspect`, {
    headers: { 'X-Admin-Token': token },
  });
  const body = (await res.json()) as unknown;
  if (!res.ok || !isRecord(body)) throw new Error(`inspect failed for ${sessionId}`);
  return body;
}

function relayFor(decision: ModelDecision, provider: ModelProvider): Record<string, unknown> {
  return {
    type: 'reasoning',
    pluginId: 'reasoning',
    scope: 'all',
    data: {
      body: decision.reasoning,
      stage: 'decision',
      tags: { provider: provider.name, model: MODEL, runId: RUN_ID },
    },
  };
}

function chatRelayFor(
  decision: ModelDecision,
  provider: ModelProvider,
  scope: string | { kind: 'dm'; recipientHandle: string } = 'all',
  message = decision.publicMessage,
): Record<string, unknown> {
  const resolvedScope =
    typeof scope === 'string' && scope !== 'all' ? { kind: 'dm', recipientHandle: scope } : scope;
  return {
    type: 'messaging',
    pluginId: 'basic-chat',
    scope: resolvedScope,
    data: {
      body: message,
      tags: { provider: provider.name, model: MODEL, runId: RUN_ID, source: 'model-harness' },
    },
  };
}

function resolveBotTarget(
  bots: HarnessBot[],
  activeBot: HarnessBot,
  requestedRecipient: string | undefined,
): HarnessBot | undefined {
  const trimmedRecipient = requestedRecipient?.trim();
  if (!trimmedRecipient || trimmedRecipient === 'system') return undefined;
  const requestedTarget = bots.find(
    (bot) =>
      bot.name === trimmedRecipient ||
      bot.playerId === trimmedRecipient ||
      bot.name.includes(trimmedRecipient) ||
      bot.playerId.includes(trimmedRecipient),
  );
  if (requestedTarget && requestedTarget.playerId !== activeBot.playerId) return requestedTarget;
  return undefined;
}

function rotateBots(bots: HarnessBot[], offset: number): HarnessBot[] {
  if (bots.length === 0) return [];
  const pivot = ((offset % bots.length) + bots.length) % bots.length;
  return [...bots.slice(pivot), ...bots.slice(0, pivot)];
}

async function callTool(bot: HarnessBot, toolName: string, args: Record<string, unknown>) {
  return api(SERVER, '/api/player/tool', {
    method: 'POST',
    token: bot.token,
    body: { toolName, args },
  });
}

function relayIndex(message: Record<string, unknown>): number {
  return typeof message.index === 'number' && Number.isFinite(message.index) ? message.index : -1;
}

function maxRelayIndex(messages: Record<string, unknown>[]): number {
  return messages.reduce((max, message) => Math.max(max, relayIndex(message)), -1);
}

function relaySender(message: Record<string, unknown>): string {
  return typeof message.sender === 'string' ? message.sender : '';
}

function isOwnRelay(message: Record<string, unknown>, bot: HarnessBot): boolean {
  const sender = relaySender(message);
  return sender === bot.name || sender === bot.playerId;
}

function shouldWakeForRelay(message: Record<string, unknown>, bot: HarnessBot): boolean {
  if (isOwnRelay(message, bot)) return false;
  const type = typeof message.type === 'string' ? message.type : '';
  return type === 'messaging' || type === 'reasoning';
}

function relayScopeKind(message: Record<string, unknown>): string {
  const scope = isRecord(message.scope) ? message.scope : {};
  return typeof scope.kind === 'string' ? scope.kind : '';
}

function relayBody(message: Record<string, unknown>): string {
  const data = isRecord(message.data) ? message.data : {};
  if (typeof data.body === 'string') return data.body;
  if (typeof data.text === 'string') return data.text;
  return '';
}

function buildWakeContext(
  bot: HarnessBot,
  bots: HarnessBot[],
  newWakeRelays: Record<string, unknown>[],
): WakeContext {
  const privateMessages = newWakeRelays.filter(
    (message) => message.type === 'messaging' && relayScopeKind(message) === 'dm',
  );
  const publicMessages = newWakeRelays.filter(
    (message) => message.type === 'messaging' && relayScopeKind(message) !== 'dm',
  );
  const latestPrivate = privateMessages
    .slice()
    .reverse()
    .find((message) => resolveBotTarget(bots, bot, relaySender(message)) !== undefined);
  const privateReplyTo = latestPrivate ? relaySender(latestPrivate) : undefined;
  const reason = latestPrivate
    ? publicMessages.length > 0
      ? 'mixed'
      : 'private'
    : publicMessages.length > 0
      ? 'public'
      : 'mixed';
  const latestSender = privateReplyTo ?? relaySender(newWakeRelays.at(-1) ?? {});
  const latestBody = relayBody(latestPrivate ?? newWakeRelays.at(-1) ?? {}).slice(0, 240);

  return {
    reason,
    privateReplyTo,
    messages: newWakeRelays,
    summary: latestPrivate
      ? `${bot.name} received a private DM from ${latestSender}: ${latestBody}`
      : `${bot.name} received ${newWakeRelays.length} new visible relay message(s).`,
  };
}

function extractTools(visibleState: Record<string, unknown>): unknown[] {
  const currentPhase = isRecord(visibleState.currentPhase) ? visibleState.currentPhase : {};
  return Array.isArray(currentPhase.tools) ? currentPhase.tools : [];
}

function relayCursorFromEnvelope(stateEnvelope: Record<string, unknown>, fallback: number): number {
  const meta = isRecord(stateEnvelope.meta) ? stateEnvelope.meta : {};
  return typeof meta.sinceIdx === 'number' && Number.isFinite(meta.sinceIdx)
    ? meta.sinceIdx
    : fallback;
}

async function fetchBotContext(bot: HarnessBot, sinceIdx?: number): Promise<BotContext> {
  const statePath =
    sinceIdx === undefined ? '/api/player/state' : `/api/player/state?sinceIdx=${sinceIdx}`;
  const stateEnvelope = await api(SERVER, statePath, { token: bot.token });
  const rawState = isRecord(stateEnvelope.state) ? stateEnvelope.state : stateEnvelope;
  const handles =
    isRecord(stateEnvelope.meta) && isRecord(stateEnvelope.meta.handles)
      ? (stateEnvelope.meta.handles as Record<string, string>)
      : {};
  const rawRelay: unknown[] = Array.isArray(rawState.relayMessages) ? rawState.relayMessages : [];
  const enrichedRelay = rawRelay.map((rawMessage): Record<string, unknown> => {
    if (!isRecord(rawMessage)) return {};
    const sender = typeof rawMessage.sender === 'string' ? rawMessage.sender : '';
    const resolved = handles[sender] ?? sender;
    const scope = isRecord(rawMessage.scope) ? { ...rawMessage.scope } : rawMessage.scope;
    if (
      isRecord(scope) &&
      typeof scope.recipientHandle === 'string' &&
      handles[scope.recipientHandle]
    ) {
      scope.recipientHandle = handles[scope.recipientHandle];
    }
    return { ...rawMessage, sender: resolved, scope };
  });
  const visibleState: Record<string, unknown> = {
    ...rawState,
    currentPhase: isRecord(stateEnvelope.currentPhase) ? stateEnvelope.currentPhase : undefined,
    gameOver: stateEnvelope.gameOver,
    handles,
    relayMessages: enrichedRelay,
  };
  return {
    visibleState,
    tools: extractTools(visibleState),
    relayMessages: enrichedRelay,
    nextRelayCursor: relayCursorFromEnvelope(stateEnvelope, maxRelayIndex(enrichedRelay) + 1),
  };
}

async function publishDecisionMessages(
  bot: HarnessBot,
  bots: HarnessBot[],
  decision: ModelDecision,
  provider: ModelProvider,
  fallbackDmRecipient?: string,
): Promise<void> {
  if (decision.reasoning.trim()) {
    await callTool(bot, 'plugin_relay', { relay: relayFor(decision, provider) });
  }

  if (decision.publicMessage.trim()) {
    await callTool(bot, 'plugin_relay', { relay: chatRelayFor(decision, provider) });
  }

  if (decision.privateMessage.trim()) {
    const dmTarget = resolveBotTarget(bots, bot, decision.dmRecipient ?? fallbackDmRecipient);
    if (dmTarget) {
      await callTool(bot, 'plugin_relay', {
        relay: chatRelayFor(decision, provider, dmTarget.name, decision.privateMessage),
      });
      console.log(`  ${bot.name}: DM to ${dmTarget.name} (playerId=${dmTarget.playerId})`);
    } else {
      console.log(`  ${bot.name}: no valid DM recipient found`);
    }
  }
}

async function runCommunicationSweeps(
  bots: HarnessBot[],
  provider: ModelProvider,
  round: number,
  nextRelayCursorByBot: Map<string, number>,
): Promise<void> {
  for (let sweep = 0; sweep < COMMUNICATION_SWEEPS; sweep++) {
    const orderedBots = rotateBots(bots, round + sweep);
    const sweepCursors = new Map(nextRelayCursorByBot);
    const pendingDecisions: Array<{
      bot: HarnessBot;
      decision: ModelDecision;
      privateReplyTo?: string;
    }> = [];
    for (const bot of orderedBots) {
      const previousCursor = sweepCursors.get(bot.playerId) ?? 0;
      const context = await fetchBotContext(bot, previousCursor);
      const newWakeRelays = context.relayMessages.filter((message) =>
        shouldWakeForRelay(message, bot),
      );
      nextRelayCursorByBot.set(bot.playerId, context.nextRelayCursor);
      if (newWakeRelays.length === 0) continue;

      const communicationState = {
        ...context.visibleState,
        relayMessages: newWakeRelays,
        harnessWakeReason: 'new-relay-messages',
        newRelayMessages: newWakeRelays,
      };
      const wakeContext = buildWakeContext(bot, bots, newWakeRelays);
      console.log(
        `  ${bot.name}: communication wake relays=${newWakeRelays.length} reason=${wakeContext.reason} sweep=${sweep + 1}`,
      );
      try {
        const decision = await decideWithRetries(
          provider,
          {
            bot,
            visibleState: communicationState,
            tools: context.tools,
            round,
            mode: 'communication',
            wakeContext,
          },
          {
            type: 'communication',
            sweep: sweep + 1,
            relayCursor: `${previousCursor}->${context.nextRelayCursor}`,
          },
        );
        pendingDecisions.push({ bot, decision, privateReplyTo: wakeContext.privateReplyTo });
      } catch (error) {
        throw new Error(
          `communication decision failed for ${bot.name} round=${round} sweep=${sweep + 1} relayCursor=${previousCursor}->${context.nextRelayCursor}: ${formatError(error)}`,
        );
      }
    }
    for (const { bot, decision, privateReplyTo } of pendingDecisions) {
      try {
        await publishDecisionMessages(bot, bots, decision, provider, privateReplyTo);
      } catch (error) {
        throw new Error(
          `communication publish failed for ${bot.name} round=${round} sweep=${sweep + 1}: ${formatError(error)}`,
        );
      }
    }
    const responses = pendingDecisions.length;
    if (responses === 0) break;
  }
}

async function main() {
  await ensureRunDir();
  const provider = createProvider();
  console.log(`model-harness run=${RUN_ID} provider=${provider.name} model=${MODEL}`);
  console.log(`server=${SERVER} game=${GAME_TYPE} bots=${BOT_COUNT}`);
  if (ARTIFACTS_ENABLED) console.log(`artifacts=${RUN_DIR}`);
  await writeJsonArtifact('run.config.json', {
    schema: 1,
    runId: RUN_ID,
    server: SERVER,
    gameType: GAME_TYPE,
    botCount: BOT_COUNT,
    teamSize: TEAM_SIZE,
    maxRounds: MAX_ROUNDS,
    communicationSweeps: COMMUNICATION_SWEEPS,
    provider: provider.name,
    model: MODEL,
    modelCallTimeoutMs: MODEL_CALL_TIMEOUT_MS,
    modelCallRetries: MODEL_CALL_RETRIES,
    maxCostUsd: MAX_COST_USD > 0 ? MAX_COST_USD : undefined,
    promptUsdPer1M: PROMPT_USD_PER_1M > 0 ? PROMPT_USD_PER_1M : undefined,
    completionUsdPer1M: COMPLETION_USD_PER_1M > 0 ? COMPLETION_USD_PER_1M : undefined,
    note: 'No provider API keys or bearer tokens are written to artifacts.',
  });

  const bots = await createBots();
  const lobby = await api(SERVER, '/api/lobbies/create', {
    method: 'POST',
    token: bots[0]?.token,
    body: { gameType: GAME_TYPE, teamSize: TEAM_SIZE },
  });
  const lobbyId = String(lobby.lobbyId);
  console.log(`lobby=${lobbyId}`);
  await appendJsonlArtifact('games.jsonl', {
    type: 'lobby_created',
    lobbyId,
    gameType: GAME_TYPE,
    teamSize: TEAM_SIZE,
    bots: bots.map((bot) => ({ name: bot.name, playerId: bot.playerId, persona: bot.persona.id })),
  });

  for (const bot of bots) {
    const joined = await api(SERVER, '/api/player/lobby/join', {
      method: 'POST',
      token: bot.token,
      body: { lobbyId },
    });
    console.log(
      `joined ${bot.name} persona="${bot.persona.title}" phase=${String(joined.phase ?? 'unknown')}`,
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const lobbyInspect = await inspect(lobbyId);
  const gameId = typeof lobbyInspect.gameId === 'string' ? lobbyInspect.gameId : null;
  if (!gameId) throw new Error(`Lobby did not start a game: ${JSON.stringify(lobbyInspect.lobby)}`);
  console.log(`game=${gameId}`);
  await appendJsonlArtifact('games.jsonl', { type: 'game_started', lobbyId, gameId });
  const nextRelayCursorByBot = new Map<string, number>();
  for (const bot of bots) {
    const context = await fetchBotContext(bot);
    nextRelayCursorByBot.set(bot.playerId, context.nextRelayCursor);
  }

  // Keep the local agent runtime active across server turn notifications. The
  // game engine emits state/relay updates, but this harness owns model wakeups;
  // HARNESS_ROUNDS is only a safety cap for local runs.
  for (let roundLoop = 0; roundLoop < MAX_ROUNDS; roundLoop++) {
    const gameInspect = await inspect(gameId);
    const diagnostics = isRecord(gameInspect.gameInspect) ? gameInspect.gameInspect : {};
    const gameState = isRecord(diagnostics.gameState) ? diagnostics.gameState : {};
    const phase = typeof gameState.phase === 'string' ? gameState.phase : 'unknown';
    const round = getNumber(gameState.round, roundLoop + 1);
    if (phase === 'finished') break;
    console.log(`round=${round} phase=${phase}`);

    // Turn-by-turn loop: keep going until all players have acted or round ends
    const actedThisRound = new Set<string>();
    let maxTurnsPerRound = bots.length * 2; // safety limit
    while (actedThisRound.size < bots.length && maxTurnsPerRound-- > 0) {
      // Get game state to find whose turn it is
      const gameInspect = await inspect(gameId);
      const gs = isRecord(gameInspect.gameInspect) ? gameInspect.gameInspect : {};
      const st = isRecord(gs.gameState) ? gs.gameState : {};
      const currentPlayerIndex =
        typeof st.currentPlayerIndex === 'number' ? st.currentPlayerIndex : 0;
      const players = Array.isArray(st.players) ? st.players : [];
      const currentPlayerObj = isRecord(players[currentPlayerIndex])
        ? players[currentPlayerIndex]
        : null;
      const currentPlayerId = typeof currentPlayerObj?.id === 'string' ? currentPlayerObj.id : null;
      if (!currentPlayerId) {
        console.log('  cannot determine current player, breaking');
        break;
      }
      if (actedThisRound.has(currentPlayerId)) {
        console.log(`  ${currentPlayerId} already acted this round, breaking`);
        break;
      }
      // Find the bot that matches this player
      const activeBot = bots.find((b) => b.playerId === currentPlayerId);
      if (!activeBot) {
        console.log(`  no bot found for player ${currentPlayerId}, breaking`);
        break;
      }

      // Fetch THIS bot's state (fresh, after previous turn advances)
      const previousCursor = nextRelayCursorByBot.get(activeBot.playerId) ?? 0;
      const context = await fetchBotContext(activeBot, previousCursor);
      const turnFeedRelays = context.relayMessages.filter((message) =>
        shouldWakeForRelay(message, activeBot),
      );
      const visibleState: Record<string, unknown> = {
        ...context.visibleState,
        relayMessages: turnFeedRelays,
        newRelayMessages: turnFeedRelays,
        harnessWakeReason: 'action-turn-feed',
      };
      nextRelayCursorByBot.set(activeBot.playerId, context.nextRelayCursor);
      console.log(
        `  ${activeBot.name}: relayFeed=${turnFeedRelays.length} totalVisibleRelay=${context.relayMessages.length}`,
      );
      const turnWakeContext = buildWakeContext(activeBot, bots, turnFeedRelays);
      let decision: ModelDecision;
      try {
        decision = await decideWithRetries(
          provider,
          {
            bot: activeBot,
            visibleState,
            tools: context.tools,
            round,
            mode: 'turn',
            wakeContext: {
              reason: 'turn',
              summary: `${activeBot.name} is taking an action turn with ${turnFeedRelays.length} new relay feed item(s) after its last delivered relay cursor.`,
              privateReplyTo: turnWakeContext.privateReplyTo,
              messages: turnFeedRelays,
            },
          },
          { type: 'turn', relayCursor: `${previousCursor}->${context.nextRelayCursor}` },
        );
        decision = normalizeSetupAction(decision, visibleState);
      } catch (error) {
        throw new Error(
          `turn decision failed for ${activeBot.name} round=${round} relayCursor=${previousCursor}->${context.nextRelayCursor}: ${formatError(error)}`,
        );
      }
      try {
        await publishDecisionMessages(
          activeBot,
          bots,
          decision,
          provider,
          turnWakeContext.privateReplyTo,
        );
      } catch (error) {
        throw new Error(
          `turn publish failed for ${activeBot.name} round=${round}: ${formatError(error)}`,
        );
      }

      // Submit the game action (only if it's their turn)
      const isYourTurn = visibleState.isYourTurn === true;
      const { type, ...args } = decision.action;
      const toolName = typeof type === 'string' ? type : 'pass';
      if (isYourTurn) {
        try {
          console.log(
            `  ${activeBot.name}: attempting ${toolName} with args ${JSON.stringify(args)}`,
          );
          await callTool(activeBot, toolName, args);
          console.log(`  ${activeBot.name}: ${toolName}`);
          await appendJsonlArtifact('turns.jsonl', {
            type: 'action_submitted',
            bot: activeBot.name,
            playerId: activeBot.playerId,
            persona: activeBot.persona.id,
            round,
            toolName,
            args,
          });
          actedThisRound.add(currentPlayerId);
        } catch (err) {
          console.log(
            `  ${activeBot.name}: ${toolName} failed, falling back to pass (${String(err).slice(0, 160)})`,
          );
          try {
            await callTool(activeBot, 'pass', {});
            console.log(`  ${activeBot.name}: pass (fallback)`);
            await appendJsonlArtifact('turns.jsonl', {
              type: 'action_fallback',
              bot: activeBot.name,
              playerId: activeBot.playerId,
              persona: activeBot.persona.id,
              round,
              attemptedToolName: toolName,
              attemptedArgs: args,
              fallbackToolName: 'pass',
              error: String(err).slice(0, 500),
            });
            actedThisRound.add(currentPlayerId);
          } catch (passErr) {
            console.log(
              `  ${activeBot.name}: pass fallback also failed (${String(passErr).slice(0, 160)})`,
            );
            await appendJsonlArtifact('errors.jsonl', {
              type: 'action_fallback_error',
              bot: activeBot.name,
              playerId: activeBot.playerId,
              round,
              attemptedToolName: toolName,
              attemptedError: String(err).slice(0, 500),
              fallbackError: formatError(passErr),
            });
          }
        }
      } else {
        console.log(
          `  ${activeBot.name}: not their turn (currentPlayer=${currentPlayerId}), skipping`,
        );
        actedThisRound.add(currentPlayerId); // count as acted to avoid infinite loop
      }

      // Small delay to let server process turn advance
      await new Promise((resolve) => setTimeout(resolve, 200));
      await runCommunicationSweeps(bots, provider, round, nextRelayCursorByBot);
    }
  }

  const finalInspect = await inspect(gameId);
  const finalDiagnostics = isRecord(finalInspect.gameInspect) ? finalInspect.gameInspect : {};
  const relayMessages = Array.isArray(finalDiagnostics.relayMessages)
    ? finalDiagnostics.relayMessages
    : [];
  const messagingRelays = relayMessages.filter(isMessagingRelay);
  const modelChatMessages = messagingRelays.filter((message) => !isSystemRelay(message));
  const summary = {
    runId: RUN_ID,
    lobbyId,
    gameId,
    inspectUrl: `http://127.0.0.1:5173/inspect/${gameId}`,
    gameUrl: `http://127.0.0.1:5173/game/${gameId}`,
    artifactDir: ARTIFACTS_ENABLED ? RUN_DIR : undefined,
    reasoningMessages: relayMessages.filter(
      (message) => isRecord(message) && message.type === 'reasoning',
    ).length,
    chatMessages: modelChatMessages.length,
    publicMessages: modelChatMessages.filter((message) => !isDmRelay(message)).length,
    dmMessages: modelChatMessages.filter(isDmRelay).length,
    systemMessages: messagingRelays.filter(isSystemRelay).length,
    usage: providerUsage(provider),
  };
  await writeJsonArtifact('summary.json', summary);
  await writeJsonArtifact('costs.json', providerUsage(provider));
  await appendJsonlArtifact('games.jsonl', { type: 'game_finished', lobbyId, gameId, summary });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(formatError(err));
  process.exit(1);
});
