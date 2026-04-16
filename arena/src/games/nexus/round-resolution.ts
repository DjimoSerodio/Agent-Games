import { Action, ActionOutcome, AgentId, RoundResult, TrustUpdate } from "../../core/types.js";
import { getStartingPositions as getGridStartingPositions, hexKey, hexNeighbors } from "./hex-grid.js";
import { computeProductionYields } from "./production.js";
import { computeAllianceVPUpdates } from "./scoring.js";
import { ComedyAction } from "./types.js";
import { getRegionByCoord } from "./world-map.js";

export async function initializeAgentsState(ctx: any): Promise<void> {
  const startingPositions = getGridStartingPositions(ctx.state.hexGrid, ctx.state.players.length);

  ctx.state.prizePool += BigInt(ctx.state.players.length) * ctx.config.entryFeeWei;
  ctx.state.payablePrizePool = ctx.state.prizePool;

  for (let i = 0; i < ctx.state.players.length; i++) {
    const agentId = ctx.state.players[i];
    const startPos = startingPositions[i % startingPositions.length];
    const playerState = {
      id: agentId,
      resources: { grain: 2, timber: 2, ore: 1, fish: 1, water: 1, energy: 1 },
      influence: 0,
      structures: { villages: [], townships: [], cities: [], beacons: [], tradePosts: [], roads: [] },
      armies: [],
      vp: 1,
      longestRoad: 0,
      revealedHexes: new Set(),
    };

    ctx.state.playerStates.set(agentId, playerState);
    ctx.state.scores[agentId] = 1;

    const startHex = ctx.state.hexGrid.get(hexKey(startPos));
    if (startHex) {
      startHex.revealed = true;
      startHex.revealedBy.push(agentId);
      for (const neighbor of hexNeighbors(startPos)) {
        const nHex = ctx.state.hexGrid.get(hexKey(neighbor));
        if (!nHex) continue;
        nHex.revealed = true;
        nHex.revealedBy.push(agentId);
      }
    }

    const startRegion = getRegionByCoord(ctx.state.worldMap, startPos);
    (playerState.structures.villages as any[]).push({
      hexes: [startPos],
      structure: "village",
      owner: agentId,
      regionId: startRegion?.id,
    });

    ctx.trustGraph.addAgent(agentId);

    if (ctx.erc8004Integration) {
      try {
        const agentName = `agent_${agentId.slice(0, 8)}`;
        await ctx.erc8004Integration.registerAgentForGame(agentId, {
          name: agentName,
          description: "Comedy of the Commons game agent",
          services: [{ name: "comedy_engine", endpoint: `game://${ctx.config.id}` }],
        });
      } catch (error) {
        console.warn(`Failed to register agent ${agentId} on ERC-8004:`, error);
      }
    }
  }
}

export function executeProduction(ctx: any): void {
  ctx.state.wheelPosition = (ctx.state.wheelPosition + 1) % ctx.state.productionWheel.length;
  const currentNumber = ctx.state.productionWheel[ctx.state.wheelPosition];

  ctx.emitEvent("game.action", {
    type: "production",
    wheelPosition: ctx.state.wheelPosition,
    productionNumber: currentNumber,
  }, { agents: "all", spectators: true });

  const yields = computeProductionYields(ctx.state, currentNumber);
  for (const [agentId, gain] of yields) {
    const ps = ctx.state.playerStates.get(agentId);
    if (!ps) continue;
    for (const [resource, amount] of Object.entries(gain)) {
      ps.resources[resource] += amount as number;
    }
  }

  if (ctx.state.crisisCooldown > 0) {
    ctx.state.crisisCooldown--;
  } else if (!ctx.state.activeCrisis && Math.random() < 0.15) {
    ctx.triggerCrisis();
  }
}

