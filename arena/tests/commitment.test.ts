import { describe, expect, it } from "vitest";
import {
  classifyCommitmentType,
  detectCommitmentInMessage,
  estimateCommitmentConfidence,
  extractCommitmentConditions,
  extractPayoutShareBps,
  inferDueRound,
  parseAttestationMessage,
  resolveSingleCommitment,
} from "../src/games/nexus/commitment.js";
import { Message } from "../src/core/types.js";
import { CommitmentRecord, ComedyGameState } from "../src/games/nexus/types.js";

function msg(content: string, recipient: string | "broadcast" = "broadcast"): Message {
  return {
    id: "m1",
    gameId: "g",
    round: 2,
    phase: "negotiation",
    sender: "a",
    recipient,
    content,
    type: recipient === "broadcast" ? "public" : "private",
    timestamp: Date.now(),
  };
}

function baseState(): ComedyGameState {
  return {
    gameId: "g",
    round: 3,
    phase: "resolution",
    players: ["a", "b", "c"],
    scores: {},
    isFinished: false,
    winner: null,
    hexGrid: new Map(),
    worldMap: {
      id: "w",
      name: "w",
      regions: [],
      ecosystems: [],
      assets: {
        frame: "",
        compass: "",
        underlay: "",
        resourceIcons: { grain: "", timber: "", ore: "", fish: "", water: "", energy: "" },
        ecosystemIcons: { fishery: "", forest: "", aquifer: "", wetland: "" },
      },
      startingRegionIds: [],
      hexSize: 1,
    },
    vertices: [],
    edges: [],
    playerStates: new Map(),
    productionWheel: [],
    wheelPosition: 0,
    activeCrisis: null,
    crisisHistory: [],
    crisisCooldown: 0,
    ecosystems: [],
    ecosystemExtractions: [],
    longestRoadHolder: null,
    mostInfluenceHolder: null,
    mostCrisisContribHolder: null,
    prizePool: 0n,
    payablePrizePool: 0n,
    slashedPrizePool: 0n,
    carryoverPrizePool: 0n,
    moveCount: 0,
    messageCount: 0,
    commitmentCandidates: [],
    commitments: [],
    attestations: [],
    contestedClaims: [],
    behaviorTags: [],
    payoutReceipts: [],
    commonsHealthHistory: [],
    currentCommonsHealth: {
      round: 0,
      score: 100,
      payableFraction: 1,
      reasons: [],
      payablePrizePoolWei: "0",
      slashedPrizePoolWei: "0",
      carryoverPrizePoolWei: "0",
    },
    actualMaxRounds: 20,
    allianceCooperationRounds: new Map(),
    allianceVP: new Map(),
  };
}

function commitment(overrides: Partial<CommitmentRecord> = {}): CommitmentRecord {
  return {
    id: "commitment-1",
    messageId: "m1",
    round: 1,
    sender: "a",
    counterparties: ["b"],
    type: "resource_transfer",
    visibility: "public",
    confidence: 0.9,
    rawText: "",
    summary: "",
    conditions: [{ type: "manual", summary: "manual" }],
    candidateId: "candidate-1",
    promisor: "a",
    resolutionStatus: "pending",
    attestations: [],
    evidence: [],
    dueByRound: 2,
    resolvedRound: null,
    contested: false,
    payoutShareBps: null,
    behaviorTags: [],
    ...overrides,
  };
}

describe("commitment module", () => {
  it("classifies commitment type", () => {
    expect(classifyCommitmentType("i will share prize 20%", false)).toBe("prize_share");
    expect(classifyCommitmentType("i will contribute to crisis", true)).toBe("crisis_support");
    expect(classifyCommitmentType("i will contribute to crisis", false)).not.toBe("crisis_support");
  });

  it("detects commitment candidate from message", () => {
    const candidate = detectCommitmentInMessage(msg("I will trade with you next round", "b"), 2, 7, false);
    expect(candidate?.id).toBe("candidate-7");
    expect(candidate?.type).toBe("resource_transfer");
  });

  it("estimates confidence with promise language", () => {
    const direct = estimateCommitmentConfidence("resource_transfer", "i will send you grain");
    const weak = estimateCommitmentConfidence("resource_transfer", "send grain maybe");
    expect(direct).toBeGreaterThan(weak);
  });

  it("extracts commitment conditions from dialogue", () => {
    const conditions = extractCommitmentConditions("if i win i will pay next round", msg("x", "b"), 3, false);
    expect(conditions.some((c) => c.type === "if_i_win")).toBe(true);
    expect(conditions.some((c) => c.type === "by_round")).toBe(true);
  });

  it("extracts payout share and infers due rounds", () => {
    expect(extractPayoutShareBps("i pay 25% of winnings")).toBe(2500);
    expect(inferDueRound("alliance", [{ type: "manual", summary: "x" }], 4)).toBe(6);
  });

  it("parses attestation message verdicts", () => {
    expect(parseAttestationMessage("i confirm this commitment exists")?.phase).toBe("existence");
    expect(parseAttestationMessage("they fulfilled and delivered")?.verdict).toBe("fulfill");
    expect(parseAttestationMessage("this is random text")).toBeNull();
  });

  it("resolves fulfilled commitments with positive trust updates", () => {
    const state = baseState();
    const c = commitment({
      attestations: [
        { id: "a1", commitmentId: "commitment-1", actor: "b", round: 2, phase: "existence", verdict: "confirm", detail: "", evidenceRefs: [], weight: 1, accepted: true },
        { id: "a2", commitmentId: "commitment-1", actor: "b", round: 3, phase: "fulfillment", verdict: "fulfill", detail: "", evidenceRefs: [], weight: 1.2, accepted: true },
      ],
    });
    const updates = resolveSingleCommitment(c, state, () => "contested-1");
    expect(c.resolutionStatus).toBe("fulfilled");
    expect(updates[0].delta).toBeGreaterThan(0);
  });

  it("resolves breached commitments with negative trust updates", () => {
    const state = baseState();
    const c = commitment({
      attestations: [
        { id: "a1", commitmentId: "commitment-1", actor: "b", round: 2, phase: "existence", verdict: "confirm", detail: "", evidenceRefs: [], weight: 1, accepted: true },
        { id: "a2", commitmentId: "commitment-1", actor: "b", round: 3, phase: "fulfillment", verdict: "breach", detail: "", evidenceRefs: [], weight: 1.3, accepted: true },
      ],
    });
    const updates = resolveSingleCommitment(c, state, () => "contested-1");
    expect(c.resolutionStatus).toBe("breached");
    expect(updates[0].delta).toBeLessThan(0);
  });
});
