import { AgentId, ActionOutcome } from "../../core/types.js";
import { getRegionByCoord } from "./world-map.js";
import { ComedyGameState, CommonsHealthSnapshot, CrisisEvent, HexCoord, ResourceInventory } from "./types.js";

export function buildStateUpdatePayload(
  state: ComedyGameState,
  outcomes: ActionOutcome[],
  resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }>,
) {
  const agentStates: Record<string, {
    resources: ResourceInventory;
    vp: number;
    influence: number;
    longestRoad: number;
    structures: {
      villages: number;
      townships: number;
      cities: number;
      beacons: number;
      tradePosts: number;
      roads: number;
    };
    structureLocations: Array<{
      type: string;
      hexes: Array<{ q: number; r: number }>;
      regionId?: string;
      regionIds?: string[];
    }>;
    armies: Array<{ id: string; owner: AgentId; position: HexCoord; count: number }>;
  }> = {};

  for (const [agentId, ps] of state.playerStates) {
    const structureLocations: Array<{
      type: string;
      hexes: Array<{ q: number; r: number }>;
      regionId?: string;
      regionIds?: string[];
    }> = [];
    for (const v of ps.structures.villages) structureLocations.push({ type: "village", hexes: v.hexes, regionId: v.regionId });
    for (const t of ps.structures.townships) structureLocations.push({ type: "township", hexes: t.hexes, regionId: t.regionId });
    for (const c of ps.structures.cities) structureLocations.push({ type: "city", hexes: c.hexes, regionId: c.regionId });
    for (const b of ps.structures.beacons) structureLocations.push({ type: "beacon", hexes: b.hexes, regionId: b.regionId });
    for (const tp of ps.structures.tradePosts) structureLocations.push({ type: "trade_post", hexes: tp.hexes, regionId: tp.regionId });
    for (const r of ps.structures.roads) structureLocations.push({ type: "road", hexes: r.hexes, regionIds: r.regionIds ? [...r.regionIds] : undefined });

    agentStates[agentId] = {
      resources: { ...ps.resources },
      vp: ps.vp,
      influence: ps.influence,
      longestRoad: ps.longestRoad,
      structures: {
        villages: ps.structures.villages.length,
        townships: ps.structures.townships.length,
        cities: ps.structures.cities.length,
        beacons: ps.structures.beacons.length,
        tradePosts: ps.structures.tradePosts.length,
        roads: ps.structures.roads.length,
      },
      structureLocations,
      armies: ps.armies.map((a) => ({ ...a })),
    };
  }

  return {
    round: state.round,
    phase: state.phase,
    agentStates,
    activeCrisis: state.activeCrisis,
    wheelPosition: state.wheelPosition,
    moveCount: state.moveCount,
    prizePool: state.prizePool.toString(),
    payablePrizePool: state.payablePrizePool.toString(),
    slashedPrizePool: state.slashedPrizePool.toString(),
    carryoverPrizePool: state.carryoverPrizePool.toString(),
    commonsHealth: state.currentCommonsHealth,
    ecosystems: state.ecosystems.map((ecosystem) => ({
      id: ecosystem.id,
      name: ecosystem.name,
      kind: ecosystem.kind,
      resource: ecosystem.resource,
      health: ecosystem.health,
      maxHealth: ecosystem.maxHealth,
      status: ecosystem.status,
      regionIds: ecosystem.regionIds,
      label: ecosystem.label,
      lastPressure: ecosystem.lastPressure,
      lastYield: ecosystem.lastYield,
      lastDelta: ecosystem.lastDelta,
      flourishThreshold: ecosystem.flourishThreshold,
      collapseThreshold: ecosystem.collapseThreshold,
      asset: ecosystem.asset,
    })),
    commitments: state.commitments.map((commitment) => ({
      id: commitment.id,
      type: commitment.type,
      promisor: commitment.promisor,
      counterparties: commitment.counterparties,
      resolutionStatus: commitment.resolutionStatus,
      summary: commitment.summary,
      dueByRound: commitment.dueByRound,
      payoutShareBps: commitment.payoutShareBps,
    })),
    attestations: state.attestations.map((attestation) => ({
      id: attestation.id,
      commitmentId: attestation.commitmentId,
      actor: attestation.actor,
      phase: attestation.phase,
      verdict: attestation.verdict,
      weight: attestation.weight,
    })),
    bonusHolders: {
      longestRoad: state.longestRoadHolder,
      mostInfluence: state.mostInfluenceHolder,
    },
    recentTrades: resolvedTrades,
    recentExtractions: state.ecosystemExtractions.filter((entry) => entry.round === state.round),
    actionSummary: outcomes.filter((o) => o.success).map((o) => ({
      agentId: o.action.agentId,
      type: o.action.type,
      description: o.description,
    })),
  };
}

