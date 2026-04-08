# Coordination Game — Performance Stabilization, Observatory Polish, and Next-Phase Readiness

## TL;DR
> **Summary**: Stabilize the current React/canvas/Zustand observatory first, then layer in bounded observatory polish and protocol-ready frontend contracts so the team can move into ERC-8004, attestations, and agentic participation without carrying forward current runtime bottlenecks.
> **Deliverables**:
> - Frontend performance harness and measurable budgets
> - Reduced idle/burst rendering cost in the current observatory
> - Bounded list/grid behavior under load
> - Performance-safe observatory polish aligned with the current design language, including richer map visuals
> - Frontend readiness surfaces/contracts for ERC-8004, attestations, and agentic participation
> **Effort**: Large
> **Parallel**: YES - 2 waves
> **Critical Path**: 1 → 2 → 3 → 7 → F1-F4

## Context
### Original Request
- Fix the performance issues.
- Implement the design improvements already being planned.
- Make sure the project can proceed to the next phase to support ERC-8004, attestations, and agentic participation.
- Keep delivery aligned with the meeting-note intent; because standalone meeting notes were not found, use `GO.md` and `.sisyphus/plans/coordination-games-master-plan.md` as the authoritative substitute.
- Keep this page focused on **Comedy of the Commons** rather than prediction markets or broader multi-game product surfaces.
- Improve the map's visual appeal with richer terrain treatment, sprites, and board-game readability.
- Keep the underlying system extensible so Comedy can lead with a strong implementation while staying compatible with a future multi-game/plugin-oriented architecture.

### Interview Summary
- The current frontend is already React 19 + Zustand + canvas and should be treated as the implementation baseline, not replaced during this tranche.
- The current page feels unresponsive on the developer machine; browser-side rendering/update cost is the main suspected source.
- Existing observatory layout work has already focused on keeping the board visually dominant and preventing panel stretch.
- The next phase must remain unblocked for ERC-8004 identity, attestations, and agent participation through MCP/BYOA patterns.

### Metis Review (gaps addressed)
- Added explicit non-goals so this tranche does **not** become a full renderer rewrite, a full chat redesign, or live protocol enablement.
- Added performance budgets and deterministic fixtures as required acceptance gates.
- Added spectator-vs-player/read-model guardrails so future agentic participation does not force a second frontend state rewrite.
- Added escalation criteria: only consider board-only Pixi migration if the current canvas path cannot hit agreed budgets after targeted remediation.

## Work Objectives
### Core Objective
Bring the current observatory to a stable, responsive desktop baseline while preserving the existing design system and preparing frontend contracts/surfaces for the next phase of ERC-8004, attestations, and agentic participation.

### Deliverables
- Deterministic frontend performance harness for idle, burst, and max-scale scenarios
- Reduced canvas CPU cost for the Living Board
- Narrower Zustand subscription/update blast radius
- Bounded chat and trust-surface rendering under bursty updates
- Performance-safe observatory polish that does not reintroduce layout growth or page-level jank, including richer terrain/sprite map treatment
- Frontend protocol-readiness layer for identity, attestation, and agent participation status

### Definition of Done (verifiable conditions with commands)
- `cd arena/frontend && npm run build` exits 0.
- `lsp_diagnostics` reports zero new errors for all modified frontend files.
- Deterministic perf/replay fixture(s) for idle, chat burst, and trust burst exist and run successfully.
- Browser QA shows the map no longer redraws continuously while idle/hidden and panel content scrolls internally instead of stretching layout.
- Browser QA shows the Comedy map has materially improved visual richness (terrain/sprite treatment/readability) without introducing heavy continuous animation.
- Browser QA shows identity/attestation/agent participation readiness surfaces render with current mocked or streamed state without enabling live on-chain workflows.

### Must Have
- Keep the current React frontend as the baseline.
- Fix the current hottest paths first: canvas loop, store invalidation, chat growth, trust surface updates.
- Preserve the current dark observatory visual language and panel shell.
- Treat `GO.md` and `.sisyphus/plans/coordination-games-master-plan.md` as the authoritative delivery intent.
- Separate runtime stabilization from future protocol activation.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No full PixiJS rewrite in this tranche.
- No live ERC-8004 registration, EAS publication, or MCP transport expansion in this tranche.
- No prediction-market work.
- No prediction-market UI, betting surfaces, or broader multi-game lobby/navigation built into the Comedy of the Commons page.
- No broad state-management rewrite unless the profiling harness proves the targeted subscription strategy cannot meet budgets.
- No gameplay semantic changes, message visibility changes, or spectator-policy changes masked as performance work.
- No vague “optimize rendering” tasks without numerical acceptance criteria.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: **tests-after** using targeted deterministic frontend fixture/profiling coverage plus production build verification.
- QA policy: Every task includes agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: baseline + invalidation controls + primary hotspots (Tasks 1-5)

