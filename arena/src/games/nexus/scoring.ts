import { AgentId, TrustUpdate } from "../../core/types.js";
import { ComedyGameState, ComedyPlayerState } from "./types.js";

export interface BonusUpdate {
  kind: "longestRoad" | "mostInfluence";
  holder: AgentId | null;
  thresholdMet: boolean;
}

export interface AllianceVPComputationResult {
  allianceCooperationRounds: Map<AgentId, Map<AgentId, number>>;
  allianceVP: Map<AgentId, number>;
  formedAlliances: Array<{ from: AgentId; to: AgentId; roundsOfCooperation: number; allianceVP: number }>;
  brokenAlliances: Array<{ saboteur: AgentId; victim: AgentId; penalty: number; trustUpdates: number }>;
}

const SUSTAINED_COOPERATION_THRESHOLD = 3;
const ALLIANCE_VP_PER_RENEWAL = 1;
const ALLIANCE_BREAK_PENALTY = 2;

function cloneCooperationRounds(
  input: Map<AgentId, Map<AgentId, number>>,
): Map<AgentId, Map<AgentId, number>> {
  return new Map(
    Array.from(input.entries()).map(([agentId, rounds]) => [
      agentId,
      new Map(rounds),
    ]),
  );
}

export function computePlayerScores(
  playerStates: Map<AgentId, ComedyPlayerState>,
): Record<AgentId, number> {
  const scores: Record<AgentId, number> = {};
  for (const [agentId, playerState] of playerStates) {
    scores[agentId] = playerState.vp;
  }
  return scores;
}

export function computeAllianceVPUpdates(
  state: ComedyGameState,
  resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }>,
  sabotageEvents: Array<{ from: AgentId; to: AgentId; round: number }>,
  trustUpdates: TrustUpdate[],
): AllianceVPComputationResult {
  const allianceCooperationRounds = cloneCooperationRounds(state.allianceCooperationRounds);
  const allianceVP = new Map(state.allianceVP);
  const formedAlliances: AllianceVPComputationResult["formedAlliances"] = [];
  const brokenAlliances: AllianceVPComputationResult["brokenAlliances"] = [];

  for (const trade of resolvedTrades) {
    const fromAgent = trade.from;
    const toAgent = trade.to;

    if (!allianceCooperationRounds.has(fromAgent)) {
      allianceCooperationRounds.set(fromAgent, new Map());
    }
    if (!allianceCooperationRounds.has(toAgent)) {
      allianceCooperationRounds.set(toAgent, new Map());
    }

    const fromCoop = allianceCooperationRounds.get(fromAgent)!;
    const toCoop = allianceCooperationRounds.get(toAgent)!;
    const prevFromCoop = fromCoop.get(toAgent) || 0;
    const prevToCoop = toCoop.get(fromAgent) || 0;

    fromCoop.set(toAgent, prevFromCoop + 1);
    toCoop.set(fromAgent, prevToCoop + 1);

    if (
      prevFromCoop + 1 >= SUSTAINED_COOPERATION_THRESHOLD &&
      prevFromCoop < SUSTAINED_COOPERATION_THRESHOLD
    ) {
      const fromVP = allianceVP.get(fromAgent) || 0;
      const toVP = allianceVP.get(toAgent) || 0;
      allianceVP.set(fromAgent, fromVP + ALLIANCE_VP_PER_RENEWAL);
      allianceVP.set(toAgent, toVP + ALLIANCE_VP_PER_RENEWAL);
      formedAlliances.push({
        from: fromAgent,
        to: toAgent,
        roundsOfCooperation: prevFromCoop + 1,
        allianceVP: ALLIANCE_VP_PER_RENEWAL,
      });
    }
  }

  for (const sabotage of sabotageEvents) {
    const saboteur = sabotage.from;
    const victim = sabotage.to;
    const saboteurCoop = allianceCooperationRounds.get(saboteur);
    const victimCoop = allianceCooperationRounds.get(victim);
    const saboteurPrevCoop = saboteurCoop?.get(victim) || 0;
    const victimPrevCoop = victimCoop?.get(saboteur) || 0;

    if (
      saboteurPrevCoop >= SUSTAINED_COOPERATION_THRESHOLD ||
      victimPrevCoop >= SUSTAINED_COOPERATION_THRESHOLD
    ) {
      const saboteurVP = allianceVP.get(saboteur) || 0;
      allianceVP.set(saboteur, Math.max(0, saboteurVP - ALLIANCE_BREAK_PENALTY));
      saboteurCoop?.set(victim, 0);
      victimCoop?.set(saboteur, 0);
      brokenAlliances.push({
        saboteur,
        victim,
        penalty: ALLIANCE_BREAK_PENALTY,
        trustUpdates: trustUpdates.length,
      });
    }
  }

  return {
    allianceCooperationRounds,
    allianceVP,
    formedAlliances,
    brokenAlliances,
  };
}

export function getAllianceVP(
  playerStates: Map<AgentId, ComedyPlayerState>,
  agentId: AgentId,
): number {
  const ps = playerStates.get(agentId);
  return ps ? (ps as ComedyPlayerState & { allianceVP?: number }).allianceVP || 0 : 0;
}

export function getAllianceVPFromMap(
  allianceVP: Map<AgentId, number>,
  agentId: AgentId,
): number {
  return allianceVP.get(agentId) || 0;
}

export function computeBonusHolderUpdates(
  playerStates: Map<AgentId, ComedyPlayerState>,
): BonusUpdate[] {
  let maxRoad = 0;
  let roadHolder: AgentId | null = null;
  for (const [id, ps] of playerStates) {
    if (ps.longestRoad > maxRoad) {
      maxRoad = ps.longestRoad;
      roadHolder = id;
    }
  }

  let maxInfluence = 0;
  let influenceHolder: AgentId | null = null;
  for (const [id, ps] of playerStates) {
    if (ps.influence > maxInfluence) {
      maxInfluence = ps.influence;
      influenceHolder = id;
    }
  }

  return [
    { kind: "longestRoad", holder: roadHolder, thresholdMet: maxRoad >= 5 },
    { kind: "mostInfluence", holder: influenceHolder, thresholdMet: maxInfluence >= 3 },
  ];
}
