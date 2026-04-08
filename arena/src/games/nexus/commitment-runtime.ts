import { AgentId, Message, TrustUpdate } from "../../core/types.js";
import { AttestationRecord, AttestationVerdict, CommitmentRecord, PayoutReceipt, ResourceInventory } from "./types.js";
import { detectCommitmentInMessage, parseAttestationMessage } from "./commitment.js";

export function processMessagesForLedger(ctx: any, messages: Message[]): void {
  for (const message of messages) {
    detectCommitmentFromMessage(ctx, message);
    detectAttestationFromMessage(ctx, message);
  }
}

export function detectCommitmentFromMessage(ctx: any, message: Message): void {
  const lower = message.content.toLowerCase();
  const candidate = detectCommitmentInMessage(
    message,
    ctx.state.round,
    ctx.candidateCounter,
    Boolean(ctx.state.activeCrisis),
  );
  if (!candidate) return;

  const duplicate = ctx.state.commitments.find((item: CommitmentRecord) =>
    item.promisor === message.sender &&
    item.type === candidate.type &&
    item.round === message.round &&
    item.summary === candidate.summary,
  );
  if (duplicate) return;

  ctx.candidateCounter += 1;
  ctx.state.commitmentCandidates.push(candidate);

  const commitment: CommitmentRecord = {
    ...candidate,
    id: `commitment-${ctx.commitmentCounter++}`,
    candidateId: candidate.id,
    promisor: message.sender,
    resolutionStatus: "pending",
    attestations: [],
    evidence: [],
    dueByRound: ctx.inferDueRound(candidate.type, candidate.conditions),
    resolvedRound: null,
    contested: false,
    payoutShareBps: ctx.extractPayoutShareBps(lower),
    behaviorTags: [],
  };

  ctx.appendEvidence(
    commitment,
    "message",
    message.id,
    `Extracted from ${message.type} message`,
    message.round,
    message.sender,
  );

  ctx.state.commitments.push(commitment);
  ctx.emitEvent("commitment.detected", { candidate, commitment }, { agents: "all", spectators: true });
}

export function detectAttestationFromMessage(ctx: any, message: Message): void {
  const lower = message.content.toLowerCase();
  const match = lower.match(/\bcommitment-(\d+)\b/);
  if (!match) return;

  const commitmentId = `commitment-${match[1]}`;
  const commitment = ctx.state.commitments.find((item: CommitmentRecord) => item.id === commitmentId);
  if (!commitment || !ctx.canActorAttest(commitment, message.sender)) return;

  const parsed = parseAttestationMessage(lower);
  if (!parsed) return;

  const evidenceRefs: string[] = [];
  const txMatch = message.content.match(/0x[a-fA-F0-9]{8,}/);
  if (txMatch) {
    const evidence = ctx.appendEvidence(
      commitment,
      "payout_receipt",
      txMatch[0],
      `Message-attached proof ${txMatch[0]}`,
      message.round,
      message.sender,
    );
    evidenceRefs.push(evidence.id);
  }

  const attestation = createAttestationRecord(
    ctx,
    commitment,
    message.sender,
    parsed.phase,
    parsed.verdict,
    message.content.trim().slice(0, 160),
    evidenceRefs,
  );
  if (!attestation) return;

  const trustUpdates = ctx.resolveSingleCommitment(commitment);
  ctx.applyImmediateTrustUpdates(trustUpdates);
}

export function createAttestationRecord(
  ctx: any,
  commitment: CommitmentRecord,
  actor: AgentId,
  phase: "existence" | "fulfillment",
  verdict: AttestationVerdict,
  detail: string,
  evidenceRefs: string[],
): AttestationRecord | null {
  const alreadyExists = commitment.attestations.some((item) => item.actor === actor && item.phase === phase);
  if (alreadyExists) return null;

  const attestation: AttestationRecord = {
    id: `attestation-${ctx.attestationCounter++}`,
    commitmentId: commitment.id,
    actor,
    round: ctx.state.round,
    phase,
    verdict,
    detail,
    evidenceRefs,
    weight: ctx.computeAttestationWeight(commitment, actor),
    accepted: true,
  };

  commitment.attestations.push(attestation);
  ctx.state.attestations.push(attestation);
  ctx.emitEvent("commitment.attested", { commitmentId: commitment.id, attestation }, { agents: "all", spectators: true });
  return attestation;
}

