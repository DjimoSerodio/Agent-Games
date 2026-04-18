import type { AgentId, GraduatedTrustProjection, TrustDossier } from "../../core/types.js";
import type {
  AttestationRecord,
  BehaviorMemoryObligation,
  BehaviorMemoryOutcome,
  BehaviorMemoryRelation,
  BehaviorMemorySnapshot,
  BehaviorTag,
  ComedyGameState,
  CommitmentRecord,
  ContestedClaim,
  PayoutReceipt,
} from "./types.js";

function isRelevantCommitment(commitment: CommitmentRecord, agentId?: AgentId): boolean {
  if (!agentId) return true;
  return commitment.promisor === agentId || commitment.counterparties.includes(agentId);
}

function mapObligation(commitment: CommitmentRecord): BehaviorMemoryObligation {
  return {
    id: commitment.id,
    type: commitment.type,
    promisor: commitment.promisor,
    counterparties: [...commitment.counterparties],
    summary: commitment.summary,
    scope: commitment.scope,
    resolutionStatus: commitment.resolutionStatus,
    dueByRound: commitment.dueByRound,
    resolvedRound: commitment.resolvedRound,
    contested: commitment.contested,
    payoutShareBps: commitment.payoutShareBps,
    behaviorTags: commitment.behaviorTags.map((tag) => tag.kind),
  };
}

function buildOutcomeRecords(
  commitments: CommitmentRecord[],
  payoutReceipts: PayoutReceipt[],
  behaviorTags: BehaviorTag[],
  agentId?: AgentId,
): BehaviorMemoryOutcome[] {
  const evidenceOutcomes = commitments
    .filter((commitment) => isRelevantCommitment(commitment, agentId))
    .flatMap((commitment) =>
      commitment.evidence.map((evidence) => ({
        id: evidence.id,
        kind: "evidence" as const,
        sourceType: evidence.type,
        round: evidence.round,
        actorId: evidence.actorId,
        counterparties: commitment.counterparties.filter((id) => id !== evidence.actorId),
        summary: evidence.summary,
        refs: [commitment.id, evidence.ref],
      })),
    );

  const payoutOutcomes = payoutReceipts
    .filter((receipt) => !agentId || receipt.from === agentId || receipt.to === agentId)
    .map((receipt) => ({
      id: receipt.id,
      kind: "payout_receipt" as const,
      sourceType: "payout_receipt",
      round: receipt.round,
      actorId: receipt.from,
      counterparties: [receipt.to],
      summary: receipt.amountWei
        ? `${receipt.from} submitted payout receipt to ${receipt.to} for ${receipt.amountWei} wei`
        : `${receipt.from} submitted payout receipt to ${receipt.to}`,
      refs: [receipt.commitmentId, receipt.proof],
    }));

  const tagOutcomes = behaviorTags
    .filter((tag) => !agentId || tag.actor === agentId || tag.relatedAgentId === agentId)
    .map((tag) => ({
      id: tag.id,
      kind: "behavior_tag" as const,
      sourceType: tag.kind,
      round: tag.round,
      actorId: tag.actor,
      counterparties: tag.relatedAgentId ? [tag.relatedAgentId] : [],
      summary: tag.description,
      refs: [],
    }));

  return [...evidenceOutcomes, ...payoutOutcomes, ...tagOutcomes].sort((a, b) => b.round - a.round);
}

function buildRelationRecords(
  state: ComedyGameState,
  obligations: CommitmentRecord[],
  contestedClaims: ContestedClaim[],
  agentId: AgentId | undefined,
  dossier?: TrustDossier,
  projection?: GraduatedTrustProjection,
): BehaviorMemoryRelation[] {
  const relations: BehaviorMemoryRelation[] = [];

  if (agentId && dossier) {
    for (const counterparty of dossier.counterparties) {
      relations.push({
        kind: "counterparty",
        primaryAgentId: agentId,
        secondaryAgentId: counterparty.agentId,
        summary: `${counterparty.agentId} appears in ${counterparty.interactions} prior trust interactions`,
        strength: counterparty.trustScore,
        refs: [],
      });
    }
  }

  for (const claim of contestedClaims) {
    const obligation = obligations.find((item) => item.id === claim.commitmentId);
    if (!obligation) continue;
    relations.push({
      kind: "contest",
      primaryAgentId: claim.actor,
      secondaryAgentId: obligation.promisor,
      round: claim.round,
      summary: claim.reason,
      refs: [claim.commitmentId, ...claim.evidenceRefs],
    });
  }

  const allianceEntries = agentId
    ? Array.from(state.allianceCooperationRounds.get(agentId)?.entries() ?? [])
    : [];
  for (const [partnerId, roundsOfCooperation] of allianceEntries) {
    if (roundsOfCooperation <= 0) continue;
    relations.push({
      kind: "alliance",
      primaryAgentId: agentId!,
      secondaryAgentId: partnerId,
      summary: `${partnerId} has ${roundsOfCooperation} rounds of sustained cooperation with ${agentId}`,
      strength: roundsOfCooperation,
      refs: [],
    });
  }

  if (agentId && projection && projection.associationRisk.relatedAgents.length > 0) {
    for (const relatedAgent of projection.associationRisk.relatedAgents) {
      relations.push({
        kind: "association_risk",
        primaryAgentId: agentId,
        secondaryAgentId: relatedAgent,
        summary: projection.associationRisk.rationale.find((item) => item.startsWith(`${relatedAgent}:`)) ?? `${relatedAgent} contributes to association risk`,
        strength: projection.associationRisk.score,
        refs: [],
      });
    }
  }

  return relations;
}

export function buildBehaviorMemorySnapshot(
  state: ComedyGameState,
  agentId?: AgentId,
  dossier?: TrustDossier,
  projection?: GraduatedTrustProjection,
): BehaviorMemorySnapshot {
  const obligations = state.commitments.filter((commitment) => isRelevantCommitment(commitment, agentId));
  const obligationIds = new Set(obligations.map((item) => item.id));
  const attestations = state.attestations.filter(
    (attestation) => !agentId || attestation.actor === agentId || obligationIds.has(attestation.commitmentId),
  );
  const contestedClaims = state.contestedClaims.filter(
    (claim) => !agentId || claim.actor === agentId || obligationIds.has(claim.commitmentId),
  );

  return {
    ...(agentId ? { agentId } : {}),
    obligations: obligations.map(mapObligation),
    outcomes: buildOutcomeRecords(obligations, state.payoutReceipts, state.behaviorTags, agentId),
    attestations: attestations.map((attestation) => ({ ...attestation, evidenceRefs: [...attestation.evidenceRefs] })),
    relations: buildRelationRecords(state, obligations, contestedClaims, agentId, dossier, projection),
    updatedAt: Date.now(),
  };
}

export function buildBehaviorMemoryByAgent(
  state: ComedyGameState,
  dossiers: Record<AgentId, TrustDossier>,
  projections: Record<AgentId, GraduatedTrustProjection>,
): Record<AgentId, BehaviorMemorySnapshot> {
  const result = {} as Record<AgentId, BehaviorMemorySnapshot>;
  for (const agentId of state.players) {
    result[agentId] = buildBehaviorMemorySnapshot(state, agentId, dossiers[agentId], projections[agentId]);
  }
  return result;
}
