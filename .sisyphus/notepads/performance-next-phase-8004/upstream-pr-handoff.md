# Upstream coordination-games PR handoff

## Blocker

- GitHub fork does not exist yet: `https://github.com/DjimoSerodio/coordination-games`
- Verified on 2026-04-08 by 404 probe and `git ls-remote` repository-not-found
- bd issue: `Coordination game-6o1` (blocked)

## Local upstream repo

- Path: `/Users/djimoserodio/Documents/coordination-games`
- Branch: `main`
- Status: clean working tree

## Local commits ready to publish

1. `d6672c0` — docs: builder quickstart + MCP tool contract + Node 22 runtime pin
2. `acae6e2` — fix: tested Node 22 build workflow and rollup platform dependency
3. `6227099` — feat(games): Comedy-of-the-Commons game plugin
4. `e38356f` — docs: before/after report for Lucian
5. `0f371a5` — fix(agent-sdk): build fixes
6. `2fde784` — feat(server): wire Comedy-of-the-Commons plugin into server
7. `d766287` — feat(agent-sdk): BuilderBot example
8. `5043648` — feat(agent-sdk): full SDK package
9. `5434ccb` — feat(games): Iterated Prisoner's Dilemma plugin
10. `d4a2407` — feat(games): built-in IPD benchmark strategies

## Verified runtime/build state

- `packages/agent-sdk`: `npx tsc --skipLibCheck` passes
- `packages/games/prisoners-dilemma`: build passes
- `packages/server`: build passes with both `@coordination-games/game-comedy-commons` and `@coordination-games/game-prisoners-dilemma`
- Runtime verification used port `3002`, not `3000`
- `/api/framework` includes `prisoners-dilemma` after wiring
- `POST /api/lobbies/create` works for `comedy-of-the-commons` and `prisoners-dilemma`

## Immediate commands after fork creation

```bash
git -C "/Users/djimoserodio/Documents/coordination-games" remote add fork https://github.com/DjimoSerodio/coordination-games.git
git -C "/Users/djimoserodio/Documents/coordination-games" push -u fork main
git -C "/Users/djimoserodio/Documents/coordination-games" remote -v
```

If `fork` already exists locally, use:

```bash
git -C "/Users/djimoserodio/Documents/coordination-games" remote set-url fork https://github.com/DjimoSerodio/coordination-games.git
git -C "/Users/djimoserodio/Documents/coordination-games" push -u fork main
```

## Recommended PR grouping

### PR 1 — upstream docs + environment fixes

Commits:

- `d6672c0`
- `acae6e2`
- `e38356f`

Suggested title:

- `docs: add builder quickstart and Node 22 setup guidance`

Suggested summary bullets:

- add builder quickstart and MCP tool contract docs
- pin/test Node 22 workflow and Darwin ARM64 rollup dependency path
- include before/after integration report for Comedy-of-the-Commons sprint

### PR 2 — Comedy plugin + server wiring

Commits:

- `6227099`
- `2fde784`

Suggested title:

- `feat(games): add Comedy-of-the-Commons plugin and register it in server`

Suggested summary bullets:

- add minimal first-slice Comedy plugin package
- register Comedy plugin in server via side-effect import
- verify framework listing and lobby creation locally

### PR 3 — agent SDK

Commits:

- `0f371a5`
- `d766287`
- `5043648`

Suggested title:

- `feat(agent-sdk): add Comedy-of-the-Commons agent SDK`

Suggested summary bullets:

- add MCP client, base agent class, simple strategies, and Claude-powered LLM agent
- add personas, quickstart docs, and BuilderBot example
- verify package builds clean with TypeScript

### PR 4 — Iterated Prisoner's Dilemma

Commits:

- `5434ccb`
- `d4a2407`

Suggested title:

- `feat(games): add Iterated Prisoner's Dilemma with benchmark strategies`

Suggested summary bullets:

- add 2-player IPD game plugin and server registration
- add built-in benchmark bots: always cooperate, always defect, tit-for-tat, grudger, detective
- add deterministic tournament helpers for evaluation

## Notes for PR creation

- Keep `BEFORE_AFTER_REPORT.md` in the docs/environment PR unless Lucian prefers it as PR body text instead
- If upstream prefers fewer PRs, combine PR 1 + PR 2
- If upstream prefers one PR only, push `main` and use the four logical sections above in the PR body
- `gh` CLI was not authenticated locally during this session, so PR creation may require re-authentication even after fork creation
