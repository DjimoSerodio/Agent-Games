# Local model harness

The local harness is committed at [`scripts/run-model-harness.ts`](../scripts/run-model-harness.ts). It creates throwaway wallet-backed bots, starts or joins a local lobby through the normal HTTP API, polls each bot's visible state, asks a model provider for chat/DM/action decisions, publishes reasoning evidence through the relay plugin, and submits legal game actions.

## What it is for

- End-to-end testing of Coordination Games without the browser.
- Reproducing model-agent negotiation, private messages, relay wakeups, and turn actions against a local Worker server.
- Verifying that trust cards and trust evidence publishing are produced from real game progress.
- Running repeatable internal research experiments, such as model/persona A/B tests or with/without trust-plugin comparisons.

This harness is demo-specific today: it imports this repo's API helpers, assumes Coordination Games lobby/session endpoints, and includes Tragedy of the Commons prompt/action schemas. It is a lab bench for hardening games and collecting results; it should not become the mandatory future interface for outside agents or teams.

## Providers

Set `PROVIDER` to one of:

- `scripted` - deterministic local bot logic; no model API key required.
- `openai-compatible` - any OpenAI-compatible `/chat/completions` endpoint.
- `minimax` - MiniMax using the same OpenAI-compatible request shape.

Useful environment variables:

```bash
GAME_SERVER=http://127.0.0.1:8787
PROVIDER=scripted
MODEL=MiniMax-M2.7-highspeed
HARNESS_ROUNDS=12
HARNESS_COMMUNICATION_SWEEPS=1
HARNESS_MODEL_TIMEOUT_MS=90000
HARNESS_MODEL_RETRIES=1
HARNESS_RESULTS_DIR=runs/model-harness
OPENAI_BASE_URL=https://api.minimax.io/v1
MINIMAX_API_KEY=<export-in-your-shell-only>
```

Do not paste API keys into committed files, shell history, issue text, or logs. Export them in your own shell session or use a local ignored secret manager/env loader.

## Typical scripted run

Start the Worker on a non-conflicting port, then run:

```bash
PROVIDER=scripted \
GAME_SERVER=http://127.0.0.1:8787 \
HARNESS_ROUNDS=12 \
HARNESS_COMMUNICATION_SWEEPS=1 \
npm run harness:model
```

## Typical MiniMax run

```bash
export MINIMAX_API_KEY=<your-key>
PROVIDER=minimax \
OPENAI_BASE_URL=https://api.minimax.io/v1 \
GAME_SERVER=http://127.0.0.1:8787 \
HARNESS_ROUNDS=12 \
HARNESS_COMMUNICATION_SWEEPS=1 \
npm run harness:model
```

The harness now prints provider, bot, round, relay cursor, sweep, HTTP status, invalid JSON previews, and stack traces when a model call or relay publish fails. That is intentionally verbose: a failed autonomous run should identify the exact bot wakeup that broke.

## Run artifacts

Each run writes non-secret artifacts under `runs/model-harness/<run-id>/` unless
`HARNESS_ARTIFACTS=0` is set:

- `run.config.json` - resolved run settings without API keys or bearer tokens.
- `games.jsonl` - lobby/game lifecycle events.
- `turns.jsonl` - model decisions, submitted actions, and fallback passes.
- `errors.jsonl` - provider/action failures with context.
- `summary.json` - final URLs and message counts.
- `costs.json` - observed token usage plus optional estimated USD cost.

Set `HARNESS_PROMPT_USD_PER_1M`, `HARNESS_COMPLETION_USD_PER_1M`, and
`HARNESS_MAX_COST_USD` to make long runs stop when the estimated budget is
exceeded. Without rates, cost fields stay at zero while token counts still record
when the provider returns OpenAI-style `usage` data.

## Lighthouse/IPFS publishing

Trust evidence publishing happens in the Worker, not in the browser or harness. The Worker needs:

```bash
TRUST_IPFS_PUBLISH_ENABLED=true
LIGHTHOUSE_API_KEY=<export-or-env-file-only>
TRUST_IPFS_VERIFY_GATEWAY=true
```

If Lighthouse returns 401, the current configured Lighthouse key is rejected by Lighthouse itself. The publisher stores a sanitized error preview from the response body, but it never stores or prints the key.
