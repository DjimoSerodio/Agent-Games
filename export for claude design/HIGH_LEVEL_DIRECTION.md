# Claude Design Export Brief

## What this export is for
This folder packages the current shell/front-end files and narrative context for a major design/brand/UI/UX pass.

## Primary objective
Redesign the Coordination Games shell so it feels like a high-tech, premium, motion-rich coordination command platform.

## Core concept
**Swarm Command**
- dark atmospheric base
- luminous telemetry accents
- subtle but ever-present agent-swarm / flocking motion
- premium command-center glass and layered shells
- shell feels alive, tactical, and epic

## Product-layer separation
Keep these layers separate:

### Platform / shell copy
Use shell pages to explain:
- Coordination Games as the AI Agent Coordination Olympiad
- trust infrastructure / proving ground framing
- install / join / watch / replay onboarding
- flagship arenas overview
- why coordination matters

### Game-specific copy
Keep Tragedy-specific detail on game-specific surfaces:
- commons/ecosystem crisis framing
- trust, promises, betrayal mechanics
- game world and rules
- detailed spectator explanations

Do **not** let Tragedy become the entire shell identity.

## First implementation slice
Prioritize these files first:
1. `packages/web/src/games/manifest.ts`
2. `packages/web/src/index.css`
3. `packages/web/src/components/Layout.tsx`
4. `packages/web/src/pages/HomePage.tsx`

Second wave:
- `packages/web/src/pages/LobbiesPage.tsx`
- `packages/web/src/pages/LobbyPage.tsx`
- `packages/web/src/components/lobby/JoinInstructions.tsx`
- adjacent lobby components

Keep plugin spectator views mostly unchanged in the first pass.

## UX / onboarding priorities
- Make install/join instructions copy-pasteable and obvious
- Show how a user or agent gets from curiosity to participation quickly
- Preserve replay and lobby discoverability
- Make the shell feel premium without hurting clarity

## Motion direction
- spring-based motion only
- living swarm fields in hero / shell backgrounds
- staggered reveals
- telemetry pulses and subtle route transitions
- motion should support orientation, not distract from usability

## References already considered
- `docs/MASTER_NARRATIVE.md` for shell thesis and platform framing
- `GO.md` for shell/lobby/replay historical direction
- beads epic `Coordination game-nki` as the correct umbrella for shell redesign
- beads task `Coordination game-9po` for this shell foundation redesign slice
- external inspiration repos:
  - `taste-skill`
  - `ui-ux-pro-max-skill`

## Important constraints
- Keep the shell/platform layer separate from game-detail surfaces
- Do not over-platformize replay to the point that it erases game identity
- Avoid generic SaaS aesthetics and generic AI purple-gradient design
- Do not rewrite plugin-owned spectator views in the first pass unless strictly necessary
