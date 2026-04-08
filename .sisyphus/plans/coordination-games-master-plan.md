# Coordination Games — Master Implementation Plan

**Date**: April 3, 2026
**Author**: Djimo (GMO)
**Target**: Late May / Early June 2026 public beta
**Budget**: Share of $25-75k (Gitcoin funding)
**Stakeholders**: Kevin Owocki, Lucian (engine), Benjamin (trust graph), EF DAI team (Davide Crapis)

---

## 1. Project Summary

**Comedy of the Commons** is a Catan-like AI Agent Coordination Olympiad game where 4-12 AI agents (and human players) compete on a world map with shared ecosystems. Agents must trade, negotiate, and manage shared resources — ecosystems can flourish through cooperation or collapse through extraction. Trust is the real score, portable across games via an on-chain trust graph.

This game is one entry in a larger **Coordination Games** ecosystem alongside Capture the Lobster (Lucian), Oathbreaker (Lucian), and Coordination Failure (Benjamin). All games share: ERC-8004 agent identity, trust graph infrastructure, and a common game engine protocol.

### Core Thesis

> The best coordination games make cooperation the **rational strategy** but not the **enforceable one**.

### What Makes This Commercially Viable

1. **Coordination Quotient (CQ) Benchmark** — benchmarking AI models on trust/cooperation (gap in the market)
2. **Prediction Markets** — revenue source for the house, prize amplification for winners, payouts for bettors
3. **Esports spectator value** — entertaining games with dramatic irony (spectators see secret deals)
4. **ERC-8004 first-mover** — first real implementation of agent reputation on Ethereum

---

## 2. Current State Assessment

### What's Built (arena/)

The codebase is ~15,000 LOC of TypeScript, far more complete than documentation suggests:

| Component | State | Quality |
|---|---|---|
| Game engine (comedy-engine.ts) | **Complete** — turn lifecycle, event bus, WebSocket | 3,427-line monolith needs splitting |
| World map (world-map.ts) | **Complete** — 19 regions, 11 biomes, hex projection | Clean, well-typed |
| 4 Shared ecosystems | **Complete** — fishery, forest, aquifer, wetland with health/collapse | Backend only, not rendered |
| 6 Resources | **Complete** — grain, timber, ore, fish, water, energy | Functional |
| Trust graph | **Complete** — EigenTrust with decay + asymmetric penalties | Not connected to on-chain |
| Agent system | **Complete** — 6 scripted + Claude LLM agent (Haiku/Sonnet) | Solid interface design |
| Observatory UI | **Partial** — spectator frontend, hex map, comms feed | Vanilla JS, non-interactive |
| Admin dashboard | **Partial** — event log, state inspector | Basic |
| ERC-8004 client | **Coded** — ~514 lines, Identity/Reputation/Validation registries | Never deployed/tested |
| Tests | **52 total, 50 passing** | 2 trivial naming failures |
| Alliance VP | **Complete** — cooperation tracking, VP calculation | Working |
| Commitment ledger | **Complete** — promise detection, attestation, resolution | Working |
| Crisis system | **Complete** — 5 crisis types, contribution tracking, penalties | Working |

### What's Actually Missing

1. **React frontend with board-game quality visuals** — Polytopia/Catan/Civilization level
2. **MCP server** — external agents can't connect
3. **Human player support** — currently AI-only
4. **4-12 player scaling** — hard-coded for 4 players, map doesn't scale
5. **Persistence layer** — all in-memory, no game replay
6. **EAS attestation integration** — trust graph not on-chain
7. **ERC-8004 deployment** — client exists, never tested against live contracts
8. **Prediction market system** — types exist, no logic
9. **Multi-game Olympiad structure** — no cross-game trust portability infra
10. **Shared protocol spec** — nothing proposed to team yet

### Bugs to Fix (Trivial)

1. `nexus-engine.test.ts` imports `NexusEngine` — should be `ComedyEngine`
2. `hex-grid.test.ts` expects `"nexus"` terrain — code uses `"commons"`
3. Unused dep: `redis` in package.json (remove)
4. `three` — KEEP for now: `src/games/nexus/three/nexus-map-3d.ts` (435 lines) actively imports it. Will be superseded by React+PixiJS frontend. Remove `three` + the 3D demo file together in Phase 5 when PixiJS board is functional.

---

## 3. Architecture Decisions

### 3.1 Frontend: React + PixiJS

**Decision**: Full React rewrite with PixiJS (via @pixi/react) for game board rendering.

**Why PixiJS over alternatives**:
- **vs. SVG/Canvas**: PixiJS handles sprite batching, camera pan/zoom, animations natively — SVG chokes on 100+ hex tiles with structures
- **vs. Three.js**: 3D is a rabbit hole. Board games are inherently 2D-top-down or isometric. PixiJS gets 90% of the visual quality at 30% of the complexity
- **vs. Phaser**: Phaser is a full game framework with its own loop — conflicts with React's rendering model. PixiJS is a rendering library that composes cleanly with React

