# Learnings — performance-next-phase-8004

## Session Init
- Plan: performance-next-phase-8004.md
- Goal: Complete Tasks 8 and 9 (F1 audit caught these as incomplete)
- Tasks 1-7: already verified complete
- F1 audit: APPROVED WITH DEVIATIONS — 7/9 tasks, Tasks 8+9 missing

## Task 8 Context
- Task 7 added read models to store.ts: AgentIdentity, AttestationReadiness, AgentParticipationReadiness
- Need to surface these in bounded UI panels/cards
- Reuse existing card system — do NOT expand layout
- No live chain or MCP activation
- Evidence: .sisyphus/evidence/task-8-readiness-surfaces.{txt,json,png}

## Task 9 Context
- Contract boundary documentation
- Distinguish spectator-only vs future player/agent participation
- Comedy-specific vs reusable cross-game contracts
- Evidence: .sisyphus/evidence/task-9-next-phase-handoff.{txt,md}

## Guardrails (must honor)
- No prediction-market UI
- No live ERC-8004 registration or EAS publication
- No MCP transport expansion
- No full PixiJS rewrite
- No layout expansion (keep board dominant)

## Task 8 Completed (2026-04-05)
- Created IdentityCard.tsx and ParticipationCard.tsx using existing card shell pattern
- Added createReadinessFixture() to fixtures.ts for test data
- App.tsx Row 3 now displays IdentityCard + ParticipationCard side by side
- Build passed ✓
- Fixed import style: named exports vs default exports issue
- Removed unnecessary comments (section labels)
- Removed unused formatTimestamp function from ParticipationCard

## Task 9 In Progress
- Need to create handoff contract document for spectator-only, player/agent participation, MCP BYOA patterns
