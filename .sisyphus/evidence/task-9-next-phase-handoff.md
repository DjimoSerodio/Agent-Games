# Next-Phase Handoff Contracts — Task 9

## Date: 2026-04-05

## Purpose

This document freezes the frontend contract boundaries needed for the next phase of ERC-8004, attestations, and agentic participation. It distinguishes:

1. Spectator-only state (current implementation)
2. Future player/agent participation (to be layered)
3. MCP BYOA patterns
4. Comedy-specific vs cross-game contracts

---

## Contract Layer 1: Spectator-Only State (Currently Active)

The current observatory exposes read-only views. All fields in this layer are visible to unauthenticated spectators.

### Core Game State
| Field | Type | Access | Notes |
|-------|------|--------|-------|
| `gameId` | `string \| null` | READ | Current game identifier |
| `round` | `number` | READ | Current round number |
| `phase` | `string` | READ | Game phase (planning, action, resolution) |
| `prizePoolWei` | `string` | READ | Total prize pool in wei |
| `payablePrizePoolWei` | `string` | READ | Unlocked portion |
| `slashedPrizePoolWei` | `string` | READ | Slashed portion |
| `carryoverPrizePoolWei` | `string` | READ | Carried over from previous |
| `commonsHealth` | `{ score, payableFraction, reasons? } \| null` | READ | Game health metrics |
| `activeCrisis` | `CrisisState \| null` | READ | Comedy-specific crisis |
| `winnerId` | `string \| null` | READ | Game winner if concluded |

### Board State
| Field | Type | Access | Notes |
|-------|------|--------|-------|
| `hexGrid` | `HexTile[]` | READ | Tile geometry and terrain |
| `worldMap` | `Record<string, unknown> \| null` | READ | Additional world data |
| `agents` | `Record<string, AgentState>` | READ | Agent positions and resources |
| `agentOrder` | `string[]` | READ | Turn order |

### Commitment/Attestation State
| Field | Type | Access | Notes |
|-------|------|--------|-------|
| `commitments` | `Commitment[]` | READ | All commitments in game |
| `attestations` | `Attestation[]` | READ | All attestations in game |
| `trustMatrix` | `{ agents, matrix } \| null` | READ | Trust relationships |

### Chat State
| Field | Type | Access | Notes |
|-------|------|--------|-------|
| `messages` | `ChatMessage[]` | READ | **Public messages only** |
| `messages[].type: public` | READ | Visible to all |
| `messages[].type: private` | HIDDEN | Not exposed to spectators |
| `messages[].type: diary` | HIDDEN | Not exposed to spectators |
| `messages[].type: system` | READ | Visible to all |

---

## Contract Layer 2: Readiness State (Next-Phase Read Models)

These fields were added in Tasks 7-8. They are **read-only surfaces** that display protocol-ready state without activating live chain/MCP workflows.

### Agent Identity (Cross-Game)
```typescript
interface AgentIdentity {
  agentId: string;       // Unique agent identifier
  walletAddress: string;  // ERC-8004 wallet
  name?: string;         // Display name
  mcpEndpoint?: string;  // MCP BYOA endpoint
  capabilities?: string[]; // Agent capabilities
  registeredAt?: number;  // Unix timestamp
  chainId?: number;      // Chain where registered
}
```

**Spectator View:** `gameState.agentIdentities` — IdentityCard displays these.

**Activation Required:** None (read from mock/fixture or future streaming).

### Attestation Readiness (Cross-Game)
```typescript
interface AttestationReadiness {
  uid: string;
  schema: string;         // Attestation schema identifier
  gameId: string;
  agentId: string;
  placement?: number;
  score?: number;
  trustDelta?: number;
  cooperationRate?: number;
  betrayalCount?: number;
  ecosystemImpact?: number;
  attestedAt?: number;
}
```

**Spectator View:** `gameState.attestationReadiness` — Displayed in CommitmentLedger or dedicated panel.

**Activation Required:** None (read from mock/fixture or future EAS streaming).

### Agent Participation Readiness (Cross-Game)
```typescript
interface AgentParticipationReadiness {
  agentId: string;
  status: 'registered' | 'active' | 'inactive' | 'unknown';
  mcpConnected: boolean;
  lastSeenAt?: number;
  gamesPlayed?: number;
  trustScore?: number;
}
```

**Spectator View:** `gameState.participationReadiness` — ParticipationCard displays these.

**Activation Required:** None (read from mock/fixture or future MCP status polling).

---

## Contract Layer 3: Player/Agent Participation (Future Layer)

This layer does NOT exist in the current implementation. These contracts define boundaries for future work.

### Permissioned Actions (Not Implemented)
| Action | Contract Boundary | Notes |
|--------|-------------------|-------|
| Send private message | `messages[].type: private` | Requires recipient auth |
| Create commitment | `commitments[]` mutation | Requires player identity |
| Submit attestation | `attestations[]` mutation | Requires EAS integration |
| Submit action | `agents[].armies` mutation | Requires turn auth |
| Manage resources | `agents[].resources` mutation | Requires player auth |

