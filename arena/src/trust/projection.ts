import type {
  AgentId,
  GraduatedTrustProjection,
  TrustCounterpartySummary,
  TrustDossier,
  TrustEvidence,
  TrustReadModel,
  TrustTimelineEntry,
} from "../core/types.js";

const RELIABILITY_BANDS = [
  { min: 0.55, label: "reliable" },
  { min: 0.1, label: "mixed" },
  { min: -0.35, label: "opportunistic" },
  { min: -1, label: "adversarial" },
] as const;

const STEWARDSHIP_BANDS = [
  { min: 0.55, label: "steward" },
  { min: 0.1, label: "neutral" },
  { min: -0.35, label: "extractive" },
  { min: -1, label: "destructive" },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function bandFor(value: number, bands: readonly { min: number; label: string }[]): string {
  for (const band of bands) {
    if (value >= band.min) return band.label;
  }
  return bands[bands.length - 1].label;
}

function evidenceSummary(entry: TrustEvidence, focalAgentId: AgentId): string {
  const counterparty = entry.actor === focalAgentId ? entry.subject : entry.actor;
  switch (entry.type) {
    case "trade.completed":
      return `Completed trade with ${counterparty ?? "another agent"}`;
    case "trade.not_reciprocated":
      return `Trade reciprocity failed with ${counterparty ?? "another agent"}`;
    case "attestation.promise_fulfilled":
      return `Promise fulfilled involving ${counterparty ?? "another agent"}`;
    case "attestation.promise_breached":
      return `Promise breached involving ${counterparty ?? "another agent"}`;
    case "attestation.contested":
      return `Promise or settlement contested with ${counterparty ?? "another agent"}`;
    case "sabotage.executed":
      return `${entry.actor ?? "An agent"} sabotaged ${entry.subject ?? "another agent"}`;
    case "aggression.witnessed":
      return `${entry.actor ?? "An agent"} acted aggressively toward ${entry.subject ?? "another agent"}`;
    case "conquest.executed":
      return `${entry.actor ?? "An agent"} conquered ${entry.subject ?? "another agent"}`;
    case "commons.collapsed":
      return `${entry.actor ?? "An agent"} was tied to a commons collapse`;
    case "crisis.contributed":
      return `${entry.actor ?? "An agent"} contributed to a crisis response`;
    case "crisis.free_ride":
      return `${entry.actor ?? "An agent"} free-rode during a crisis`;
    case "commitment.resolved":
      return `Commitment resolved for ${counterparty ?? "another agent"}`;
    default:
      return entry.reasonCode ?? entry.type;
  }
}

function directnessFor(entry: TrustEvidence, focalAgentId: AgentId): "direct" | "indirect" {
  return entry.actor === focalAgentId || entry.subject === focalAgentId ? "direct" : "indirect";
}

export function buildTrustDossier(
  agentId: AgentId,
  readModel: TrustReadModel,
  evidenceLog: TrustEvidence[],
): TrustDossier {
  const relatedEvidence = evidenceLog.filter((entry) => entry.actor === agentId || entry.subject === agentId);
  const counterpartMap = new Map<AgentId, TrustCounterpartySummary>();

  const timeline: TrustTimelineEntry[] = relatedEvidence
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 12)
    .map((entry) => {
      const counterparties = [entry.actor, entry.subject]
        .filter((value): value is AgentId => Boolean(value) && value !== agentId);
      for (const counterparty of counterparties) {
        const existing = counterpartMap.get(counterparty) ?? {
          agentId: counterparty,
          interactions: 0,
          trustScore: readModel.directScores[counterparty] ?? 0,
          lastSeen: null,
        };
        existing.interactions += 1;
        existing.lastSeen = existing.lastSeen === null ? entry.timestamp : Math.max(existing.lastSeen, entry.timestamp);
        counterpartMap.set(counterparty, existing);
      }

      return {
        evidenceId: entry.id,
        timestamp: entry.timestamp,
        gameId: entry.gameId,
        round: entry.round,
        phase: entry.phase,
        type: entry.type,
        reasonCode: entry.reasonCode,
        summary: evidenceSummary(entry, agentId),
        directness: directnessFor(entry, agentId),
        counterparties,
        scope: typeof entry.payload.scope === "string" ? entry.payload.scope : undefined,
      };
    });

  return {
    agentId,
    timeline,
    counterparties: Array.from(counterpartMap.values()).sort((left, right) => right.interactions - left.interactions),
    outstandingCommitments: 0,
    keptCommitments: readModel.keptCommitments,
    brokenCommitments: readModel.brokenCommitments,
    updatedAt: timeline[0]?.timestamp ?? Date.now(),
  };
}

