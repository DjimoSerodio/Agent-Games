# Nexus: Official Game Rules

> This document is the complete and authoritative specification for the Nexus coordination game. It is intended to be read by AI agents as their sole source of game knowledge. Every cost, threshold, and mechanic described here is derived directly from the game engine source code.

---

## 1. Overview

Nexus is a multiplayer resource-trading coordination game played on a hex grid. Players collect resources from terrain hexes, build structures, trade with each other, respond to shared crises, and compete to reach a victory point (VP) threshold.

- **Players**: 4-6 agents
- **Win condition**: First player to reach **15 VP**, OR the player with the highest VP when the hidden round limit is reached
- **Core tension**: Individual advancement vs. collective crisis response. Trust and cooperation are mechanically rewarded.

---

## 2. Map

### 2.1 Hex Grid

The map uses **axial coordinates** `(q, r)`. Each hex is identified by the string key `"q,r"`.

- **4-5 players**: 2-ring grid = **19 hexes**
- **6 players**: 3-ring grid = **37 hexes**

The center hex `(0, 0)` is always the **Nexus**.

Each hex has 6 neighbors at these axial offsets:
```
(+1, 0), (+1, -1), (0, -1), (-1, 0), (-1, +1), (0, +1)
```

Hex distance between two coordinates `a` and `b`:
```
distance = max(|a.q - b.q|, |a.r - b.r|, |(a.q + a.r) - (b.q + b.r)|)
```

### 2.2 Terrain Types

| Terrain      | Produces   | Distribution |
|:-------------|:-----------|:-------------|
| `plains`     | `grain`    | ~25%         |
| `forest`     | `timber`   | ~25%         |
| `mountains`  | `ore`      | ~20%         |
| `rivers`     | `energy`   | ~15%         |
| `wasteland`  | nothing    | ~10%         |
| `nexus`      | wild (see below) | exactly 1 (center) |

### 2.3 Nexus Hex

The center hex `(0, 0)` is always terrain type `nexus` with production number **7**. When it produces, adjacent players receive 1 unit of their **scarcest resource** (the resource type they have the fewest of).

### 2.4 Fog of War

Hexes start unrevealed. At game start, each player's starting hex and its neighbors are revealed. Hexes are revealed by:
- Building settlements, beacons, or other structures (reveals the hex and its neighbors)
- Using the `explore` action (reveals up to 3 unrevealed hexes)
- Beacons reveal a wider area (the beacon hex's neighbors, plus each neighbor's neighbors)

An agent can only see hexes that have been revealed to them (via `revealedBy`) or that are globally revealed.

### 2.5 Production Numbers

Each non-wasteland hex has a **production number** from 2-12, assigned from the production wheel sequence during map generation and then shuffled. Wasteland hexes have production number 0 and never produce.

---

## 3. Resources

There are 4 resource types:

| Resource  | Primary source | Key uses                        |
|:----------|:---------------|:--------------------------------|
| `grain`   | Plains         | Settlements, cities, roads      |
| `timber`  | Forest         | Settlements, roads, trade posts |
| `ore`     | Mountains      | Settlements, cities, beacons, sabotage |
| `energy`  | Rivers         | Beacons, trade posts, sabotage  |

### 3.1 Resource Cap

Total resources held by a player are capped at **10**. If a player already holds 10 total resources, they receive no production. (The famine crisis penalty can reduce this cap to 5 for 3 rounds.)

### 3.2 Starting Resources

Each player begins with:
```json
{ "grain": 2, "timber": 2, "ore": 1, "energy": 0 }
```

---

## 4. Production

### 4.1 The Production Wheel

Instead of dice, Nexus uses a fixed, deterministic sequence called the **production wheel**:

```
[5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 3, 4, 5, 6, 11, 7, 2]
```

This is a 20-element cycle. The wheel position advances by 1 each round. The current position and the full wheel are visible to all agents. Agents can also see the **next 5 upcoming numbers**.

### 4.2 How Production Works

At the start of each round (production phase):

1. The wheel position advances by 1 (wrapping around at 20).
2. The number at the new position is the **current production number**.
3. Every non-wasteland hex whose `productionNumber` matches the current number **produces**.
4. Each player with a structure on or adjacent to (distance <= 1) a producing hex gains 1 unit of that hex's resource.
5. **Cities produce double**: if a player has a city adjacent to a producing hex, they get 2 units instead of 1 (subject to the resource cap).
6. **Nexus hex**: produces the player's scarcest resource (not a fixed type).
7. Players at the resource cap (10 total) receive nothing.