export function buildHexGridDataPayload(state: ComedyGameState) {
  const hexes = Array.from(state.hexGrid.values()).map((tile) => ({
    q: tile.coord.q,
    r: tile.coord.r,
    terrain: tile.terrain,
    productionNumber: tile.productionNumber,
    revealed: tile.revealed,
    regionId: tile.regionId,
    regionName: tile.regionName,
    biome: tile.biome,
    primaryResource: tile.primaryResource,
    center: tile.center,
    polygon: tile.polygon,
    ecosystemIds: tile.ecosystemIds,
  }));

  const agentPositions: Record<string, { q: number; r: number }> = {};
  const agentRegions: Record<string, string> = {};
  for (const [agentId, ps] of state.playerStates) {
    if (ps.structures.villages.length > 0) {
      const startHex = ps.structures.villages[0].hexes[0];
      agentPositions[agentId] = { q: startHex.q, r: startHex.r };
      const startRegion = getRegionByCoord(state.worldMap, startHex);
      if (startRegion) {
        agentRegions[agentId] = startRegion.id;
      }
    }
  }

  return {
    hexes,
    agentPositions,
    agentRegions,
    productionWheel: state.productionWheel,
    worldMap: {
      id: state.worldMap.id,
      name: state.worldMap.name,
      assets: state.worldMap.assets,
      regions: state.worldMap.regions,
      ecosystems: state.ecosystems.map((ecosystem) => ({
        id: ecosystem.id,
        name: ecosystem.name,
        kind: ecosystem.kind,
        resource: ecosystem.resource,
        regionIds: ecosystem.regionIds,
        label: ecosystem.label,
        health: ecosystem.health,
        maxHealth: ecosystem.maxHealth,
        status: ecosystem.status,
        asset: ecosystem.asset,
      })),
    },
  };
}

