# Comedy / Tragedy of the Commons Trust Evidence Lexicon

Lexicon version: `0.1.0`

This lexicon maps the Tragedy/Comedy runtime into canonical trust records. It is
the first pre-chain vocabulary for the local trust database.

## Game semantics

Comedy / Tragedy measures whether agents can coordinate under scarcity. Trust is
not just whether an agent wins; it is whether the agent preserves shared systems,
keeps commitments, reciprocates trade, contributes during crises, avoids sabotage,
and repairs harm.

## Evidence sources

| Source | Current code surface | Trust role |
| --- | --- | --- |
| Runtime outcome | `game_events` and action outcomes | Objective facts the engine observed. |
| Trust delta | `TrustUpdate.reason` | Compatibility signal for current scalar graph. |
| Commitment ledger | commitment records and attestations | Promises, fulfillment, breach, contestation. |
| Behavior tags | public agent behavior labels | Human/agent-readable context for dossiers. |
| Snapshot | future reducer output | Stable derived read model, not raw evidence. |

## Canonical event names

### Trade and reciprocity

| Canonical event | Record type | Current reason/source | Meaning |
| --- | --- | --- | --- |
| `trade.completed` | `outcome` | `completed_trade` | A negotiated trade settled successfully. |
| `trade.not_reciprocated` | `outcome` | `trade_not_reciprocated` | An expected reciprocal trade did not happen. |
| `cooperation.sustained` | `relation` | repeated completed trades | Repeated reciprocal trade crossed a cooperation threshold. |

### Crisis behavior

| Canonical event | Record type | Current reason/source | Meaning |
| --- | --- | --- | --- |
| `crisis.contributed` | `outcome` | crisis action/event | Actor contributed to a shared crisis response. |
| `crisis.co_contributor` | `relation` | `crisis_co_contributor` | Actors coordinated by contributing to the same crisis. |
| `crisis.free_ride` | `outcome` | `crisis_free_rider` | Actor benefited or remained exposed while not contributing. |
| `crisis.failed_with_noncontributors` | `outcome` | failed crisis resolution | Crisis failed with visible non-contributors. |

### Commons stewardship

| Canonical event | Record type | Current reason/source | Meaning |
| --- | --- | --- | --- |
| `commons.extracted` | `outcome` | `extract_commons` | Actor extracted from a shared ecosystem. |
| `commons.high_extraction` | `outcome` | high extraction profile | Actor applied high pressure to a shared ecosystem. |
| `commons.restored` | `outcome` | `restore_ecosystem` | Actor restored ecosystem health. |
| `commons.collapsed` | `outcome` | `commons_collapsed` | Shared ecosystem collapsed under extraction pressure. |
| `commons.restrained_extraction` | `outcome` | low/medium extraction with healthy outcome | Actor avoided extractive pressure when restraint mattered. |

### Sabotage and aggression

| Canonical event | Record type | Current reason/source | Meaning |
| --- | --- | --- | --- |
| `sabotage.executed` | `outcome` | sabotage action | Actor sabotaged another agent. |
| `sabotage.victim` | `outcome` | `sabotage_victim` | Subject was directly harmed by sabotage. |
| `sabotage.witnessed` | `outcome` | `sabotage_witness` | Other agents observed sabotage. |
| `conquest.executed` | `outcome` | `conquest` | Actor conquered or destroyed another agent's structure. |
| `aggression.witnessed` | `outcome` | `aggression` | Aggression was visible to others. |

### Commitments, attestations, and repair

| Canonical event | Record type | Current reason/source | Meaning |
| --- | --- | --- | --- |
| `commitment.detected` | `obligation` | commitment parser | A commitment-like promise was detected. |
| `commitment.fulfilled` | `outcome` | `attested_commitment_fulfilled` or objective evidence | Actor fulfilled a commitment. |
| `commitment.breached` | `outcome` | `attested_commitment_breached` or objective evidence | Actor breached a commitment. |
| `commitment.contested` | `attestation` | conflicting attestations | Commitment outcome is disputed or under-evidenced. |
| `attestation.promise_exists` | `attestation` | promise attestation | Agent claims a promise existed. |
| `attestation.promise_fulfilled` | `attestation` | fulfill attestation | Agent claims a promise was fulfilled. |
| `attestation.promise_breached` | `attestation` | breach attestation | Agent claims a promise was breached. |
| `attestation.dispute` | `attestation` | contest attestation | Agent disputes another claim. |
| `repair.attempted` | `outcome` | future repair event | Actor attempted to repair prior harm. |
| `repair.completed` | `outcome` | payout receipt or future repair event | Actor completed meaningful repair. |

### Provisional alliance events

These are useful but should remain provisional until alliance rules are fully
formalized across games.

| Canonical event | Record type | Current reason/source | Meaning |
| --- | --- | --- | --- |
| `alliance.formed` | `relation` | `alliance.formed` | Repeated cooperation produced an alliance relation. |
| `alliance.broken` | `relation` | `alliance.broken` | An alliance was broken by later behavior. |

## Record conventions

- `actor` is the agent responsible for the behavior.
- `subject` is the affected agent, if any.
- `counterparty` is the cooperating or promised-to agent, if any.
- `trustDelta` is optional compatibility metadata, not the canonical fact.
- `payload` holds game-specific details such as resource, ecosystem, crisis, commitment, or structure IDs.
- `provenance.sourceEventIds` should point to persisted `game_events.id` values once available.
- `provenance.verification` should prefer `deterministic` for engine-observed facts and `attested` or `contested` for social claims.

## Reducer guidance

The first reducer should preserve separate dimensions instead of collapsing them:

- reciprocal trade;
- crisis contribution;
- commons stewardship;
- commitment reliability;
- sabotage/aggression risk;
- repair history;
- association/alliance context.

Scalar trust can still be derived for compatibility with the current graph, but
the dossier should expose these dimensions independently.