export function buildGraduatedTrustProjection(
  agentId: AgentId,
  readModel: TrustReadModel,
  evidenceLog: TrustEvidence[],
): GraduatedTrustProjection {
  const relatedEvidence = evidenceLog.filter((entry) => entry.actor === agentId || entry.subject === agentId);

  const completedTrades = relatedEvidence.filter((entry) => entry.type === "trade.completed").length;
  const failedReciprocityEvents = relatedEvidence.filter((entry) => entry.type === "trade.not_reciprocated").length;
  const keptCommitments = relatedEvidence.filter((entry) => entry.type === "attestation.promise_fulfilled" || entry.type === "commitment.resolved").length;
  const brokenCommitments = relatedEvidence.filter((entry) => entry.type === "attestation.promise_breached" || entry.type === "attestation.contested").length;
  const sabotageEvents = relatedEvidence.filter((entry) =>
    entry.type === "sabotage.executed" || entry.type === "conquest.executed" || entry.type === "aggression.witnessed",
  ).length;
  const crisisContributions = relatedEvidence.filter((entry) => entry.type === "crisis.contributed").length;
  const crisisFreeRideEvents = relatedEvidence.filter((entry) => entry.type === "crisis.free_ride").length;
  const commonsCollapseEvents = relatedEvidence.filter((entry) => entry.type === "commons.collapsed").length;

  const reliabilityRaw =
    completedTrades * 0.15 +
    keptCommitments * 0.2 +
    crisisContributions * 0.08 -
    failedReciprocityEvents * 0.18 -
    brokenCommitments * 0.24 -
    sabotageEvents * 0.1;
  const stewardshipRaw =
    crisisContributions * 0.16 -
    crisisFreeRideEvents * 0.22 -
    commonsCollapseEvents * 0.28 -
    sabotageEvents * 0.06;

  const coordinationByPartner = new Map<AgentId, number>();
  for (const entry of evidenceLog) {
    const isPositiveCoordination =
      entry.type === "trade.completed" ||
      entry.type === "attestation.promise_fulfilled" ||
      (entry.type === "commitment.resolved" && typeof entry.payload.delta === "number" && entry.payload.delta > 0);
    if (!isPositiveCoordination) continue;
    if (entry.actor === agentId && entry.subject) {
      coordinationByPartner.set(entry.subject, (coordinationByPartner.get(entry.subject) ?? 0) + 1);
    } else if (entry.subject === agentId && entry.actor) {
      coordinationByPartner.set(entry.actor, (coordinationByPartner.get(entry.actor) ?? 0) + 1);
    }
  }

  const harmfulEvidenceByAgent = new Map<AgentId, number>();
  for (const entry of evidenceLog) {
    if (!entry.actor) continue;
    if (
      entry.type === "crisis.free_ride" ||
      entry.type === "commons.collapsed" ||
      entry.type === "sabotage.executed" ||
      entry.type === "conquest.executed" ||
      entry.type === "aggression.witnessed"
    ) {
      harmfulEvidenceByAgent.set(entry.actor, (harmfulEvidenceByAgent.get(entry.actor) ?? 0) + 1);
    }
  }

  const riskyPartners = Array.from(coordinationByPartner.entries())
    .filter(([partner, count]) => count >= 2 && (harmfulEvidenceByAgent.get(partner) ?? 0) > 0)
    .sort((left, right) => (harmfulEvidenceByAgent.get(right[0]) ?? 0) - (harmfulEvidenceByAgent.get(left[0]) ?? 0));

  const associationScore = clamp(
    riskyPartners.reduce((sum, [partner, count]) => sum + Math.min(0.4, count * 0.12 + (harmfulEvidenceByAgent.get(partner) ?? 0) * 0.08), 0),
    0,
    1,
  );
  const associationBand = associationScore >= 0.65 ? "concerning" : associationScore >= 0.25 ? "watch" : "none";
  const associationRationale = riskyPartners.slice(0, 3).map(([partner, count]) => {
    const harm = harmfulEvidenceByAgent.get(partner) ?? 0;
    return `${partner}: ${count} repeated coordination signals, ${harm} harmful commons signals`;
  });

  const reliabilityScore = clamp(readModel.globalScore * 0.35 + reliabilityRaw, -1, 1);
  const stewardshipScore = clamp(stewardshipRaw - associationScore * 0.35, -1, 1);

  return {
    agentId,
    coordinationReliability: {
      score: reliabilityScore,
      band: bandFor(reliabilityScore, RELIABILITY_BANDS),
    },
    commonsStewardship: {
      score: stewardshipScore,
      band: bandFor(stewardshipScore, STEWARDSHIP_BANDS),
    },
    associationRisk: {
      score: associationScore,
      band: associationBand,
      relatedAgents: riskyPartners.map(([partner]) => partner),
      rationale: associationRationale,
    },
    inputs: {
      completedTrades,
      failedReciprocityEvents,
      keptCommitments,
      brokenCommitments,
      sabotageEvents,
      crisisContributions,
      crisisFreeRideEvents,
      commonsCollapseEvents,
      concerningPartnerCount: riskyPartners.length,
    },
    updatedAt: relatedEvidence[relatedEvidence.length - 1]?.timestamp ?? Date.now(),
  };
}
