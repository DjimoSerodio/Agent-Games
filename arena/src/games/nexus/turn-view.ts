import { Action, AgentId } from "../../core/types.js";
import { TragedyAction, TragedyAgentView, RESOURCE_NAMES } from "./types.js";
import { projectVisibleBehaviorTags } from "./behavior-view.js";

export function getAgentView(ctx: any, agentId: AgentId): TragedyAgentView {
  const playerState = ctx.state.playerStates.get(agentId);
  if (!playerState) throw new Error(`Unknown agent: ${agentId}`);

  const visibleHexes = (Array.from(ctx.state.hexGrid.values()) as any[]).filter(
    (h: any) => h.revealed || h.revealedBy.includes(agentId),
  );

  const allScores: Record<AgentId, number> = {};
  const allInfluence: Record<AgentId, number> = {};
  for (const [id, ps] of ctx.state.playerStates) {
    allScores[id] = ps.vp;
    allInfluence[id] = ps.influence;
  }

  const trustScores: Record<AgentId, number> = {};
  for (const id of ctx.state.players) trustScores[id] = ctx.trustGraph.getGlobalScore(id);

  const nextProduction: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const pos = (ctx.state.wheelPosition + i) % ctx.state.productionWheel.length;
    nextProduction.push(ctx.state.productionWheel[pos]);
  }

  const myAllianceVP = ctx.state.allianceVP.get(agentId) || 0;
  const allianceCoop = ctx.state.allianceCooperationRounds.get(agentId);
  const alliancePartners: Array<{ agentId: AgentId; roundsOfCooperation: number }> = [];
  if (allianceCoop) {
    for (const [partnerId, rounds] of allianceCoop) {
      if (rounds > 0) alliancePartners.push({ agentId: partnerId, roundsOfCooperation: rounds });
    }
  }

  return {
    gameId: ctx.state.gameId,
    round: ctx.state.round,
    phase: ctx.state.phase,
    myId: agentId,
    visibleHexes,
    worldMap: ctx.state.worldMap,
    ecosystemStates: ctx.state.ecosystems.map((ecosystem: any) => ({
      ...ecosystem,
      regionIds: [...ecosystem.regionIds],
      extractionProfiles: ecosystem.extractionProfiles.map((profile: any) => ({ ...profile })),
    })),
    visibleVertices: ctx.state.vertices,
    visibleEdges: ctx.state.edges,
    myResources: { ...playerState.resources },
    myInfluence: playerState.influence,
    myVP: playerState.vp,
    myStructures: playerState.structures,
    allScores,
    allInfluence,
    trustScores,
    productionWheel: ctx.state.productionWheel,
    wheelPosition: ctx.state.wheelPosition,
    nextProduction,
    activeCrisis: ctx.state.activeCrisis,
    visibleArmies: Array.from(ctx.state.playerStates.values()).flatMap((ps: any) => ps.armies),
    visibleCommitments: ctx.getVisibleCommitments(agentId),
    visibleAttestations: ctx.getVisibleAttestations(agentId),
    visibleBehaviorTags: projectVisibleBehaviorTags(ctx.state.behaviorTags),
    messageHistory: ctx.filterMessagesForAgent(agentId, ctx.messageLog),
    prizePool: ctx.state.prizePool.toString(),
    payablePrizePool: ctx.state.payablePrizePool.toString(),
    slashedPrizePool: ctx.state.slashedPrizePool.toString(),
    carryoverPrizePool: ctx.state.carryoverPrizePool.toString(),
    currentCommonsHealth: ctx.state.currentCommonsHealth,
    tournamentDay: 1,
    tournamentPrizePool: ctx.state.prizePool.toString(),
    cumulativeScores: { ...ctx.state.scores },
    allianceInfo: {
      myAllianceVP,
      alliancePartners,
    },
  };
}

export function getLegalActions(ctx: any, agentId: AgentId): Action[] {
  const ps = ctx.state.playerStates.get(agentId);
  if (!ps) return [];

  const actions: TragedyAction[] = [];
  const r = ps.resources;

  if (r.grain >= 1 && r.timber >= 1) actions.push(ctx.makeAction("build_road", agentId));
  if (r.grain >= 1 && r.timber >= 1 && r.ore >= 1 && r.water >= 1) actions.push(ctx.makeAction("build_village", agentId));
  if (r.grain >= 2 && r.timber >= 1 && r.ore >= 1 && r.water >= 1 && ps.structures.villages.length >= 3) actions.push(ctx.makeAction("upgrade_township", agentId));
  if (r.grain >= 2 && r.ore >= 2 && r.water >= 1 && ps.structures.townships.length >= 2) actions.push(ctx.makeAction("upgrade_city", agentId));
  if (r.ore >= 1 && r.energy >= 1 && r.water >= 1) actions.push(ctx.makeAction("build_beacon", agentId));
  if (r.timber >= 1 && r.fish >= 1 && r.water >= 1) actions.push(ctx.makeAction("build_trade_post", agentId));
  if (r.ore >= 1 && r.energy >= 1) actions.push(ctx.makeAction("build_army", agentId));

  for (const army of ps.armies) {
    if (army.owner === agentId) {
      actions.push(ctx.makeAction("move_army", agentId, { armyId: army.id }));
      break;
    }
  }
  for (const army of ps.armies) {
    if (army.owner === agentId && army.count > 0) {
      for (const [otherId, otherPs] of ctx.state.playerStates) {
        if (otherId === agentId) continue;
        const enemyStructures = [...otherPs.structures.villages, ...otherPs.structures.townships, ...otherPs.structures.cities];
        if (enemyStructures.length > 0) {
          actions.push(ctx.makeAction("attack_structure", agentId, { targetAgent: otherId }));
          break;
        }
      }
      break;
    }
  }

  const totalResources = ctx.totalResources(r);
  if (totalResources > 0) {
    for (const otherId of ctx.state.players) {
      if (otherId !== agentId) actions.push(ctx.makeAction("trade_player", agentId, { partnerId: otherId }));
    }
  }

  const bankRatio = ps.structures.tradePosts.length > 0 ? 2 : 4;
  for (const resType of RESOURCE_NAMES) {
    if (r[resType] >= bankRatio) {
      actions.push(ctx.makeAction("trade_bank", agentId, { bankGiveType: resType, bankGiveAmount: bankRatio }));
    }
  }

  actions.push(ctx.makeAction("explore", agentId));
  const accessibleEcosystems = ctx.getAccessibleEcosystems(agentId);
  if (accessibleEcosystems.length > 0) {
    actions.push(ctx.makeAction("extract_commons", agentId, { ecosystemId: accessibleEcosystems[0].id, extractionLevel: "medium" }));
    if (r.water >= 1 || r.energy >= 1 || r.grain >= 1) {
      actions.push(ctx.makeAction("restore_ecosystem", agentId, { ecosystemId: accessibleEcosystems[0].id }));
    }
  }

  if (r.energy >= 1 && r.ore >= 1) actions.push(ctx.makeAction("sabotage", agentId));
  if (ctx.state.activeCrisis && !ctx.state.activeCrisis.resolved) actions.push(ctx.makeAction("crisis_contribute", agentId));
  actions.push(ctx.makeAction("pass", agentId));
  return actions;
}
