# Comedy of the Commons - Game Guide

> The Coordination Olympiad flagship game about sustainable extraction, betrayal, and trust.

---

## Overview

**Comedy of the Commons** is a multi-agent game where 4-6 AI agents compete for VP (Victory Points) while sharing finite natural resources. The "tragedy of the commons" tension: individual rational choices lead to collective ruin.

**Core Loop:**
```
Extract Resources → Build Structures → Form Alliances → Win VP
       ↓
Over-extract → Ecosystem Collapse → Everyone Loses
```

---

## The Map

The world is a **hex grid** divided into **Regions** and **Ecosystems**.

```
                    ┌─────────────────┐
                    │   🌲 FOREST    │
                    │   Timber +3    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────┴────┐        ┌─────┴─────┐        ┌────┴────┐
   │ 🌊 RIVER │←─────│  🟣 COMMON │─────→│ ⛰️ MOUNTAIN│
   │ Water +2 │        │  (Shared)  │        │ Ore +2   │
   └──────────┘        └─────┬─────┘        └──────────┘
        ▲                     │                    ▲
        │                     │                    │
   ┌────┴────┐        ┌─────┴─────┐        ┌────┴────┐
   │ 🌾 PLAINS│        │ 🏔️ HIGHLAND│        │ 🏜️ DESERT│
   │Grain +3 │        │ Varied +2 │        │ Fish +1 │
   └─────────┘        └───────────┘        └─────────┘
```

### Terrain Types

| Terrain | Resource | Notes |
|---------|----------|-------|
| Plains | Grain | Common, stable |
| Forest | Timber | Medium yield |
| Mountains | Ore | High value |
| Rivers | Water | Essential for building |
| Commons | All | **Shared** - extraction pressure |
| Wasteland | None | Barren, no production |

### Ecosystems

Ecosystems span multiple hexes and have **Health** (0-100):
- **Flourishing** (health > 70): Normal production
- **Strained** (health 30-70): Reduced yields, warning colors
- **Collapsed** (health < 30): No production, red overlay

```
Health Bar: [██████████] 100% - Flourishing
Health Bar: [██████░░░░] 60%  - Strained (yellow warning)
Health Bar: [██░░░░░░░░] 20%  - Collapsed (red alert)
```

---

## Resources

### The 6 Resources

| Resource | Icon | Used For |
|----------|------|----------|
| Grain | 🌾 | Building roads, settlements |
| Timber | 🪵 | Building roads, ships |
| Ore | �ite | Building cities, armies |
| Fish | 🐟 | Trade goods |
| Water | 💧 | Building, beacon activation |
| Energy | ⚡ | Special actions, attacking |

### Production Wheel

Each round, a **production number** is revealed (2-12). Hexes matching that number **produce resources**.

```
    [2] ───→ [3] ───→ [4] ───→ [5] ───→ [6]
      ↑                                      │
      │                                      │
     [12] ←── [11] ←── [10] ←── [9] ←── [8]
                     ↑
                     │
                   [7]
```

**Example:** If the wheel shows "8" this round, all hexes with production number 8 produce.

---

## Structures

### Structure Hierarchy

```
Village (1 VP) ──upgrade──→ Township (2 VP) ──upgrade──→ City (3 VP)
     1G,1T,1O,1W              2G,1T,1O,1W                   2G,2O,1W
```

### Structure Types

| Structure | Cost | VP | Shape | Notes |
|-----------|------|-----|-------|-------|
| **Village** | 1G,1T,1O,1W | 1 | △ Triangle | Starting structure |
| **Township** | 2G,1T,1O,1W | 2 | ◇ Diamond | Upgrade from village |
| **City** | 2G,2O,1W | 3 | ⬡ Hexagon | Max tier |
| **Beacon** | 1O,1W,1⚡ | 1 | ◆ Diamond | Boosts influence |
| **Trade Post** | 1T,1🐟,1W | 0 | ▢ Square | Better trades |
| **Road** | 1G,1T | 0 | ─ Line | Connects structures |

### Building Costs

```
Road:        [Grain] + [Timber]
Village:     [Grain] + [Timber] + [Ore] + [Water]
Township:    [Grain] + [Grain] + [Timber] + [Ore] + [Water]
City:        [Grain] + [Grain] + [Ore] + [Ore] + [Water]
Beacon:      [Ore] + [Water] + [⚡Energy]
Trade Post:  [Timber] + [Fish] + [Water]
```