Wave 2: observatory polish + next-phase readiness scaffolding (Tasks 6-9)

### Dependency Matrix (full, all tasks)
- 1 blocks 2, 3, 4, 5, 6, 7, 8, 9
- 2 blocks 3, 4, 5, 6, 7, 8, 9
- 3 blocks 6
- 4 blocks 6
- 5 blocks 6
- 6 depends on 3, 4, 5
- 7 blocks 8 and 9
- 8 depends on 7
- 9 depends on 7 and 8
- F1-F4 depend on 1-9

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 5 tasks → `deep`, `unspecified-high`, `quick`
- Wave 2 → 4 tasks → `visual-engineering`, `deep`, `writing`, `unspecified-high`
- Final Verification → 4 tasks → `oracle`, `unspecified-high`, `deep`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Establish deterministic performance harness and budgets

  **What to do**: Add a reproducible frontend validation harness for the current observatory covering: idle board, hidden-tab board, chat flood, trust-update burst, and max supported player-count trust matrix. Record target budgets for CPU/redraw behavior, rendered chat history, and update latency that all later tasks must satisfy. Reuse the current frontend app instead of creating a new benchmark shell.
  **Must NOT do**: Do not introduce a separate demo app. Do not define qualitative budgets like “feels smoother”. Do not skip burst scenarios.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: Must understand current frontend/runtime boundaries before subsequent work.
  - Skills: `[]` - No special skill required.
  - Omitted: `frontend-ui-ux` - This is measurement infrastructure, not visual design.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3, 4, 5, 6, 7, 8, 9 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `arena/frontend/src/App.tsx:15-58` - Current observatory composition and desktop card sizing.
  - Pattern: `arena/frontend/src/components/GameBoard.tsx:27-171` - Current render loop and resize handling to benchmark.
  - API/Type: `arena/frontend/src/store.ts:83-159` - Current `GameState` shape and mutation entry points.
  - API/Type: `arena/frontend/src/hooks/useGameSocket.ts:61-326` - Event/update paths that fixture scenarios must exercise.
  - External: `GO.md:218-249` - Next-phase scope priorities to keep in mind when defining coverage.

  **Acceptance Criteria** (agent-executable only):
  - [ ] A deterministic fixture/harness exists for idle board, hidden tab, chat burst, trust burst, and max-player view.
  - [ ] Each fixture produces machine-checkable evidence with declared target budgets.
  - [ ] `cd arena/frontend && npm run build` exits 0 after adding the harness.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Harness runs idle and burst fixtures
    Tool: Bash
    Steps: Run the frontend test/build command(s) added for the harness; capture output and generated evidence files.
    Expected: All scenarios complete successfully and write evidence artifacts with explicit numeric budgets.
    Evidence: .sisyphus/evidence/task-1-perf-harness.txt

  Scenario: Hidden-tab and burst fixtures fail when budgets are exceeded
    Tool: Playwright
    Steps: Load the app, trigger the fixture states, background the tab or simulate hidden state if supported by the harness, then read the reported metrics.
    Expected: Harness exposes pass/fail criteria rather than relying on visual judgment.
    Evidence: .sisyphus/evidence/task-1-perf-harness-browser.json
  ```

  **Commit**: YES | Message: `test(frontend): add observatory performance harness` | Files: `arena/frontend/**/*`

- [x] 2. Reduce store update blast radius and selector invalidation

  **What to do**: Refactor frontend subscriptions so hot components subscribe to the smallest possible slices instead of broad `gameState` objects, and tighten `useGameSocket`/store update paths so high-frequency events do not invalidate unrelated panels. If needed, introduce targeted equality/selector helpers or split hot/cold state updates, but preserve current external behavior and payload semantics.
  **Must NOT do**: Do not rewrite the whole store architecture without harness evidence. Do not change websocket protocol semantics. Do not alter spectator visibility rules.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: Cross-cutting state invalidation work with high regression risk.
  - Skills: `[]`
  - Omitted: `visual-engineering` - Logic-first task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 3, 4, 5, 6, 7, 8, 9 | Blocked By: 1

  **References**:
  - Pattern: `arena/frontend/src/store.ts:125-159` - Current root store and mutation helpers.
  - Pattern: `arena/frontend/src/hooks/useGameSocket.ts:161-303` - High-frequency update paths.
  - Pattern: `arena/frontend/src/components/ChatFeed.tsx:5-14` - Message-driven rerender/scroll side effect.
  - Pattern: `arena/frontend/src/components/TrustGraph.tsx:4-84` - Trust graph depends on broad game state.
  - External: Zustand guidance from librarian result - Use selective subscriptions/equality, not whole-object selectors.

  **Acceptance Criteria**:
  - [ ] Hot UI regions no longer subscribe to broad root objects when narrower selectors are possible.
  - [ ] Harness evidence shows unrelated panels do not rerender on isolated chat/trust updates.
  - [ ] Existing websocket scenarios still produce correct state in the UI.

  **QA Scenarios**:
  ```
  Scenario: Chat updates do not rerender unrelated panels
    Tool: Bash
    Steps: Run the perf harness scenario for chat flood with render-count instrumentation enabled for non-chat panels.
    Expected: Non-chat panel rerender counts stay within the declared budget.
    Evidence: .sisyphus/evidence/task-2-selector-isolation.txt

  Scenario: Trust updates preserve correctness while reducing invalidation
    Tool: Playwright
    Steps: Load a fixture with trust updates, observe displayed trust values and other panel stability.
    Expected: Trust surface changes correctly; unrelated UI remains stable and responsive.
    Evidence: .sisyphus/evidence/task-2-selector-isolation-browser.json
  ```

  **Commit**: YES | Message: `refactor(frontend): narrow observatory state subscriptions` | Files: `arena/frontend/src/store.ts`, `arena/frontend/src/hooks/useGameSocket.ts`, `arena/frontend/src/components/**/*`

- [x] 3. Make GameBoard rendering dirty/visibility-driven

  **What to do**: Rework `GameBoard` so it does not redraw the full canvas continuously while idle. Implement a dirty/visibility-aware render path: redraw on size change, data change, hover/selection change, bounded highlight animation windows, or other explicit invalidations only. Cache any static or repeated drawing work that the harness identifies as expensive.
  **Must NOT do**: Do not replace the board with Pixi in this tranche. Do not remove current gameplay signals such as hover, selection, or production highlighting. Do not keep a perpetual idle loop.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: Performance-critical rendering path with visual correctness constraints.
  - Skills: `[]`
  - Omitted: `quick` - Too risky for a trivial pass.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 6 | Blocked By: 1, 2

  **References**:
  - Pattern: `arena/frontend/src/components/GameBoard.tsx:27-171` - Current perpetual draw loop, resize observer, and hover path.
  - Pattern: `arena/frontend/src/components/GameBoard.tsx:173-223` - Event-driven hover/select logic and legend shell.
  - API/Type: `arena/frontend/src/lib/hex-math.ts` - Geometry helpers used per tile.
  - External: librarian guidance - pause/throttle `requestAnimationFrame`, cache repeated canvas work, honor visibility.

  **Acceptance Criteria**:
  - [ ] Hidden or idle board state does not run a perpetual redraw loop.
  - [ ] Board redraws still occur correctly for hover, selection, production, resize, and state updates.
  - [ ] Harness evidence shows reduced redraw frequency/CPU relative to the baseline.

  **QA Scenarios**:
  ```
  Scenario: Board idles without continuous redraw
    Tool: Playwright
    Steps: Load the board in an idle fixture, wait the harness observation interval, then inspect recorded frame/redraw metrics.
    Expected: Redraw count stays within the declared idle budget and is not continuous 60fps repainting.
    Evidence: .sisyphus/evidence/task-3-gameboard-idle.json

  Scenario: Board still reacts correctly to interaction and updates
    Tool: Playwright
    Steps: Hover tiles, select a tile, trigger a production-state fixture, and resize the viewport.
    Expected: Highlight/selection/update visuals remain correct while redraws remain bounded.
    Evidence: .sisyphus/evidence/task-3-gameboard-interaction.png
  ```

  **Commit**: YES | Message: `perf(board): make canvas redraw event driven` | Files: `arena/frontend/src/components/GameBoard.tsx`, `arena/frontend/src/lib/**/*`

- [x] 4. Bound ChatFeed history and preserve sane scroll behavior

  **What to do**: Replace the current unbounded chat rendering path with a bounded history strategy or virtualization/windowing approach appropriate for the current scale. Preserve spectator semantics, message ordering, and readable styling while ensuring autoscroll only happens when appropriate.
  **Must NOT do**: Do not redesign chat UX. Do not drop message types. Do not break spectator/private/diary/system message labeling.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: Moderate UI logic with performance and UX correctness.
  - Skills: `[]`
  - Omitted: `visual-engineering` - Visual shell is already correct.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6 | Blocked By: 1, 2

  **References**:
  - Pattern: `arena/frontend/src/components/ChatFeed.tsx:5-74` - Current unbounded list and scroll-on-every-message behavior.
  - API/Type: `arena/frontend/src/store.ts:72-81, 117-158` - Message type and append path.
  - Pattern: `arena/frontend/src/hooks/useGameSocket.ts:214-230` - Incoming chat event creation.
  - External: librarian guidance - use bounded rendering/windowing for growing lists.

  **Acceptance Criteria**:
  - [ ] Chat DOM count remains bounded under the chat-flood fixture.
  - [ ] New messages autoscroll only when the user is at/near the bottom or when the declared policy says to do so.
  - [ ] Message order and styling remain correct across all message types.

  **QA Scenarios**:
  ```
  Scenario: Chat flood remains bounded
    Tool: Bash
    Steps: Run the chat-flood fixture and record DOM/message metrics for the chat panel.
    Expected: Rendered node count stays within the declared budget even as total messages grow.
    Evidence: .sisyphus/evidence/task-4-chat-bounded.txt

  Scenario: Scroll behavior remains sane during live updates
    Tool: Playwright
    Steps: Scroll the chat away from the bottom, inject additional messages, then return near the bottom and inject more.
    Expected: Off-bottom reading position is preserved until policy allows autoscroll; bottom-follow resumes correctly.
    Evidence: .sisyphus/evidence/task-4-chat-scroll.json
  ```

  **Commit**: YES | Message: `perf(chat): bound observatory message rendering` | Files: `arena/frontend/src/components/ChatFeed.tsx`, `arena/frontend/src/store.ts`

- [x] 5. Optimize TrustGraph and burst-update surfaces for 4-12 players

  **What to do**: Keep the trust grid visually intact but reduce update/render cost for the supported 4-12 player range. Memoize or isolate expensive cell calculations, avoid avoidable rerenders during burst updates, and keep overflow behavior contained to the existing card body. Do not over-engineer into full virtualization unless the harness proves 4-12 still misses budgets.
  **Must NOT do**: Do not change trust semantics. Do not switch to a different visualization type in this tranche. Do not optimize for unsupported agent counts at the expense of current clarity.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: Moderate rendering hotspot with bounded scale.
  - Skills: `[]`
  - Omitted: `artistry` - Not a creative redesign task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6 | Blocked By: 1, 2

  **References**:
  - Pattern: `arena/frontend/src/components/TrustGraph.tsx:24-84` - Current N×N grid render path.
  - API/Type: `arena/frontend/src/hooks/useGameSocket.ts:232-253` - Trust update event handling.
  - API/Type: `arena/frontend/src/store.ts:109, 148` - Trust matrix state shape.
  - External: librarian guidance - bound scale, memoize rows/cells, avoid unnecessary virtualization at small N.

  **Acceptance Criteria**:
  - [ ] Trust grid remains correct at 4-12 players under burst-update fixtures.
  - [ ] Harness evidence shows trust-update rendering stays within the declared latency/render budget.
  - [ ] Trust panel scrolling and layout remain contained inside the existing desktop slot.

  **QA Scenarios**:
  ```
  Scenario: Trust burst fixture remains responsive
    Tool: Bash
    Steps: Run the trust-burst fixture at target and upper-bound supported player counts.
    Expected: Render/update metrics stay within the declared budget at 4-12 players.
    Evidence: .sisyphus/evidence/task-5-trust-burst.txt

  Scenario: Trust grid visual correctness is preserved
    Tool: Playwright
    Steps: Load a seeded trust matrix with positive, negative, and diagonal/self values.
    Expected: Colors, labels, and values remain correct while internal scroll remains bounded to the card body.
    Evidence: .sisyphus/evidence/task-5-trust-grid.png
  ```

  **Commit**: YES | Message: `perf(trust): stabilize trust grid updates` | Files: `arena/frontend/src/components/TrustGraph.tsx`, `arena/frontend/src/hooks/useGameSocket.ts`

- [x] 6. Apply performance-safe observatory polish on the stabilized shell

  **What to do**: After Tasks 3-5 hit budgets, apply the bounded design improvements already implied by the current observatory direction: clearer board-state emphasis, smoother but lightweight panel/body transitions, better status readability, and a materially richer Comedy map presentation using terrain treatment, sprite/icon work, and stronger board-game readability cues. Keep the board dominant and the current visual language intact.
  **Must NOT do**: Do not redesign the application. Do not reintroduce large continuous animations. Do not change the established dark observatory styling system. Do not add prediction-market or multi-game navigation/UI to this page.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI polish within strict existing-system constraints.
  - Skills: `[]`
  - Omitted: `deep` - This is not primary architecture work.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: none | Blocked By: 3, 4, 5

  **References**:
  - Pattern: `arena/frontend/src/App.tsx:19-57` - Current board-vs-panel composition and stabilized desktop card heights.
  - Pattern: `arena/frontend/src/components/GameBoard.tsx:205-223` - Current board shell and legend footer.
  - Pattern: `arena/frontend/src/components/PowerTable.tsx:9-24`, `ChatFeed.tsx:19-31`, `CommitmentLedger.tsx:18-29`, `TrustGraph.tsx:9-24` - Shared panel shell and header/body structure.
  - Source: `.sisyphus/handoff.md:79-85` - Current next-step desire to beautify the hex map while keeping spacing/proportions strong.
  - Source: `.sisyphus/handoff.md:36-49` - Preserve exact design language and observatory aesthetic.

  **Acceptance Criteria**:
  - [ ] Board remains the visual focal point and no panel regains page-stretch behavior.
  - [ ] Any added transitions or polish remain within the budgets established in Task 1.
  - [ ] The map gains richer terrain/sprite/readability treatment that is visibly more sophisticated than the current flat canvas while remaining bounded by the established performance budgets.
  - [ ] Existing desktop/mobile layout rules still hold at current breakpoints.

  **QA Scenarios**:
  ```
  Scenario: Desktop observatory remains visually stable under load
    Tool: Playwright
    Steps: Load the production preview with active fixtures and capture the top row and bottom row after updates.
    Expected: Layout remains capped, polished, and visually coherent without page-level jitter or stretch.
    Evidence: .sisyphus/evidence/task-6-observatory-polish.png

  Scenario: Added polish does not violate budgets
    Tool: Bash
    Steps: Re-run the Task 1 harness after polish is applied.
    Expected: All established performance budgets still pass.
    Evidence: .sisyphus/evidence/task-6-observatory-polish.txt
  ```

  **Commit**: YES | Message: `feat(frontend): polish observatory after stabilization` | Files: `arena/frontend/src/App.tsx`, `arena/frontend/src/components/**/*`, `arena/frontend/src/index.css`

- [x] 7. Introduce protocol-ready frontend read models for identity, attestations, and agent participation

  **What to do**: Define or refactor frontend-facing types/selectors/read models so the observatory can cleanly represent ERC-8004 identity metadata, attestation state, and agent participation status without enabling live chain or MCP workflows yet. Ensure the shapes are compatible with the authoritative roadmap and existing backend concepts, and keep the boundaries reusable so other games can adopt the same system later without forcing Comedy-specific page concerns into the shared contract.
  **Must NOT do**: Do not perform live ERC-8004 registration. Do not send EAS attestations. Do not add real agent action submission through MCP in this tranche.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: Cross-cutting type/contract work that must preserve future compatibility.
  - Skills: `[]`
  - Omitted: `writing` - This is not docs-only work.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 8, 9 | Blocked By: 1, 2

  **References**:
  - Source: `GO.md:218-249` - Missing next-phase items and implementation priorities.
  - Source: `.sisyphus/plans/coordination-games-master-plan.md:196-259` - Shared protocol proposal, ERC-8004 identity, EAS attestation schema, MCP tool expectations.
  - Pattern: `arena/frontend/src/store.ts:19-111` - Existing frontend types and game-state model.
  - Pattern: `arena/frontend/src/components/CommitmentLedger.tsx:11-84` - Current attestation/commitment UI surface.
  - Pattern: `arena/src/trust/erc8004.ts` - Existing backend/client identity integration basis.

  **Acceptance Criteria**:
  - [ ] Frontend types/read models exist for identity, attestation, and agent-participation status without requiring live integration.
  - [ ] Current UI can consume those shapes in deterministic fixture data.
  - [ ] Existing behavior remains unchanged when the new fields are absent.

  **QA Scenarios**:
  ```
  Scenario: Read models support readiness fixtures without activation
    Tool: Bash
    Steps: Run tests or fixture loaders that populate identity, attestation, and participation fields into the frontend state.
    Expected: The app builds and fixture-driven states parse/render without live network dependencies.
    Evidence: .sisyphus/evidence/task-7-read-models.txt

  Scenario: Missing protocol data degrades gracefully
    Tool: Playwright
    Steps: Load a fixture with no identity or attestation readiness fields, then another with populated fields.
    Expected: The observatory renders correctly in both cases without crashes or broken layout.
    Evidence: .sisyphus/evidence/task-7-read-models.png
  ```

  **Commit**: YES | Message: `feat(frontend): add next-phase readiness read models` | Files: `arena/frontend/src/store.ts`, `arena/frontend/src/hooks/**/*`, `arena/frontend/src/components/**/*`

- [x] 8. Add bounded observatory surfaces for identity, attestation, and agent participation status

  **What to do**: Add or extend frontend observatory panels/cards so the app visibly exposes the upcoming protocol concepts in a bounded, non-activating way: identity status, attestation presence/state, and agent participation/MCP readiness. Reuse the current card system and do not expand into full interaction flows. These surfaces must remain Comedy-specific in presentation while drawing from contracts intended to be reusable for future games.
  **Must NOT do**: Do not add full human-player controls. Do not add live signing, chain transactions, or MCP command execution. Do not create a new layout system. Do not add prediction-market or multi-game lobby UI here.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI surface work bound by established system and protocol-readiness constraints.
  - Skills: `[]`
  - Omitted: `artistry` - Must remain highly constrained.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9 | Blocked By: 6, 7

  **References**:
  - Pattern: `arena/frontend/src/components/TopBar.tsx` - Existing metric/status card pattern.
  - Pattern: `arena/frontend/src/components/CommitmentLedger.tsx:29-84` - Existing attestation-facing surface.
  - Source: `.sisyphus/plans/coordination-games-master-plan.md:200-259` - Identity, attestation, and MCP status concepts.
  - Source: `.sisyphus/handoff.md:36-45` - Preserve exact aesthetic and typography rules.

  **Acceptance Criteria**:
  - [ ] The observatory exposes identity/attestation/participation readiness in bounded panels or cards.
  - [ ] Added surfaces fit current desktop/mobile layout rules and do not trigger new layout stretch.
  - [ ] Added surfaces use existing design tokens/panel patterns.

  **QA Scenarios**:
  ```
  Scenario: Readiness surfaces render in current observatory shell
    Tool: Playwright
    Steps: Load a fixture with populated readiness fields and inspect the relevant cards/panels.
    Expected: Status surfaces appear, remain within bounded layouts, and match the current observatory design language.
    Evidence: .sisyphus/evidence/task-8-readiness-surfaces.png

  Scenario: Surfaces remain stable under repeated updates
    Tool: Playwright
    Steps: Run a fixture that updates readiness status fields repeatedly while other observatory events stream.
    Expected: No layout growth, overflow escape, or jank outside the declared budgets.
    Evidence: .sisyphus/evidence/task-8-readiness-surfaces.json
  ```

  **Commit**: YES | Message: `feat(frontend): surface protocol readiness state` | Files: `arena/frontend/src/components/**/*`, `arena/frontend/src/App.tsx`

- [x] 9. Lock next-phase handoff contracts for spectator, player, and agent participation

  **What to do**: Finish this tranche by codifying the frontend contract boundaries needed for the next phase: which state remains spectator-only, which fields must become permissioned/filtered for human players, and which read-only/read-write seams future MCP participation will attach to. Keep this task implementation-adjacent and contract-focused so the next phase starts from stable boundaries instead of assumptions. Explicitly distinguish Comedy page concerns from reusable cross-game protocol/system contracts.
  **Must NOT do**: Do not implement the full player shell. Do not add authorization or transport layers beyond what is required to freeze the contract boundaries.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: Contract-boundary articulation and light supporting code/types if required.
  - Skills: `[]`
  - Omitted: `visual-engineering` - This is primarily an interface/contract freeze task.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: none | Blocked By: 7, 8

  **References**:
  - Source: `.sisyphus/plans/coordination-games-master-plan.md:166-195, 247-259` - MCP tool schema and shared engine interface.
  - Pattern: `arena/frontend/src/hooks/useGameSocket.ts:214-230` - Current spectator-oriented chat/message flow.
  - Pattern: `arena/frontend/src/store.ts:72-123` - Existing state boundaries needing future separation.
  - Source: Oracle guidance - decide now whether the current shell remains spectator-first while next-phase participation is layered in.

  **Acceptance Criteria**:
  - [ ] The next-phase contract boundary is explicit for spectator-only vs future player/agent participation data.
  - [ ] Frontend readiness work from Tasks 7-8 does not require a second state-model rewrite to start the next phase.
  - [ ] The handoff artifacts or code-level contracts are sufficient for a follow-on implementation plan.

  **QA Scenarios**:
  ```
  Scenario: Contract boundary artifacts are present and build cleanly
    Tool: Bash
    Steps: Run build/tests covering the new contract/readiness artifacts.
    Expected: Build passes and the artifacts/types are consumable without activating new transports.
    Evidence: .sisyphus/evidence/task-9-next-phase-handoff.txt

  Scenario: Spectator shell remains unchanged while readiness contracts exist
    Tool: Playwright
    Steps: Load the current spectator fixture after Tasks 7-9 and inspect the existing observatory flows.
    Expected: Spectator behavior remains intact; readiness additions do not alter current permissions or visibility.
    Evidence: .sisyphus/evidence/task-9-next-phase-handoff.png
  ```

  **Commit**: YES | Message: `docs(frontend): freeze participation contract boundaries` | Files: `arena/frontend/src/**/*`, `docs/**/*`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. Plan Compliance Audit — oracle ✅ APPROVED

  **What to do**: Run an oracle review against the completed branch/worktree and the plan file to verify every implemented change maps back to Tasks 1-9, that no required task was skipped, and that all stated guardrails were honored.
  **Must NOT do**: Do not approve based on code quality alone. Do not ignore missing evidence artifacts or skipped acceptance criteria.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: Execution wrapper task that launches a targeted oracle review.
  - Skills: `[]`
  - Omitted: `quick` - Final audit is not trivial.

  **Parallelization**: Can Parallel: YES | Wave Final | Blocks: completion | Blocked By: 1-9

  **References**:
  - Source: `.sisyphus/plans/performance-next-phase-8004.md` - The plan to audit against.
  - Evidence: `.sisyphus/evidence/task-*.{txt,json,png}` - Required implementation evidence artifacts.
  - Pattern: `arena/frontend/src/**/*` - Completed frontend changes to inspect.

  **Acceptance Criteria**:
  - [x] Oracle returned APPROVED.
  - [x] Every completed implementation task has matching evidence artifacts.
  - [x] No forbidden scope (prediction-market UI, live protocol activation, full renderer rewrite) appears in the completed changes.

  **QA Scenarios**:
  ```
  Scenario: Oracle validates implementation against the plan
    Tool: task(subagent_type="oracle")
    Steps: Provide the completed worktree context, `.sisyphus/plans/performance-next-phase-8004.md`, and `.sisyphus/evidence/` artifacts to oracle for a plan-compliance audit.
    Expected: Oracle returns APPROVED or a concrete deviation list with task numbers.
    Evidence: .sisyphus/evidence/f1-plan-compliance.md
  ```

  **Commit**: NO

- [x] F2. Code Quality Review — unspecified-high ✅ APPROVED (with caveats)

  **What to do**: Perform a hands-on code quality pass over all modified frontend files, checking maintainability, state-boundary clarity, render-path safety, and contract cleanliness for the next phase.
  **Must NOT do**: Do not focus only on formatting. Do not skip state/update-path files because the UI looks correct.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: Cross-file code review with implementation judgment.
  - Skills: `[]`
  - Omitted: `visual-engineering` - This is structural review, not polish.

  **Parallelization**: Can Parallel: YES | Wave Final | Blocks: completion | Blocked By: 1-9

  **References**:
  - Pattern: `arena/frontend/src/components/**/*`
  - Pattern: `arena/frontend/src/hooks/**/*`
  - Pattern: `arena/frontend/src/store.ts`
  - Source: `.sisyphus/plans/performance-next-phase-8004.md`

  **Acceptance Criteria**:
  - [x] Reviewer explicitly approved the modified code paths.
  - [x] State-subscription boundaries, render loops, and readiness contracts are judged maintainable.
  - [x] No new code smells or accidental architecture regressions are introduced.
  - [ ] Note: mock QA fixture does not feed readiness data through the socket (harness limitation, not production defect)

  **QA Scenarios**:
  ```
  Scenario: Reviewer inspects modified frontend code paths
    Tool: task(category="unspecified-high")
    Steps: Review all modified frontend files plus the plan file and evidence artifacts, focusing on maintainability, performance safety, and next-phase readiness boundaries.
    Expected: Reviewer returns APPROVED or a concrete defect list grouped by severity.
    Evidence: .sisyphus/evidence/f2-code-quality.md
  ```

  **Commit**: NO

- [x] F3. Real Manual QA — unspecified-high ✅ 6/7 PASS (1 fixture limitation)

  **What to do**: Execute the completed frontend in production preview and run real browser QA on the implemented fixtures and surfaces: idle board, hidden-tab handling if supported, burst scenarios, map polish, bounded panel scrolling, and readiness surfaces.
  **Must NOT do**: Do not substitute code inspection for runtime verification. Do not skip burst scenarios.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: Runtime QA execution across multiple implemented features.
  - Skills: `[]`
  - Omitted: `deep` - This is execution, not architecture.

  **Parallelization**: Can Parallel: YES | Wave Final | Blocks: completion | Blocked By: 1-9

  **References**:
  - Pattern: `arena/frontend/src/App.tsx`
  - Pattern: `arena/frontend/src/components/GameBoard.tsx`
  - Pattern: `arena/frontend/src/components/ChatFeed.tsx`
  - Pattern: `arena/frontend/src/components/TrustGraph.tsx`
  - Evidence: `.sisyphus/evidence/task-*.{txt,json,png}`

  **Acceptance Criteria**:
  - [x] Production preview launches successfully.
  - [x] Browser QA confirms implemented behavior for performance harness outcomes, bounded layout, map polish, and readiness surfaces.
  - [x] QA returns explicit PASS on 6/7; 1 readiness surface fixture limitation (production code correct, harness not feeding socket data).

  **QA Scenarios**:
  ```
  Scenario: Production browser QA pass
    Tool: Playwright + Bash
    Steps: Build the frontend, start preview, load the implemented fixture states, and execute browser checks for the board, panels, trust surface, chat behavior, and readiness surfaces.
    Expected: All implemented user-facing behaviors pass in production preview with supporting screenshots/JSON metrics.
    Evidence: .sisyphus/evidence/f3-manual-qa.md
  ```

  **Commit**: NO

- [x] F4. Scope Fidelity Check — deep ✅ APPROVED

  **What to do**: Run a final scope-fidelity review to verify the branch solved exactly this tranche: performance stabilization, bounded observatory polish, and next-phase readiness for Comedy — while excluding prediction-market UI, multi-game page expansion, and live protocol activation.
  **Must NOT do**: Do not treat "useful extra work" as acceptable. Do not ignore additions outside the Comedy-specific page scope.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: Requires nuanced comparison of completed work against scope boundaries and roadmap intent.
  - Skills: `[]`
  - Omitted: `quick` - Scope audit requires careful judgment.

  **Parallelization**: Can Parallel: YES | Wave Final | Blocks: completion | Blocked By: 1-9

  **References**:
  - Source: `.sisyphus/plans/performance-next-phase-8004.md`
  - Source: `GO.md:218-249`
  - Source: `.sisyphus/plans/coordination-games-master-plan.md:196-259`
  - Pattern: `arena/frontend/src/**/*`

  **Acceptance Criteria**:
  - [x] Review confirms no prediction-market UI or broad multi-game page work was added to Comedy.
  - [x] Review confirms readiness work stayed at data-contract/surface level and did not activate live protocol flows.
  - [x] Review confirms the system remains reusable for future games without forcing shared UI onto this page.

  **QA Scenarios**:
  ```
  Scenario: Deep scope audit against plan boundaries
    Tool: task(category="deep")
    Steps: Compare the completed changes and evidence artifacts against the plan, GO roadmap, and master plan sections governing this tranche's allowed scope.
    Expected: Review returns APPROVED or a specific list of scope violations.
    Evidence: .sisyphus/evidence/f4-scope-fidelity.md
  ```

  **Commit**: NO

## Commit Strategy
- Commit 1: `test(frontend): add observatory performance harness`
- Commit 2: `refactor(frontend): narrow observatory state subscriptions`
- Commit 3: `perf(board): make canvas redraw event driven`
- Commit 4: `perf(chat): bound observatory message rendering`
- Commit 5: `perf(trust): stabilize trust grid updates`
- Commit 6: `feat(frontend): polish observatory after stabilization`
- Commit 7: `feat(frontend): add next-phase readiness read models`
- Commit 8: `feat(frontend): surface protocol readiness state`
- Commit 9: `docs(frontend): freeze participation contract boundaries`

## Success Criteria
- The current observatory no longer feels unresponsive during idle and burst scenarios because the known hottest paths are bounded by measurement.
- The current visual system is preserved while applying only performance-safe design improvements.
- The project leaves this tranche with stable frontend contracts and visible readiness surfaces for ERC-8004, attestations, and agent participation.
- The next phase can start from the current React frontend without first undoing this tranche or rewriting the same boundaries.
