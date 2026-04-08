import { AgentId } from "../../core/types.js";
import {
  BIOME_ALLOWED_RESOURCES,
  ComedyGameState,
  EcosystemState,
  HexCoord,
  RESOURCE_CAP,
  RESOURCE_NAMES,
  ResourceInventory,
  TERRAIN_RESOURCE,
} from "./types.js";
import { hexDistance } from "./hex-grid.js";
import { getRegionByCoord, getRegionById } from "./world-map.js";

function totalResources(resources: ResourceInventory): number {
  return RESOURCE_NAMES.reduce((sum, resource) => sum + resources[resource], 0);
}

function hasStructureNearHex(state: ComedyGameState, agentId: AgentId, coord: HexCoord): boolean {
  const ps = state.playerStates.get(agentId);
  if (!ps) return false;
  const structures = [
    ...ps.structures.villages,
    ...ps.structures.townships,
    ...ps.structures.cities,
    ...ps.structures.beacons,
    ...ps.structures.tradePosts,
  ];
  for (const structure of structures) {
    for (const structureHex of structure.hexes) {
      if (hexDistance(structureHex, coord) <= 1) return true;
    }
  }
  return false;
}

function hasCityNearHex(state: ComedyGameState, agentId: AgentId, coord: HexCoord): boolean {
  const ps = state.playerStates.get(agentId);
  if (!ps) return false;
  for (const city of ps.structures.cities) {
    for (const cityHex of city.hexes) {
      if (hexDistance(cityHex, coord) <= 1) return true;
    }
  }
  return false;
}

export function getRegionProductionModifier(regionId: string, ecosystems: EcosystemState[]): number {
  let modifier = 0;
  for (const ecosystem of ecosystems) {
    if (!ecosystem.regionIds.includes(regionId)) continue;
    if (ecosystem.status === "collapsed") modifier -= 1;
    else if (ecosystem.status === "strained") modifier -= 0;
    else if (ecosystem.status === "flourishing") modifier += 1;
  }
  return modifier;
}

export function computeProductionYields(
  state: ComedyGameState,
  productionNumber: number,
): Map<AgentId, Partial<ResourceInventory>> {
  const yields = new Map<AgentId, Partial<ResourceInventory>>();
  const runningTotals = new Map<AgentId, number>();

  for (const [agentId, ps] of state.playerStates) {
    runningTotals.set(agentId, totalResources(ps.resources));
    yields.set(agentId, {});
  }

  for (const [, tile] of state.hexGrid) {
    if (tile.productionNumber !== productionNumber) continue;
    if (tile.terrain === "wasteland") continue;

    const region = tile.regionId
      ? getRegionById(state.worldMap, tile.regionId)
      : getRegionByCoord(state.worldMap, tile.coord);
    const resource = region?.primaryResource ?? tile.primaryResource ?? TERRAIN_RESOURCE[tile.terrain];
    if (!resource) continue;

    if (region?.biome) {
      const allowed = BIOME_ALLOWED_RESOURCES[region.biome];
      if (allowed && !allowed.includes(resource)) continue;
    }

    for (const [agentId] of state.playerStates) {
      if (!hasStructureNearHex(state, agentId, tile.coord)) continue;

      const total = runningTotals.get(agentId) || 0;
      if (total >= RESOURCE_CAP) continue;

      let yieldAmount = 1;
      if (hasCityNearHex(state, agentId, tile.coord)) {
        yieldAmount += 1;
      }
      if (region) {
        yieldAmount += getRegionProductionModifier(region.id, state.ecosystems);
      }

      const safeYield = Math.max(0, yieldAmount);
      const grant = Math.min(safeYield, RESOURCE_CAP - total);
      if (grant <= 0) continue;

      const current = yields.get(agentId) || {};
      current[resource] = (current[resource] || 0) + grant;
      yields.set(agentId, current);
      runningTotals.set(agentId, total + grant);
    }
  }

  return yields;
}
