# 🎭 Tragedy of the Commons

### *The Coordination Olympiad Flagship Game*

---

> **Where individual rationality meets collective survival.**
> Extract. Build. Betray. Trust. Repeat.

---

## 🎮 At a Glance

```
╔══════════════════════════════════════════════════════════════════╗
║                     THE CORE LOOP                             ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║   💰 Extract          🏠 Build           🤝 Ally              ║
║   Resources           Structures         Form Teams              ║
║      ↓                   ↓                 ↓                   ║
║   ⚠️ Over-Extract  💀 Ecosystem      😤 Betrayal              ║
║   = Collapse       = Ruin           = No Trust               ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**Players:** 4-6 AI Agents | **Rounds:** 20-30 (hidden) | **Goal:** Most VP + Prize Pool

---

## 🗺️ The World

### Hex Grid Map

```
                          ┌─────────────────────────────────────┐
                    🏔️   │         🌲 FOREST REGION            │
                   /│\   │    ╱╲     ╱╲     ╱╲                │
                  / │ \  │   ╱  ╲   ╱  ╲   ╱  ╲               │
                 /  │  \ │  │🌲  │  │🌲  │  │🌲  │              │
                /   │   \│   ╲  ╱   ╲  ╱   ╲  ╱               │
               /────┴────\│    ╲╱     ╲╱     ╲╱                │
              │            │         RIVER                       │
             🟣◀═════════════════════════════════════════════════▶🟣
              │  ████  │    │  🌾 PLAINS  │   │  ⛰️ MOUNTAINS │ │
              │ █      │    │  ╱╲  ╱╲  │   │  ╱╲    ╱╲    │ │
              │ █ COMM  │    │ ╱  ╲╱  ╲ │   │ ╱  ╲  ╱  ╲   │ │
              │ █      │    ││ 🌾  │ 🌾 │ │   ││ ⛰️ │  │ ⛰️ │ │ │
              │ ████  │    │  ╲  ╱╲  ╱  │   │  ╲ ╱    ╲ ╱  │ │
              │        │    │   ╲╱  ╲╱    │   │    ╲╱      ╲╱  │ │
              │  🌊    │    │              │   │               │ │
              └────────┘    └──────────────┘   └───────────────┘ │
                           │                                    │
                           │     🏜️ DESERT        🌲 TAIGA      │
                           │    ╱╲    ╱╲   ╱╲    ╱╲  ╱╲       │
                           │   │🏜️│  │🏜️│  │🌲│   │🌲│  │🌲│      │
                           │    ╲╱    ╲╱   ╲╱    ╲╱  ╲╱       │
                           └────────────────────────────────────┘
```

### Terrain Types

| Icon | Terrain | Produces | Feel |
|------|---------|----------|------|
| 🌾 | Plains | Grain | 🍞 Breadbasket |
| 🌲 | Forest | Timber | 🪵 Lumber |
| ⛰️ | Mountains | Ore | ⚙️ Industrial |
| 🌊 | Rivers | Water | 💧 Essential |
| 🟣 | Commons | **All** | 🎁 Shared pain |
| 🏜️ | Wasteland | Nothing | 💀 Barren |

---

## 🌡️ Ecosystems

Ecosystems span multiple hexes and have **Health** (0-100%):

```
╔════════════════════════════════════════════════════════════════╗
║  ECOSYSTEM HEALTH STATES                                      ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  🌿 FLOURISHING     [██████████] 100% - All systems go        ║
║                       ✨ Green glow, full production           ║
║                                                                ║
║  🌾 STRAINED       [██████░░░░] 60%  - Warning signs        ║
║                       🟡 Yellow overlay, reduced yield         ║
║                                                                ║
║  💀 COLLAPSED      [██░░░░░░░░] 20%  - Ecosystem dead       ║
║                       🔴 Red alert, no production               ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

### Pressure System

Every extraction adds **pressure**. Too much pressure = collapse.

```
  Extraction Level    Pressure    Health Impact
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🌱 Light           +5%        -5%  per round
  🌿 Medium          +15%       -15% per round
  💀 Heavy           +30%       -30% per round
```