export function resolveAllianceVP(
  ctx: any,
  resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }>,
  sabotageEvents: Array<{ from: AgentId; to: AgentId; round: number }>,
  trustUpdates: TrustUpdate[],
): void {
  const computed = computeAllianceVPUpdates(ctx.state, resolvedTrades, sabotageEvents, trustUpdates);
  ctx.state.allianceCooperationRounds = computed.allianceCooperationRounds;
  ctx.state.allianceVP = computed.allianceVP;

  for (const formed of computed.formedAlliances) {
    ctx.emitEvent("alliance.formed", {
      agents: [formed.from, formed.to],
      roundsOfCooperation: formed.roundsOfCooperation,
      allianceVP: formed.allianceVP,
    }, { agents: "all", spectators: true });
  }

  for (const broken of computed.brokenAlliances) {
    ctx.emitEvent("alliance.broken", {
      saboteur: broken.saboteur,
      victim: broken.victim,
      penalty: broken.penalty,
      trustUpdates: broken.trustUpdates,
    }, { agents: "all", spectators: true });
  }
}

export function resolveActions(ctx: any, actions: Map<AgentId, Action[]>): RoundResult {
  const outcomes: ActionOutcome[] = [];
  const trustUpdates: TrustUpdate[] = [];
  const scoreChanges: Record<AgentId, number> = {};
  const resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }> = [];
  const sabotageEvents: Array<{ from: AgentId; to: AgentId; round: number }> = [];
  const crisisContributors = new Set<AgentId>();

  for (const agentId of ctx.state.players) scoreChanges[agentId] = 0;
  const tradeSubmissions = new Map<string, ComedyAction>();

  for (const [agentId, agentActions] of actions) {
    const ps = ctx.state.playerStates.get(agentId);
    if (!ps) continue;
    const limitedActions = agentActions.slice(0, 2) as ComedyAction[];

    for (const action of limitedActions) {
      ctx.state.moveCount++;
      ctx.state.prizePool += ctx.config.moveFeeWei;
      const outcome = ctx.resolveAction(agentId, action, tradeSubmissions, trustUpdates, sabotageEvents);
      outcomes.push(outcome);

      if (!outcome.success) continue;
      for (const effect of outcome.effects) {
        if (effect.type !== "vp_change") continue;
        const target = effect.target === "all" ? agentId : effect.target;
        scoreChanges[target] = (scoreChanges[target] || 0) + (effect.params.amount as number);
      }
    }
  }

  ctx.resolveMatchedTrades(tradeSubmissions, outcomes, trustUpdates, resolvedTrades);
  if (ctx.state.activeCrisis && !ctx.state.activeCrisis.resolved) {
    ctx.resolveCrisis(outcomes, trustUpdates, scoreChanges, crisisContributors);
  }

  ctx.resolveCommonsCycle(trustUpdates);
  ctx.resolveCommitmentLedger(trustUpdates, resolvedTrades, sabotageEvents, crisisContributors);
  ctx.resolveAllianceVP(resolvedTrades, sabotageEvents, trustUpdates);
  ctx.refreshCommonsHealth();

  for (const [agentId, delta] of Object.entries(scoreChanges)) {
    const ps = ctx.state.playerStates.get(agentId);
    if (!ps) continue;
    ps.vp += delta;
    ps.vp += ctx.getAllianceVP(agentId);
    ctx.state.scores[agentId] = ps.vp;
  }

  ctx.updateBonusHolders();
  ctx.trustGraph.applyUpdatesWithMeta(trustUpdates, {
    gameId: ctx.state.gameId,
    round: ctx.state.round,
    phase: ctx.state.phase,
    timestamp: Date.now(),
  });
  ctx.trustGraph.tick();

  if (trustUpdates.length > 0) {
    ctx.emitEvent("trust.updated", {
      updates: trustUpdates,
      snapshots: ctx.trustGraph.getAllSnapshots(),
      readModels: ctx.trustGraph.getAllReadModels(),
      dossiers: ctx.trustGraph.getAllTrustDossiers(),
      projections: ctx.trustGraph.getAllGraduatedProjections(),
      snapshotArtifact: ctx.trustGraph.getSnapshotArtifact(),
    }, { agents: "all", spectators: true });
  }

  ctx.emitStateUpdate(outcomes, resolvedTrades);

  return {
    gameId: ctx.state.gameId,
    round: ctx.state.round,
    actions: Object.fromEntries(actions),
    outcomes,
    scoreChanges,
    trustUpdates,
    messages: ctx.messageLog.filter((m: any) => m.round === ctx.state.round),
  };
}
