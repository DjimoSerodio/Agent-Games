# F2 Code Quality Review — performance-next-phase-8004

Result: previous 3 major defects are fixed, but major follow-up issues still remain.

Reviewed scope: all frontend files changed in `37a17b0^..HEAD`.

## Verified fixes from `9ae2a43`

1. **ChatFeed scroll compensation is now implemented correctly.**
   - File: `arena/frontend/src/components/ChatFeed.tsx:17-79`
   - `scrollSnapshotRef`, `syncScrollSnapshot()`, and removed-content height compensation are present. The effect now uses the pre-update snapshot and compensates `scrollTop` when older rows are trimmed, so the original viewport-jump defect is fixed.

2. **`game.started` now clears readiness surfaces.**
   - File: `arena/frontend/src/hooks/useGameSocket.ts:107-127`
   - `agentIdentities`, `attestationReadiness`, and `participationReadiness` are reset on new game start, so the originally reported readiness-card leak is fixed.

3. **IdentityCard is now bounded.**
   - File: `arena/frontend/src/components/IdentityCard.tsx:19`
   - The card now renders `identities.slice(0, 5)`, so the unbounded row-growth defect is fixed.

## Remaining Major Issues

1. **Chat history is still unbounded in store state, so the main chat hotspot is only partially fixed.**
   - Files: `arena/frontend/src/store.ts:196`, `arena/frontend/src/components/ChatFeed.tsx:26-29`
   - `ChatFeed` only windows rendering, but `addMessage` still does `messages: [...state.messages, message]` forever. That means memory usage and message-array copy cost still grow without bound over long sessions, which undercuts Task 4's stated bounded-history requirement.

2. **`game.started` still leaves other match-scoped observatory state stale.**
   - File: `arena/frontend/src/hooks/useGameSocket.ts:107-127`
   - The fix correctly clears readiness data, but the same reset block still leaves `pendingAgentInfo`, `trustMatrix`, `worldMap`, `prizePoolWei`, `payablePrizePoolWei`, `slashedPrizePoolWei`, `carryoverPrizePoolWei`, and `commonsHealth` untouched. A fresh game can therefore inherit prior-match metadata and economy/trust/world surfaces until later events overwrite them.

3. **The performance harness does not measure real frontend behavior and does not enforce budgets.**
   - Files: `arena/frontend/src/harness/runners.ts:11-27`, `arena/frontend/src/harness/runners.ts:48-90`, `arena/frontend/src/harness/fixtures.ts:79-99`, `arena/frontend/src/harness/index.ts:1-5`
   - `measureIdleRedraws()` is a 1-second busy loop, not a redraw measurement.
   - `measureChatDOM()` is a fixed arithmetic estimate, not a DOM measurement.
   - `measureUnrelatedRerenders()` counts object-shape diffs, not React rerenders.
   - `createReadinessFixture()` exists but is not exported from the harness entrypoint.
   - `npm run test:harness` logged multiple FAILs (`idle`, `chat-burst`, `hidden-tab`) but still exited successfully, so the harness cannot act as an acceptance gate.

## Remaining Medium Issues

1. **WebSocket reconnect can survive component unmount.**
   - File: `arena/frontend/src/hooks/useGameSocket.ts:56-59`, `arena/frontend/src/hooks/useGameSocket.ts:335-338`
   - Cleanup calls `wsRef.current?.close()`, but `onclose` always schedules `setTimeout(connect, 2000)`. Without an unmounted guard, tearing down the component can still create a reconnect loop.

2. **ChatFeed's height cache is never pruned.**
   - File: `arena/frontend/src/components/ChatFeed.tsx:24`, `arena/frontend/src/components/ChatFeed.tsx:31-43`
   - `messageHeightsRef` keeps every seen message id forever. The DOM is bounded now, but the auxiliary cache is not, so long-running sessions still accumulate per-message state.

## Verification

- `lsp_diagnostics` on modified frontend TS/TSX files: clean.
- `cd arena/frontend && npm run build`: passed.
- `cd arena/frontend && npm run test:harness`: ran successfully but reported:
  - `idle`: `fps measured=42672554 budget=0 FAIL`
  - `chat-burst`: `domNodes measured=510 budget=200 FAIL`
  - `trust-burst`: `updateMs measured=0.013958... budget=16 PASS`
  - `hidden-tab`: `rerenders measured=1 budget=0 FAIL`