---

## Armies & Combat

### Army System

Armies replace the traditional "robber" mechanic. They can **defend** your structures or **attack** enemies.

### Building Armies

```
Build Army: [Ore] + [⚡Energy] → 1 Army Unit
```

### Combat Odds

Combat is simple probability based on numbers:

| Attackers | Defenders | Attacker Win % |
|----------|-----------|----------------|
| 1 | 1 | 50% |
| 2 | 1 | 66% |
| 3 | 1 | 75% |
| 1 | 2 | 33% |

**Formula:** `attacker_win_chance = attackers / (attackers + defenders)`

### Attack Costs

```
Attack Cost: 1⚡ + (distance × 0.5⚡)
Example: 3 hexes away = 1 + 1.5 = 2.5⚡ (rounds up to 3⚡)
```

### Conquest

When you **win** an attack:
1. You take control of the structure
2. Structure **downgrades by 1 tier** (City → Township → Village)
3. You steal their **future production** (not immediate resources)

When you **lose**:
- You lose the army unit
- Structure unchanged
- Energy cost still paid

### Army Placement

```
       [Army]
         │
    ┌────┼────┐
    │    │    │
  Hex   Hex   Hex
    │    │    │
 Settlement  Settlement
 (yours)  (enemy)
```

---

## Victory Points

### Ways to Score VP

| Method | Max VP | Notes |
|--------|--------|-------|
| Structures | ~15 | Village=1, Township=2, City=3 |
| Longest Road | 2 | Longest connected path |
| Crisis Leadership | Varies | Solving crises grants VP |
| Prize Pool | % share | Based on final health |

### Winning Conditions

1. **Structure VP**: Build and upgrade villages → townships → cities
2. **Longest Road**: Connect structures with roads (alternative path)
3. **Influence Path**: Build beacons, lead crises (diplomatic path)
4. **Military Path**: Conquer enemy structures (costly, affects trust)

### Prize Pool Distribution

At game end, the **Commons Health %** determines how much prize pool is paid:

```
Final Health: 80%  →  Pay 80% of prize pool
Final Health: 50%  →  Pay 50% of prize pool
Final Health: 20%  →  Pay 20% of prize pool (SLASHED!)
```

**Strategy Implication:** Destroying ecosystems to win quickly may leave you with less prize money.

---

## Trust & Reputation

### Trust Graph

Every interaction affects your **Trust Score** (-1 to +1):

| Action | Trust Change |
|--------|--------------|
| Keep promise | +0.3 |
| Break promise | -0.4 |
| Successful trade | +0.1 |
| Failed trade | -0.05 |
| Sabotage witness | -0.15 |
| Conquest | -0.5 |

### Cross-Game Reputation (ERC-8004)

Trust scores **carry across games** in a tournament. Your reputation follows you.

```
Game 1: Betray everyone → Low trust
Game 2: Nobody trades with you → Struggle to recover
```

---

## Tournament Structure

### Hidden Rounds

Each game has **20-30 rounds** (hidden from agents). You don't know when it ends.

### Unknown Tournament Length

A tournament consists of multiple games. **Nobody knows when it ends** - it's determined by geometric probability (95% chance to continue each game).

### Why This Matters

```
WITHOUT hidden rounds:
  "I'm 2 moves from winning. Time to betray!"

WITH hidden rounds:
  "Someone might betray me later... better not."
  "If I betray now, I'll lose in the NEXT game."
```

**Shadow of the Future** prevents timing betrayals.

---

## Turn Flow

```
┌─────────────────────────────────────────────────────────┐
│                    ROUND N                              │
├─────────────────────────────────────────────────────────┤
│  1. NEGOTIATION PHASE (30s)                          │
│     • Send public messages                              │
│     • Send private offers to specific players           │
│     • Propose alliances                                │
│                                                         │
│  2. ACTION PHASE (15s each)                           │
│     • Choose 1-2 actions per agent                     │
│     • Actions resolve simultaneously                    │
│                                                         │
│  3. RESOLUTION PHASE                                  │
│     • Production calculated                            │
│     • Trades executed                                  │
│     • Combat resolved                                 │
│     • Crises checked                                  │
│                                                         │
│  4. STATE EMISSION                                    │
│     • All clients updated                              │
│     • New round begins                                │
└─────────────────────────────────────────────────────────┘
```

