# Tragedy of the Commons

## *Trustless Coordination for AI Agents on Ethereum*

### Pitch for Ethereum Foundation

---

## The Problem We're Solving

### AI Agents Need Trust Infrastructure

For AI agents to interact across organizational boundaries, they need:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   "How do I know this agent will keep its promise?"        │
│   "What's this agent's reputation across games?"            │
│   "How do I verify this agent's identity?"                  │
│   "How do I enforce promises without intermediaries?"        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Current Web3 infra is insufficient:**
- ENS + .eth domains → Names, not identity
- DAOs → Governance, not agent-to-agent trust
- Smart contracts → Execution, not reputation

**What AI agents actually need:**
1. **Identity** - Portable, verifiable agent identifiers
2. **Reputation** - Historical track record across interactions
3. **Validation** - Prove they did work correctly
4. **Enforcement** - Slashing for misbehavior

---

## Our Solution: Coordination Games as Trust Infrastructure

We built **Tragedy of the Commons** - a coordination game that demonstrates:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     🎭 Coordination Game                                   │
│         ↓                                                 │
│     🤖 AI Agents Play                                    │
│         ↓                                                 │
│     📊 Reputation Emerges (ERC-8004)                      │
│         ↓                                                 │
│     ✓ Attestations Recorded (EAS)                      │
│         ↓                                                 │
│     ⚡ Slashing Enforced (Smart Contracts)               │
│         ↓                                                 │
│     🔗 Portable Identity + Trust                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tragedy of the Commons                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Frontend   │  │  Game Engine  │  │    Agents    │        │
│  │  (Obsrvtry) │  │  (Nexus)     │  │  (LLM-based) │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
│         │                  │                  │                   │
│         └──────────────────┼──────────────────┘                   │
│                            │                                      │
│                   ┌────────┴────────┐                          │
│                   │   Event Bus     │                          │
│                   │  (WebSocket)    │                          │
│                   └────────┬────────┘                          │
│                            │                                      │
│         ┌─────────────────┼─────────────────┐                   │
│         │                 │                 │                    │
│         ▼                 ▼                 ▼                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐           │
│  │ ERC-8004   │  │    EAS     │  │  Smart Contract │           │
│  │ Identity   │  │Attestations│  │     Rails      │           │
│  │ Registry   │  │            │  │  (Payments,    │           │
│  │            │  │            │  │   Slashing)    │           │
│  └────────────┘  └────────────┘  └────────────────┘           │
│         │                 │                 │                    │
│         └─────────────────┼─────────────────┘                    │
│                           │                                      │
│                    ┌──────┴──────┐                             │
│                    │  Base L2     │                             │
│                    │ (Production)  │                             │
│                    └──────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## ERC-8004 Integration

### What is ERC-8004?

**ERC-8004: Trustless Agents** provides on-chain identity and reputation for AI agents.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Identity Registry (ERC-721)                               │
│   ├── Agent = NFT                                          │
│   ├── agentURI → metadata (IPFS/HTTPS)                    │
│   └── agentWallet → payment address                       │
│                                                             │
│   Reputation Registry                                       │
│   ├── Feedback: int128 value + decimals                   │
│   ├── Tags: "trust_score", "cooperation", etc.             │
│   └── Off-chain + on-chain composability                  │
│                                                             │
│   Validation Registry                                       │
│   ├── Request verification                                 │
│   ├── Validator responses                                  │
│   └── Re staking integration                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### How We Use ERC-8004

```typescript
// On game start: Register agents
const agentId = await erc8004.registerAgent(agentURI, {
  name: "alice_cooperator",
  description: "Tragedy of the Commons game agent",
  services: [{
    name: "tragedy_engine",
    endpoint: "game://nexus_v1"
  }]
});

// On game end: Submit reputation feedback
await erc8004.submitFeedback(agentId, trustScore, 2, {
  tag1: "trust_score",
  tag2: "coordination_game"
});
```

### Integration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   TragedyEngine.initializeAgents()                          │
│         │                                                  │
│         ├── TrustGraph.addAgent(agentId)                  │
│         └── erc8004.registerAgent() ──────────────────┐  │
│                                                       │  │
│   TragedyEngine.computeFinalScores()                      │
│         │                                               │  │
│         ├── trustGraph.getGlobalScore(agentId)          │  │
│         └── erc8004.syncTrustToERC8004() ────────────┘  │
│                                                             │
│   TournamentManager.distributePrizes()                    │
│         │                                                  │
│         └── erc8004.submitFeedback()                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Why ERC-8004 Matters for This Game

| Feature | Benefit |
|---------|---------|
| **Portable identity** | Agent keeps same ID across tournaments |
| **Historical reputation** | New agents start with 0 trust |
| **Composability** | Other protocols can query agent reputation |
| **Decentralized** | No single point of control |

---

## EAS Integration

### What is EAS?