### 4.3 Crisis Check

After production, if the crisis cooldown is 0 and no crisis is active, there is a **15% chance** a new crisis triggers. The cooldown starts at 3 rounds (no crisis can trigger in the first 3 rounds) and resets to 3 after each crisis.

---

## 5. Structures

### 5.1 Costs

| Structure    | Grain | Timber | Ore | Energy | VP  |
|:-------------|:-----:|:------:|:---:|:------:|:---:|
| `road`       | 1     | 1      | 0   | 0      | 0   |
| `settlement` | 1     | 1      | 1   | 0      | 1   |
| `city`       | 2     | 0      | 3   | 0      | 2   |
| `beacon`     | 0     | 0      | 1   | 2      | 1   |
| `trade_post` | 0     | 2      | 0   | 1      | 0   |

### 5.2 Placement Rules

- **Settlement**: Placed on an available hex adjacent to an existing structure. Must not be on wasteland. Grants 1 VP.
- **City**: Upgrades an existing settlement. You must have at least 1 settlement. The settlement is removed and replaced by a city. Net VP change is **+1** (from settlement's 1 to city's 2). Cities produce double resources from adjacent hexes.
- **Road**: Placed on an edge between two hexes, near an existing structure. Roads increase your `longestRoad` counter by 1.
- **Beacon**: Placed on an available hex adjacent to an existing structure. Reveals a wide area (the hex, its neighbors, and their neighbors). Grants 1 VP.
- **Trade Post**: Placed on an available hex adjacent to an existing structure. Enables **2:1 bank trades** instead of the default 4:1 ratio. Grants 0 VP.

### 5.3 Structure Adjacency for Production

A structure is considered adjacent to a hex if the hex distance between the structure's hex and the producing hex is **<= 1**. All structure types (settlements, cities, beacons, trade posts) count for production adjacency.

---

## 6. Actions

Each agent may submit up to **2 actions per round** during the action phase. Actions beyond the first 2 are silently dropped.

### 6.1 Complete Action List

#### `build_road`

Build a road on a hex edge near an existing structure.

**Cost**: 1 grain, 1 timber
**Effect**: Increments your `longestRoad` counter. Places road near an existing structure.

```json
{
  "type": "build_road",
  "agentId": "<your_id>",
  "params": {},
  "round": 5,
  "timestamp": 1700000000000
}
```

#### `build_settlement`

Build a new settlement on an available adjacent hex.

**Cost**: 1 grain, 1 timber, 1 ore
**Effect**: +1 VP. Reveals nearby hexes. Adds a resource collection point.

```json
{
  "type": "build_settlement",
  "agentId": "<your_id>",
  "params": {
    "location": { "q": 1, "r": -1 }
  },
  "round": 5,
  "timestamp": 1700000000000
}
```

#### `build_city`

Upgrade an existing settlement to a city.

**Cost**: 2 grain, 3 ore
**Prerequisite**: Must have at least 1 settlement.
**Effect**: Net +1 VP (settlement removed, city placed). Cities produce double from adjacent hexes.

```json
{
  "type": "build_city",
  "agentId": "<your_id>",
  "params": {
    "location": { "q": 0, "r": 1 }
  },
  "round": 5,
  "timestamp": 1700000000000
}
```

#### `build_beacon`

Build a beacon for map revelation.

**Cost**: 1 ore, 2 energy
**Effect**: +1 VP. Reveals a wide area (2-hex radius around the beacon).

```json
{
  "type": "build_beacon",
  "agentId": "<your_id>",
  "params": {
    "location": { "q": -1, "r": 2 }
  },
  "round": 5,
  "timestamp": 1700000000000
}
```

#### `build_trade_post`

Build a trade post for improved bank trade ratios.

**Cost**: 2 timber, 1 energy
**Effect**: 0 VP. Enables 2:1 bank trades (instead of 4:1).

```json
{
  "type": "build_trade_post",
  "agentId": "<your_id>",
  "params": {
    "location": { "q": 2, "r": 0 }
  },
  "round": 5,
  "timestamp": 1700000000000
}
```

#### `trade_player`

Submit a trade offer to another player. Both players must independently submit matching `trade_player` actions in the same round for the trade to execute.

**Cost**: None (but you must have the resources you offer to give).
**Effect**: If matched, resources are exchanged. Both players gain +1 influence and +0.15 trust toward each other. If not matched, the submitting player gets a -0.05 trust penalty toward the partner.

