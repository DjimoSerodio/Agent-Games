# Model harness

`scripts/run-model-harness.ts` is a lightweight, model-agnostic game runner.
It sits outside the game engine: the engine exposes auth, lobbies, game tools,
and relay tools; the harness chooses a model/provider and drives agents.

The harness is an internal lab bench for game reliability and research runs. It
is not the intended future requirement for outside teams or bring-your-own-agent
participants.

## Providers

- `PROVIDER=scripted` — no model calls; validates game/reasoning plumbing.
- `PROVIDER=openai-compatible` or `PROVIDER=minimax` — calls an OpenAI-compatible
  `/chat/completions` API. MiniMax works through this path.

## MiniMax example

Do not put secrets in files. Export them only in your shell/session:

```bash
GAME_SERVER=http://127.0.0.1:3101 \
PROVIDER=minimax \
OPENAI_BASE_URL=https://api.minimax.io/v1 \
OPENAI_API_KEY=... \
MODEL=MiniMax-M2.7-highspeed \
HARNESS_ROUNDS=3 \
HARNESS_RESULTS_DIR=runs/model-harness \
tsx scripts/run-model-harness.ts
```

The harness will:

1. authenticate ephemeral players,
2. create and fill a Tragedy lobby,
3. wait for the lobby to auto-start a game,
4. ask the provider for public reasoning + one action,
5. publish `reasoning` relay entries,
6. submit the chosen game action,
7. write run artifacts for analysis,
8. print game and Inspector URLs.

## Reliability and research artifacts

By default each run writes to `runs/model-harness/<run-id>/`:

- `run.config.json` — resolved non-secret run configuration.
- `games.jsonl` — lobby/game lifecycle events.
- `turns.jsonl` — model decisions, submitted actions, and fallbacks.
- `errors.jsonl` — provider/action errors with context.
- `summary.json` — final run summary and URLs.
- `costs.json` — observed token usage and optional cost estimate.

Useful controls:

```bash
HARNESS_MODEL_TIMEOUT_MS=90000      # per model call
HARNESS_MODEL_RETRIES=1             # retry provider failures/timeouts
HARNESS_ARTIFACTS=0                 # disable artifact files
HARNESS_MAX_COST_USD=5              # optional hard stop when rates are set
HARNESS_PROMPT_USD_PER_1M=0.15      # optional estimate only
HARNESS_COMPLETION_USD_PER_1M=0.60  # optional estimate only
```

Artifacts intentionally exclude provider API keys and bot bearer tokens.

## Contract

The model should return only JSON:

```json
{
  "reasoning": "public strategy note, not hidden chain-of-thought",
  "action": { "type": "pass" }
}
```

Invalid or rejected actions fall back to `pass` so local demos keep moving.
