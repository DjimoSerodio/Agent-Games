/**
 * LLM Provider abstraction for the Coordination Olympiad Arena.
 *
 * Allows swapping between Anthropic (Claude), Minimax (OpenAI-compatible),
 * and any other OpenAI-compatible provider.
 */

import OpenAI from "openai";

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

export interface LLMProvider {
  complete(opts: {
    model: string;
    system: string;
    userMessage: string;
    tools: ProviderTool[];
  }): Promise<LLMResponse>;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SDK = await import("@anthropic-ai/sdk") as any;
    const Anthropic = SDK.default ?? SDK;

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
}

// ---------------------------------------------------------------------------
// Minimax provider — OpenAI-compatible API
// ---------------------------------------------------------------------------

export interface MinimaxProviderOptions extends LLMProviderOptions {
  /** Defaults to "https://api.minimax.chat/v1" */
  baseURL?: string;
}

export class MinimaxProvider implements LLMProvider {
  private apiKey: string;
  private baseURL: string;
  private maxTokens: number;

  constructor(apiKey: string, options: MinimaxProviderOptions = {}) {
    this.apiKey = apiKey;
    this.baseURL = options.baseURL ?? "https://api.minimax.chat/v1";
    this.maxTokens = options.maxTokens ?? 1024;
  }

  async complete(opts: {
    model: string;
    system: string;
    userMessage: string;
    tools: ProviderTool[];
  }): Promise<LLMResponse> {
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      dangerouslyAllowBrowser: false,
    });

    const openaiTools = opts.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema as {
          type: "object";
          properties: Record<string, unknown>;
          required?: string[];
        },
      },
    }));

    const message = await client.chat.completions.create({
      model: opts.model,
      max_tokens: this.maxTokens,
      temperature: 0.7,
      tools: openaiTools,
      tool_choice: "auto",
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.userMessage },
      ],
    });

    const rawChoice = message.choices[0];
    if (!rawChoice) throw new Error("Minimax returned no choices");

    const toolCalls: ToolCall[] = [];
    const rawMessage = rawChoice.message as {
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string };
      }>;
    };

    if (rawMessage.tool_calls) {
      for (const tc of rawMessage.tool_calls) {
        if (tc.function) {
          let input: Record<string, unknown> = {};
          try {
            if (tc.function.arguments) {
              input = JSON.parse(tc.function.arguments);
            }
          } catch {
            // use empty input on parse failure
          }
          toolCalls.push({
            name: tc.function.name ?? "",
            input,
          });
        }
      }
    }

    return { toolCalls, raw: message };
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