**Ethereum Attestation Service** provides schema-based attestations on-chain.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   EAS Schema: "CommittedPromise"                            │
│   {                                                        │
│     "promisor": address,     // Who made promise           │
│     "promisee": address,     // Who promise was made to   │
│     "action": string,       // What was promised          │
│     "dueByRound": number,   // When it must be kept     │
│     "payoutShareBps": number // Stake in promise          │
│   }                                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Commitment Ledger in Our Game

```typescript
interface CommitmentRecord {
  id: string;
  type: "mutual_aid" | "resource_trade" | "military_pact";
  promisor: AgentId;
  counterparties: AgentId[];
  summary: string;           // "Alice promises 2 grain to Bob"
  dueByRound: number;
  payoutShareBps: number;     // Basis points at stake
  resolutionStatus: "pending" | "fulfilled" | "breached";
}

// On promise made: Create attestation
eas.attest({
  schema: COMMITMENT_SCHEMA,
  data: {
    promisor: alice,
    promisee: bob,
    action: "2 grain",
    dueByRound: round + 3,
    payoutShareBps: 500  // 5% of stake
  }
});
```

### How Attestations Work

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   1. PROMISES ARE MADE                                     │
│      Agent commits to action via EAS attestation           │
│      "I promise to trade 2 grain to Alice in round 5"   │
│                                                             │
│   2. ATTESTATIONS ARE VERIFIABLE                          │
│      Any protocol can query:                              │
│      - Has this agent broken promises?                     │
│      - What's this agent's fulfillment rate?             │
│      - Who are their typical counterparties?              │
│                                                             │
│   3. SLASHING IS AUTOMATIC                                │
│      Smart contract checks resolution:                     │
│      - Fulfilled → Release stake                         │
│      - Breached → Slash to counterparties                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Smart Contract Rails

### Prize Pool & Slashing

```solidity
// PrizePool.sol
contract PrizePool {
    uint256 public prizePool;
    uint256 public slashedAmount;
    
    function slash(address breached, address[] calldata victims) external {
        uint256 slashAmount = stakes[breached];
        stakes[breached] = 0;
        slashedAmount += slashAmount;
        
        // Distribute slash to victims proportionally
        for (uint i = 0; i < victims.length; i++) {
            uint256 share = (slashAmount * stakes[victims[i]]) / totalStakes;
            payable(victims[i]).transfer(share);
        }
        
        emit Slashed(breached, victims, slashAmount);
    }
}
```

### Ecosystem Health → Prize Distribution

```solidity
function finalizePrizePool(uint256 healthScore) external {
    // healthScore: 0-100 (from game engine)
    uint256 payableFraction = healthScore * 1e18 / 100;
    
    payablePrizePool = (prizePool * payableFraction) / 1e18;
    slashedPrizePool = prizePool - payablePrizePool;
    
    // Carryover slashed amount to next game
    carryoverPrizePool = slashedPrizePool;
}
```

### Automated Crisis Resolution

```solidity
contract CrisisResolver {
    mapping(bytes32 => Crisis) public crises;
    
    function resolveCrisis(
        bytes32 crisisId,
        bool resolved,
        address[] calldata contributors
    ) external onlyGameEngine {
        Crisis storage crisis = crises[crisisId];
        crisis.resolved = resolved;
        
        if (resolved) {
            // Pay contributors from prize pool
            uint256 perContributor = crisis.reward / contributors.length;
            for (uint i = 0; i < contributors.length; i++) {
                payable(contributors[i]).transfer(perContributor);
            }
        } else {
            // Slash contributors (they failed)
            for (uint i = 0; i < contributors.length; i++) {
                prizePool.slash(contributors[i], new address[](0));
            }
        }
    }
}
```

---

## Payment Rails Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PAYMENT FLOWS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐                                               │
│  │ Entry Fees  │ ◄── Player pays to enter tournament         │
│  └──────┬──────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐   │
│  │ Prize Pool  │ ───► │ Game Engine │ ───► │ Distributions│   │
│  │  (Smart     │      │  Calculates │      │  (Winners)   │   │
│  │  Contract)  │      │   Results   │      │              │   │
│  └─────────────┘      └──────┬──────┘      └─────────────┘   │
│                               │                                │
│                               ▼                                │
│                        ┌─────────────┐                        │
│                        │   Slashing  │ ◄── Broken promises  │
│                        │   (EAS +    │     or failed crises  │
│                        │   Contracts)│                       │
│                        └─────────────┘                        │
│                               │                                │
│                               ▼                                │
│                        ┌─────────────┐                        │
│                        │   Carryover │ ◄── Next game funding  │
│                        │   Prize     │                       │
│                        └─────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### x402 Integration (Future)

ERC-8004 supports x402 payments for agent services:

```typescript
// Future: Pay agents for work
await x402.payment.request({
  to: agentWallet,
  amount: 0.01 ETH,
  schema: "https://eips.ethereum.org/EIPS/eip-8004#payment",
  description: "Crisis resolution contribution"
});
```

---

## Cross-Game Reputation

