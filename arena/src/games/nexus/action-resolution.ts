import { AgentId, ActionOutcome, TrustUpdate } from "../../core/types.js";
import {
  TragedyAction,
  ResourceType,
  ResourceInventory,
  STRUCTURE_COSTS,
  STRUCTURE_VP,
  ExtractionLevel,
  RESOURCE_CAP,
  EMPTY_INVENTORY,
  HexCoord,
} from "./types.js";
import { getRegionByCoord } from "./world-map.js";
import { hexNeighbors, hexKey } from "./hex-grid.js";
import { resolveArmyAttack, resolveArmyBuild, resolveArmyMove } from "./combat.js";

export function resolveAction(
  ctx: any,
  agentId: AgentId,
  action: TragedyAction,
  tradeSubmissions: Map<string, TragedyAction>,
  trustUpdates: TrustUpdate[],
  sabotageEvents: Array<{ from: AgentId; to: AgentId; round: number }>,
): ActionOutcome {
  const ps = ctx.state.playerStates.get(agentId)!;

  switch (action.type) {
    case "build_village": {
      const cost = STRUCTURE_COSTS.village;
      if (!ctx.canAfford(ps.resources, cost)) return ctx.failOutcome(action, "Insufficient resources for village");
      const villageHex = ctx.findBuildableHex(agentId, true);
      if (!villageHex) return ctx.failOutcome(action, "No valid location for village (distance rule)");
      ctx.deductResources(ps, cost);
      const villageRegion = getRegionByCoord(ctx.state.worldMap, villageHex);
      ps.structures.villages.push({ hexes: [villageHex], structure: "village", owner: agentId, regionId: villageRegion?.id });
      ctx.revealHexesAround(agentId, villageHex);
      return ctx.successOutcome(action, "Built a village", [{ type: "vp_change", target: agentId, params: { amount: STRUCTURE_VP.village } }]);
    }
    case "upgrade_township": {
      const cost = STRUCTURE_COSTS.township;
      if (!ctx.canAfford(ps.resources, cost)) return ctx.failOutcome(action, "Insufficient resources for township");
      if (ps.structures.villages.length === 0) return ctx.failOutcome(action, "No villages to upgrade");
      ctx.deductResources(ps, cost);
      const upgradedVillage = ps.structures.villages.shift()!;
      ps.structures.townships.push({ hexes: upgradedVillage.hexes, structure: "township", owner: agentId, regionId: upgradedVillage.regionId });
      return ctx.successOutcome(action, "Upgraded village to township", [{ type: "vp_change", target: agentId, params: { amount: STRUCTURE_VP.township - STRUCTURE_VP.village } }]);
    }
    case "upgrade_city": {
      const cost = STRUCTURE_COSTS.city;
      if (!ctx.canAfford(ps.resources, cost)) return ctx.failOutcome(action, "Insufficient resources for city");
      if (ps.structures.townships.length === 0) return ctx.failOutcome(action, "No townships to upgrade");
      ctx.deductResources(ps, cost);
      const upgradedTownship = ps.structures.townships.shift()!;
      ps.structures.cities.push({ hexes: upgradedTownship.hexes, structure: "city", owner: agentId, regionId: upgradedTownship.regionId });
      return ctx.successOutcome(action, "Upgraded township to city", [{ type: "vp_change", target: agentId, params: { amount: STRUCTURE_VP.city - STRUCTURE_VP.township } }]);
    }
    case "build_road": {
      const cost = STRUCTURE_COSTS.road;
      if (!ctx.canAfford(ps.resources, cost)) return ctx.failOutcome(action, "Insufficient resources for road");
      ctx.deductResources(ps, cost);
      ps.longestRoad++;
      const roadHex = ctx.findStructureHex(agentId);
      if (roadHex) {
        const neighbors = hexNeighbors(roadHex).filter((neighbor) => ctx.state.hexGrid.has(hexKey(neighbor)));
        const neighborHex = neighbors[Math.floor(Math.random() * neighbors.length)] || roadHex;
        const fromRegion = getRegionByCoord(ctx.state.worldMap, roadHex);
        const toRegion = getRegionByCoord(ctx.state.worldMap, neighborHex);
        ps.structures.roads.push({ hexes: [roadHex, neighborHex], road: true, owner: agentId, regionIds: fromRegion && toRegion ? [fromRegion.id, toRegion.id] : undefined });
      }
      return ctx.successOutcome(action, "Built a road", []);
    }
    case "build_beacon": {
      const cost = STRUCTURE_COSTS.beacon;
      if (!ctx.canAfford(ps.resources, cost)) return ctx.failOutcome(action, "Insufficient resources for beacon");
      const beaconHex = ctx.findBuildableHex(agentId, false);
      if (!beaconHex) return ctx.failOutcome(action, "No valid location for beacon");
      ctx.deductResources(ps, cost);
      const beaconRegion = getRegionByCoord(ctx.state.worldMap, beaconHex);
      ps.structures.beacons.push({ hexes: [beaconHex], structure: "beacon", owner: agentId, regionId: beaconRegion?.id });
      for (const neighbor of hexNeighbors(beaconHex)) ctx.revealHexesAround(agentId, neighbor);
      return ctx.successOutcome(action, "Built a beacon", [{ type: "vp_change", target: agentId, params: { amount: STRUCTURE_VP.beacon } }]);
    }
    case "build_trade_post": {
      const cost = STRUCTURE_COSTS.trade_post;
      if (!ctx.canAfford(ps.resources, cost)) return ctx.failOutcome(action, "Insufficient resources for trade post");
      const tpHex = ctx.findBuildableHex(agentId, false);
      if (!tpHex) return ctx.failOutcome(action, "No valid location for trade post");
      ctx.deductResources(ps, cost);
      const tradePostRegion = getRegionByCoord(ctx.state.worldMap, tpHex);
      ps.structures.tradePosts.push({ hexes: [tpHex], structure: "trade_post", owner: agentId, regionId: tradePostRegion?.id });
      return ctx.successOutcome(action, "Built a trade post (2:1 bank trades enabled)", []);
    }
    case "trade_player": {
      const partnerId = action.params.partnerId as AgentId;
      const tradeKey = [agentId, partnerId].sort().join("-");
      tradeSubmissions.set(`${tradeKey}:${agentId}`, action);
      return ctx.successOutcome(action, `Trade offer submitted to ${partnerId}`, []);
    }
    case "trade_bank": {
      const giveType = action.params.bankGiveType as ResourceType;
      const receiveType = action.params.bankReceiveType as ResourceType;
      const giveAmount = (action.params.bankGiveAmount as number) || 4;
      if (!giveType || !receiveType || giveType === receiveType) return ctx.failOutcome(action, "Invalid bank trade parameters");
      if (ps.resources[giveType] < giveAmount) return ctx.failOutcome(action, `Insufficient ${giveType} for bank trade`);
      ps.resources[giveType] -= giveAmount;
      ps.resources[receiveType]++;
      return ctx.successOutcome(action, `Bank trade: ${giveAmount} ${giveType} -> 1 ${receiveType}`, []);
    }
    case "explore": {
      let revealed = 0;
      for (const [, tile] of ctx.state.hexGrid) {
        if (!tile.revealedBy.includes(agentId)) {
          tile.revealed = true;
          tile.revealedBy.push(agentId);
          revealed++;
          if (revealed >= 3) break;
        }
      }
      return ctx.successOutcome(action, `Explored and revealed ${revealed} hexes`, []);
    }
    case "extract_commons": {
      const ecosystem = ctx.chooseAccessibleEcosystem(agentId, action.params.ecosystemId as string | undefined);
      if (!ecosystem) return ctx.failOutcome(action, "No accessible commons ecosystem to extract from");
      const level = (action.params.extractionLevel as ExtractionLevel | undefined) || "medium";
      const profile = ecosystem.extractionProfiles.find((item: any) => item.level === level);
      if (!profile) return ctx.failOutcome(action, "Invalid extraction level");
      const availableCapacity = Math.max(0, RESOURCE_CAP - ctx.totalResources(ps.resources));
      if (availableCapacity <= 0) return ctx.failOutcome(action, "Storage is full; cannot extract from the commons");
      const yieldAmount = Math.min(profile.yield, availableCapacity, Math.max(1, Math.round(profile.yield * ctx.getEcosystemYieldMultiplier(ecosystem))));
      ps.resources[ecosystem.resource] += yieldAmount;
      ctx.state.ecosystemExtractions.push({ ecosystemId: ecosystem.id, agentId, level, pressure: profile.pressure, yield: yieldAmount, round: ctx.state.round });
      if (level === "high") {
        ctx.recordBehaviorTag(agentId, "extractive", undefined, `Pushed ${ecosystem.name} at high extraction`, ecosystem.health <= ecosystem.flourishThreshold ? "high" : "medium", -0.12);
      }
      return ctx.successOutcome(action, `Extracted ${yieldAmount} ${ecosystem.resource} from ${ecosystem.name} (${level})`, []);
    }
    case "restore_ecosystem": {
      const ecosystem = ctx.chooseAccessibleEcosystem(agentId, action.params.ecosystemId as string | undefined);
      if (!ecosystem) return ctx.failOutcome(action, "No accessible ecosystem to restore");
      const restorationCost = ctx.getRestorationCost(ecosystem.kind);
      if (!ctx.canAfford(ps.resources, restorationCost)) return ctx.failOutcome(action, `Insufficient resources to restore ${ecosystem.name}`);
      ctx.deductResources(ps, restorationCost);
      const restored = Math.min(ecosystem.maxHealth - ecosystem.health, 8);
      ecosystem.health += restored;
      ecosystem.lastDelta += restored;
      ecosystem.status = ctx.getEcosystemStatus(ecosystem);
      ctx.recordBehaviorTag(agentId, "stewardship", undefined, `Restored ${ecosystem.name} by ${restored} health`, "medium", 0.14);
      return ctx.successOutcome(action, `Restored ${ecosystem.name}`, []);
    }
    case "sabotage": {
      if (ps.resources.energy < 1 || ps.resources.ore < 1) return ctx.failOutcome(action, "Insufficient resources for sabotage");
      let targetId = action.params.targetAgent as AgentId | undefined;
      if (!targetId || targetId === agentId || !ctx.state.playerStates.has(targetId)) {
        let maxRoads = -1;
        for (const [id, opponent] of ctx.state.playerStates) {
          if (id === agentId) continue;
          if (opponent.structures.roads.length > maxRoads) {
            maxRoads = opponent.structures.roads.length;
            targetId = id;
          }
        }
      }
      if (!targetId || targetId === agentId) return ctx.failOutcome(action, "No valid sabotage target");
      const targetPs = ctx.state.playerStates.get(targetId)!;
      let description: string;
      if (targetPs.structures.roads.length > 0) {
        targetPs.structures.roads.pop();
        targetPs.longestRoad = Math.max(0, targetPs.longestRoad - 1);
        description = `Sabotaged ${targetId}'s road (destroyed)`;
      } else if (targetPs.structures.villages.length > 0) {
        targetPs.structures.villages.pop();
        targetPs.vp = Math.max(0, targetPs.vp - 1);
        description = `Sabotaged ${targetId}'s village (destroyed, -1 VP)`;
      } else if (targetPs.structures.townships.length > 0) {
        const township = targetPs.structures.townships.pop()!;
        targetPs.structures.villages.push({ hexes: township.hexes, structure: "village", owner: targetId, regionId: township.regionId });
        targetPs.vp = Math.max(0, targetPs.vp - (STRUCTURE_VP.township - STRUCTURE_VP.village));
        description = `Sabotaged ${targetId}'s township (downgraded to village, -1 VP)`;
      } else if (targetPs.structures.cities.length > 0) {
        const city = targetPs.structures.cities.pop()!;
        targetPs.structures.townships.push({ hexes: city.hexes, structure: "township", owner: targetId, regionId: city.regionId });
        targetPs.vp = Math.max(0, targetPs.vp - (STRUCTURE_VP.city - STRUCTURE_VP.township));
        description = `Sabotaged ${targetId}'s city (downgraded to township, -1 VP)`;
      } else {
        ps.resources.energy--;
        ps.resources.ore--;
        return ctx.failOutcome(action, `${targetId} has no structures to sabotage`);
      }
      ps.resources.energy--;
      ps.resources.ore--;
      ps.influence -= 2;
      sabotageEvents.push({ from: agentId, to: targetId, round: ctx.state.round });
      ctx.recordBehaviorTag(agentId, "sabotage", targetId, `Sabotaged ${targetId}`, "high", -0.25);
      for (const otherId of ctx.state.players) {
        if (otherId === agentId) continue;
        const delta = otherId === targetId ? -0.4 : -0.15;
        trustUpdates.push({ from: otherId, to: agentId, delta, reason: otherId === targetId ? "sabotage_victim" : "sabotage_witness" });
      }
      return ctx.successOutcome(action, `${description} (-2 Influence)`, []);
    }
    case "crisis_contribute": {
      if (!ctx.state.activeCrisis) return ctx.failOutcome(action, "No active crisis");
      const contribution = (action.params.contribution as Partial<ResourceInventory>) || {};
      let contributed = false;
      for (const [res, amount] of Object.entries(contribution)) {
        const resType = res as ResourceType;
        const amt = amount as number;
        if (amt > 0 && ps.resources[resType] >= amt) {
          ps.resources[resType] -= amt;
          if (!ctx.state.activeCrisis.contributions[agentId]) ctx.state.activeCrisis.contributions[agentId] = { ...EMPTY_INVENTORY };
          ctx.state.activeCrisis.contributions[agentId][resType] += amt;
          contributed = true;
        }
      }
      if (contributed) {
        ps.influence += 1;
        return ctx.successOutcome(action, "Contributed to crisis response (+1 Influence)", []);
      }
      return ctx.failOutcome(action, "No valid resources contributed");
    }
    case "build_army": {
      const result = resolveArmyBuild(agentId, ps, action.params, ctx.state);
      return result.success ? ctx.successOutcome(action, result.description, []) : ctx.failOutcome(action, result.description);
    }
    case "move_army": {
      const armyId = action.params.armyId as string | undefined;
      const targetHex = action.params.targetHex as HexCoord | undefined;
      if (!targetHex) return ctx.failOutcome(action, "No target hex specified");
      const result = resolveArmyMove(agentId, armyId || "", targetHex, ctx.state);
      return result.success ? ctx.successOutcome(action, result.description, []) : ctx.failOutcome(action, result.description);
    }
    case "attack_structure": {
      const targetAgentId = action.params.targetAgent as AgentId | undefined;
      if (!targetAgentId) return ctx.failOutcome(action, "No target agent specified");
      const attackerArmy = ps.armies.find((army: any) => army.owner === agentId && army.count > 0);
      const result = resolveArmyAttack(agentId, attackerArmy?.id || "", targetAgentId, ctx.state, action.params.targetStructureIndex as number | undefined);
      trustUpdates.push(...result.trustUpdates);
      return result.success ? ctx.successOutcome(action, result.description, []) : ctx.failOutcome(action, result.description);
    }
    case "pass":
      return ctx.successOutcome(action, "Passed", []);
    default:
      return ctx.failOutcome(action, `Unknown action type: ${action.type}`);
  }
}
