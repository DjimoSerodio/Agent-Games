# Agent Handoff — Comedy of the Commons

## What This Project Is

An AI Agent Coordination Olympiad game (Catan-like). Agents negotiate, trade, build on a hex board, and manage shared ecosystems. The project has a Node.js backend (COMPLETE, don't touch) and a React frontend (IN PROGRESS).

## Current State

### Backend — DONE, DO NOT MODIFY
- Location: `arena/src/`
- 115/115 tests passing
- Comedy engine, PostgreSQL persistence, event sourcing, REST API, MCP server
- WebSocket server at `localhost:3000` pushes game state updates
- Run with: `cd arena && npm run dev`

### Frontend — ACTIVE WORK
- Location: `arena/frontend/`
- React 19 + Tailwind CSS v4 + Zustand + Vite 8
- Build: `cd arena/frontend && npm run build`
- Preview: `npm run preview -- --port 4173`
- Dev: `npm run dev` (port 5173, proxies /api to localhost:3000)

### What's Working
- Canvas 2D hex board with 9-layer rendering pipeline (shadow→gradient→glow→texture→pulse→border→symbol→label→badge)
- All panels: TopBar, GameBoard, PowerTable, ChatFeed, TrustGraph, CommitmentLedger, CrisisBanner, WorldHealthSidebar
- WebSocket connection to backend, Zustand state management
- 12-column CSS grid layout, responsive breakpoints
- Proper padding/spacing (was broken by a CSS cascade layers bug — now fixed)

## CRITICAL: CSS Cascade Layers Bug (SOLVED — DON'T REINTRODUCE)

Tailwind v4 uses `@layer utilities { }` for all utility classes. If you put `* { padding: 0; margin: 0; }` OUTSIDE of `@layer`, it silently overrides ALL Tailwind padding/margin utilities because unlayered CSS beats layered CSS. The fix was removing `margin: 0; padding: 0;` from the `*` rule in `index.css`. Tailwind v4's preflight handles resets inside `@layer base`.

**NEVER add unlayered CSS resets that conflict with Tailwind utilities.**

## Design Language — PRESERVE EXACTLY

The UI uses a specific dark observatory aesthetic. Do NOT change:
- Color palette: defined as CSS variables in `arena/frontend/src/index.css` (:root block)
- Fonts: Baskerville (serif for headings/values), SFMono (mono for labels), Avenir Next (sans for body)
- Panel style: `border border-[var(--color-line)] rounded-[var(--radius-xl)] bg-gradient-to-b from-[rgba(12,24,36,0.92)] to-[rgba(8,16,24,0.86)] shadow-[var(--shadow)] backdrop-blur-[16px]`
- Header style within panels: `p-6 px-7 border-b border-[var(--color-line)] bg-gradient-to-b from-[rgba(24,40,56,0.86)] to-[rgba(10,18,28,0.48)]`
- Gold accents for emphasis: `var(--color-gold)` / `#ddb469`
- Label style: `font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-soft)]`

## Design Reference

The original Observatory at `arena/public/index.html` (4,234 lines) is the gold standard. When unsure about visual style, extract values from there.

## Layout Structure (App.tsx)

```
TopBar (header + 6 metric cards in a row)
Row 1: [Board Section: 9 cols] [Power Table: 3 cols]
  Board Section contains: [Canvas Map | WorldHealthSidebar]
Row 2: [Chat: 4 cols] [Commitments: 5 cols] [Trust: 3 cols]
```

## Key Files

| File | Purpose |
|------|---------|
| `arena/frontend/src/App.tsx` | Main layout grid |
| `arena/frontend/src/index.css` | CSS variables, Tailwind theme, body background |
| `arena/frontend/src/store.ts` | Zustand game state store |
| `arena/frontend/src/hooks/useGameSocket.ts` | WebSocket event handler |
| `arena/frontend/src/components/GameBoard.tsx` | Canvas 2D hex renderer |
| `arena/frontend/src/components/TopBar.tsx` | Header + metric cards |
| `arena/frontend/src/components/PowerTable.tsx` | Player rankings |
| `arena/frontend/src/components/ChatFeed.tsx` | Message feed |
| `arena/frontend/src/components/TrustGraph.tsx` | Trust matrix grid |
| `arena/frontend/src/components/CommitmentLedger.tsx` | Promises + attestations |
| `arena/frontend/src/components/CrisisBanner.tsx` | Crisis overlay on board |
| `arena/frontend/src/components/WorldHealthSidebar.tsx` | Ecosystem health bars |
| `arena/frontend/src/lib/hex-math.ts` | Pointy-top hex geometry |
| `arena/frontend/src/lib/colors.ts` | Biome/resource color mapping |
| `arena/frontend/src/lib/format.ts` | Agent name formatting |

## What The User Wants Next

1. **Beautify the hex map** — make it look like Polytopia/Catan/Civilization. The Canvas 2D renderer in GameBoard.tsx has 9 layers but currently renders flat colored hexes. Next step is terrain textures, structure sprites, ecosystem overlays, trade route animations.

2. **Keep spacing/proportions good** — header is compact, metric cards are compact, map is large, sidebar panels fill remaining space.

3. **Eventually**: human player controls (build UI, trade panel, chat input), spectator overlay, prediction markets.

## Technical Gotchas

1. **GameBoard.tsx uses refs to avoid stale closures** — the animation loop uses `hexesRef.current`, `prodRef.current`, `hoverRef.current`, `selRef.current` instead of state directly. This is intentional — don't "fix" it to use state.

2. **Backend sends `agentStates` not `agents`** — the WebSocket `state_update` event uses `agentStates` which gets mapped to `agents` in the store. The `hex` field in state updates has format `{ id, biome, primaryResource, center, polygon, ecosystemIds }`.

3. **Tailwind v4 specifics** — no `tailwind.config.js`. Config is via `@theme` in `index.css` and `@tailwindcss/vite` plugin. Arbitrary values work: `p-[24px]`, `bg-[rgba(12,24,36,0.92)]`.

4. **Build before preview** — `npm run build && npm run preview -- --port 4173`. The dev server on 5173 can cache aggressively; production preview is more reliable for visual verification.

5. **The `items-start` on the board grid** prevents the WorldHealthSidebar from stretching the canvas container vertically when ecosystem data loads.

## Provider Config

The `oh-my-openagent.json` has been reconfigured to maximize minimax-m2.7 usage. Codex 5.4 is the orchestrator. Only `ultrabrain` and `artistry` categories use codex, everything else uses minimax. Oracle uses codex at xhigh for architecture decisions.
