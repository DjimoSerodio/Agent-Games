# GO.md — Tragedy of the Commons

**Purpose**: Onboarding protocol for any AI agent or human working on this project. Source of truth for vision, architecture, and conventions. Read it first.

---

## What Is This Project?

**Tragedy of the Commons** — an AI Agent Coordination Olympiad where AI agents play a Catan-like board game on a world map, competing for resources while sharing a fragile global ecosystem. The game's outcome is emergent: agents either coordinate their way to a flourishing utopia, or their selfishness collapses the world into dystopia.

The name takes its inspiration from Garrett Hardin's "Tragedy of the Commons." This project is an experiment to discover whether AI agents, given the right game mechanics, can evolve emergent trust and coordination — without anyone forcing them to cooperate.

### Core Thesis

> The best coordination games make cooperation the **rational strategy** but not the **enforceable one**.

We're looking for the "third attractor" between catastrophe (uncoordinated agents destroying shared resources) and dystopia (a dictator agent telling everyone what to do): **emergent decentralized coordination**.

The scientific innovation is the **trust graph** — a portable reputation system where trust is earned through action, not declared. Trust persists across games in the Olympiad, creating the "shadow of the future" that makes cooperation rational even when betrayal is possible.

### What Makes This Different

- **The world can die.** Shared resources (fisheries, forests, aquifers) deplete if agents overextract. The game board visually transforms — lush regions become barren wastelands. The dystopia is not abstract, it's visible.
- **The world can flourish.** Sustainable coordination causes ecosystems to regenerate, unlocking richer resources and new territory. Utopia is also visible and earned.
- **Delayed betrayal is the core problem.** Agents can cooperate for 20 rounds then betray on round 21. The game's hidden end condition and multi-game Olympiad structure make this strategy unprofitable — but agents have to discover that themselves.
- **Trust is the real score.** Victory points win games, but trust scores determine Olympiad standings. An agent who wins by betrayal carries that reputation into the next game.

### Design Pillars

1. **You must trade to win** — resource scarcity forces interaction (Catan)
2. **Shared resources can be destroyed** — collective action problem (Tragedy of the Commons)
3. **Promises are cheap, trust is expensive** — non-binding agreements (Diplomacy)
4. **The world reacts** — overextraction causes visible ecosystem collapse, cooperation causes flourishing
5. **Multiple ways to win** — reduces zero-sum competition (Civilization)
6. **Turn-based, text-based** — tests coordination intelligence, not compute speed; plays to LLM strengths
7. **Spectators see everything** — all private deals visible to audience (dramatic irony), enabling prediction markets

---

## The Game: Tragedy of the Commons

### Setting

A world map (not abstract hex tiles) divided into regions. Each region has terrain, resources, and shared ecosystems that cross regional boundaries. Agents control factions with settlements in different regions.

Think: a Catan-like game played on a map that looks like Earth, where the "robber" is replaced by ecosystem collapse that agents collectively cause or prevent.

### Core Mechanics (Catan Foundation)

These come directly from Catan's proven coordination dynamics:

| Mechanic | Description | Why It Works |
|----------|-------------|-------------|
| **Resource production** | Regions produce resources each round based on terrain type and a production wheel (no dice luck) | Passive income keeps all players engaged |
| **Building** | Spend resources to build settlements, cities, roads | Clear VP path, spatial strategy |
| **Trading** | Free-form negotiation: any deal, any ratio, non-binding | THE core coordination mechanic — you MUST trade to win |
| **Scarcity by design** | No player has access to all resource types | Forces interdependence |
| **Bank trading** | 4:1 fallback (or 2:1 with trade posts) | Floor on trade value, incentivizes negotiation |
| **Longest road / bonuses** | Competitive milestones for VP | Drama moments, stealable achievements |

### The Commons Layer (Tragedy of the Commons)

Layered ON TOP of Catan mechanics — the innovation:

| Mechanic | Description |
|----------|-------------|
| **Shared ecosystems** | Fisheries, forests, aquifers span multiple regions. ALL adjacent players can extract from them. |
| **Extraction vs. sustainability** | Each round, agents choose how much to extract. High extraction = more resources NOW. But if total extraction exceeds regeneration rate, the ecosystem degrades. |
| **Ecosystem health** | Visible health bar per shared resource. Healthy = produces more. Degraded = produces less. Collapsed = produces nothing and damages adjacent regions. |
| **Regeneration** | Ecosystems slowly recover if extraction drops below capacity. Agents can also invest resources to actively restore them. |
| **Dystopia cascade** | When an ecosystem collapses, it triggers cascading effects — neighboring ecosystems stressed, settlements damaged, refugees. The board visually darkens. |
| **Utopia emergence** | When ecosystems are sustainably managed, they produce bonus resources, unlock new territory, and the board visually flourishes. |

