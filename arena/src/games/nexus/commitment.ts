import { Message, TrustUpdate, AgentId } from "../../core/types.js";
import {
  AttestationVerdict,
  CommitmentCandidate,
  CommitmentCondition,
  CommitmentRecord,
  ContestedClaim,
  ResolutionStatus,
  ComedyGameState,
} from "./types.js";

export function detectCommitmentInMessage(
  message: Message,
  round: number,
  counter: number,
  hasActiveCrisis: boolean,
): CommitmentCandidate | null {
  const lower = message.content.toLowerCase();
  const type = classifyCommitmentType(lower, hasActiveCrisis);
  if (!type) return null;

  const conditions = extractCommitmentConditions(lower, message, round, hasActiveCrisis);
  const summary = message.content.trim().slice(0, 160);
  const counterparties = message.recipient === "broadcast" ? [] : [message.recipient as AgentId];

  return {
    id: `candidate-${counter}`,
    messageId: message.id,
    round: message.round,
    sender: message.sender,
    counterparties,
    type,
    visibility: message.type === "public" ? "public" : "private",
    confidence: estimateCommitmentConfidence(type, lower),
    rawText: message.content,
    summary,
    conditions,
  };
}

export function parseAttestationMessage(lower: string): { phase: "existence" | "fulfillment"; verdict: AttestationVerdict } | null {
  if (/(attest|confirm|acknowledge).*(exists|promise|commitment)/.test(lower)) {
    return { phase: "existence", verdict: "confirm" };
  }
  if (/(fulfilled|kept|honored|paid|delivered)/.test(lower)) {
    return { phase: "fulfillment", verdict: "fulfill" };
  }
  if (/\breceived\b/.test(lower)) {
    return { phase: "fulfillment", verdict: "receive" };
  }
  if (/(betrayed|broke|defaulted|did not pay|didn't pay|failed to honor)/.test(lower)) {
    return { phase: "fulfillment", verdict: "breach" };
  }
  if (/(did not trigger|didn't trigger|i did not win|i didn't win|no payout due)/.test(lower)) {
    return { phase: "fulfillment", verdict: "non_trigger" };
  }
  if (/(contest|dispute|disagree)/.test(lower)) {
    return { phase: "fulfillment", verdict: "contest" };
  }
  return null;
}

export function classifyCommitmentType(lower: string, hasActiveCrisis: boolean): CommitmentRecord["type"] | null {
  if (/(split|share).*(prize|pot|winnings)/.test(lower)) return "prize_share";
  if (/(don't attack|do not attack|won't attack|will not attack|non-aggression)/.test(lower)) return "non_attack";
  if (/(don't build|do not build|won't build|will not build)/.test(lower)) return "non_build";
  if (/(contribute|help with crisis|pitch in|donate)/.test(lower) && hasActiveCrisis) return "crisis_support";
  if (/(give you|send you|trade|deal|offer|exchange|swap)/.test(lower)) return "resource_transfer";
  if (/(alliance|ally|team up|partner|pact|work together)/.test(lower)) return "alliance";
  return null;
}

export function estimateCommitmentConfidence(type: CommitmentRecord["type"], lower: string): number {
  const hasDirectPromise = /\b(i will|i'll|i promise|we will|we'll)\b/.test(lower);
  const hasConditional = /\bif\b/.test(lower);
  let base = hasDirectPromise ? 0.82 : 0.58;
  if (hasConditional) base += 0.08;
  if (type === "prize_share") base += 0.05;
  return Math.min(0.99, base);
}

export function extractCommitmentConditions(
  lower: string,
  message: Message,
  round: number,
  hasActiveCrisis: boolean,
): CommitmentCondition[] {
  const conditions: CommitmentCondition[] = [];

  if (/\bif i win\b/.test(lower) || /\bif we win\b/.test(lower)) {
    conditions.push({ type: "if_i_win", summary: "Only applies if the promisor wins" });
  }
  if (message.recipient !== "broadcast" && /\bif you don't attack me\b|\bif you do not attack me\b/.test(lower)) {
    conditions.push({
      type: "if_no_attack",
      summary: `Only applies if ${message.recipient} does not attack ${message.sender}`,
      agentId: message.recipient as AgentId,
    });
  }
  if (message.recipient !== "broadcast" && /\bif you give me\b|\bif you send me\b|\bif you trade me\b/.test(lower)) {
    conditions.push({
      type: "if_resource_transfer",
      summary: `Only applies if ${message.recipient} transfers resources`,
      agentId: message.recipient as AgentId,
    });
  }
  if (/\bnext round\b/.test(lower)) {
    conditions.push({
      type: "by_round",
      summary: "Due next round",
      round: round + 1,
    });
  }
  if (hasActiveCrisis && /(contribute|help with crisis|pitch in|donate)/.test(lower)) {
    conditions.push({
      type: "if_crisis_contribution",
      summary: "Must contribute while active crisis is ongoing",
    });
  }
  if (conditions.length === 0) {
    conditions.push({ type: "manual", summary: "Inferred from dialogue" });
  }

  return conditions;
}

export function extractPayoutShareBps(lower: string): number | null {
  const match = lower.match(/(\d+)\s*%/);
  if (!match) return null;
  const pct = parseInt(match[1], 10);
  if (Number.isNaN(pct)) return null;
  return Math.max(0, Math.min(10000, pct * 100));
}

export function inferDueRound(
  type: CommitmentRecord["type"],
  conditions: CommitmentCondition[],
  round: number,
): number | null {
  const explicitRound = conditions.find((item) => item.type === "by_round")?.round;
  if (explicitRound !== undefined) return explicitRound;

  if (type === "resource_transfer" || type === "non_attack" || type === "crisis_support") {
    return round + 1;
  }
  if (type === "alliance" || type === "non_build") {
    return round + 2;
  }

  return null;
}

function getObjectiveResolutionStatus(commitment: CommitmentRecord, state: ComedyGameState): ResolutionStatus | null {
  const hasTradeEvidence = commitment.evidence.some((item) => item.type === "trade");
  const hasPayoutReceipt = commitment.evidence.some((item) => item.type === "payout_receipt");
  const hasAbsenceEvidence = commitment.evidence.some((item) => item.type === "absence");
  const hasSystemBreach = commitment.evidence.some((item) =>
    item.type === "system" && item.summary.toLowerCase().includes("attacked"),
  );
  const hasCrisisContribution = commitment.evidence.some((item) => item.type === "crisis_contribution");

  if (commitment.type === "resource_transfer" && hasTradeEvidence) {
    return "fulfilled";
  }
  if (commitment.type === "non_attack" && hasSystemBreach) {
    return "breached";
  }
  if (commitment.type === "non_attack" && hasAbsenceEvidence) {
    return "fulfilled";
  }
  if (commitment.type === "crisis_support" && hasCrisisContribution) {
    return "fulfilled";
  }
  if (commitment.type === "prize_share") {
    if (hasPayoutReceipt) return "fulfilled";
    const conditionalWin = commitment.conditions.find((item) => item.type === "if_i_win");
    if (conditionalWin && state.winner && state.winner !== commitment.promisor) {
      return "non_triggered";
    }
  }

  return null;
}

export function resolveSingleCommitment(
  commitment: CommitmentRecord,
  state: ComedyGameState,
  nextContestedId: () => string,
): TrustUpdate[] {
  if (commitment.resolutionStatus !== "pending") {
    return [];
  }

  const trustUpdates: TrustUpdate[] = [];
  const existenceWeight = commitment.attestations
    .filter((item) => item.phase === "existence" && item.verdict === "confirm" && item.accepted)
    .reduce((sum, item) => sum + item.weight, 0);
  if (existenceWeight <= 0) {
    return [];
  }

  const objectiveStatus = getObjectiveResolutionStatus(commitment, state);
  const fulfillWeight = commitment.attestations
    .filter((item) => item.phase === "fulfillment" && ["fulfill", "receive"].includes(item.verdict) && item.accepted)
    .reduce((sum, item) => sum + item.weight, 0);
  const breachWeight = commitment.attestations
    .filter((item) => item.phase === "fulfillment" && item.verdict === "breach" && item.accepted)
    .reduce((sum, item) => sum + item.weight, 0);
  const contestWeight = commitment.attestations
    .filter((item) => item.phase === "fulfillment" && item.verdict === "contest" && item.accepted)
    .reduce((sum, item) => sum + item.weight, 0);

  let nextStatus: ResolutionStatus | null = null;
  if (objectiveStatus === "non_triggered") {
    nextStatus = "non_triggered";
  } else if (objectiveStatus === "fulfilled") {
    nextStatus = contestWeight > 0.75 ? "contested" : "fulfilled";
  } else if (objectiveStatus === "breached") {
    nextStatus = contestWeight > breachWeight ? "contested" : "breached";
  } else if (fulfillWeight > 0 && breachWeight > 0 && Math.abs(fulfillWeight - breachWeight) < 0.35) {
    nextStatus = "contested";
  } else if (fulfillWeight >= 1.2) {
    nextStatus = "fulfilled";
  } else if (breachWeight >= 1.2) {
    nextStatus = "breached";
  } else if (
    commitment.dueByRound !== null &&
    state.round > commitment.dueByRound &&
    breachWeight > 0
  ) {
    nextStatus = "breached";
  }

  if (!nextStatus) {
    return [];
  }

  commitment.resolutionStatus = nextStatus;
  commitment.resolvedRound = state.round;
  commitment.contested = nextStatus === "contested";

  if (nextStatus === "contested") {
    const claim: ContestedClaim = {
      id: nextContestedId(),
      commitmentId: commitment.id,
      actor: commitment.promisor,
      round: state.round,
      reason: "Conflicting attestations or insufficient proof",
      evidenceRefs: commitment.evidence.map((item) => item.id),
    };
    state.contestedClaims.push(claim);
  }

  if (nextStatus === "fulfilled") {
    for (const counterparty of commitment.counterparties) {
      trustUpdates.push({
        from: counterparty,
        to: commitment.promisor,
        delta: 0.18,
        reason: "attested_commitment_fulfilled",
      });
    }
  } else if (nextStatus === "breached") {
    const reporters = commitment.counterparties.length > 0
      ? commitment.counterparties
      : state.players.filter((id) => id !== commitment.promisor);
    for (const reporter of reporters) {
      trustUpdates.push({
        from: reporter,
        to: commitment.promisor,
        delta: -0.22,
        reason: "attested_commitment_breached",
      });
    }
  }

  return trustUpdates;
}