**Architecture**:
```
React App (Vite + React 19)
  |
  +-- GameBoard (PixiJS via @pixi/react)
  |     +-- HexGrid layer (terrain tiles, biome sprites)
  |     +-- Structure layer (settlements, cities, roads)
  |     +-- Unit layer (armies, scouts)
  |     +-- Ecosystem overlay (health bars, visual state)
  |     +-- Animation layer (trade routes, crisis effects)
  |     +-- Camera (pan, zoom, minimap)
  |
  +-- UI Panels (React + Tailwind)
  |     +-- PlayerDashboard (resources, VP, trust score)
  |     +-- TradePanel (propose, accept, counter offers)
  |     +-- ChatPanel (public, private, diary)
  |     +-- EcosystemPanel (health details, extraction choices)
  |     +-- CrisisPanel (contribution tracking, countdown)
  |     +-- Scoreboard (rankings, CQ metrics)
  |
  +-- SpectatorOverlay (React)
  |     +-- SecretDealsPanel (private messages visible to spectators)
  |     +-- PredictionPanel (bet on outcomes)
  |     +-- GameTimeline (round history, key events)
  |
  +-- HumanPlayerControls (React)
        +-- ActionSelector (build, trade, extract, move, pass)
        +-- MapInteraction (click-to-build, drag-to-move)
```

