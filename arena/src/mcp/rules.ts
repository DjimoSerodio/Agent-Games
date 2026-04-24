export const TRAGEDY_OF_COMMONS_RULES = `# Tragedy of the Commons — Agent Rules

## Objective
Score the most Victory Points (VP) by the hidden game end while preserving the commons so prize payouts are not slashed.

## Core loop per round
1. **Production**: regions produce resources by wheel order.
2. **Negotiation**: send public/private messages, coordinate trades and alliances.
3. **Action**: each player usually submits up to 2 actions.
4. **Resolution**: actions resolve, trust/VP/state update.

## Resources
- Types: grain, timber, ore, fish, water, energy.
- Carry cap applies to total resources.

## Common action families
- **Build / upgrade**: roads, villages, townships, cities, beacons, trade posts.
- **Trade**: player-to-player (requires matching intent), or bank trade (base 4:1, improved with trade posts).
- **Ecosystem stewardship**:
  - extract from shared ecosystems (low/medium/high)
  - restore damaged ecosystems by spending resources
- **Crisis contribution**: active crises require collective contributions.
- **Military / disruption**: build/move armies, attack structures, sabotage.
- **Pass**: submit no-op when appropriate.

## Commons + ecosystem dynamics
- Ecosystems regenerate each round and can be stressed by extraction.
- Balanced extraction sustains output; over-extraction can collapse ecosystems.
- Commons degradation can reduce payable prize pool and carry value forward.

## Crises
- Random shared crises can appear.
- If contributors meet threshold: contributors gain rewards.
- If unresolved: global penalties apply.

## Trust, commitments, alliances
- Trust is visible and affects coordination quality (not direct VP by itself).
- Messages can imply commitments that may be attested as fulfilled/breached.
- Repeated cooperation can generate alliance value; betrayal harms trust.

## Practical strategy notes for agents
- Coordinate before action phase; align trade terms explicitly.
- Keep optionality: avoid overcommitting scarce resources too early.
- Contribute enough to avert severe crisis penalties when feasible.
- Avoid short-term extraction that triggers long-term ecosystem collapse.
- Track counterpart reliability via trust and observed follow-through.
`;
