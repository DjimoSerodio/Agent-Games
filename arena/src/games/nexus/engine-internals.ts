import { AgentId, TrustUpdate } from "../../core/types.js";
import { computeCommonsHealthRefresh } from "./ecosystem.js";
import { projectVisibleBehaviorTags } from "./behavior-view.js";
import { BehaviorTag, CommitmentRecord, CommonsHealthSnapshot, EvidenceRef, ResourceInventory, ResourceType, RESOURCE_NAMES } from "./types.js";
import { resolveSingleCommitment as resolveSingleCommitmentFn } from "./commitment.js";

export function resolveSingleCommitment(ctx: any, commitment: CommitmentRecord): TrustUpdate[] {
  if (commitment.type === "prize_share") {
    const hasPayoutReceipt = commitment.evidence.some((item) => item.type === "payout_receipt");
    const conditionalWin = commitment.conditions.find((item) => item.type === "if_i_win");
    if (!hasPayoutReceipt && conditionalWin && ctx.state.winner && ctx.state.winner !== commitment.promisor) {
      ctx.appendEvidence(
        commitment,
        "winner",
        ctx.state.winner,
        `${commitment.promisor} did not win the game`,
        ctx.state.round,
        ctx.state.winner,
      );
    }
  }

  const previousStatus = commitment.resolutionStatus;
  const trustUpdates = resolveSingleCommitmentFn(commitment, ctx.state, () => `contested-${ctx.contestedCounter++}`);
  if (previousStatus !== commitment.resolutionStatus && commitment.resolutionStatus !== "pending") {
    ctx.emitEvent("commitment.resolved", {
      commitmentId: commitment.id,
      status: commitment.resolutionStatus,
      summary: commitment.summary,
      evidence: commitment.evidence,
      attestations: commitment.attestations,
    }, { agents: "all", spectators: true });
  }
  return trustUpdates;
}

export function finalizePostGameCommitments(ctx: any): void {
  if (!ctx.state.winner) return;
  const trustUpdates: TrustUpdate[] = [];
  for (const commitment of ctx.state.commitments) {
    if (commitment.resolutionStatus === "pending") trustUpdates.push(...ctx.resolveSingleCommitment(commitment));
  }
  ctx.applyImmediateTrustUpdates(trustUpdates);
}

export function applyImmediateTrustUpdates(ctx: any, trustUpdates: TrustUpdate[]): void {
  if (trustUpdates.length === 0) return;
  ctx.trustGraph.applyUpdates(trustUpdates, ctx.state.gameId);
  ctx.trustGraph.tick();
  ctx.emitEvent("trust.updated", { updates: trustUpdates, snapshots: ctx.trustGraph.getAllSnapshots() }, { agents: "all", spectators: true });
}

export function getVisibleCommitments(ctx: any, agentId: AgentId): CommitmentRecord[] {
  return ctx.state.commitments.filter((commitment: CommitmentRecord) =>
    commitment.visibility === "public" || commitment.promisor === agentId || commitment.counterparties.includes(agentId),
  );
}

export function getVisibleAttestations(ctx: any, agentId: AgentId) {
  const visibleIds = new Set(getVisibleCommitments(ctx, agentId).map((item) => item.id));
  return ctx.state.attestations.filter((attestation: any) =>
    visibleIds.has(attestation.commitmentId) || attestation.actor === agentId,
  );
}

export function canActorAttest(_ctx: any, commitment: CommitmentRecord, actor: AgentId): boolean {
  if (actor === commitment.promisor) return true;
  if (commitment.counterparties.includes(actor)) return true;
  return commitment.visibility === "public" && commitment.counterparties.length === 0;
}

export function computeAttestationWeight(ctx: any, commitment: CommitmentRecord, actor: AgentId): number {
  const relevance = actor === commitment.promisor ? 1 : commitment.counterparties.includes(actor) ? 0.95 : 0.45;
  const reliability = 0.5 + ctx.trustGraph.getGlobalScore(actor) * 0.5;
  return Math.round(relevance * reliability * 100) / 100;
}

export function appendEvidence(
  ctx: any,
  commitment: CommitmentRecord,
  type: EvidenceRef["type"],
  ref: string,
  summary: string,
  round: number,
  actorId?: AgentId,
): EvidenceRef {
  const existing = commitment.evidence.find((item) => item.type === type && item.ref === ref);
  if (existing) return existing;
  const evidence: EvidenceRef = { id: `evidence-${ctx.evidenceCounter++}`, type, ref, summary, round, actorId };
  commitment.evidence.push(evidence);
  return evidence;
}