---

## 💎 Resources

### The Six Resources

```
        💧 WATER
         ╱ ╲
        ╱   ╲
    🌾 GRAIN    ⛰️ ORE
      ╱     ╲    ╱     ╲
     ╱       ╲  ╱       ╲
  🪵 TIMBER    ⚡ ENERGY    🐟 FISH
```

| Resource | Icon | Used For |
|----------|------|----------|
| Grain | 🌾 | Roads, Villages |
| Timber | 🪵 | Roads, Ships |
| Ore | ⛰️ | Cities, **Armies** |
| Fish | 🐟 | Trading |
| Water | 💧 | Building |
| Energy | ⚡ | **Attacking**, Beacons |

---

## 🏗️ Structures

### Upgrade Tree

```
                    ╔═══════════════════════════════════╗
                    ║     STRUCTURE HIERARCHY         ║
                    ╚═══════════════════════════════════╝

                              ⬡ CITY (3 VP)
                             /│╲│\
                            / │ ╲│ \
                           /  │  ╲│  \
            ╱─────────────╲   │   ╱│   ╱─────────────╲
           ╱               ╲  │  ╱ │  ╱               ╲
          ╱                 ╲ │ ╱  │ ╱                 ╲
         ◇                    ◇◇◇                    ◇
    TOWNSHIP (2 VP)           │           TOWNSHIP (2 VP)
         │                     │                     │
         │                     │                     │
         △                     │                     △
    VILLAGE (1 VP)            │                VILLAGE (1 VP)
         │                     │                     │
    ════════════════════════════════════════════════════════
                           ROADS
```

### Structure Shapes (on map)

| Structure | Icon | Shape | VP | Build Cost |
|-----------|------|-------|-----|------------|
| Village | 🏘️ | △ Triangle | 1 | 1🌾+1🪵+1⛰️+1💧 |
| Township | 🏡 | ◇ Diamond | 2 | 2🌾+1🪵+1⛰️+1💧 |
| City | 🏛️ | ⬡ Hexagon | 3 | 2🌾+2⛰️+1💧 |
| Beacon | 🗼 | ◆ Thin Diamond | 1 | 1⛰️+1💧+1⚡ |
| Trade Post | 🏪 | ▢ Square | 0 | 1🪵+1🐟+1💧 |
| Road | ─── | ─ Line | 0 | 1🌾+1🪵 |

---

## ⚔️ Armies & Combat

### Why Armies?

> **Replaces the "robber"** with strategic choice. Armies can defend OR attack.

### Building Armies

```
╔═══════════════════════════════════════════════════════╗
║           BUILD ARMY                                  ║
║                                                       ║
║     1⛰️ ORE  +  1⚡ ENERGY  =  🛡️ 1 ARMY        ║
║                                                       ║
║     ⚔️ You can stack multiple armies! ⚔️            ║
╚═══════════════════════════════════════════════════════╝
```

### Combat Odds

Combat is **simple probability**:

```
╔═══════════════════════════════════════════════════════════╗
║                    COMBAT ODDS                            ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║   YOUR ARMY          vs         ENEMY ARMY                 ║
║                                                            ║
║     🛡️1                    🛡️1      →  50% WIN         ║
║                                                            ║
║     🛡️2                    🛡️1      →  66% WIN  ⬆️       ║
║                                                            ║
║     🛡️3                    🛡️1      →  75% WIN  ⬆️⬆️     ║
║                                                            ║
║     🛡️1                    🛡️2      →  33% WIN  ⬇️       ║
║                                                            ║
║     🛡️5                    🛡️1      →  83% WIN  ⬆️⬆️⬆️  ║
║                                                            ║
║   Formula: YOUR / (YOUR + ENEMY) = WIN CHANCE            ║
║                                                            ║
╚═══════════════════════════════════════════════════════════╝
```

### Attack Costs

```
⚔️ Attack Cost = 1⚡ + (distance × 0.5⚡)

Example: 3 hexes away = 1 + 1.5 = 2.5 → 3⚡
```

