import {
  AnthropicProvider,
  type LLMProvider,
  MinimaxProvider,
} from "../agents/providers.js";

/**
 * Harness/runtime-owned provider selection.
 *
 * Provider secrets belong to the harness operator, not to the game engine or
 * the GameAgent implementation itself.
 */
export function createProviderFromEnv(): LLMProvider {
  const minimaxKey = process.env.MINIMAX_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (minimaxKey) {
    console.log("[Harness] Using Minimax provider");
    return new MinimaxProvider(minimaxKey);
  }

  if (anthropicKey) {
    console.log("[Harness] Using Anthropic provider");
    return new AnthropicProvider(anthropicKey);
  }

  throw new Error(
    "Either MINIMAX_API_KEY or ANTHROPIC_API_KEY environment variable is required",
  );
}