**Visual Target**: Top-down hex board with hand-drawn/painterly terrain tiles (like Polytopia's art style). Ecosystems glow green when flourishing, darken and crack when collapsing. Smooth sprite animations for building placement, trade routes, army movement. Clean, modern UI panels alongside the board.

**Effort Estimate**: 4-6 weeks (the largest single work item)

### 3.2 Player Scaling: 4-12 Players with Dynamic Map

**Decision**: Scalable hex grid that grows with player count.

| Players | Map Size | Hexes | Ecosystems | Shared Resources |
|---|---|---|---|---|
| 4 | Small | 19 | 3 | 4-5 |
| 6 | Medium | 37 | 4 | 6-7 |
| 8 | Large | 61 | 5 | 8-9 |
| 10-12 | XL | 91 | 6-7 | 10-12 |

**Implementation**:
- Parameterized map generator: `generateMap(playerCount: number) => WorldMap`
- Starting positions calculated dynamically (evenly distributed around perimeter)
- Resource distribution scaled to maintain scarcity ratios
- Ecosystem placement algorithm ensures each player borders at least 1-2 shared ecosystems
- Camera zoom level defaults based on map size

### 3.3 Persistence: PostgreSQL + Event Sourcing

**Decision**: PostgreSQL for game state, event-sourced architecture for replay.

**Why PostgreSQL over SQLite**:
- Multi-process access (Observatory + Admin + Game Engine + API)
- JSON columns for flexible game state
- Scales to concurrent tournaments
- Solid ecosystem for Node.js (pg, Drizzle ORM)

**Schema Highlights**:
```sql
-- Core tables
games (id, config, status, created_at, completed_at)
game_events (id, game_id, round, event_type, payload JSONB, timestamp)
players (id, game_id, agent_id, faction, is_human, wallet_address)
trust_scores (from_agent, to_agent, game_id, score, attestation_uid)

-- Replay: every game action is an event
-- Full game state reconstructable from events
-- Game results cached in materialized views
```

**Event Sourcing Benefits**:
- Full game replay (scrub through rounds)
- Audit trail for trust graph computation
- Feed for spectator views (stream events via WebSocket)
- CQ benchmark can reprocess any game from events

### 3.4 MCP Server: Agent Interface Protocol

**Decision**: MCP server with stdio transport, wrapping existing GameAgent interface.

**Tool Schema**:
```
Tools:
  submit_action(action_type, params)       → ActionResult
  send_message(channel, recipient?, text)  → MessageId
  propose_trade(partner, offer, request)   → TradeResult
  respond_trade(trade_id, accept)          → TradeResult
  extract_ecosystem(ecosystem_id, level)   → ExtractionResult
  contribute_crisis(crisis_id, resources)  → ContributionResult
  form_alliance(partner_id)               → AllianceResult
  break_alliance(partner_id)              → void
  build(structure_type, location)          → BuildResult
  move_army(army_id, destination)          → MoveResult
  pass_turn()                             → void

Resources:
  game://state          → AgentGameView (filtered per agent)
  game://messages       → Message[] (only visible ones)
  game://ecosystems     → EcosystemState[]
  game://trust          → TrustScores (known trust relationships)
  game://rules          → string (full game rules)
  game://history        → GameEvent[] (this agent's visible events)
```

**Human Player Interface**: WebSocket API with the same action schema. React frontend sends actions via WebSocket, receives state updates via Server-Sent Events (SSE).

### 3.5 Shared Protocol Proposal (for team)

This is what we propose to Kevin, Lucian, and Benjamin as the shared infrastructure:

#### Layer 1: Agent Identity (ERC-8004)

Every agent in the Coordination Games Olympiad MUST register via ERC-8004 on Base.

```
Agent Registration:
  - wallet_address: address (agent's signing key)
  - agent_card: {
      name: string,
      mcp_endpoint: string (how to reach this agent),
      capabilities: string[] (games it can play),
      personality_hash: bytes32 (hash of soul/skills.md),
      model: string (optional — "claude-sonnet-4-20250514", "gpt-4", etc.)
    }
  - registered_at: uint256
```

**Cross-game**: Agent ID is the SAME across all games. Register once, play everywhere.

#### Layer 2: Trust Graph (EAS Attestations)

Every game emits post-game attestations to EAS on Base.

**Universal Schema** (all games MUST use):
```
schema: "coordination-games-v1"
fields:
  gameId:        bytes32   # unique game identifier
  gameType:      string    # "comedy-of-commons" | "capture-lobster" | "oathbreaker" | etc.
  agentId:       uint256   # ERC-8004 agent ID
  placement:     uint8     # 1st, 2nd, 3rd...
  score:         uint256   # game-specific score
  trustDelta:    int128    # net trust change from this game
  cooperationRate: uint16  # 0-10000 (basis points) — % of cooperative actions
  betrayalCount: uint8     # number of broken commitments
  ecosystemImpact: int128  # net ecosystem health impact (game-specific, 0 if N/A)
```

**Optional Per-Game Schema Extensions**:
Each game can define additional attestation fields for game-specific metrics, linked to the universal schema via `gameType`.

**Trust Computation**:
- EigenTrust over all attestation data
- Weights: betrayalCount has 3-5x negative weight vs cooperationRate positive weight
- Temporal decay: half-life of 10 games (not rounds) for cross-game trust
- Per-game trust AND global trust both queryable

#### Layer 3: Game Engine Interface (MCP Protocol)

Every game in the Olympiad MUST expose these standard MCP tools:

```
REQUIRED TOOLS (every game):
  register(agent_id: uint256)                    → RegistrationResult
  get_state()                                    → GameState (agent-filtered)
  submit_action(action: Action)                  → ActionResult
  send_message(channel, recipient?, content)     → MessageResult
  get_trust(agent_id?: uint256)                  → TrustScores
  pass_turn()                                    → void

REQUIRED RESOURCES (every game):
  game://rules      → Game rules text
  game://state      → Current game state
  game://players    → Player list with public info

OPTIONAL TOOLS (game-specific):
  trade, extract, build, move, form_alliance, etc.
```

**Convention**: Agents connect via MCP stdio. Human players connect via WebSocket. Both use the same action schema.

#### Layer 4: Olympiad Scoring

Cross-game ranking computed from:
1. **Game Points**: Win = 3, 2nd = 2, 3rd = 1 (scaled by player count)
2. **CQ Score**: Coordination Quotient from trust/cooperation metrics
3. **Consistency Bonus**: Maintaining high trust across 3+ games
4. **Innovation Bonus** (manual): Spectators/judges award for novel coordination strategies

### 3.6 Prediction Markets

**Revenue Model**:
```
Total Bet Pool for a Market
  |
  +-- 8% → House (platform revenue)
  +-- 7% → Prize Amplification (added to game winner's prize)
  +-- 85% → Winning Bettors (proportional to their stake)
```

**Market Types**:

| Market | When | Resolution |
|---|---|---|
| "Who wins?" | Pre-game | Game completion |
| "Will ecosystem X survive?" | In-game (round 5+) | Game end ecosystem status |
| "Will Agent X betray their alliance?" | In-game | Alliance break event |
| "Highest trust score?" | Pre-game | Post-game trust calculation |
| "Total VP threshold?" | Pre-game | Sum of all VPs at game end |

**Implementation Approach** (phased):
- **v1 (May/June)**: Off-chain prediction tracking. Bets placed via API, resolved automatically. No smart contracts. Proof of concept.
- **v2**: On-chain via simple binary outcome contracts on Base. House manages market creation.
- **v3**: Gnosis Conditional Token Framework (CTF) for composable markets. AMM for liquidity.

**For v1**, the prediction market is a React panel in the spectator UI where viewers place bets (testnet tokens or points), and the system resolves them automatically at game end.

---

## 4. Implementation Plan

### Track Overview

Three parallel tracks to maximize throughput:

```
Week 1-2:  [BACKEND] Engine refactor + MCP server + persistence
           [FRONTEND] React scaffold + PixiJS board + hex rendering
           [PROTOCOL] Shared protocol spec + ERC-8004 testing

Week 3-4:  [BACKEND] Player scaling + human player support + game balancing
           [FRONTEND] Structures, ecosystems, animations, trade UI
           [PROTOCOL] EAS attestation integration + trust graph on-chain

Week 5-6:  [BACKEND] Prediction market (off-chain v1) + Olympiad structure
           [FRONTEND] Spectator overlay, prediction UI, polish
           [PROTOCOL] Demo prep + team integration

Week 7-8:  [INTEGRATION] End-to-end testing + load testing + bug fixes
           [DEMO] EF presentation + public beta prep
```

### Phase 0: Stabilize (Day 1) ✅ COMPLETE

| Task | Effort |
|---|---|
| Fix `NexusEngine` → `ComedyEngine` test import | 15 min |
| Fix `"nexus"` → `"commons"` terrain in hex-grid tests | 15 min |
| Remove `redis` from package.json (keep `three` — used by `src/games/nexus/three/nexus-map-3d.ts`) | 10 min |
| Add `.env.example` | 15 min |
| Update GO.md to reflect actual codebase state | 1 hr |
| Verify: all tests pass, build succeeds, simulation runs | 30 min |

**Exit Criteria**: 52/52 tests green, clean build, simulation completes.

**QA Block (Phase 0)**:
```bash
# 1. Tests pass
cd arena && npx vitest run 2>&1 | grep -E "(Tests|✓|×)"
# EXPECT: "52 passed", 0 failed

# 2. TypeScript compiles
npx tsc --noEmit
# EXPECT: exit code 0, no errors

# 3. Build succeeds
npm run build
# EXPECT: exit code 0, dist/ populated

# 4. Simulation runs
npm run simulate 2>&1 | tail -5
# EXPECT: game completion with scores for all agents

# 5. redis removed from deps
cat package.json | grep redis
# EXPECT: no output (not found)

# 6. three still present (needed by nexus-map-3d.ts)
cat package.json | grep three
# EXPECT: "three" in dependencies
```

### Phase 1: Engine Refactor (Days 2-5) ✅ COMPLETE

Split `comedy-engine.ts` (3,427 lines) into focused modules:

| Module | Responsibility | Est. Lines |
|---|---|---|
| `production.ts` | Resource production wheel, distribution | ~200 |
| `crisis.ts` | Crisis triggering, contribution, resolution, penalties | ~300 |
| `ecosystem.ts` | Extraction, restoration, health, collapse cascades | ~250 |
| `commitment.ts` | Detection, attestation, resolution, behavior tags | ~400 |
| `combat.ts` | Army build, move, attack resolution | ~200 |
| `scoring.ts` | VP calculation, alliance VP, milestones, commons health | ~300 |
| `comedy-engine.ts` (shell) | Turn lifecycle, module coordination | ~700 |

**Rules**: No behavior changes. Pure structural refactor. All existing tests must pass after each extraction.

**Exit Criteria**: comedy-engine.ts < 800 lines. 70+ tests passing (existing + new module tests).

**QA Block (Phase 1)**:
```bash
# 1. Monolith size reduced
wc -l arena/src/games/nexus/comedy-engine.ts
# EXPECT: < 800 lines

# 2. All modules exist
ls arena/src/games/nexus/{production,crisis,ecosystem,commitment,combat,scoring}.ts
# EXPECT: all 6 files present

# 3. Existing tests still pass
cd arena && npx vitest run 2>&1 | grep -E "Tests"
# EXPECT: 52+ passed, 0 failed

# 4. New module tests exist and pass
npx vitest run --reporter=verbose 2>&1 | grep -E "(production|crisis|ecosystem|commitment|combat|scoring)"
# EXPECT: test suites for each module, all passing

# 5. Total test count increased
npx vitest run 2>&1 | grep "Tests"
# EXPECT: 70+ passed

# 6. Simulation still works (behavioral equivalence)
npm run simulate 2>&1 | tail -5
# EXPECT: game completes with same structure as before refactor

# 7. No circular imports
npx tsc --noEmit
# EXPECT: exit code 0
```

### Phase 2: Persistence Layer (Days 4-7) ✅ COMPLETE

| Task | Effort |
|---|---|
| Add PostgreSQL dependency (pg + Drizzle ORM) | 0.5 day |
| Define schema: games, game_events, players, trust_scores | 1 day |
| Implement event store (persist all game events) | 1 day |
| Implement game replay from events | 0.5 day |
| Add game history API endpoint | 0.5 day |

**Exit Criteria**: Games persist across restarts. Full replay from stored events.

**QA Block (Phase 2)**:
```bash
# 1. PostgreSQL connection works
cd arena && npx tsx scripts/db-health-check.ts
# EXPECT: "Connected to PostgreSQL" + schema tables listed

# 2. Game events persist
npm run simulate && npx tsx scripts/list-games.ts
# EXPECT: game ID appears with event count > 0

# 3. Restart and query — data survives
npx tsx scripts/list-games.ts
# EXPECT: same game ID still present

# 4. Replay works
npx tsx scripts/replay-game.ts --game-id=<id> 2>&1 | tail -10
# EXPECT: round-by-round event playback, final scores match original

# 5. API endpoint responds
curl http://localhost:3000/api/games | jq '.games | length'
# EXPECT: >= 1
```

### Phase 3: Player Scaling (Days 6-9) ✅ COMPLETE

| Task | Effort |
|---|---|
| Parameterized map generator (4-12 players) | 1 day |
| Dynamic starting position calculator | 0.5 day |
| Resource/ecosystem distribution scaling | 0.5 day |
| Game balance adjustments per player count | 1 day |
| Update tests for variable player counts | 1 day |

**Exit Criteria**: 4, 6, 8, and 12 player games complete successfully in simulation.

**QA Block (Phase 3)**:
```bash
# 1. Map generator produces correct sizes
cd arena && npx vitest run --reporter=verbose 2>&1 | grep "map.*player"
# EXPECT: tests for 4, 6, 8, 12 player maps all passing

# 2. Simulate at each player count
for n in 4 6 8 12; do
  npm run simulate -- --players=$n 2>&1 | tail -1
done
# EXPECT: each game completes, final scores for $n agents

# 3. Map hex count matches spec
npx vitest run --reporter=verbose 2>&1 | grep "hex.*count"
# EXPECT: 4p→19, 6p→37, 8p→61, 12p→91 hexes

# 4. Every player borders at least 1 ecosystem
npx vitest run --reporter=verbose 2>&1 | grep "ecosystem.*adjacency"
# EXPECT: all passing — each starting position borders ≥1 ecosystem

# 5. TypeScript compiles with new parameterized types
npx tsc --noEmit
# EXPECT: exit code 0
```

### Phase 4: MCP Server (Days 7-14) ✅ COMPLETE

| Task | Effort |
|---|---|
| Add `@modelcontextprotocol/sdk` | 0.5 day |
| Design and implement MCP tool schema (all tools + resources) | 2 days |
| Implement MCPAgentAdapter (MCP → GameAgent bridge) | 1 day |
| Human player WebSocket interface (same action schema) | 1.5 days |
| Mixed game support (AI + human players in same game) | 1 day |
| Integration tests: MCP agents + human players | 1 day |

**Exit Criteria**: 4 MCP agents play full game. 1 human + 3 AI agents play full game.

**QA Block (Phase 4)**:
```bash
# 1. MCP server starts and lists tools
cd arena && npx @modelcontextprotocol/inspector -- node dist/mcp-server.js 2>&1 | head -20
# EXPECT: tool listing with submit_action, send_message, get_state, etc.

# 2. MCP integration test — 2 agents play 5 rounds
npx vitest run tests/mcp-integration.test.ts --reporter=verbose
# EXPECT: test passes, game completes without timeout

# 3. Full MCP game — 4 Claude agents
npm run demo:mcp 2>&1 | tail -20
# EXPECT: game completes, scores displayed for all 4 agents

# 4. WebSocket human player interface
npx vitest run tests/websocket-player.test.ts --reporter=verbose
# EXPECT: human player actions accepted, state updates received

# 5. Mixed game — 1 human mock + 3 AI
npx vitest run tests/mixed-game.test.ts --reporter=verbose
# EXPECT: game completes with mixed player types

# 6. MCP tool schema matches spec
npx tsx scripts/validate-mcp-schema.ts
# EXPECT: all required tools present, all resources defined
```

### Phase 5: React Frontend (Days 5-30 — largest effort)

#### 5a: Foundation (Days 5-10)
| Task | Effort |
|---|---|
| Vite + React 19 + Tailwind + @pixi/react scaffold | 1 day |
| Hex grid rendering with PixiJS (basic terrain tiles) | 2 days |
| Camera system (pan, zoom, minimap) | 1.5 days |
| WebSocket connection to game engine | 1 day |
| Basic game state rendering (hexes + player colors) | 1 day |

#### 5b: Game Visuals (Days 11-20)
| Task | Effort |
|---|---|
| Terrain sprite system (painterly/Polytopia style per biome) | 2 days |
| Structure rendering (settlements, cities, roads, trade posts) | 2 days |
| Army/unit rendering with movement animations | 1.5 days |
| Ecosystem health overlay (glow, darken, crack, flourish) | 2 days |
| Trade route animations (resource flow between players) | 1 day |
| Crisis visual effects (overlay, timer, contribution bars) | 1.5 days |

#### 5c: Interactive UI (Days 18-28)
| Task | Effort |
|---|---|
| Player dashboard (resources, VP, trust score, faction) | 1.5 days |
| Build action UI (click hex → select structure → confirm) | 2 days |
| Trade panel (propose, counter, accept/reject) | 2 days |
| Chat panel (public, private DMs, message history) | 1.5 days |
| Ecosystem extraction panel (choose extraction level) | 1 day |
| Crisis contribution panel | 0.5 day |
| Army command UI (select, move, attack) | 1.5 days |
| Action history / game log panel | 1 day |

#### 5d: Spectator Mode (Days 25-32)
| Task | Effort |
|---|---|
| Spectator overlay toggle (view mode vs play mode) | 0.5 day |
| Secret deals panel (private messages visible) | 1 day |
| Prediction market panel (view odds, place bets) | 1.5 days |
| Game timeline / round scrubber | 1 day |
| Agent reasoning panel (diary entries visible post-game) | 0.5 day |
| Highlight reel generator (key moments auto-detected) | 1 day |

**Exit Criteria**: Human can play full game via browser. Spectator view shows all game activity with ecosystem visualizations. Visual quality comparable to Polytopia/Catan digital.

**QA Block (Phase 5)**:
```bash
# 5a: Foundation
# 1. React app starts
cd arena/frontend && npm run dev &
sleep 5 && curl -s http://localhost:5173 | grep -c "root"
# EXPECT: 1 (root div present)

# 2. Playwright: hex grid renders
npx playwright test tests/e2e/board-renders.spec.ts
# EXPECT: pass — hex tiles visible, correct count per player setting

# 3. Playwright: camera controls work
npx playwright test tests/e2e/camera-controls.spec.ts
# EXPECT: pass — pan and zoom change viewport

# 5b: Game Visuals
# 4. Playwright: terrain sprites load
npx playwright test tests/e2e/terrain-sprites.spec.ts
# EXPECT: pass — each biome type has distinct visual

# 5. Playwright: structures render on build event
npx playwright test tests/e2e/structures-render.spec.ts
# EXPECT: pass — settlement/city markers appear after build action

# 6. Playwright: ecosystem overlay shows health
npx playwright test tests/e2e/ecosystem-overlay.spec.ts
# EXPECT: pass — health bars visible, color changes with health level

# 5c: Interactive UI
# 7. Playwright: human can complete a build action
npx playwright test tests/e2e/human-build-action.spec.ts
# EXPECT: pass — click hex → select settlement → confirm → structure appears

# 8. Playwright: trade panel opens and submits
npx playwright test tests/e2e/trade-panel.spec.ts
# EXPECT: pass — propose trade → partner receives → accept/reject

# 9. Playwright: chat messages send and display
npx playwright test tests/e2e/chat-panel.spec.ts
# EXPECT: pass — send message → appears in chat feed

# 5d: Spectator Mode
# 10. Playwright: spectator sees private messages
npx playwright test tests/e2e/spectator-private-msgs.spec.ts
# EXPECT: pass — private DMs visible in spectator overlay

# 11. Screenshot comparison: visual quality check
npx playwright test tests/e2e/visual-regression.spec.ts --update-snapshots
# EXPECT: screenshots generated for manual visual quality review
```

### Phase 6: On-Chain Integration (Days 20-30)

| Task | Effort |
|---|---|
| Configure Base Sepolia provider + test wallet | 0.5 day |
| Test ERC-8004 client against live Sepolia contracts | 1 day |
| Implement agent registration flow (game startup) | 1 day |
| Design EAS schemas (propose to Benjamin) | 1 day |
| Implement EAS attestation client | 2 days |
| Wire attestations into game completion flow | 1 day |
| Implement trust graph query from on-chain attestations | 1.5 days |
| End-to-end test: register → play → attest → query trust | 1 day |
| Write shared protocol spec document for team | 1 day |

**Exit Criteria**: Agents register on ERC-8004 (Base Sepolia). Post-game trust attestations on EAS. Trust scores queryable by agents before next game.

**QA Block (Phase 6)**:
```bash
# 1. ERC-8004 registration succeeds on Base Sepolia
cd arena && npx vitest run tests/integration/erc8004-register.test.ts
# EXPECT: pass — agentId returned > 0

# 2. Verify on-chain via cast
cast call <IDENTITY_REGISTRY> "totalSupply()" --rpc-url https://sepolia.base.org
# EXPECT: count incremented from baseline

# 3. EAS attestation created
npx vitest run tests/integration/eas-attestation.test.ts
# EXPECT: pass — attestation UID (32-byte hash) returned

# 4. Verify attestation on EAS explorer
curl -s "https://base-sepolia.easscan.org/attestation/view/<uid>" | grep "schema"
# EXPECT: schema matches coordination-games-v1

# 5. End-to-end flow
npx vitest run tests/integration/e2e-onchain.test.ts
# EXPECT: pass — register 2 agents → play 5-round game → attest results → query trust

# 6. Trust scores queryable
npx tsx scripts/query-trust.ts --agent-id=<id>
# EXPECT: trust scores from attestation data returned
```

### Phase 7: Prediction Markets v1 (Days 28-35)

| Task | Effort |
|---|---|
| Prediction market engine (off-chain, API-based) | 2 days |
| Market creation from game config (auto-generate standard markets) | 1 day |
| Bet placement API (testnet tokens / points) | 1 day |
| Automatic market resolution from game events | 1 day |
| Revenue split calculation (8% house, 7% prize, 85% bettors) | 0.5 day |
| Spectator UI integration (odds display, bet interface) | 1.5 days |

**Exit Criteria**: Spectators can bet on game outcomes. Markets resolve automatically. Revenue split calculated and displayed.

**QA Block (Phase 7)**:
```bash
# 1. Market creation from game config
cd arena && npx vitest run tests/prediction-market.test.ts --reporter=verbose
# EXPECT: standard markets auto-created (who-wins, ecosystem-survives, etc.)

# 2. Bet placement API
curl -X POST http://localhost:3000/api/bets \
  -H "Content-Type: application/json" \
  -d '{"market_id": "<id>", "outcome": "agent_1", "amount": 100}'
# EXPECT: 200 OK, bet_id returned

# 3. Market resolution after game
npm run simulate && npx tsx scripts/resolve-markets.ts
# EXPECT: markets resolved, winning bets identified

# 4. Revenue split calculation
npx tsx scripts/check-revenue-split.ts --game-id=<id>
# EXPECT: house=8%, prize_amp=7%, bettors=85% of total pool

# 5. Playwright: spectator prediction panel
npx playwright test tests/e2e/prediction-panel.spec.ts
# EXPECT: pass — odds displayed, bet placement works, results shown post-game
```

### Phase 8: Olympiad Structure (Days 32-38)

| Task | Effort |
|---|---|
| Multi-game tournament manager | 2 days |
| Trust graph carryover between games | 1 day |
| CQ Benchmark computation from game data | 1.5 days |
| Leaderboard (cross-game rankings) | 1 day |
| Tournament lobby (create/join/configure Olympiads) | 1.5 days |

**Exit Criteria**: Run 3-game tournament with 6 agents, trust carries over, CQ scores computed, leaderboard accurate.

**QA Block (Phase 8)**:
```bash
# 1. Tournament manager creates multi-game series
cd arena && npx vitest run tests/olympiad.test.ts --reporter=verbose
# EXPECT: 3-game tournament created, games run sequentially

# 2. Trust carryover between games
npx tsx scripts/verify-trust-carryover.ts --tournament-id=<id>
# EXPECT: agent trust scores from game 1 visible to agents in game 2

# 3. CQ benchmark computation
npx tsx scripts/compute-cq.ts --tournament-id=<id>
# EXPECT: CQ scores for all 6 agents, each component (trust, ecosystem, alliance, etc.) shown

# 4. Leaderboard accuracy
npx vitest run tests/leaderboard.test.ts
# EXPECT: pass — rankings match manual calculation from game results + CQ

# 5. Playwright: leaderboard UI
npx playwright test tests/e2e/leaderboard.spec.ts
# EXPECT: pass — leaderboard displays, CQ scores visible, sortable by metric
```

### Phase 9: Demo & Polish (Days 36-42)

| Task | Effort |
|---|---|
| Demo script: one-command launch of full game | 1 day |
| Performance optimization (60fps board rendering) | 1.5 days |
| Error handling + graceful degradation | 1 day |
| Responsive design (desktop + tablet) | 1 day |
| Demo runbook for EF presentation | 0.5 day |
| Bug fix buffer | 2 days |

**Exit Criteria**: One-command demo runs 6-player game with mixed AI/human, Observatory shows live, on-chain attestations verified, prediction markets functional.

**QA Block (Phase 9)**:
```bash
# 1. One-command launch
cd arena && docker-compose up -d && npm run demo
# EXPECT: PostgreSQL, game engine, frontend, MCP server all start. Game begins within 30s.

# 2. Full demo flow (automated)
npx playwright test tests/e2e/full-demo.spec.ts --timeout=900000
# EXPECT: pass — 6-player game (4 AI + 2 mock-human) completes, all UI panels functional

# 3. On-chain verification
npx tsx scripts/verify-demo-onchain.ts
# EXPECT: 6 ERC-8004 registrations + 6 EAS attestations on Base Sepolia

# 4. Performance check
npx playwright test tests/e2e/performance.spec.ts
# EXPECT: pass — board renders at ≥30fps, no frame drops during animations

# 5. Demo completes in time
time npm run demo 2>&1 | tail -1
# EXPECT: wall-clock time < 15 minutes

# 6. Replay works
npx tsx scripts/replay-game.ts --game-id=<latest>
# EXPECT: full game replay from stored events
```

---

## 5. Risk Analysis

### Critical Risks

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| **Frontend visual quality takes 2x longer** | Delays entire demo | HIGH | Use asset packs for terrain sprites (Kenney, itch.io). Prioritize functional over beautiful for v1. Polish in weeks 7-8. |
| **comedy-engine.ts refactor introduces regressions** | Breaks working game | MEDIUM | Strict TDD: refactor one module at a time, run full test suite after each. Never change behavior during refactor. |
| **ERC-8004 spec changes** | Rework client code | LOW | Keep integration thin. Adapter pattern isolates game from spec details. |
| **Team protocol disagreements** | Integration blocked | MEDIUM | Build our own complete implementation FIRST. Propose from a position of "here's what works" not "what should we do?" |
| **Player scaling breaks game balance** | 12-player games not fun | HIGH | Extensive simulation testing at each player count. Parameterize balance knobs (resource ratios, ecosystem capacities). Playtest with humans. |
| **PostgreSQL adds operational complexity** | Dev environment friction | LOW | Docker compose for local dev. SQLite fallback for simple testing. |

### Scope Creep Traps

1. **3D graphics** — "what if we used Three.js for an isometric view?" NO. PixiJS 2D is the boundary.
2. **Custom smart contracts** — "let's write our own prediction market contract." NO for v1. Off-chain first.
3. **Multi-chain** — "deploy on Arbitrum too." NO. Base Sepolia only until post-launch.
4. **Complex economics** — "variable entry fees, dynamic prize pools." NO. Fixed economics for v1.
5. **Full BYOA** — "any model, any framework." NO for v1. Claude + MCP standard. BYOA is post-launch.

### Dependencies on Team

| Dependency | Risk if Blocked | Mitigation |
|---|---|---|
| Benjamin's EAS schema design | Can't deploy attestations | Design our own schema, propose to team, iterate |
| Lucian's shared game engine | Can't integrate | Build standalone, propose integration points |
| ERC-8004 Sepolia deployments | Can't register agents | ERC-8004 client already points at deployed Sepolia contracts |
| Kevin's marketing/funding | No public beta promotion | Game works regardless; funding affects scale not feasibility |

---

## 6. What "Done" Looks Like

### Minimum Viable Demo (Week 6)

- [ ] 6 AI agents (Claude via MCP) play full game of Comedy of the Commons
- [ ] Game visible in React frontend with hex map, structures, ecosystem health
- [ ] Human player can join mid-game via browser
- [ ] All agents registered on ERC-8004 (Base Sepolia)
- [ ] Post-game trust attestations on EAS (Base Sepolia)
- [ ] Spectator view shows private messages in real-time
- [ ] Basic prediction market panel (off-chain, testnet points)
- [ ] CQ Benchmark scores displayed on leaderboard

### Full Public Beta (Week 8)

- [ ] 4-12 player games with scalable map
- [ ] 3-game tournament with trust carryover
- [ ] Polished UI with Polytopia-quality terrain visuals
- [ ] Prediction markets with revenue split
- [ ] Shared protocol spec published for team integration
- [ ] One-command docker-compose launch
- [ ] Game replay from stored events

---

## 7. Open Questions for Team

1. **EAS Schema**: Can we standardize the `coordination-games-v1` schema across all games? (See Section 3.5, Layer 2)
2. **ERC-8004 Metadata**: What fields should the agent card include for cross-game compatibility?
3. **MCP Protocol**: Can we agree on REQUIRED vs OPTIONAL tools? (See Section 3.5, Layer 3)
4. **Trust Computation**: EigenTrust with what parameters? Decay rate? Betrayal penalty multiplier? 
5. **Olympiad Scoring**: How do we weight game points vs CQ score vs consistency?
6. **Prediction Markets**: Does the team want prediction markets across ALL games or just Comedy of the Commons?
7. **Revenue Split**: Is 8% house / 7% prize amplification / 85% bettors the right split?

---

## 8. Technical Stack

| Layer | Technology | Why |
|---|---|---|
| Game Engine | TypeScript (existing) | Proven, well-typed, 15K LOC |
| Frontend Framework | React 19 + Vite | Modern, fast, huge ecosystem |
| Board Rendering | PixiJS 8 (@pixi/react) | 2D game rendering, sprites, animations, camera |
| UI Styling | Tailwind CSS | Rapid development, consistent design |
| State Management | Zustand | Lightweight, TypeScript-native |
| Real-time | WebSocket (ws) + SSE | Existing WS infra, add SSE for spectators |
| Database | PostgreSQL + Drizzle ORM | Event sourcing, game replay, multi-process |
| Agent Protocol | MCP (stdio transport) | Standard for AI agent tooling |
| Human Protocol | WebSocket | Same action schema as MCP |
| Identity | ERC-8004 (Base) | Team-agreed standard |
| Trust | EAS Attestations (Base) | Verifiable, queryable, composable |
| Testing | Vitest | Existing, fast, good DX |
| E2E Testing | Playwright | Frontend + integration tests |

---

## 9. Appendix: CQ Benchmark Specification

### Coordination Quotient (CQ) Score

A composite metric measuring an agent's coordination quality across games.

**Components**:

| Metric | Weight | Range | Description |
|---|---|---|---|
| Trust Reliability | 25% | 0-100 | % of commitments fulfilled |
| Ecosystem Stewardship | 20% | 0-100 | Net positive ecosystem impact |
| Alliance Stability | 15% | 0-100 | Duration × count of maintained alliances |
| Crisis Response | 15% | 0-100 | Contribution rate when crises hit |
| Negotiation Efficiency | 15% | 0-100 | Trade surplus captured |
| Adaptation | 10% | 0-100 | Performance improvement across games |

**Computation**:
```
CQ = (0.25 × TrustReliability) + (0.20 × EcosystemStewardship) + 
     (0.15 × AllianceStability) + (0.15 × CrisisResponse) + 
     (0.15 × NegotiationEfficiency) + (0.10 × Adaptation)
```

**Scale**: 0-100, where:
- 90+ = "Exceptional Coordinator"
- 70-89 = "Reliable Partner"
- 50-69 = "Self-Interested but Predictable"
- 30-49 = "Unreliable"
- <30 = "Defector"

All raw data already captured by the existing commitment ledger, behavior tags, and ecosystem extraction records. CQ is a **post-processing layer**, not new game features.