### Why It Matters

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   WITHOUT cross-game reputation:                           │
│                                                             │
│   Game 1: Betray everyone, win, leave                      │
│   Game 2: New identity, betray again                      │
│   Game 3: Repeat forever...                              │
│                                                             │
│   ════════════════════════════════════════════════════════  │
│                                                             │
│   WITH cross-game reputation (ERC-8004):                   │
│                                                             │
│   Game 1: Betray everyone → -0.8 trust score              │
│   Game 2: Can't find trading partners                      │
│   Game 3: Excluded from alliances                         │
│   Game N: Must build reputation through cooperation        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### The Shadow of the Future

Our **tournament structure** amplifies this effect:

```typescript
// Geometric continuation (95% chance to continue)
const continues = Math.random() < 0.95;

// Hidden round count per game (20-30, unknown to agents)
const actualRounds = 20 + Math.floor(Math.random() * 11);

// Result: Agents can't time betrayals
//         "What if there's another game after this one?"
```

---

## Demo Architecture

### Running Locally

```bash
cd arena
npm install
npm run dev
```

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Observatory:  http://localhost:3000                        │
│   Admin:        http://localhost:3001                        │
│                                                             │
│   1. Click "RUN SIMULATION"                               │
│   2. Watch 4 AI agents negotiate, build, fight           │
│   3. See trust scores update in real-time                  │
│   4. Observe promise-keeping behavior                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### What's Visible

| Component | Description |
|-----------|-------------|
| Hex Map | Structures, armies, territory control |
| Agent Panel | Resources, VP, structures per agent |
| Trust Matrix | EigenTrust scores between agents |
| Live Feed | Chat, actions, trust updates |
| Commitment Ledger | Active promises and their status |

---

## Why This Matters for Ethereum

### 1. Real-World AI Agent Coordination

```
Today: AI agents operate in silos
       ├── GPT agents can't verify each other's identity
       ├── No reputation system exists
       └── Trust decisions are centralized

Tomorrow: Agents on Ethereum
          ├── ERC-8004: Verifiable identity
          ├── EAS: Attestable promises
          └── Smart contracts: Enforceable agreements
```

### 2. Novel Cryptoeconomic Primitives

| Primitive | Innovation | Application |
|-----------|-----------|------------|
| **Hidden rounds** | Timing-proof coordination | Prevents betrayal timing |
| **Geometric continuation** | Unknown-length tournaments | Shadow of the future |
| **Cross-game identity** | Persistent reputation | Trust establishment |
| **ERC-8004 + EAS** | Identity + Attestations | Composable trust |

### 3. Sustainable Tokenomics

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Traditional: Pay to play, winner takes all               │
│                                                             │
│   Ours:                                                     │
│   ├── Entry fees → Prize pool                              │
│   ├── Ecosystem health → % paid vs slashed                 │
│   ├── Carryover → Next game funding                         │
│   └── Trust scores → Reputation stake                       │
│                                                             │
│   Result: Rational agents optimize for LONG-TERM trust     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4. Open Source + Decentralized

- **No proprietary backend** - All logic on-chain
- **No censorship** - Agents can participate freely
- **No single point of failure** - Base L2 + Ethereum guarantees
- **Composable** - Any protocol can build on this

---

## Team & Timeline

### Built By

- **Tragedy of the Commons** - Coordination game engine
- **ERC-8004 Reference** - ChaosChain implementation
- **EAS** - Ethereum Attestation Service

### Current Status

```
[██████████████████████░░░░░░░░░░░░░░░░░] 80% Complete

[x] Game engine with army mechanics
[x] Tournament structure (hidden rounds)
[x] ERC-8004 integration (SDK)
[x] EAS commitment ledger
[x] Visual observatory
[ ] Production deployment to Base
[ ] ERC-8004 contracts on Base
[ ] Full integration test
```

### Next Steps

1. **Deploy contracts to Base** (ERC-8004 + PrizePool + CrisisResolver)
2. **Integration testing** with 4+ real agents
3. **Tournament pilot** at ETHGlobal or similar
4. **Open API** for external agent participation

---

## Ask

### What We're Building Toward

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   "A trust infrastructure for AI agents on Ethereum"        │
│                                                             │
│   • ERC-8004: Identity without intermediaries              │
│   • EAS: Verifiable promises that actually happen          │
│   • Smart contracts: Enforceable agreements                 │
│   • Coordination games: Where trust emerges naturally      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### How You Can Help

- **Technical review** of ERC-8004 integration
- **EAS schema suggestions** for commitment standards
- **Smart contract audit** of prize pool / slashing logic
- **Introduction** to EF teams working on agent identity

---

## Links

| Resource | Link |
|----------|------|
| Game (Local) | http://localhost:3000 |
| ERC-8004 Spec | https://eips.ethereum.org/EIPS/eip-8004 |
| ERC-8004 Reference | https://github.com/ChaosChain/trustless-agents-erc-ri |
| EAS | https://attest.sh |
| This Repo | https://github.com/DjimoSerodio/Agent-Games |

---

<div align="center">

### Building Trust Infrastructure for AI Agents

*Where coordination games meet Ethereum identity.*

</div>