```json
{
  "type": "trade_player",
  "agentId": "<your_id>",
  "params": {
    "partnerId": "agent_xyz",
    "give": { "grain": 2 },
    "receive": { "timber": 1, "ore": 1 }
  },
  "round": 5,
  "timestamp": 1700000000000
}
```

**Important**: Both players in a trade must submit `trade_player` actions targeting each other in the same round. The engine matches them by creating a sorted pair key. If only one side submits, the trade fails.

#### `trade_bank`

Trade resources with the bank at a fixed ratio.

**Default ratio**: 4:1 (give 4 of one type, receive 1 of another)
**With trade post**: 2:1

```json
{
  "type": "trade_bank",
  "agentId": "<your_id>",
  "params": {
    "bankGiveType": "grain",
    "bankReceiveType": "ore",
    "bankGiveAmount": 4
  },
  "round": 5,
  "timestamp": 1700000000000
}
```

**Constraints**: `bankGiveType` must differ from `bankReceiveType`. You must hold at least `bankGiveAmount` of the give type. The amount defaults to 4 if omitted.

#### `explore`

Reveal unrevealed hexes on the map.

**Cost**: None
**Effect**: Reveals up to **3** previously unrevealed hexes.

```json
{
  "type": "explore",
  "agentId": "<your_id>",
  "params": {
    "targetHex": { "q": 2, "r": -1 }
  },
  "round": 5,
  "timestamp": 1700000000000
}
```

#### `sabotage`

Sabotage an opponent's infrastructure.

**Cost**: 1 energy, 1 ore
**Effect**: Destroys an opponent's road. You lose **2 influence** and take a **-0.1 trust** penalty to your own trust score.

```json
{
  "type": "sabotage",
  "agentId": "<your_id>",
  "params": {
    "targetEdge": {
      "hexes": [{ "q": 1, "r": 0 }, { "q": 1, "r": -1 }]
    }
  },
  "round": 5,
  "timestamp": 1700000000000
}
```

**Warning**: Sabotage is costly to your reputation. It reduces your influence by 2 and hurts your trust score, which directly impacts end-game VP (see Victory Conditions).

#### `crisis_contribute`

Contribute resources to resolve an active crisis.

**Cost**: The resources you contribute (deducted from your inventory).
**Prerequisite**: There must be an active, unresolved crisis.
**Effect**: +1 influence per contribution action. If the crisis is resolved, contributors earn bonus VP and influence (see Crises section).

```json
{
  "type": "crisis_contribute",
  "agentId": "<your_id>",
  "params": {
    "contribution": { "grain": 3, "energy": 1 }
  },
  "round": 5,
  "timestamp": 1700000000000
}
```

#### `pass`

Take no action. Always legal.

```json
{
  "type": "pass",
  "agentId": "<your_id>",
  "params": {},
  "round": 5,
  "timestamp": 1700000000000
}
```

---

## 7. Trading

### 7.1 Player-to-Player Trading

Player trades require **bilateral submission**: both players must submit `trade_player` actions targeting each other in the same action phase. The engine pairs them using a sorted key of the two agent IDs.

**If both submit**: Resources in each player's `give` field are transferred to the other player. Both players receive:
- +1 influence
- +0.15 mutual trust

**If only one submits**: The trade fails. The submitting player receives:
- -0.05 trust toward the non-reciprocating partner

**Negotiation strategy**: Use the negotiation phase to agree on trade terms before submitting matching actions. Be aware that promises made during negotiation are not binding -- the other player may agree to a trade verbally but not submit the action.

### 7.2 Bank Trading

Bank trades are unilateral -- no partner needed.

| Condition       | Ratio |
|:----------------|:------|
| No trade post   | 4:1   |
| Has trade post  | 2:1   |

You give N units of one resource type and receive 1 unit of a different type. The give and receive types must differ.

---

## 8. Negotiation

### 8.1 Message Types

During the negotiation phase, agents can send three types of messages:

| Type      | `recipient` field   | Visible to                          |
|:----------|:--------------------|:------------------------------------|
| `public`  | `"broadcast"`       | All agents + spectators             |
| `private` | `"<agent_id>"`      | Sender + recipient only (among agents). Spectators CAN see. |
| `diary`   | (self)              | Only the sender (among agents). Spectators CAN see.         |

### 8.2 Negotiation Response Format

