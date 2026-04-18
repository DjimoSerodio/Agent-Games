import type {
  GameId,
  GamePhase,
  RoundId,
  TrustEvidence,
  TrustEvidenceType,
  TrustUpdate,
} from "../core/types.js";

export interface TrustEvidenceMeta {
  gameId: GameId;
  round?: RoundId;
  phase?: GamePhase | string;
  timestamp?: number;
  refs?: TrustEvidence["refs"];
  payload?: Record<string, unknown>;
}

const REASON_TO_TYPE: Record<string, TrustEvidenceType> = {
  completed_trade: "trade.completed",
  trade_not_reciprocated: "trade.not_reciprocated",
  conquest: "conquest.executed",
  aggression: "aggression.witnessed",
  sabotage_victim: "sabotage.executed",
  sabotage_witness: "aggression.witnessed",
  commons_collapsed: "commons.collapsed",
  crisis_co_contributor: "crisis.contributed",
  crisis_free_rider: "crisis.free_ride",
  attested_commitment_fulfilled: "attestation.promise_fulfilled",
  attested_commitment_breached: "attestation.promise_breached",
  "Conflicting attestations or insufficient proof": "attestation.contested",
};

export function mapTrustReasonToEvidenceType(reason: string): TrustEvidenceType {
  return REASON_TO_TYPE[reason] ?? "trust.delta";
}

export function trustUpdateToEvidence(
  update: TrustUpdate,
  meta: TrustEvidenceMeta,
  sequence: number,
): TrustEvidence {
  return {
    id: `${meta.gameId}:trust:${sequence}`,
    gameId: meta.gameId,
    round: meta.round,
    phase: meta.phase,
    timestamp: meta.timestamp ?? Date.now(),
    type: mapTrustReasonToEvidenceType(update.reason),
    actor: update.from,
    subject: update.to,
    counterparty: update.from,
    reasonCode: update.reason,
    weightHint: Math.abs(update.delta),
    refs: meta.refs ?? {},
    payload: {
      delta: update.delta,
      ...(meta.payload ?? {}),
    },
  };
}