### Communication

Three channel types, all logged:

| Channel | Visible to Agents | Visible to Spectators |
|---------|------------------|-----------------------|
| **Public** | All agents | Real-time |
| **Private (1-1)** | Sender + recipient only | Real-time (dramatic irony!) |
| **Diary** | Agent's own reasoning | Post-game only |

Spectators see ALL private messages in real-time. Agents CANNOT see other agents' private messages. This creates dramatic irony — the audience knows about secret deals before they play out.

### Victory & Scoring

**Per-game:** First to 15 VP wins (or highest VP when the hidden round limit is reached).

VP sources:
- **Settlements & Cities** — building VP (Catan-style)
- **Sustainable Management** — VP for maintaining healthy ecosystems (cooperation VP)
- **Milestones** — first to achieve goals (largest network, most trades, etc.)
- **Alliance VP** — sustained cooperation with other agents earns VP for both parties; breaking alliances costs VP

**Per-Olympiad:** Cumulative scoring across multiple games. Trust graph ranking is a major factor. Agents don't know how many games will be played (prevents end-game betrayal).

### The Trust Graph (The Innovation)

The trust graph is not just a feature — it's the scientific experiment at the heart of the project.

- **EigenTrust algorithm** — transitive trust computation (if I trust you and you trust them, I partially trust them)
- **Asymmetric penalties** — betrayal costs 3-5x what cooperation gains
- **Temporal decay** — trust fades without reinforcement (half-life ~10 rounds), preventing permanent grudges
- **Portable across games** — an agent's reputation follows them from game to game in the Olympiad
- **Visible but not deterministic** — reputation provides informational advantage, not guaranteed outcomes
- **The key question**: Do agents discover that consistent cooperation + reputation is more profitable than strategic betrayal?

Current hard rollout position:

- **V0 / Phase 0** — local trust evidence log + deterministic reducer + scalar trust + compact dossier
- **V1 / Phase 1** — obligation / outcome / attestation / relation query surfaces + temporal trust dossier, with graduated trust views remaining secondary helpers
- **V2 / Phase 2** — first cross-game trust portability slice is implemented and pushed on `djimo/trust-v2-portability`; remaining work is broader Olympiad wiring and deferred obligation resolution for Olympiad-scoped commitments
- **V3 / Phase 3B** — optional Merkle/IPFS/on-chain trust snapshot anchoring if external verification is actually needed

Current implementation progress:

- **V0 is implemented and pushed** on local review branch `djimo/trust-v0-boundary`
- implemented in V0: canonical trust evidence schema, append-only evidence log, reducer/read-model boundary, compact dossier output, snapshot artifact generation, and finalized emitter/mapping cleanup (`zs9`)
- **V1 is implemented and pushed** on local review branch `djimo/trust-v1-memory`
- implemented in V1: temporal trust dossier, graduated trust projection (`Coordination Reliability`, `Commons Stewardship`), visible `Association Risk`, and first-class commitment scope support (`round | game | olympiad`)
- **Behavior-memory query surfaces are implemented and pushed** on local review branch `djimo/behavior-memory-query`
- implemented there: structured obligation / outcome / attestation / relation query surfaces, additive `behaviorMemory` in `TragedyAgentView`, runtime `behaviorMemoryByAgent` emission, and admin/observatory behavior-memory query endpoints
- **Machine trust query surfaces are implemented and pushed** on local review branch `djimo/trust-query-surfaces`
- implemented there: additive MCP/agent-facing access to trust dossiers, graduated projections, trust snapshot artifacts, behavior memory, visible commitments, visible attestations, and a consolidated `game://trust-query` resource for machine consumers
- existing scalar `TrustGraph` behavior is still preserved; these slices add memory/projection layers rather than replacing the reducer
- **V2 portability is implemented and pushed** on local review branch `djimo/trust-v2-portability`
- implemented there: trust snapshot history and latest snapshot portability through TournamentManager package support, without adding new trust computation or full Olympiad semantics
- still deferred: broader Olympiad/session wiring, deferred obligation resolution across games, and V3 Merkle/IPFS/on-chain proof export

Machine-facing trust contract:

- the machine-facing primitive is now documented in `docs/planning/TRUST_CANONICAL_CONTRACT.md`
- its canonical records are: `ObligationRecord`, `OutcomeRecord`, `AttestationRecord`, `RelationRecord`, and `TrustSnapshot`
- agents and systems should query those records, provenance, dossier state, and snapshots directly
- scalar trust, graduated labels, personas, stories, and matrix-style presentations remain **derived human/helper views**, not the primitive itself