During the negotiation phase, your `negotiate()` function receives the current game state and visible messages, and must return an array of `Message` objects:

```json
[
  {
    "recipient": "broadcast",
    "content": "I have surplus grain. Looking to trade for ore.",
    "type": "public"
  },
  {
    "recipient": "agent_abc",
    "content": "I'll give you 2 grain if you give me 1 ore. Submit the trade action this round.",
    "type": "private"
  }
]
```

The engine fills in `id`, `gameId`, `round`, `phase`, `sender`, and `timestamp` automatically.

### 8.3 Information Visibility

- **Public messages**: Everyone sees them.
- **Private messages**: Only the sender and the named recipient see them (other agents cannot). Spectators CAN see private messages.
- **Diary entries**: Only the writing agent sees them during the game. Spectators can see diaries in real-time.
- **Other agents' resources**: NOT visible. You cannot see how many resources another player holds.
- **Other agents' VP and influence**: VISIBLE. All scores and influence values are public.
- **Trust scores**: VISIBLE. The global trust score for every agent is public.

---

## 9. Crises

Crises are shared emergencies that require collective resource contributions to resolve. They test whether players will cooperate for mutual benefit or free-ride on others' contributions.

### 9.1 Trigger Conditions

- No crisis in the first **3 rounds** (initial cooldown).
- After the cooldown, each production phase has a **15% chance** to trigger a crisis if none is active.
- After a crisis triggers (or resolves), the cooldown resets to **3 rounds**.
- Only **1 crisis** can be active at a time.

### 9.2 Resolution

A crisis remains active until either:
- The **collective resource threshold** is met (all resource requirements satisfied by summing all player contributions) -- crisis is **resolved successfully**.
- **3 rounds** pass since the crisis triggered without meeting the threshold -- crisis **fails** and the penalty applies to everyone.

### 9.3 Crisis Types

#### The Blight (`blight`)

> "A fungal plague threatens the grain fields. Contribute Grain to save the harvest."

| Threshold          | Reward (per contributor) | Failure Penalty                         |
|:-------------------|:-------------------------|:----------------------------------------|
| 8 grain            | +1 VP, +2 influence      | All Plains hexes skip next production   |

#### The Great Storm (`storm`)

> "A massive storm approaches. Contribute Energy to power the shields."

| Threshold          | Reward (per contributor) | Failure Penalty                         |
|:-------------------|:-------------------------|:----------------------------------------|
| 6 energy           | +0 VP, +3 influence      | Random roads destroyed across the map   |

#### The Famine (`famine`)

> "Crops fail across the land. Contribute Grain and Timber for emergency shelters."

| Threshold          | Reward (per contributor) | Failure Penalty                         |
|:-------------------|:-------------------------|:----------------------------------------|
| 5 grain, 3 timber  | +1 VP, +2 influence      | Resource cap reduced to 5 for 3 rounds  |

#### Nexus Surge (`nexus_surge`)

> "The Nexus is overcharging! Contribute Energy and Ore to stabilize it."

| Threshold          | Reward (per contributor) | Failure Penalty                         |
|:-------------------|:-------------------------|:----------------------------------------|
| 4 ore, 4 energy    | +1 VP, +2 influence      | Nexus hex becomes Wasteland for 5 rounds|

#### The Rift (`the_rift`)

> "A dimensional rift opens! Contribute ANY 10 resources to seal it."

| Threshold                        | Reward (per contributor) | Failure Penalty                         |
|:---------------------------------|:-------------------------|:----------------------------------------|
| 3 grain, 3 timber, 2 ore, 2 energy | +3 VP, +3 influence      | Random hex becomes permanent Wasteland  |

### 9.4 Contribution Rewards

- Each `crisis_contribute` action (with valid resources) grants the contributor **+1 influence** immediately.
- If the crisis is resolved, every contributor receives the crisis's `rewardVP` and `rewardInfluence`.
- Contributors also get **+0.2 mutual trust** with every other contributor.

---

## 10. Victory Conditions

### 10.1 VP Threshold

The game ends immediately when any player reaches **15 VP**.

### 10.2 Hidden Round Limit

The game has a hidden maximum round count, randomly set between **20 and 30** (inclusive). Agents do NOT know the exact value. When this limit is reached, the game ends and final scores are computed.

### 10.3 Final Score Computation

At game end, each player's final score is:

```
Final VP = Current VP + Trust Bonus VP
```

**Trust Bonus VP** (based on EigenTrust global score):

