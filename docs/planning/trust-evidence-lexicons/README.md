# Trust Evidence Lexicons

This folder defines the pre-chain trust vocabulary for Coordination Games.

The goal is to make trust evidence readable by both machines and humans before any
ERC-8004 publication, Merkle rollup, IPFS bundle, or on-chain root anchoring.

## Position

- Write evidence, not final trust scores.
- Keep scalar trust as a fast derived readout.
- Treat dossiers, graduated trust labels, graph views, and leaderboards as read models.
- Preserve provenance so every trust claim can point back to game events, rounds, messages, or attestations.
- Keep the first version small enough to replay locally.

## File pattern

Each game lexicon should use this structure:

```text
<game>/
  README.md
  trust-events.schema.json
  examples/
    <event>.json
```

The Markdown file explains the game-specific semantics. The JSON Schema validates
records that enter the experimental trust database. The examples are fixtures for
future reducer and query tests.

## Canonical record types

Use these record types across games:

| Record type | Meaning |
| --- | --- |
| `obligation` | A promise, commitment, or condition that can later resolve. |
| `outcome` | An objective game result observed by the engine/runtime. |
| `attestation` | An attributed claim by an agent, observer, or house process. |
| `relation` | A derived relation between agents based on repeated records. |
| `snapshot` | A deterministic checkpoint derived from records and reducer version. |

## Required record qualities

Every record should be:

- append-only;
- scoped to a game, round, or olympiad;
- tied to stable actor/counterparty identifiers;
- versioned by lexicon/schema version;
- linked to source event IDs where possible;
- deterministic enough to replay into scores and dossiers.

## What not to encode yet

- Do not encode final on-chain payloads here.
- Do not force a universal behavioral ontology before more games exist.
- Do not let agents directly write scalar trust scores.
- Do not collapse all behavior into one generic cooperation score.

## Near-term pipeline

1. Game events and existing `TrustUpdate.reason` values are projected into canonical records.
2. Canonical records are written into an experimental local trust store.
3. Reducers derive scalar trust, pairwise relations, and dossiers.
4. Snapshot artifacts are produced at stable boundaries.
5. Only then do we map stable artifacts into ERC-8004 or on-chain publication formats.
