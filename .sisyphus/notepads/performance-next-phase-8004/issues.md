# Issues — performance-next-phase-8004

## 2026-04-06 — F3 Manual QA blockers
- Chat burst regression: the feed correctly trims to the latest 100 messages, but the scroll position remains at the top after the burst instead of following the newest messages.
- Readiness runtime gap: `createReadinessFixture()` payload contains identity, attestation readiness, and participation readiness data, but the production preview still renders all three readiness cards in their empty states.

## 2026-04-06 — F2 re-review follow-up issues
- The chat fix corrected viewport preservation in `ChatFeed.tsx`, but chat state is still unbounded in `store.ts` because `addMessage` keeps appending forever while only the rendered window is capped.
- `game.started` now clears readiness arrays/maps, but other match-scoped frontend state (`pendingAgentInfo`, `trustMatrix`, `worldMap`, prize/commons fields) is still not reset and can leak stale data into a fresh game.
- `useGameSocket.ts` cleanup still allows reconnect scheduling after unmount because `onclose` always arms `setTimeout(connect, 2000)`.
- The perf harness is not a real acceptance gate: `npm run test:harness` reported FAIL for idle/chat/hidden-tab but still exited successfully.

## 2026-04-06 — F3 re-run result
- Chat burst QA now passes: the tracked off-bottom message stayed effectively pinned in place (`0px -> 6.25px`) while the rendered window trimmed to the latest 100 messages (`25 -> 124`).
- Readiness runtime gap still reproduces in QA: even when `game.state_update` carries populated `agentIdentities`, `attestationReadiness`, and `participationReadiness`, all three readiness cards remain in their empty states.

## 2026-04-08 — External blockers after completion
- Plan close-out blocker: `performance-next-phase-8004` is fully complete, but remains open until the user gives explicit `okay`.
- Upstream publish blocker: `Coordination game-6o1` is blocked because the GitHub fork `https://github.com/DjimoSerodio/coordination-games` does not exist yet.
- Upstream PR handoff is documented in `.sisyphus/notepads/performance-next-phase-8004/upstream-pr-handoff.md`, including the exact commit stack, fork commands, and recommended PR split.

## 2026-04-08 — Non-plan local artifact state
- Main repo still has unrelated untracked local artifacts (screenshots, local state, frontend public assets).
- They are outside the scope of `performance-next-phase-8004` and were left untouched rather than guessed-at or swept up.

## 2026-04-08 — Upstream publication blocker re-check
- Direct branch push to `coordination-games/coordination-games` is currently blocked too: dry-run push to `origin` returned `403 Permission denied to DjimoSerodio`.
- Practical unblock paths are now: (a) confirmed upstream push access, or (b) fork creation.
- Local alternative auth paths are also unavailable right now: `gh auth status` shows no logged-in hosts, and SSH access fails with `Permission denied (publickey)`.