| Trust Score     | Bonus VP |
|:----------------|:---------|
| >= 0.8          | +3       |
| >= 0.6 (< 0.8) | +2       |
| >= 0.3 (< 0.6) | +1       |
| < 0.3          | +0       |

### 10.4 Bonus VP Awards (During Game)

These bonuses are **tracked dynamically** and transfer between players during the game:

| Bonus             | Requirement        | VP Award | Notes                                      |
|:------------------|:-------------------|:---------|:--------------------------------------------|
| Longest Road      | >= 5 roads built   | +2 VP    | Awarded to the player with the most roads. Transfers if surpassed. Previous holder loses 2 VP. |
| Most Influence    | >= 3 influence     | +2 VP    | Awarded to the player with the highest influence. Transfers if surpassed. Previous holder loses 2 VP. |

These bonuses require a **minimum threshold** (5 roads or 3 influence) before they are awarded to anyone. Once awarded, they can transfer to a new holder if that player exceeds the current holder.

### 10.5 Winner

The player with the highest final VP wins. Ties are broken by the engine (highest score wins; no explicit tiebreaker beyond score).

---

## 11. Turn Structure

Each round consists of 4 phases executed sequentially:

### Phase 1: Production

- The production wheel advances by 1.
- Matching hexes produce resources for adjacent structure owners.
- Cities produce double.
- Crisis trigger check (15% chance if cooldown is 0 and no active crisis).

### Phase 2: Negotiation

- All agents simultaneously receive the current game state and visible message history.
- Each agent returns a list of messages (public broadcasts, private DMs, diary entries).
- Messages are routed according to their type.
- There is a time limit (`config.timeouts.negotiationMs`). Agents that time out send no messages.

### Phase 3: Action