### Conquest Mechanics

```
┌─────────────────────────────────────────────────────────┐
│                    CONQUEST RESULT                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   WIN:  ✅ You get the structure                         │
│         ⬇️ It DOWNGRADES by 1 tier                      │
│         💰 You steal FUTURE production                   │
│         😱 Enemy loses structure                          │
│                                                          │
│   LOSE: ❌ You lose the army unit                        │
│         💸 Energy cost still paid                        │
│         🏠 Structure unchanged                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🏆 Victory Points

### Ways to Win

```
╔═══════════════════════════════════════════════════════════════════╗
║                     VP STRATEGIES                               ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║   🏠 STRUCTURES          ⚔️ MILITARY          🗣️ INFLUENCE       ║
║   Build villages         Conquer enemies      Lead crises         ║
║   Upgrade to cities      Build armies         Build beacons       ║
║   ~15 VP max            Risky but fast       Slow but steady     ║
║                                                                    ║
║   🛤️ LONGEST ROAD        💰 PRIZE POOL                          ║
║   Connect everything     Final health %                          ║
║   2 VP                  Sweetens the pot                         ║
║                                                                    ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Prize Pool Logic

```
Final Health → Pay to Players

100% Health → 💰💰💰💰💰 100% paid
 80% Health → 💰💰💰💰     80% paid  
 50% Health → 💰💰💰        50% paid  
 20% Health → 💰             20% paid (SLASHED!)
```

**Strategy:** Destroy ecosystems to win quick = lose prize money!

---

## 🤝 Trust System

### Trust Graph

Every action affects your **Trust Score** (-1 to +1):

```
╔═══════════════════════════════════════════════════════════╗
║                 TRUST MATRIX                              ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║            ALICE    BOB    CHARLIE   DAVE                 ║
║   ALICE   ────    +0.3    -0.2     +0.1                 ║
║   BOB     +0.3    ────    +0.4     -0.5                 ║
║   CHARLIE -0.2    +0.4    ────     +0.2                 ║
║   DAVE    +0.1    -0.5    +0.2     ────                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

### Trust Changes

| Action | Trust Impact |
|--------|--------------|
| ✅ Keep promise | +0.3 |
| ❌ Break promise | -0.4 |
| 🔄 Successful trade | +0.1 |
| 💔 Failed trade | -0.05 |
| 👀 Witness sabotage | -0.15 |
| ⚔️ Conquest | -0.5 |

### ERC-8004: Cross-Game Reputation

> Your trust follows you across games in a tournament.

```
Game 1: Betray everyone
         ↓
Game 2: Nobody trusts you
         ↓
Game 3: You lose...
```

---

## 🎭 Tournament Structure

### Hidden Rounds

Each game has **20-30 rounds** - but agents don't know when it ends!

```
┌─────────────────────────────────────────────────────────┐
│                    HIDDEN TIMING                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   Round 1, 2, 3... agents playing normally...           │
│                                                          │
│   Suddenly...                                            │
│                                                          │
│   💀 GAME ENDS 💀                                       │
│                                                          │
│   Agents couldn't time their betrayal!                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Unknown Tournament Length

```
╔═══════════════════════════════════════════════════════════╗
║               TOURNAMENT DYNAMICS                        ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║   Game 1 → Game 2 → Game 3 → ... → ??? → PRIZES        ║
║                                                            ║
║   95% chance to continue after each game                 ║
║                                                            ║
║   "Why betray now? There might be MORE games!"           ║
║   "If I betray, they'll get me in Game 3!"              ║
║                                                            ║
║   ⭐ SHADOW OF THE FUTURE ⭐                             ║
║                                                            ║
╚═══════════════════════════════════════════════════════════╝
```

---

## 🎬 Turn Flow

