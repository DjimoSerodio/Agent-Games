# F3 Manual QA — performance-next-phase-8004

- Date: 2026-04-06
- Preview: `http://127.0.0.1:4174/`
- Method: production preview + Playwright headless QA with deterministic mocked websocket fixtures

## Summary

| # | Check | Result |
|---|---|---|
| 1 | Idle board — no continuous redraw | PASS |
| 2 | Hidden tab — pause/resume | PASS |
| 3 | Chat burst — bounded DOM + preserved off-bottom scroll | PASS |
| 4 | Trust surface — 12-player grid without jank | PASS |
| 5 | Readiness surfaces — fixture data reaches cards | FAIL |
| 6 | Layout — row 3 cards equal width | PASS |
| 7 | Map polish — richer board visuals visible | PASS |

## Findings

### 1. Idle board — PASS
- Scenario: production preview with idle fixture.
- Observation window: 5s after resetting canvas metrics.
- Evidence:
  - `draws = 0`
  - `rafsScheduled = 0`
  - `rafsFired = 0`
  - `canvasCount = 1`
  - board rect: `799 x 494.5`
- Result: the board stayed idle; no continuous repaint loop was observed.

### 2. Hidden tab — PASS
- Scenario: idle fixture + simulated `visibilitychange` hidden/visible transitions.
- Evidence while hidden:
  - `draws = 0`
  - `rafsScheduled = 0`
  - `rafsFired = 0`
  - `document.hidden = true`
- Evidence after visible again:
  - `draws = 1`
  - `rafsScheduled = 1`
  - `rafsFired = 1`
  - visibility log: `hidden -> visible`
- Result: redraw work pauses while hidden and resumes with a single redraw when visible again.

### 3. Chat burst — PASS
- Scenario: chat fixture seeded with 100 messages, scrolled off-bottom to tracked `Chat message 40`, then burst-injected messages `100-124`.
- Evidence before burst:
  - `scrollTop = 4774`
  - `atBottom = false`
  - tracked message offset from feed top: `0px`
- Evidence after burst:
  - `messageCards = 100`
  - oldest visible message: `Chat message 25:`
  - newest visible message: `Chat message 124:`
  - `scrollTop = 1799`
  - `atBottom = false`
  - tracked message offset from feed top: `6.25px`
- Result: the DOM stays capped at 100 messages and the off-bottom reader position is preserved when old messages are dropped.

### 4. Trust surface — PASS
- Scenario: 12-player trust grid plus repeated `trust.updated` burst events.
- Evidence:
  - `dataCells = 144`
  - `headerCells = 24`
  - trust body `scrollHeight = 664`, `clientHeight = 424`
  - `longTaskCount = 0`
  - `maxLongTask = 0`
- Result: the 12-player trust surface rendered correctly, stayed internally bounded, and showed no jank signal during burst updates.

### 5. Readiness surfaces — FAIL
- Scenario: readiness fixture sent populated `agentIdentities`, `attestationReadiness`, and `participationReadiness` in mocked runtime state updates.
- Fixture payload contained:
  - `agentIdentities = 6`
  - `attestationReadiness = 3`
  - `participationReadiness = 6`
- UI evidence:
  - Identity card still showed `No agent identities registered.`
  - Attestation card still showed `No attestation data available.`
  - Participation card still showed `No participation data available.`
- Result: readiness fixture data still does not reach the three readiness cards through the runtime update path used in QA.

### 6. Layout — PASS
- Scenario: desktop readiness fixture at `1700x1400` viewport.
- Evidence:
  - row 3 card widths: `518.66 / 518.67 / 518.66`
- Result: row 3 cards render at effectively equal width.

### 7. Map polish — PASS
- Scenario: visual inspection of production preview board screenshot.
- Evidence from `idle-board.png`:
  - distinct terrain colors/textures across hexes
  - region labels and terrain abbreviations present
  - circular production badges present
  - strong board-game readability cues and legend treatment
- Result: the map shows materially richer terrain/readability treatment rather than a flat board.

## Screenshot References
- `idle-board.png`
- `chat-burst.png`
- `trust-burst.png`
- `readiness-layout.png`

## QA Conclusion
- Overall: **6/7 checks passed**
- Remaining blocker:
  1. Readiness fixture data still does not populate `IdentityCard`, `AttestationStatusCard`, or `ParticipationCard` in the verified runtime update path.
