/**
 * LLM Provider abstraction for the Coordination Olympiad Arena.
 *
 * Allows swapping between Anthropic (Claude) and MiniMax.
 */

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface ProviderTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface LLMResponse {
  toolCalls: ToolCall[];
  raw: unknown;
}

export interface LLMProviderOptions {
  maxTokens?: number;
}

export interface ProviderModels {
  fast: string;
  smart: string;
}

export interface LLMProvider {
  complete(opts: {
    model: string;
    system: string;
    userMessage: string;
    tools: ProviderTool[];
  }): Promise<LLMResponse>;
  getModels(): ProviderModels;
}

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private maxTokens: number;

  constructor(apiKey: string, options: LLMProviderOptions = {}) {
    this.apiKey = apiKey;
    this.maxTokens = options.maxTokens ?? 1024;
  }

  async complete(opts: {
    model: string;
    system: string;
    userMessage: string;
    tools: ProviderTool[];
  }): Promise<LLMResponse> {
    const client = new Anthropic({ apiKey: this.apiKey });

    const anthropicTools = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    const message = await client.messages.create({
      model: opts.model,
      max_tokens: this.maxTokens,
      system: opts.system,
      tools: anthropicTools,
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: opts.userMessage }],
    });

    const toolCalls: ToolCall[] = [];
    const contentBlocks = (message.content ?? []) as Array<{
      type?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
    for (const block of contentBlocks) {
      if (block.type === "tool_use") {
        toolCalls.push({
          name: block.name ?? "",
          input: block.input ?? {},
        });
      }
    }

    return { toolCalls, raw: message };
  }

  getModels(): ProviderModels {
    return {
      fast: "claude-haiku-4-20250414",
      smart: "claude-sonnet-4-20250514",
    };
  }
}

// ---------------------------------------------------------------------------
// MiniMax provider — Anthropic-compatible API
// ---------------------------------------------------------------------------

export interface MinimaxProviderOptions extends LLMProviderOptions {
  /** Defaults to "https://api.minimax.io/anthropic" */
  baseURL?: string;
}

export class MinimaxProvider implements LLMProvider {
  private apiKey: string;
  private baseURL: string;
  private maxTokens: number;

  constructor(apiKey: string, options: MinimaxProviderOptions = {}) {
    this.apiKey = apiKey;
    this.baseURL = options.baseURL ?? "https://api.minimax.io/anthropic";
    this.maxTokens = options.maxTokens ?? 1024;
  }

  async complete(opts: {
    model: string;
    system: string;
    userMessage: string;
    tools: ProviderTool[];
  }): Promise<LLMResponse> {
    const client = new Anthropic({
      authToken: this.apiKey,
      baseURL: this.baseURL,
      dangerouslyAllowBrowser: false,
    });

    const anthropicTools = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    const message = await client.messages.create({
      model: opts.model,
      max_tokens: this.maxTokens,
      system: opts.system,
      temperature: 0.7,
      tools: anthropicTools,
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: opts.userMessage }],
    });

    const toolCalls: ToolCall[] = [];
    const contentBlocks = (message.content ?? []) as Array<{
      type?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;

    for (const block of contentBlocks) {
      if (block.type === "tool_use") {
        toolCalls.push({
          name: block.name ?? "",
          input: block.input ?? {},
        });
      }
    }

    return { toolCalls, raw: message };
  }

  getModels(): ProviderModels {
    return {
      fast: "MiniMax-M2.7-highspeed",
      smart: "MiniMax-M2.7",
    };
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

/**
 * Create the best available LLM provider from environment variables.
 * Priority: MINIMAX_API_KEY (preferred) > ANTHROPIC_API_KEY
 */
export function createProvider(): LLMProvider {
  const minimaxKey = process.env.MINIMAX_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (minimaxKey) {
    console.log("[LLMAgent] Using Minimax provider");
    return new MinimaxProvider(minimaxKey);
  }

  if (anthropicKey) {
    console.log("[LLMAgent] Using Anthropic provider");
    return new AnthropicProvider(anthropicKey);
  }

  throw new Error(
    "Either MINIMAX_API_KEY or ANTHROPIC_API_KEY environment variable is required",
  );
}