```
╔═══════════════════════════════════════════════════════════════════╗
║                        ROUND N                                 ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║   ┌─────────────────────────────────────────────────────────────┐ ║
║   │ 1️⃣ NEGOTIATION (30 seconds)                               │ ║
║   │                                                             │ ║
║   │   💬 Public chat: "Anyone want to trade grain for ore?"  │ ║
║   │   🔒 Private msg: "I'll give you 2 ore if you attack Bob" │ ║
║   │   🤝 Propose alliance                                     │ ║
║   └─────────────────────────────────────────────────────────────┘ ║
║                              ↓                                  ║
║   ┌─────────────────────────────────────────────────────────────┐ ║
║   │ 2️⃣ ACTION (15 seconds each)                              │ ║
║   │                                                             │ ║
║   │   Choose 1-2 actions:                                     │ ║
║   │   🛤️ Build road    ⚔️ Attack    💰 Trade                   │ ║
║   │   🏠 Build city   🛡️ Fortify  🌾 Extract                │ ║
║   └─────────────────────────────────────────────────────────────┘ ║
║                              ↓                                  ║
║   ┌─────────────────────────────────────────────────────────────┐ ║
║   │ 3️⃣ RESOLUTION                                             │ ║
║   │                                                             │ ║
║   │   ⚡ Production calculated    ⚔️ Combat resolved          │ ║
║   │   💰 Trades executed          🌡️ Crises checked           │ ║
║   │   📊 VP tallied              💾 State saved               │ ║
║   └─────────────────────────────────────────────────────────────┘ ║
║                              ↓                                  ║
║   ┌─────────────────────────────────────────────────────────────┐ ║
║   │ 4️⃣ UPDATE                                                 │ ║
║   │                                                             │ ║
║   │   📡 All clients receive new state                         │ ║
║   │   🗺️ Map updates with new structures/armies                │ ║
║   │   ➡️ Next round begins                                    │ ║
║   └─────────────────────────────────────────────────────────────┘ ║
║                                                                    ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 🎒 Actions Reference

### Building

| Action | Cost | Effect |
|--------|------|--------|
| `build_road` | 1🌾 + 1🪵 | Connect structures |
| `build_village` | 1🌾+1🪵+1⛰️+1💧 | +1 VP, reveal hexes |
| `upgrade_township` | 2🌾+1🪵+1⛰️+1💧 | +1 VP (upgrade) |
| `upgrade_city` | 2🌾+2⛰️+1💧 | +1 VP (upgrade) |
| `build_beacon` | 1⛰️+1💧+1⚡ | +1 VP, +influence |
| `build_trade_post` | 1🪵+1🐟+1💧 | Better trades |

### Military

| Action | Cost | Effect |
|--------|------|--------|
| `build_army` | 1⛰️+1⚡ | +1 army unit |
| `move_army` | — | Move 1 hex |
| `attack_structure` | 1⚡+dist | Combat + conquest |

### Economic

| Action | Cost | Effect |
|--------|------|--------|
| `trade_player` | — | Exchange resources |
| `trade_bank` | — | Convert 2:1 |
| `extract_commons` | — | Harvest shared |
| `restore_ecosystem` | 💧 | Heal ecosystem |
| `crisis_contribute` | varies | Resolve crisis |

### Social

| Action | Cost | Effect |
|--------|------|--------|
| `sabotage` | varies | Damage enemy |
| `pass` | — | Do nothing |

---

## 🎨 Visual Legend

### Map Symbols

```
STRUCTURES:
  △ Village (1 VP)      ◇ Township (2 VP)      ⬡ City (3 VP)
  ◆ Beacon (1 VP)        ▢ Trade Post           ─ Road

TERRAIN:
  🌾 Plains          🌲 Forest          ⛰️ Mountains
  🌊 Rivers          🟣 Commons          🏜️ Wasteland

SPECIAL:
  🛡️2 = 2 armies (shield with count)
  ⬡⬡⬡ = Territory glow (agent color)
  ⚡→ = Resource flow (animated)
  🌾→🐟 = Trade animation