- All agents simultaneously receive the current game state and list of legal actions.
- Each agent returns up to 2 actions. Extra actions are dropped.
- Actions are collected simultaneously (agents do NOT see each other's actions before submitting).
- There is a time limit (`config.timeouts.actionMs`). Agents that time out take no actions.

### Phase 4: Resolution

- All submitted actions are resolved.
- Trades are matched (both sides must have submitted).
- Active crisis is checked for resolution or failure (after 3 rounds).
- Bonus holders (longest road, most influence) are recalculated.
- Trust graph is updated.
- Scores are updated.
- All agents receive the round results via `reflect()`.

---

## 12. Agent View

Each round, agents receive a `NexusAgentView` object. This is exactly what you can see:

### 12.1 What You CAN See

| Field              | Description                                                |
|:-------------------|:-----------------------------------------------------------|
| `gameId`           | The game's unique identifier                               |
| `round`            | Current round number                                       |
| `phase`            | Current phase (`"production"`, `"negotiation"`, `"action"`, `"resolution"`) |
| `myId`             | Your agent ID                                              |
| `visibleHexes`     | Array of hex tiles revealed to you (terrain, production number, coordinates) |
| `visibleVertices`  | Array of vertices (structures on the map)                  |
| `visibleEdges`     | Array of edges (roads on the map)                          |
| `myResources`      | Your resource inventory: `{ grain, timber, ore, energy }`  |
| `myInfluence`      | Your current influence score                               |
| `myVP`             | Your current victory points                                |
| `myStructures`     | Your structures: settlements, cities, beacons, tradePosts, roads |
| `allScores`        | VP for every player: `Record<AgentId, number>`             |
| `allInfluence`     | Influence for every player: `Record<AgentId, number>`      |
| `trustScores`      | Global trust score for every player: `Record<AgentId, number>` |
| `productionWheel`  | The full 20-number wheel sequence                          |
| `wheelPosition`    | Current position in the wheel                              |
| `nextProduction`   | The next 5 upcoming production numbers                     |
| `activeCrisis`     | The current crisis (if any), including type, thresholds, contributions so far, and resolution status |
| `messageHistory`   | All messages visible to you (public + your private + your diary) |
| `prizePool`        | The total accumulated prize pool (in Wei, as string)       |

### 12.2 What You CANNOT See

- Other players' **resources** (their inventory is private)
- **Private messages** between other players
- **Diary entries** from other players
- The **exact maximum round count** (hidden; between 20-30)
- Other players' **action submissions** before resolution

---

## 13. Agent Response Schemas

### 13.1 Negotiation Phase Response

Return an array of message objects:

```json
[
  {
    "recipient": "broadcast",
    "content": "Looking to trade grain for ore. Anyone interested?",
    "type": "public"
  },
  {
    "recipient": "agent_123",
    "content": "Let's both contribute to the crisis this round.",
    "type": "private"
  },
  {
    "recipient": "self",
    "content": "Agent_456 seems untrustworthy based on last round's broken trade.",
    "type": "diary"
  }
]
```

### 13.2 Action Phase Response

Return an array of 1-2 action objects:

```json
[
  {
    "type": "build_settlement",
    "agentId": "<your_id>",
    "params": {
      "location": { "q": 1, "r": 0 }
    },
    "round": 5,
    "timestamp": 1700000000000
  },
  {
    "type": "trade_player",
    "agentId": "<your_id>",
    "params": {
      "partnerId": "agent_xyz",
      "give": { "grain": 2 },
      "receive": { "ore": 1 }
    },
    "round": 5,
    "timestamp": 1700000000000
  }
]
```

### 13.3 Action Type Parameter Reference

| Action Type         | Required `params` fields                                                   |
|:--------------------|:---------------------------------------------------------------------------|
| `build_road`        | `location?` (optional; engine auto-places near existing structure)         |
| `build_settlement`  | `location?` (optional; `{ q, r }` of target hex)                          |
| `build_city`        | `location?` (optional; engine upgrades oldest settlement if not specified) |
| `build_beacon`      | `location?` (optional; engine auto-places near existing structure)         |
| `build_trade_post`  | `location?` (optional; engine auto-places near existing structure)         |
| `trade_player`      | `partnerId` (required), `give` (partial resource inventory), `receive` (partial resource inventory) |
| `trade_bank`        | `bankGiveType` (resource type), `bankReceiveType` (resource type), `bankGiveAmount` (number, default 4) |
| `explore`           | `targetHex?` (optional; `{ q, r }`)                                       |
| `sabotage`          | `targetEdge?` (optional; `{ hexes: [{ q, r }, { q, r }] }`)              |
| `crisis_contribute` | `contribution` (partial resource inventory, e.g. `{ "grain": 3 }`)        |
| `pass`              | none                                                                       |

---

## 14. Trust System

### 14.1 How Trust Works

Trust is tracked via an **EigenTrust**-based graph. Each interaction adjusts pairwise trust, and global trust scores are computed from the full graph.

### 14.2 Trust Modifiers

| Event                          | Trust Delta | Direction         |
|:-------------------------------|:------------|:------------------|
| Completed player trade         | +0.15       | Mutual (both parties) |
| Trade not reciprocated         | -0.05       | Submitter toward non-reciprocating partner |
| Sabotage action                | -0.10       | Self (damages your own trust score) |
| Crisis co-contribution         | +0.20       | Mutual (among all contributors) |

### 14.3 Why Trust Matters

Trust directly converts to VP at game end (0-3 bonus VP). A player with high trust (>= 0.8) gets +3 VP, which can be the difference between winning and losing.

---

## 15. Economy

### 15.1 Fees

Each action submitted costs a **move fee** (in Wei), which is added to the prize pool. Messages during negotiation cost a **message fee**. These are on-chain costs configured per game.

### 15.2 Starting State

Each player begins with:
- **1 settlement** at their starting position
- **1 VP** (from the initial settlement)
- **Resources**: 2 grain, 2 timber, 1 ore, 0 energy
- **0 influence**
- Their starting hex and adjacent hexes revealed

---

## 16. Strategic Notes

These are not rules but observations derived from the mechanics:

1. **Trade posts are high-value early investments**: 2:1 bank trades are dramatically more efficient than 4:1.
2. **Crisis contribution is almost always positive EV**: +1 influence per contribution, potential VP reward, and +0.2 trust with co-contributors.
3. **Sabotage is usually negative EV**: -2 influence and -0.1 trust is steep. The trust penalty at game end (potentially losing up to 3 bonus VP) often outweighs the tactical benefit.
4. **Trust is a VP source**: Getting trust >= 0.8 is worth +3 VP. Keeping promises and trading reliably is mechanically rewarded.
5. **The hidden round limit creates uncertainty**: You cannot run out the clock by counting rounds. Plan as if the game could end any round after 20.
6. **Both sides must submit trades**: Negotiate clearly and follow through. Broken trade promises hurt both trust and influence.
7. **Longest Road and Most Influence are transferable**: The +2 VP can be taken from you. Only invest in these if you can maintain the lead.
8. **Production is deterministic**: You can see the next 5 production numbers. Plan your structure placement around upcoming production.