export function resolveCommitmentLedger(
  ctx: any,
  trustUpdates: TrustUpdate[],
  resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }>,
  sabotageEvents: Array<{ from: AgentId; to: AgentId; round: number }>,
  crisisContributors: Set<AgentId>,
): void {
  for (const commitment of ctx.state.commitments) {
    if (commitment.resolutionStatus !== "pending") continue;

    if (commitment.type === "resource_transfer") {
      const matchedTrade = resolvedTrades.find((trade) =>
        trade.from === commitment.promisor && commitment.counterparties.includes(trade.to),
      );
      if (matchedTrade) {
        ctx.appendEvidence(
          commitment,
          "trade",
          `${matchedTrade.from}:${matchedTrade.to}:${matchedTrade.round}`,
          `Resolved trade between ${matchedTrade.from} and ${matchedTrade.to}`,
          matchedTrade.round,
          matchedTrade.from,
        );
      }
    }

    if (commitment.type === "non_attack") {
      const targetId = commitment.counterparties[0] ?? commitment.conditions.find((item: any) => item.type === "if_no_attack")?.agentId;
      const sabotage = sabotageEvents.find((item) => item.from === commitment.promisor && item.to === targetId);
      if (sabotage) {
        ctx.appendEvidence(
          commitment,
          "system",
          `sabotage:${sabotage.from}:${sabotage.to}:${sabotage.round}`,
          `${sabotage.from} attacked ${sabotage.to}`,
          sabotage.round,
          sabotage.from,
        );
      } else if (targetId && commitment.dueByRound !== null && ctx.state.round >= commitment.dueByRound) {
        ctx.appendEvidence(
          commitment,
          "absence",
          `no-sabotage:${commitment.promisor}:${targetId}:${ctx.state.round}`,
          `${commitment.promisor} did not attack ${targetId} through round ${ctx.state.round}`,
          ctx.state.round,
          commitment.promisor,
        );
      }
    }

    if (commitment.type === "crisis_support" && crisisContributors.has(commitment.promisor)) {
      ctx.appendEvidence(
        commitment,
        "crisis_contribution",
        `${commitment.promisor}:${ctx.state.round}`,
        `${commitment.promisor} contributed to the active crisis`,
        ctx.state.round,
        commitment.promisor,
      );
    }

    trustUpdates.push(...ctx.resolveSingleCommitment(commitment));
  }
}

export function recordPayoutReceipt(
  ctx: any,
  commitmentId: string,
  from: AgentId,
  to: AgentId,
  proof: string,
  shareBps?: number,
  amountWei?: bigint,
): PayoutReceipt | null {
  const commitment = ctx.state.commitments.find((item: CommitmentRecord) => item.id === commitmentId);
  if (!commitment || commitment.type !== "prize_share") return null;

  const receipt: PayoutReceipt = {
    id: `receipt-${ctx.payoutReceiptCounter++}`,
    commitmentId,
    from,
    to,
    shareBps,
    amountWei: amountWei?.toString(),
    proof,
    round: ctx.state.round,
  };
  ctx.state.payoutReceipts.push(receipt);

  const evidence = ctx.appendEvidence(
    commitment,
    "payout_receipt",
    receipt.id,
    `Payout receipt submitted: ${proof}`,
    ctx.state.round,
    from,
  );

  ctx.emitEvent("commitment.attested", {
    commitmentId,
    actor: from,
    verdict: "fulfill",
    evidence,
    receipt,
  }, { agents: "all", spectators: true });

  const trustUpdates = ctx.resolveSingleCommitment(commitment);
  ctx.applyImmediateTrustUpdates(trustUpdates);
  return receipt;
}