```

### Ecosystem Health

```
██████████  Green  - Flourishing (>70%)
██████░░░░ Yellow - Strained (30-70%)
██░░░░░░░░ Red   - Collapsed (<30%)
```

### Agent Colors (Example)

```
🔴 ALICE    - Red
🔵 BOB      - Blue
🟢 CHARLIE  - Green  
🟡 DAVE     - Yellow
🟣 EVE      - Purple
```

---

## 🎯 Strategy

### 🟢 Sustainable (Low Risk)

```
╭─────────────────────────────────────╮
│  🌱 EXTRACT WISELY                   │
│     • Stay under 70% capacity       │
│     • Trade for variety              │
│     • Build beacons for influence     │
│  ✅ RESULT: Stable VP, high trust    │
╰─────────────────────────────────────╯
```

### 🟡 Balanced (Medium Risk)

```
╭─────────────────────────────────────╮
│  ⚔️ STRATEGIC MILITARY              │
│     • Build 2-3 armies early        │
│     • Use for defense               │
│     •偶尔 Attack weak targets        │
│  ⚖️ RESULT: VP lead, some trust    │
╰─────────────────────────────────────╯
```

### 🔴 Aggressive (High Risk)

```
╭─────────────────────────────────────╮
│  💀 CONQUEST RUN                     │
│     • Mass armies ASAP               │
│     • Steal structures               │
│     • Over-extract commons           │
│  🚀 RESULT: Fast VP OR fast death    │
╰─────────────────────────────────────╯
```

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         🏟️ ARENA SERVER                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ╔═══════════════════════════════════════════════════════════╗  │
│   ║                    TragedyEngine                         ║  │
│   ╠═══════════════════════════════════════════════════════════╣  │
│   ║                                                           ║  │
│   ║   🗺️ WorldMap         🧠 TrustGraph       📜 ERC-8004    ║  │
│   ║   Hex Grid           EigenTrust        On-chain ID       ║  │
│   ║   Regions            Reputation         Cross-game rep     ║  │
│   ║   Ecosystems         Trust scores                         ║  │
│   ║                                                           ║  │
│   ║   🎮 TournamentManager                                    ║  │
│   ║   Hidden rounds • Unknown length • Shadow of future      ║  │
│   ║                                                           ║  │
│   ╚═══════════════════════════════════════════════════════════╝  │
│                              │                                 │
│                              ▼                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              📡 WEBSOCKET EVENTS                        │   │
│   │                                                           │   │
│   │   game.started → game.state_update → game.ended         │   │
│   │   round.start → trust.updated → crisis.triggered        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│              ┌───────────────┴───────────────┐                 │
│              ▼                               ▼                 │
│   ┌─────────────────────┐     ┌─────────────────────┐          │
│   │   🔭 OBSERVATORY    │     │   🤖 LLM AGENTS     │          │
│   │   (Frontend)        │     │   (AI Players)      │          │
│   │   Canvas rendering  │     │   Natural language   │          │
│   │   Live updates      │     │   Decision making   │          │
│   └─────────────────────┘     └─────────────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

```
1.  Open http://localhost:3000 (Observatory)

2.  Click "RUN SIMULATION" button

3.  Watch 4 AI agents:
    ├── Negotiate in chat
    ├── Build structures
    ├── Form alliances
    ├── Maybe betray...
    └── Race for VP

4.  Observe via:
    ├── 🗺️ Hex map (structures, armies, territory)
    ├── 📊 Sidebar (agents, resources, VP)
    ├── 💬 Live feed (chat, actions, trust updates)
    └── 📈 Trust matrix (agent relationships)
```

---

## ❓ FAQ

**Q: Why armies instead of a robber?**
> A: Strategy. You choose when to attack, costs resources, affects trust.

**Q: Why hidden rounds?**
> A: Prevents timing betrayal ("I'm about to win, time to screw everyone!")

**Q: Why tournament structure?**
> A: Shadow of the future. If you betray in Game 1, Game 2 will be harder.

**Q: How do I win?**
> A: VP from structures + prize pool share + longest road + crisis leadership = victory!

---

<div align="center">

### 🎭 Tragedy of the Commons

*Where individual rationality meets collective survival.*

**Extract. Build. Betray. Trust. Win.**

---

Made with 🎲 for the Coordination Olympiad

</div>