export function buildStateSnapshot(
  state: ComedyGameState,
  trustMatrix: { agents: AgentId[]; matrix: number[][] },
): {
  gameId: string;
  round: number;
  phase: string;
  isFinished: boolean;
  winner: AgentId | null;
  hexGrid: Array<any>;
  agentStates: Record<string, any>;
  agentPositions: Record<string, { q: number; r: number }>;
  agentRegions: Record<string, string>;
  productionWheel: number[];
  wheelPosition: number;
  activeCrisis: CrisisEvent | null;
  ecosystems: Array<any>;
  prizePool: string;
  payablePrizePool: string;
  slashedPrizePool: string;
  carryoverPrizePool: string;
  commonsHealth: CommonsHealthSnapshot;
  commitments: Array<any>;
  attestations: Array<any>;
  behaviorTags: Array<any>;
  bonusHolders: { longestRoad: AgentId | null; mostInfluence: AgentId | null };
  trustMatrix: { agents: AgentId[]; matrix: number[][] };
} {
  const hexGrid = Array.from(state.hexGrid.values()).map((tile) => ({
    q: tile.coord.q,
    r: tile.coord.r,
    terrain: tile.terrain,
    productionNumber: tile.productionNumber,
    revealed: tile.revealed,
    regionId: tile.regionId,
    regionName: tile.regionName,
    biome: tile.biome,
    primaryResource: tile.primaryResource,
    center: tile.center,
    polygon: tile.polygon,
    ecosystemIds: tile.ecosystemIds,
  }));

  const agentStates: Record<string, any> = {};
  const agentPositions: Record<string, { q: number; r: number }> = {};
  const agentRegions: Record<string, string> = {};

  for (const [agentId, ps] of state.playerStates) {
    const structureLocations: Array<any> = [];
    for (const v of ps.structures.villages) structureLocations.push({ type: "village", hexes: v.hexes, regionId: v.regionId });
    for (const t of ps.structures.townships) structureLocations.push({ type: "township", hexes: t.hexes, regionId: t.regionId });
    for (const c of ps.structures.cities) structureLocations.push({ type: "city", hexes: c.hexes, regionId: c.regionId });
    for (const b of ps.structures.beacons) structureLocations.push({ type: "beacon", hexes: b.hexes, regionId: b.regionId });
    for (const tp of ps.structures.tradePosts) structureLocations.push({ type: "trade_post", hexes: tp.hexes, regionId: tp.regionId });
    for (const r of ps.structures.roads) structureLocations.push({ type: "road", hexes: r.hexes, regionIds: r.regionIds ? [...r.regionIds] : undefined });

    agentStates[agentId] = {
      resources: { ...ps.resources },
      vp: ps.vp,
      influence: ps.influence,
      longestRoad: ps.longestRoad,
      structures: {
        villages: ps.structures.villages.length,
        townships: ps.structures.townships.length,
        cities: ps.structures.cities.length,
        beacons: ps.structures.beacons.length,
        tradePosts: ps.structures.tradePosts.length,
        roads: ps.structures.roads.length,
      },
      structureLocations,
      armies: ps.armies.map((a) => ({ ...a })),
    };

    if (ps.structures.villages.length > 0) {
      const startHex = ps.structures.villages[0].hexes[0];
      agentPositions[agentId] = { q: startHex.q, r: startHex.r };
      const startRegion = getRegionByCoord(state.worldMap, startHex);
      if (startRegion) {
        agentRegions[agentId] = startRegion.id;
      }
    }
  }

  return {
    gameId: state.gameId,
    round: state.round,
    phase: state.phase,
    isFinished: state.isFinished,
    winner: state.winner,
    hexGrid,
    agentStates,
    agentPositions,
    agentRegions,
    productionWheel: [...state.productionWheel],
    wheelPosition: state.wheelPosition,
    activeCrisis: state.activeCrisis,
    ecosystems: state.ecosystems.map((ecosystem) => ({
      id: ecosystem.id,
      name: ecosystem.name,
      kind: ecosystem.kind,
      resource: ecosystem.resource,
      health: ecosystem.health,
      maxHealth: ecosystem.maxHealth,
      status: ecosystem.status,
      regionIds: ecosystem.regionIds,
      label: ecosystem.label,
      lastPressure: ecosystem.lastPressure,
      lastYield: ecosystem.lastYield,
      lastDelta: ecosystem.lastDelta,
    })),
    prizePool: state.prizePool.toString(),
    payablePrizePool: state.payablePrizePool.toString(),
    slashedPrizePool: state.slashedPrizePool.toString(),
    carryoverPrizePool: state.carryoverPrizePool.toString(),
    commonsHealth: state.currentCommonsHealth,
    commitments: state.commitments.map((commitment) => ({
      id: commitment.id,
      type: commitment.type,
      promisor: commitment.promisor,
      counterparties: commitment.counterparties,
      resolutionStatus: commitment.resolutionStatus,
      summary: commitment.summary,
      dueByRound: commitment.dueByRound,
      payoutShareBps: commitment.payoutShareBps,
    })),
    attestations: state.attestations.map((attestation) => ({
      id: attestation.id,
      commitmentId: attestation.commitmentId,
      actor: attestation.actor,
      phase: attestation.phase,
      verdict: attestation.verdict,
      weight: attestation.weight,
    })),
    behaviorTags: state.behaviorTags.map((tag) => ({
      id: tag.id,
      round: tag.round,
      actor: tag.actor,
      kind: tag.kind,
      severity: tag.severity,
      description: tag.description,
    })),
    bonusHolders: {
      longestRoad: state.longestRoadHolder,
      mostInfluence: state.mostInfluenceHolder,
    },
    trustMatrix,
  };
}
