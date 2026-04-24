import { AgentId, TrustUpdate } from "../../core/types.js";
import {
  ARMY_ATTACK_COST_PER_DISTANCE,
  ARMY_COST,
  TragedyGameState,
  TragedyPlayerState,
  HexCoord,
  HexVertex,
  RESOURCE_NAMES,
  ResourceInventory,
} from "./types.js";
import { hexDistance } from "./hex-grid.js";

export interface ArmyCombatResult {
  success: boolean;
  description: string;
  trustUpdates: TrustUpdate[];
}

function canAfford(resources: ResourceInventory, cost: ResourceInventory): boolean {
  return RESOURCE_NAMES.every((resource) => resources[resource] >= cost[resource]);
}

function deductResources(ps: TragedyPlayerState, cost: ResourceInventory): void {
  for (const resource of RESOURCE_NAMES) {
    ps.resources[resource] -= cost[resource];
  }
}

export function resolveArmyBuild(
  agentId: AgentId,
  ps: TragedyPlayerState,
  _params: unknown,
  state: TragedyGameState,
): ArmyCombatResult {
  if (!canAfford(ps.resources, ARMY_COST)) {
    return { success: false, description: "Insufficient resources for army (need 1 Ore + 1 Energy)", trustUpdates: [] };
  }

  deductResources(ps, ARMY_COST);
  const armyId = `army_${state.gameId}_${agentId}_${state.round}`;
  let armyPosition = { q: 0, r: 0 };
  if (ps.structures.villages.length > 0) {
    armyPosition = ps.structures.villages[0].hexes[0];
  } else if (ps.structures.townships.length > 0) {
    armyPosition = ps.structures.townships[0].hexes[0];
  } else if (ps.structures.cities.length > 0) {
    armyPosition = ps.structures.cities[0].hexes[0];
  }

  const existingArmy = ps.armies.find((army) => army.owner === agentId);
  if (existingArmy) {
    existingArmy.count += 1;
  } else {
    ps.armies.push({
      id: armyId,
      owner: agentId,
      position: armyPosition,
      count: 1,
    });
  }

  return { success: true, description: "Built an army unit", trustUpdates: [] };
}

export function resolveArmyMove(
  agentId: AgentId,
  armyId: string,
  destination: HexCoord,
  state: TragedyGameState,
): ArmyCombatResult {
  const ps = state.playerStates.get(agentId);
  if (!ps) {
    return { success: false, description: "No army found to move", trustUpdates: [] };
  }

  const army = ps.armies.find((item) => item.id === armyId && item.owner === agentId);
  if (!army) {
    return { success: false, description: "No army found to move", trustUpdates: [] };
  }

  const distance = hexDistance(army.position, destination);
  if (distance > 1) {
    return { success: false, description: "Army can only move 1 hex per turn", trustUpdates: [] };
  }

  army.position = destination;
  return { success: true, description: `Moved army to (${destination.q}, ${destination.r})`, trustUpdates: [] };
}

export function resolveArmyAttack(
  agentId: AgentId,
  armyId: string,
  targetId: string,
  state: TragedyGameState,
  targetStructureIndex?: number,
): ArmyCombatResult {
  const ps = state.playerStates.get(agentId);
  const targetPs = state.playerStates.get(targetId);
  if (!ps || !targetPs) {
    return { success: false, description: "Target agent not found", trustUpdates: [] };
  }

  const attackerArmy = ps.armies.find((army) => army.id === armyId && army.owner === agentId && army.count > 0);
  if (!attackerArmy) {
    return { success: false, description: "No army available to attack with", trustUpdates: [] };
  }

  let targetStructure: HexVertex | undefined;
  let structureArray: HexVertex[] | undefined;
  let structureType: "village" | "township" | "city" | undefined;

  const allStructures = [
    { array: targetPs.structures.villages, type: "village" as const },
    { array: targetPs.structures.townships, type: "township" as const },
    { array: targetPs.structures.cities, type: "city" as const },
  ];

  let index = targetStructureIndex;
  for (const { array, type } of allStructures) {
    const idx = index !== undefined ? index : 0;
    if (idx < array.length) {
      targetStructure = array[idx];
      structureArray = array;
      structureType = type;
      break;
    }
    if (index !== undefined) {
      index = index - array.length;
    }
  }

  if (!targetStructure || !structureArray || !structureType) {
    return { success: false, description: "Target structure not found", trustUpdates: [] };
  }

  const distance = hexDistance(attackerArmy.position, targetStructure.hexes[0]);
  const attackCost = 1 + Math.ceil(distance * ARMY_ATTACK_COST_PER_DISTANCE);
  if (ps.resources.energy < attackCost) {
    return { success: false, description: `Insufficient energy for attack (need ${attackCost})`, trustUpdates: [] };
  }
  ps.resources.energy -= attackCost;

  const defenderArmy = targetPs.armies.find((army) => army.owner === targetId && hexDistance(army.position, targetStructure!.hexes[0]) <= 1);
  const defenderCount = defenderArmy?.count || 0;
  const attackerCount = attackerArmy.count;
  const odds = attackerCount / (attackerCount + defenderCount);
  const roll = Math.random();

  if (roll >= odds) {
    attackerArmy.count -= 1;
    if (attackerArmy.count === 0) {
      ps.armies = ps.armies.filter((army) => army.id !== attackerArmy.id);
    }
    return { success: false, description: `Attack on ${targetId}'s ${structureType} failed!`, trustUpdates: [] };
  }

  attackerArmy.count -= 1;
  if (attackerArmy.count === 0) {
    ps.armies = ps.armies.filter((army) => army.id !== attackerArmy.id);
  }

  const structIndex = structureArray.findIndex(
    (structure) =>
      structure.hexes[0].q === targetStructure!.hexes[0].q &&
      structure.hexes[0].r === targetStructure!.hexes[0].r,
  );
  if (structIndex !== -1) {
    structureArray.splice(structIndex, 1);
  }

  const newType = structureType === "city"
    ? "township"
    : structureType === "township"
      ? "village"
      : null;

  const trustUpdates: TrustUpdate[] = [];
  if (newType) {
    if (newType === "village") {
      ps.structures.villages.push({
        hexes: targetStructure.hexes,
        structure: "village",
        owner: agentId,
        regionId: targetStructure.regionId,
      });
    } else {
      ps.structures.townships.push({
        hexes: targetStructure.hexes,
        structure: "township",
        owner: agentId,
        regionId: targetStructure.regionId,
      });
    }

    trustUpdates.push({
      from: agentId,
      to: targetId,
      delta: -0.5,
      reason: "conquest",
    });
    for (const otherId of state.players) {
      if (otherId !== agentId && otherId !== targetId) {
        trustUpdates.push({
          from: otherId,
          to: agentId,
          delta: -0.3,
          reason: "aggression",
        });
      }
    }
  }

  return {
    success: true,
    description: `Conquered ${targetId}'s ${structureType}! (now a ${newType})`,
    trustUpdates,
  };
}