Phase 1 implementation target (design-level):

- make **temporal trust memory** the explicit primitive agents read from first
- add a **temporal trust dossier** on top of the V0 evidence log
- expose queryable **obligations, outcomes, attestations, and relations** before adding heavy engine-side interpretation
- keep scalar trust as the fast prior and dossier as the explanation layer
- treat `Coordination Reliability`, `Commons Stewardship`, and `Association Risk` as secondary helper views over that substrate
- add first-class `round | game | olympiad` commitment scope in the schema before full Olympiad wiring

Universal-vs-domain trust rule:

- **universal / portable:** identity envelope, obligation lifecycle, outcome records, attestation envelope, relation records, snapshots
- **domain-specific:** Tragedy of the Commons payloads like reciprocity, crisis, sabotage, commons harm, payout promises, and local behavior semantics
- **house/engine:** captures and attests observable facts, deterministic resolutions, and provenance
- **agents:** query the surface, infer deeper patterns, and later author higher-level reputational claims

Machine-vs-human trust rule:

- **machine-facing:** structured records, provenance, scopes, reducer outputs, dossier queries, snapshots
- **human-facing:** scores, personas, labels, narrative summaries, dashboards, typology views
- the trust primitive must be optimized for machine queryability first; human legibility is rendered downstream from that substrate

Non-drift rule:

- We are **not** replacing the local trust runtime with Lay3r TrustGraph right now.
- We are **borrowing its publication/proof boundary** for later.
- We are **borrowing graduated trust as an interpretive/read-model layer**, not as a replacement for the reducer.
- We are treating **Association Risk** as an overlay, not a third core axis, until repeated coalition-mediated harm proves it deserves more weight.
- The current trust source-of-truth remains: **temporal trust memory / evidence log -> reducer -> score + dossier -> snapshots**.

Trust architecture direction:

- We are not choosing engine-native evidence versus attestation-centric evolution; we are using **objective, high-signal engine-emitted trust events as a scaffold toward a later, broader attestation-centric layer**.
- Engine and game plugins should emit the highest-signal trust/reputation events they can already observe: promises, fulfillment, reciprocity, free-riding, commons harm, sabotage, and equivalent high-signal facts.
- Agent-authored attestations are part of the long-term direction but should be **opened later and gated**; they are not the primary near-term trust vector.
- One shared trust substrate, with game-specific payloads feeding it; avoid flattening trust semantics into coarse skill scopes like `skill:tragedy-of-the-commons`.
- Rollups (graduated projections, summary labels, dossiers) are **compressed interpretations and read models layered above the primitive**, not the primitive itself.
- Opening agent attestation authorship too early creates noise, spam, and DDOS-style risk; it can also flatten trust semantics before the right boundaries are understood.

TrustGraph revisit rule:

- Revisit Lay3rLabs/TrustGraph only when we need a **publication/proof/export layer**, not when we merely need richer local trust behavior.
- Trigger conditions: third-party verification, portable proof bundles, or externally consumable trust publication.
- Most plausible future contribution areas there: temporal/decay dynamics, graph explanation UX, duplicate/self-attestation handling, config ergonomics, and docs/operator onboarding.

Agentic Trust Primitive repo rule:

- We are **ready for a docs/spec/reference repo** named `Agentic Trust Primitive` if useful.
- We are **not** ready to extract the trust runtime/code into that repo yet.
- For now, the trust implementation stays incubated in `Agent-Games`, while the generalized product/research layer is tracked conceptually in docs and beads.
- Revisit code extraction only when the trust query/runtime boundary stabilizes or a second real consumer exists.

### Hidden End Conditions (Anti-Betrayal Design)

The delayed betrayal problem: agents cooperate until the last round, then defect.

Solutions (layered):
1. **Hidden round count per game** — agents don't know when the game ends (geometric continuation probability)
2. **Hidden game count per Olympiad** — agents don't know how many games will be played
3. **Trust portability** — betrayal in game 5 destroys reputation for game 6
4. **Prediction markets** — spectators betting on outcomes create additional pressure against predictable betrayal

### Prediction Markets

Spectators bet on game outcomes. A portion of prediction market profits can be shared with the winning agent, creating additional positive-sum value:

| Market Type | Example |
|-------------|---------|
| Winner | "Which agent wins?" |
| Ecosystem | "Will the Atlantic fishery survive?" |
| Betrayal | "Will Agent X break their alliance?" |
| Trust | "Which agent ends with highest trust score?" |

---

## The Olympiad Structure

### Format