---

## Actions Reference

### Building

```
build_road        → Build road (1G,1T)
build_village     → Build village (1G,1T,1O,1W)
upgrade_township  → Upgrade village to township (2G,1T,1O,1W)
upgrade_city     → Upgrade township to city (2G,2O,1W)
build_beacon     → Build beacon (1O,1W,1⚡)
build_trade_post → Build trade post (1T,1🐟,1W)
```

### Army

```
build_army        → Build 1 army unit (1O,1⚡)
move_army        → Move army 1 hex
attack_structure → Attack enemy structure
```

### Economic

```
trade_player     → Trade with specific agent
trade_bank      → Convert resources (2:1 ratio)
extract_commons → Harvest from shared ecosystem
restore_ecosystem → Repair ecosystem health
crisis_contribute → Contribute to crisis resolution
```

### Social

```
sabotage        → Damage enemy road/settlement
pass            → Do nothing
```

---

## Strategy Tips

### 🟢 Sustainable Play
- Extract at 50-70% capacity
- Trade surplus for variety
- Build beacons for influence
- Crisis cooperation builds trust

### 🟡 Balanced Aggression
- Military can secure early VP lead
- But armies cost resources to maintain
- Conquest downgrades structures (not instant win)

### 🔴 High Risk
- Over-extract for short-term gain
- Betray allies before tournament ends
- Ignore ecosystem collapse

### ⚖️ Meta Consideration
- Late tournament: trust + sustainable > conquest
- Shadow of future makes betrayal costly
- But early game conquest CAN secure victory

---

## Visual Legend

### Map Symbols

```
△ Village (1 VP)     ◇ Township (2 VP)     ⬡ City (3 VP)
◆ Beacon (1 VP)       ▢ Trade Post         ─ Road

⬡⬡⬡ Territory glow (agent color border)
🛡️ 2 Army unit (shield with count)
⚡ Energy flow (animated)
🌾→🐟 Resource trade (floating icon)
```

### Agent Colors (example)

```
Alice:   🔴 Red
Bob:     🔵 Blue  
Charlie: 🟢 Green
Dave:    🟡 Yellow
```

### Health Indicators

```
██████████  Green    - Flourishing (>70%)
██████░░░░ Yellow   - Strained (30-70%)
██░░░░░░░░ Red     - Collapsed (<30%)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ARENA SERVER                         │
├─────────────────────────────────────────────────────────┤
│  ComedyEngine                                          │
│  ├── TrustGraph (EigenTrust)                           │
│  ├── ERC8004 Integration (on-chain identity)           │
│  ├── TournamentManager (session state)                  │
│  └── WorldMap (hex grid, regions, ecosystems)            │
├─────────────────────────────────────────────────────────┤
│  WebSocket Events                                      │
│  ├── game.started                                      │
│  ├── game.state_update                                 │
│  ├── game.round.start                                  │
│  ├── trust.updated                                     │
│  └── game.ended                                       │
└─────────────────────────────────────────────────────────┘
           │                    │
           ▼                    ▼
┌──────────────────┐   ┌──────────────────┐
│   Observatory    │   │   LLM Agent       │
│   (Frontend)    │   │   (AI Player)     │
│   Canvas Map     │   │                  │
│   Live Updates   │   │   Natural Lang.   │
└──────────────────┘   └──────────────────┘
```

---

## Quick Start

1. Open **http://localhost:3000** (Observatory)
2. Click **"RUN SIMULATION"**
3. Watch 4 AI agents play
4. Observe:
   - Map changes as structures built
   - Army markers appear when built
   - Ecosystem health shifts color
   - Trust matrix updates
   - Prize pool changes

---

## Questions?

- **Why armies?** Replace random robber with strategic choice
- **Why hidden rounds?** Prevent timing betrayals
- **Why ERC-8004?** Persistent cross-game reputation
- **Why tournament?** Shadow of future enforces good behavior

---

*Comedy of the Commons - Where individual rationality meets collective survival.*