### Boundary Rules
1. **Spectators** see Layer 1 + Layer 2 only
2. **Players/Agents** additionally have mutation access to Layer 3
3. **Auth filter** must strip Layer 3 mutations for unauthenticated users
4. **MCP agents** authenticate via `mcpEndpoint` + signature, not session cookies

---

## Contract Layer 4: MCP BYOA Patterns

### MCP Agent Contract
```typescript
interface MCPAgentContract {
  // Agent identity
  agentId: string;
  walletAddress: string;
  mcpEndpoint: string;        // Agent's MCP server
  capabilities: string[];     // What the agent can do

  // Connection status
  mcpConnected: boolean;       // Live connection status
  lastSeenAt?: number;        // Last activity timestamp

  // Participation
  status: 'registered' | 'active' | 'inactive' | 'unknown';
  gamesPlayed?: number;
  trustScore?: number;
}
```

### BYOA Integration Points
| Point | Direction | Protocol | Notes |
|-------|-----------|----------|-------|
| `mcpEndpoint` | Inbound | MCP over HTTP | Agent exposes tools |
| `mcpConnected` | Status | Polling/Websocket | Connection health |
| `AgentParticipationReadiness` | Outbound | Store subscription | Readiness surface |

### Constraints
- **No live MCP tool execution** in current tranche
- **BYOA = Bring Your Own Agent** — agents host their own MCP servers
- **Frontend only subscribes** to readiness status, does not initiate MCP calls
- **Future:** MCP gateway proxies agent tool calls through auth layer

---

## Comedy-Specific vs Cross-Game Contracts

### Cross-Game (Reusable)
| Contract | File | Notes |
|----------|------|-------|
| `AgentIdentity` | `store.ts:72-80` | ERC-8004 identity |
| `AgentParticipationReadiness` | `store.ts:96-103` | MCP status |
| `AttestationReadiness` | `store.ts:82-94` | EAS attestation summary |
| `Commitment` | `store.ts:46-55` | Commitment schema |
| `Attestation` | `store.ts:57-64` | Attestation schema |
| `HexTile` | `store.ts:3-17` | Hex geometry |
| `ChatMessage` | `store.ts:105-114` | Message types |

### Comedy-Specific
| Contract | File | Notes |
|----------|------|-------|
| `CrisisState` | `store.ts:66-70` | Comedy crisis system |
| `ecosystemStates` | `GameState` | Comedy ecosystem |
| `activeCrisis` | `GameState` | Comedy crisis |
| `structures` | `AgentState` | Comedy buildings |
| `armies` | `AgentState` | Comedy armies |
| `ecosystemIds` | `HexTile` | Comedy ecosystem linking |
| `regionId`, `regionName` | `HexTile` | Comedy regions |

### Separation Rule
> **Cross-game contracts must not import Comedy-specific types.**
> If a component uses both, it must handle graceful degradation when cross-game data exists without Comedy context.

---

## State Mutation Boundaries

### Current (Spectator) — No Mutations
```typescript
// All mutations go through setGameState() which is write-only to internal store
setGameState(partial)      // Internal only
setSelectedHex(hex)       // Internal only
setConnectionStatus(status) // Internal only
addMessage(message)       // Internal only
clearMessages()           // Internal only
```

### Future (Player/Agent) — New Mutation Points
```typescript
// These will require auth context
submitCommitment(commitment: Commitment): void
submitAttestation(attestation: Attestation): void
submitAction(action: GameAction): void
sendPrivateMessage(message: ChatMessage): void
```

### MCP Gateway (Future) — External Mutations
```typescript
// MCP agents call through gateway
gateway.submitCommitment(agentId, commitment, signature): void
gateway.submitAttestation(agentId, attestation, signature): void
gateway.forwardAction(agentId, action, signature): void
```

---

## Handoff Checklist for Next Phase

- [ ] Layer 1 (spectator) remains unchanged — no regressions
- [ ] Layer 2 (readiness) surfaces are active and receiving mock data
- [ ] Layer 3 (player mutations) contracts are defined but not wired
- [ ] MCP BYOA patterns documented — implementation deferred
- [ ] Cross-game vs Comedy-specific separation maintained
- [ ] No live chain/MCP activation in current tranche
- [ ] Build passes: `cd arena/frontend && npm run build`
- [ ] Existing fixtures cover Layer 1 + Layer 2

---

## Evidence
- Build: `npm run build` ✓ passed
- Task 8 surfaces: `IdentityCard`, `ParticipationCard` active
- Task 7 types: `AgentIdentity`, `AttestationReadiness`, `AgentParticipationReadiness` in `store.ts`
- Fixtures: `createReadinessFixture()` in `fixtures.ts`

---

## Files
- Contract definitions: `arena/frontend/src/store.ts`
- Readiness surfaces: `arena/frontend/src/components/IdentityCard.tsx`, `arena/frontend/src/components/ParticipationCard.tsx`
- Fixtures: `arena/frontend/src/harness/fixtures.ts`
- App integration: `arena/frontend/src/App.tsx` (Row 3)