export function recordBehaviorTag(
  ctx: any,
  actor: AgentId,
  kind: BehaviorTag["kind"],
  relatedAgentId: AgentId | undefined,
  description: string,
  severity: BehaviorTag["severity"],
  trustDeltaHint?: number,
): BehaviorTag {
  const tag: BehaviorTag = {
    id: `behavior-${ctx.behaviorCounter++}`,
    round: ctx.state.round,
    actor,
    kind,
    severity,
    description,
    relatedAgentId,
    trustDeltaHint,
  };
  ctx.state.behaviorTags.push(tag);
  const [visibleTag] = projectVisibleBehaviorTags([tag]);
  if (visibleTag) {
    ctx.emitEvent("behavior.tagged", visibleTag, { agents: "all", spectators: true });
  }
  return tag;
}

export function refreshCommonsHealth(ctx: any): void {
  const ecosystemHealth = computeCommonsHealthRefresh(ctx.state.ecosystems);
  const { ecosystemAverage, collapsed, strained, flourishing } = ecosystemHealth;
  const failedCrises = ctx.state.crisisHistory.filter((crisis: any) => !crisis.resolved).length;
  const sabotageCount = ctx.state.behaviorTags.filter((tag: any) => tag.kind === "sabotage").length;

  let score = ecosystemAverage;
  score -= strained * 5;
  score -= collapsed * 12;
  score -= failedCrises * 10;
  score -= sabotageCount * 5;
  score = Math.max(0, Math.min(100, score));

  const payableFraction = score / 100;
  const payablePrizePool = applyFractionToBigInt(ctx.state.prizePool, payableFraction);
  const slashedPrizePool = ctx.state.prizePool - payablePrizePool;
  const reasons: string[] = [`${ecosystemAverage} avg ecosystem health`];
  if (flourishing > 0) reasons.push(`${flourishing} ecosystems flourishing`);
  if (strained > 0) reasons.push(`${strained} ecosystems strained`);
  if (collapsed > 0) reasons.push(`${collapsed} ecosystems collapsed`);
  if (failedCrises > 0) reasons.push(`${failedCrises} failed crises`);
  if (sabotageCount > 0) reasons.push(`${sabotageCount} sabotage incidents`);
  if (reasons.length === 0) reasons.push("Commons stable");

  const snapshot = buildCommonsHealthSnapshot(ctx.state.round, score, reasons, payablePrizePool, slashedPrizePool, ctx.state.carryoverPrizePool);
  ctx.state.currentCommonsHealth = snapshot;

  const last = ctx.state.commonsHealthHistory[ctx.state.commonsHealthHistory.length - 1];
  if (!last || last.round !== snapshot.round) ctx.state.commonsHealthHistory.push(snapshot);
  else ctx.state.commonsHealthHistory[ctx.state.commonsHealthHistory.length - 1] = snapshot;
}

export function finalizePrizePool(ctx: any): void {
  refreshCommonsHealth(ctx);
  const fraction = ctx.state.currentCommonsHealth.payableFraction;
  ctx.state.payablePrizePool = applyFractionToBigInt(ctx.state.prizePool, fraction);
  ctx.state.slashedPrizePool = ctx.state.prizePool - ctx.state.payablePrizePool;
  ctx.state.carryoverPrizePool = ctx.state.slashedPrizePool;
  ctx.constructor.pendingPrizeCarryoverWei = ctx.state.carryoverPrizePool;

  ctx.state.currentCommonsHealth = buildCommonsHealthSnapshot(
    ctx.state.round,
    ctx.state.currentCommonsHealth.score,
    ctx.state.currentCommonsHealth.reasons,
    ctx.state.payablePrizePool,
    ctx.state.slashedPrizePool,
    ctx.state.carryoverPrizePool,
  );

  ctx.emitEvent("prize.slashed", {
    prizePoolWei: ctx.state.prizePool.toString(),
    payablePrizePoolWei: ctx.state.payablePrizePool.toString(),
    slashedPrizePoolWei: ctx.state.slashedPrizePool.toString(),
    carryoverPrizePoolWei: ctx.state.carryoverPrizePool.toString(),
    commonsHealth: ctx.state.currentCommonsHealth,
  }, { agents: "all", spectators: true });
}

export function buildCommonsHealthSnapshot(
  round: number,
  score: number,
  reasons: string[],
  payablePrizePool: bigint,
  slashedPrizePool: bigint,
  carryoverPrizePool: bigint,
): CommonsHealthSnapshot {
  return {
    round,
    score,
    payableFraction: Math.max(0, Math.min(1, score / 100)),
    reasons,
    payablePrizePoolWei: payablePrizePool.toString(),
    slashedPrizePoolWei: slashedPrizePool.toString(),
    carryoverPrizePoolWei: carryoverPrizePool.toString(),
  };
}

export function applyFractionToBigInt(value: bigint, fraction: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10000, Math.round(fraction * 10000))));
  return (value * bps) / 10000n;
}

export function getScarcestResource(resources: ResourceInventory): ResourceType {
  return RESOURCE_NAMES.reduce((min, r) => (resources[r] < resources[min] ? r : min));
}