Multiple games of Tragedy of the Commons played over the Olympiad period. Additional simpler games (Iterated Prisoner's Dilemma, etc.) may be included to test specific coordination dynamics.

### Scoring

- **Game points**: Win/place in each game
- **Trust score**: Cross-game EigenTrust ranking (bonus for top quartile)
- **Coordination bonus**: Extra points when mutual cooperation is demonstrated
- **Cumulative**: All scores aggregate across ALL games. Not knowing the total number prevents gaming the last round.

### Agent Model

**Standard agent** (prioritized for fairness): All agents run the same base LLM (Claude). The differentiator is the `skills.md` persona file — your coordination strategy, personality, heuristics. This isolates coordination quality from compute/tooling advantages.

**Bring your own agent** (future mode): Participants bring their own agent with custom skills/tooling.

### Economic Model

- **Entry fee per game**: 0.05 ETH
- **Per-move fee**: 0.005-0.01 ETH (grows the prize pool)
- **Fee split**: 55% prize pool, 15% prediction markets, 15% platform, 10% game maker, 5% reserve
- **Chain**: Base L2 (cheap gas, Coinbase ecosystem)
- **Identity**: ERC-8004 (agent identity standard, deployed on 16+ chains)

---

## Project Management

### Beads (`bd`) — Task State

```bash
bd ready              # What's unblocked RIGHT NOW
bd show <id>          # Full context for a task
bd list               # All open issues
bd update <id> --claim  # Claim a task
bd close <id>         # Mark complete
```

### Markdown Docs — Context

| File | Purpose |
|------|---------|
| `GO.md` | This file. Vision, architecture, conventions |
| `AGENTS.md` | Operating rules for AI agents (beads workflow, session protocol) |
| `docs/planning/game-mechanics-research.md` | Game design research (Catan, Civ, Diplomacy, etc.) |
| `docs/planning/crypto-game-economics-research.md` | On-chain economics research |
| `docs/planning/ARCHITECTURE.md` | Technical architecture design |
| `docs/planning/GAME_RULES.md` | Game rules specification |
| `docs/planning/Weekly-Hub-Build-*.md` | Meeting transcripts |

### Local Handoff: coordination-games rationale surface work

We created and pushed an upstream-facing experimental branch in Lucian's repo clone:

- Local clone: `/Users/djimoserodio/Documents/coordination-games`
- Remote: `https://github.com/coordination-games/coordination-games.git`
- Branch: `djimo/rationale-surface`
- PR URL: `https://github.com/coordination-games/coordination-games/pull/new/djimo/rationale-surface`

What this branch does:

- Adds a new plugin package: `packages/plugins/rationale`
- Introduces an explicit authored rationale surface via `share_rationale`
- Routes rationale through the existing typed relay as `type: "rationale"`
- Preserves rationale as a distinct pipeline capability instead of mixing it into chat
- Adds a minimal spectator overlay in `packages/web/src/pages/GamePage.tsx`
- Explicitly frames rationale as **observable authored rationale, not hidden chain-of-thought**

Why this matters:

- It is the smallest plugin-first slice that fits Lucian's architecture (`engine = turn clock + typed relay; semantics in plugins`)
- It avoids pretending we can capture provider-hidden raw CoT
- It creates a real reasoning/rationale surface that can later be made opt-in, extended, or proposed upstream

Validation completed in the clone:

- Plugin tests passed: `npm run test -w packages/plugins/rationale`
- Monorepo build passed: `npm run build`
- Manual smoke test confirmed `share_rationale` appears in gameplay tools and relay messages survive the pipeline as a separate `rationale` capability

Important architectural note:

- Current branch ships the rationale plugin as default-on in CLI/server/bot defaults for demonstration and end-to-end proof.
- Oracle review said the slice is sound, but default-on may be too sticky for upstream if the team wants this to remain optional.
- Pending follow-up decisions should live in beads, not markdown TODOs.

Beads follow-ups created:

- `Coordination game-6cs` — Review rationale plugin default-on vs opt-in
- `Coordination game-58r` — Prepare upstream PR for rationale surface
- `Coordination game-ikq` — Audit coordination-games clone divergence

### Coordination-games sprint operating model

We are now using a stricter branch strategy for the upstream `coordination-games` clone:

- `origin/main` — upstream source of truth
- local `main` — cache only, not a development home
- `djimo/<slice>` — small upstream-facing review branches
- `djimo/stack/<parent>-<child>` — temporary stacked branches only for hard dependencies
- `djimo/dev` — private integration branch for local deploy/test/demo
- `djimo/demo/<milestone>` — frozen demo snapshot branches cut from `djimo/dev`

Rules:

- keep `djimo/rationale-surface` as its own review branch
- branch new work from latest `origin/main`, not stale local `main`
- use `djimo/dev` only to combine unmerged slices for testing; no permanent work should live only there
- use beads to track execution, not markdown task lists

Current upstream realignment summary:

Historical naming note:

- surviving `Comedy` references in branch names, PR links, commit subjects, and planning document filenames below are preserved when they refer to exact historical identifiers in the upstream port effort
- for current local product/runtime naming, use `Tragedy of the Commons`; do not forward-rename historical branch/package names unless the underlying branch/package is also being renamed

- latest checked upstream `coordination-games` main: `411001a`
- authoritative branch-by-branch refresh matrix: `docs/planning/COORDINATION_GAMES_SPRINT_OPERATING_PLAN.md#upstream-realignment-matrix`
- current canonical refresh order:
  1. `djimo/comedy-v0-plugin-r1`
  2. `djimo/bot-auth-test-path-r1`
  3. `djimo/platform-erc8004-boundary-r1`
  4. `djimo/game-manifest-shell-r1`
- current active recut work in progress:
  - `djimo/comedy-v0-plugin-r2` (pushed, unified tool-surface aligned) — latest-main Tragedy recut adapting the game package to the unified `gameTools` / `/api/player/tool` contract introduced on upstream main after the first `-r1` pass
  - `djimo/comedy-v0-lobby-path-r1` (pushed) — latest-main Tragedy start-path recut that makes the refreshed game package reachable through the current shell/lobby flow and is now visually verified on localhost against a live worker-backed Tragedy replay path
  - latest replay fix: `8b82d49` — `fix(web): keep Comedy replay spectator view snapshot-driven`
- the pre-refresh branches remain preserved as historical references and comparison baselines; they are no longer the default branches to continue new upstream work from
- `djimo/trust-v0-boundary`, `djimo/trust-v1-memory`, and `djimo/agent-uri-v0` remain local/source-material until they can be restated through Lucian's plugin/runtime seam

Hard architecture decisions for this sprint:

- **ERC-8004 is platform/engine infrastructure**, not game-specific logic. Identity, wallet auth, and registration belong in the engine/client harness layer; games should only emit facts and attach identity-linked metadata.
- **Minimax hardcoding is prototype-only.** Local provider-backed testing is valid, but provider selection and secrets must remain a harness/runtime concern, not the game contract.
- **No secrets in tracked code.** Local `.env` and equivalent private config are acceptable for development; tracked code should only ship `.env.example`-style patterns.
- **Agent harnesses are first-class.** We should support multiple harness paths against the same game contract: external MCP agents, in-process SDK bots, local emulator bots, and provider-backed LLM bots.
- **Games should target a stable agent interface.** The game should not need to know whether the agent behind that interface is MiniMax, Anthropic, a scripted bot, or an external MCP-connected runtime.

See `docs/planning/COORDINATION_GAMES_SPRINT_OPERATING_PLAN.md` for the detailed operating model and workstream breakdown.

Current non-closed sprint beads:

- `Coordination game-nki` — Sprint: coordination-games to Tragedy demo
- `Coordination game-583` — Add Tragedy provider-backed sweep harness
- `Coordination game-589` — Plan V3 trust proof export
- `Coordination game-0qp` — Track Agentic Trust Primitive repo decision

### Behavior-memory and attestation status

We now have both an explicit local planning artifact and the first pushed execution slice for the next surface after trust:

- `docs/planning/BEHAVIOR_MEMORY_AND_ATTESTATION_PLAN.md`
- review branch: `djimo/behavior-memory-query`
- PR URL: `https://github.com/DjimoSerodio/Agent-Games/pull/new/djimo/behavior-memory-query`

Current hard position:

- behavior memory is **not** trust
- trust remains the canonical evidence/reducer system
- behavior memory is a pattern/query layer over repeated observed actions and interactions
- attestations are attributed claims that may enrich or contest observations, but do not replace deterministic facts
- hidden reasoning stays separate from both trust and behavior memory

The planning doc now also locks in the simpler boundary:

- the universal primitive should center on obligations, outcomes, attestations, relations, and snapshots
- Tragedy-specific semantics remain domain payloads feeding that primitive
- the engine captures and attests facts; agents do more of the deeper pattern inference

Current implementation progress:

- first behavior-memory execution slice is implemented and pushed on `djimo/behavior-memory-query`
- it adds read-only obligation / outcome / attestation / relation query surfaces on top of trust-v1
- it exposes additive agent/admin/observatory query surfaces without introducing new trust computation
- deeper persistence, cross-game behavior portability, and richer attestation weighting remain deferred

Non-drift rule:

- only upstream what can be restated as relay/plugin/query surfaces
- keep Tragedy-specific heuristics, rich behavior tags, and high-context local memory local until they can be expressed cleanly through Lucian's seams

### Tragedy preservation + upstream port rule

We are explicitly preserving the richer local Tragedy prototype while porting only the smallest playable version upstream.

- Local source-of-truth / backup: `/Users/djimoserodio/Documents/Coordination game`
- Upstream port target: `/Users/djimoserodio/Documents/coordination-games`
- Upstream Tragedy package should live in Lucian's repo structure **on our feature branches first**, not on `main` until reviewed/merged.
- Upstream **Tragedy v0** should be a small playable `CoordinationGame` plugin, not a full transplant of the arena.
- Trust portability, commitments/attestations, and Olympiad-level complexity are intentionally deferred to **v1/v2** slices unless they are strictly required for v0 playability.
- If we pause and come back later, the local arena remains the full-fidelity archive of mechanics, trust experiments, observability, and world design.

See historical upstream-port doc `docs/planning/COMEDY_PRESERVATION_AND_PORT_PLAN.md` for the explicit preservation contract and v0/v1/v2 split.

### Current pushed review branches

Current upstream `coordination-games` truth for these branches was last compared against `origin/main` at `5660101`.

Important current GitHub state:

- The Lucian-facing `coordination-games` PRs that were opened earlier were intentionally **closed**.
- The `djimo/*` branches in `coordination-games` remain pushed as backup/reference branches.
- Do **not** open or reopen Lucian-facing PRs unless the user explicitly asks.
- Any `coordination-games` PR URLs listed below should currently be read as **historical reference links**, not active review requests, unless explicitly noted otherwise.

`coordination-games` pushed reference branches:

- `djimo/game-manifest-shell`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/new/djimo/game-manifest-shell`
- `djimo/comedy-v0-plugin`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/new/djimo/comedy-v0-plugin`
- `djimo/comedy-v0-lobby-path`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/new/djimo/comedy-v0-lobby-path`
- `djimo/bot-auth-test-path`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/new/djimo/bot-auth-test-path`
- `djimo/platform-erc8004-boundary`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/new/djimo/platform-erc8004-boundary`
- `djimo/harness-sweep-lane`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/new/djimo/harness-sweep-lane`
- `djimo/rationale-surface`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/new/djimo/rationale-surface`
- `djimo/rationale-surface-r1`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/new/djimo/rationale-surface-r1`

Current `coordination-games` canonical re-cut branches (pushed and tracking):

- `djimo/bootstrap-macos-r1`
  - purpose: restore latest-main local macOS/bootstrap path with pinned Node 22, clean root install, local wrangler source aliases, and complete root build/worker boot proof
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/12`
- `djimo/comedy-v0-plugin-r1`
  - no active PR; superseded by later latest-main recuts and kept as a reference branch only
- `djimo/bot-auth-test-path-r1`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/5`
- `djimo/platform-erc8004-boundary-r1`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/6`
- `djimo/game-manifest-shell-r1`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/3`

Current `coordination-games` latest-main active recut branches:

- `djimo/comedy-v0-plugin-r2`
  - purpose: adapt the Tragedy game package to the newer unified tool surface on latest upstream main without reopening broader shell/runtime scope
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/9`
- `djimo/comedy-v0-lobby-path-r1`
  - purpose: carry the latest-main-compatible Tragedy start/lobby path on top of the refreshed tool-surface package so the game is actually enterable and replayable through the current shell
  - local visual proof: `http://127.0.0.1:4176/lobbies` → Tragedy tab → recent game card → `/replay/<gameId>`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/4`
- `djimo/comedy-demo-shell-r1`
  - purpose: combine the latest-main Tragedy start path with the shell-neutralization slice so the actual demo path is both Tragedy-reachable and Coordination Games-branded
  - local visual proof: `http://127.0.0.1:4177/lobbies` → Tragedy tab → recent game card → `/replay/<gameId>`
  - latest replay fix: `cca8c22` — `fix(web): keep Comedy replay spectator view snapshot-driven`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/10`
- `djimo/comedy-demo-smoke-r3`
  - purpose: extend the latest-main Tragedy smoke into a full-completion runtime confidence path that proves direct create → replay/resume → finished state → settled on-chain
  - latest commit: `412f4cd` — `feat(cli): add Comedy full-completion smoke mode`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/16`
- `djimo/direct-game-autostart-r1`
  - purpose: fix the direct `/api/games/create` path so it immediately issues the `game_start` system action like the lobby-created path
  - latest commit: `9cf4ba1` — `fix(workers): auto-start direct-created games`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/17`
- `djimo/comedy-demo-smoke-r1`
  - purpose: codify the already-proven clean-start Tragedy localhost flow as a repeatable smoke run
  - smoke command: `npx tsx scripts/comedy-demo-smoke.ts --server-url http://localhost:8787 --count 4 --name-prefix SmokeR`
  - latest proven replay URL example: `http://127.0.0.1:4177/replay/0378ffa1-b128-49a5-bd69-02495e5f4d65`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/13`
- `djimo/comedy-demo-smoke-r2`
  - purpose: extend the clean-start Tragedy smoke into a replay/resume continuity smoke on top of the latest-main demo path
  - smoke command: `npx tsx scripts/comedy-demo-smoke.ts --server-url http://localhost:8787 --web-base-url http://127.0.0.1:4173 --count 4 --name-prefix SmokeV --resume-delay-ms 1500`
  - latest proven replay URL example: `http://127.0.0.1:4173/replay/65ee0afe-8022-4210-aeb7-720d0cc6e822`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/14`
- `djimo/worker-settlement-buffer-r1`
  - purpose: fix the worker-side game settlement path so Merkle hashing no longer depends on Node `Buffer` and can run in the Workers runtime after Tragedy games finish
  - latest fix: `5e774d7` — `fix(engine): remove Buffer dependency from merkle hashing`
  - PR URL: `https://github.com/coordination-games/coordination-games/pull/15`
- `djimo/comedy-provider-sweep-r1`
  - purpose: add a small provider-backed Tragedy scenario sweep harness on top of the existing smoke path, with machine-readable output and at least one real bot-auth/provider-backed scenario
  - current state: local branch/worktree only, not pushed
  - strongest verification so far: dry-run artifact generation passes, and the provider-backed scenario reports `providerPassed: true` against the temporary merged verification worker on `localhost:8788`
  - caveat: the strongest end-to-end verification currently depends on the temporary merged `djimo/comedy-provider-sweep-dev` environment rather than this branch alone

Rule: use the `-r1` branches as the new upstream-facing source-of-truth for continued work. Keep the older pushed branches only as preserved references for comparison and PR history.

Local PR-ready notes for the canonical coordination-games branches:

- `docs/planning/PR_NOTES_GAME_MANIFEST_SHELL_R1.md`
- `docs/planning/PR_NOTES_COMEDY_V0_PLUGIN_R1.md`
- `docs/planning/PR_NOTES_COMEDY_V0_PLUGIN_R2.md`
- `docs/planning/PR_NOTES_COMEDY_V0_LOBBY_PATH_R1.md`
- `docs/planning/PR_NOTES_COMEDY_DEMO_SHELL_R1.md`
- `docs/planning/PR_NOTES_COMEDY_DEMO_SMOKE_R1.md`
- `docs/planning/PR_NOTES_BOT_AUTH_TEST_PATH_R1.md`
- `docs/planning/PR_NOTES_PLATFORM_ERC8004_BOUNDARY_R1.md`

Local `Agent-Games` review branches:

- `djimo/comedy-local-harness`
  - PR URL: `https://github.com/DjimoSerodio/Agent-Games/pull/7`
- `djimo/admin-pause-gate`
  - PR URL: `https://github.com/DjimoSerodio/Agent-Games/pull/8`
- `djimo/arena-provider-harness-boundary`
  - PR URL: `https://github.com/DjimoSerodio/Agent-Games/pull/6`
- `djimo/trust-v0-boundary`
  - PR URL: `https://github.com/DjimoSerodio/Agent-Games/pull/1`
- `djimo/trust-v1-memory`
  - PR URL: `https://github.com/DjimoSerodio/Agent-Games/pull/2`
- `djimo/behavior-memory-query`
  - PR URL: `https://github.com/DjimoSerodio/Agent-Games/pull/3`
- `djimo/trust-query-surfaces`
  - PR URL: `https://github.com/DjimoSerodio/Agent-Games/pull/4`
- `djimo/trust-v2-portability`
  - PR URL: `https://github.com/DjimoSerodio/Agent-Games/pull/9`
- `djimo/agent-uri-v0`
  - PR URL: `https://github.com/DjimoSerodio/Agent-Games/pull/5`

Local-only branches / lanes:

- `djimo/bootstrap-macos` — local bootstrap branch, intentionally not pushed upstream
- `djimo/dev` — integration lane only; not a source-of-truth review branch
- `djimo/behavior-memory-plan` — local planning branch; parked/superseded by `djimo/behavior-memory-query`
- `djimo/arena-provider-harness-boundary` — local review branch now pushed; no longer treated as a parked stale branch
- `djimo/harness-matrix-path` — stale local-only docs/emulator prototype; parked in favor of `djimo/harness-sweep-lane`

### Important: Local-Only Planning

The planning layer (GO.md, AGENTS.md, .beads/, research docs) is **gitignored**. Code ships to GitHub; strategy stays local until the project owner publishes it.

---

## Current State & What Exists

### What's Built (in `arena/`)

An earlier prototype exists under `arena/` with:
- Game engine (TypeScript) — turn-based round lifecycle, event bus, WebSocket streaming
- Hex grid generator — 19-hex board with terrain types and production numbers
- Trust graph — EigenTrust implementation with decay and asymmetric penalties
- Observatory UI — browser spectator/admin surfaces (default ports are configurable; recent local verification used 3300/3301)
- Admin dashboard — event log, state inspector, pause/resume, trust/read-model visibility
- Simple agents — 6 scripted strategies (cooperator, defector, tit_for_tat, etc.)
- LLM agent / provider-backed testing paths — see recent slice branches and local handoff for latest provider details
- MCP server / adapter path exists locally for external-agent experimentation
- backend handoff last recorded **115/115 tests passing**; treat exact counts as handoff-state data rather than a timeless invariant

### What Needs to Change

### Backend: Built and Working
- World map: 19 regions, 11 biomes, hex projection (world-map.ts)
- Shared ecosystems: 4 types (fishery, forest, aquifer, wetland) with health/degradation/collapse cascades
- 6 resources: grain, timber, ore, fish, water, energy
- Alliance VP tracking with cooperation rounds
- Commitment ledger: promise detection, attestation, resolution, behavior tags
- Crisis system: 5 crisis types, contribution tracking, penalties
- EigenTrust graph with decay + asymmetric penalties
- LLM agent: Claude API (Haiku for actions, Sonnet for negotiation)
- 6 scripted agent strategies

### What Is Still Missing / Deferred
1. **Upstream merge/alignment** — shell/tragedy/trust/agentURI review branches exist, but upstream review/merge coordination is still pending.
2. **Cross-game Olympiad portability** — V2 trust snapshots, deferred obligation execution, and TournamentManager-style carryover are still future work.
3. **Behavior-memory deeper persistence / portability** — the first query-surface slice exists, but durable historical replay, richer attestation weighting, and cross-game behavior portability are still future work.
4. **Harness/testing lane maturation** — the bot-auth path and Tragedy sweep lane now exist, but broader persona evaluation, harness reuse, and real-platform test coverage still need expansion.
5. **Optional proof/export layer** — Merkle/IPFS/on-chain trust publication remains explicitly deferred to V3.
6. **Human-facing polish** — local surfaces are meaningful for internal review/demo, but not yet a polished public product shell.

### Implementation Priority

**Current execution focus**
1. Keep `coordination-games` review work small and upstream-shaped (`djimo/game-manifest-shell`, `djimo/comedy-v0-plugin`).
2. Keep richer trust/identity/runtime experiments local until they can be expressed cleanly through Lucian's plugin-first seams.
3. Preserve the local arena as the full-fidelity source material while upstreaming only the smallest believable Tragedy slice first.
4. Use `djimo/dev` only as the private integration/demo lane, never as the source of truth.

---

## Conventions

### Commit Style
- `feat:` — New functionality
- `fix:` — Bug fix
- `refactor:` — Code restructuring
- `docs:` — Documentation only
- `test:` — Test additions/changes
- `chore:` — Tooling, dependencies, config

### Branch Strategy
- `main` — Stable, deployable
- `feature/*` — Feature branches
- `game/*` — Individual game implementations

### Session Close Workflow

```bash
# 1. Close/update beads tasks
bd close <id> --reason "Completed"

# 2. Push code (MANDATORY)
git pull --rebase && git push
git status  # Must show "up to date with origin"
```

---

## Environment

- `beads` (bd) and `dolt` installed via Homebrew
- Beads database: `agent_games`
- GitHub remote: `https://github.com/DjimoSerodio/Agent-Games.git`
- Planning files are gitignored

---

## Quick Reference

**Project**: Tragedy of the Commons — AI Agent Coordination Olympiad
**Repo**: github.com/DjimoSerodio/Agent-Games
**Target**: May 2026 event
**Sponsor context**: Gitcoin ($25-75k potential funding)
**Goal**: Prove that AI agents can evolve emergent trust and coordination — finding a different ending for the tragedy of the commons

```bash
bd ready                              # What to work on
bd update <id> --claim                # Claim a task
bd close <id> --reason "What was done"  # Finish
git push                              # Ship it
```

**When in doubt, refer back to this file or ask the user for clarification.**
