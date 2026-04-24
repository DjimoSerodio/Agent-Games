import { AgentId, ActionOutcome, TrustUpdate } from "../../core/types.js";
import { hexKey } from "./hex-grid.js";
import { getRegionByCoord } from "./world-map.js";
import { TragedyGameState, TragedyPlayerState, CrisisEvent, EcosystemState, ResourceType } from "./types.js";
import { computeCommonsCycleEffects } from "./ecosystem.js";
import { computeCrisisPenalties, computeCrisisResolution } from "./crisis.js";

export function getControlledRegionIds(state: TragedyGameState, agentId: AgentId): string[] {
  const ps = state.playerStates.get(agentId);
  if (!ps) return [];
  const regionIds = new Set<string>();
  const structures = [...ps.structures.villages, ...ps.structures.townships, ...ps.structures.cities, ...ps.structures.beacons, ...ps.structures.tradePosts];
  for (const structure of structures) {
    if (structure.regionId) {
      regionIds.add(structure.regionId);
      continue;
    }
    const region = structure.hexes[0] ? getRegionByCoord(state.worldMap, structure.hexes[0]) : undefined;
    if (region) regionIds.add(region.id);
  }
  return [...regionIds];
}

export function getAccessibleEcosystems(state: TragedyGameState, agentId: AgentId): EcosystemState[] {
  const controlled = new Set(getControlledRegionIds(state, agentId));
  return state.ecosystems
    .filter((ecosystem) => ecosystem.regionIds.some((regionId) => controlled.has(regionId)))
    .sort((left, right) => left.health - right.health);
}

export function chooseAccessibleEcosystem(state: TragedyGameState, agentId: AgentId, ecosystemId?: string): EcosystemState | null {
  const accessible = getAccessibleEcosystems(state, agentId);
  if (accessible.length === 0) return null;
  if (ecosystemId) return accessible.find((ecosystem) => ecosystem.id === ecosystemId) || null;
  return accessible[0] || null;
}

export function resolveCommonsCycle(ctx: any, trustUpdates: TrustUpdate[]): void {
  const commonsCycle = computeCommonsCycleEffects(ctx.state, ctx.state.playerStates);
  ctx.state.ecosystems = commonsCycle.ecosystems;

  for (const detail of commonsCycle.details) {
    const ecosystem = ctx.state.ecosystems.find((item: EcosystemState) => item.id === detail.ecosystemId);
    if (!ecosystem) continue;
    if (detail.status === "collapsed" && detail.extractions.length > 0) {
      for (const extraction of detail.extractions) {
        ctx.recordBehaviorTag(extraction.agentId, "extractive", undefined, `${ecosystem.name} collapsed under extraction pressure`, "high", -0.18);
        for (const otherId of ctx.state.players) {
          if (otherId === extraction.agentId) continue;
          trustUpdates.push({ from: otherId, to: extraction.agentId, delta: -0.08, reason: "commons_collapsed" });
        }
      }
    } else if (detail.status === "flourishing" && detail.totalPressure > 0 && detail.totalPressure <= ecosystem.baseRegeneration) {
      for (const extraction of detail.extractions) {
        if (extraction.level === "high") continue;
        ctx.recordBehaviorTag(extraction.agentId, "stewardship", undefined, `${ecosystem.name} remained healthy under restrained extraction`, "low", 0.08);
      }
    }
  }
}

export function applyCrisisPenalty(ctx: any, crisis: CrisisEvent, scoreChanges: Record<AgentId, number>): void {
  const scorePenalties = computeCrisisPenalties(crisis, ctx.state.playerStates);
  for (const [agentId, penalty] of scorePenalties) scoreChanges[agentId] = (scoreChanges[agentId] || 0) + penalty;

  switch (crisis.type) {
    case "blight": {
      for (const [, ps] of ctx.state.playerStates as Map<AgentId, TragedyPlayerState>) {
        const lost = Math.min(ps.resources.grain, 2);
        ps.resources.grain -= lost;
        if (ps.resources.water > 0) ps.resources.water -= 1;
      }
      break;
    }
    case "storm": {
      for (const [, ps] of ctx.state.playerStates as Map<AgentId, TragedyPlayerState>) {
        if (ps.structures.roads.length > 0) {
          ps.structures.roads.pop();
          ps.longestRoad = Math.max(0, ps.longestRoad - 1);
        }
      }
      break;
    }
    case "famine": {
      for (const [, ps] of ctx.state.playerStates as Map<AgentId, TragedyPlayerState>) {
        const total = ctx.totalResources(ps.resources);
        if (total > 5) {
          let toRemove = total - 5;
          const types: ResourceType[] = ["grain", "timber", "ore", "fish", "water", "energy"];
          types.sort((a, b) => ps.resources[b] - ps.resources[a]);
          for (const resType of types) {
            const remove = Math.min(ps.resources[resType], toRemove);
            ps.resources[resType] -= remove;
            toRemove -= remove;
            if (toRemove <= 0) break;
          }
        }
      }
      break;
    }
    case "current_surge": {
      const basinHex = ctx.state.hexGrid.get(hexKey({ q: 0, r: 0 }));
      if (basinHex) {
        basinHex.terrain = "wasteland";
        basinHex.productionNumber = 0;
      }
      break;
    }
    case "the_rift": {
      const nonWasteland = Array.from(ctx.state.hexGrid.values() as Iterable<any>).filter((t: any) => t.terrain !== "wasteland" && t.terrain !== "commons");
      if (nonWasteland.length > 0) {
        const target = nonWasteland[Math.floor(Math.random() * nonWasteland.length)] as any;
        target.terrain = "wasteland";
        target.productionNumber = 0;
      }
      break;
    }
  }
}

export function resolveCrisis(
  ctx: any,
  outcomes: ActionOutcome[],
  trustUpdates: TrustUpdate[],
  scoreChanges: Record<AgentId, number>,
  crisisContributors: Set<AgentId>,
): void {
  const crisis = ctx.state.activeCrisis!;
  const contributions = new Map<AgentId, any>(Object.entries(crisis.contributions) as any);
  const resolution = computeCrisisResolution(crisis, contributions);
  const resolved = resolution.resolved;

  crisis.resolved = resolved;

  if (resolved) {
    for (const [agentId] of Object.entries(crisis.contributions)) {
      crisisContributors.add(agentId);
      const ps = ctx.state.playerStates.get(agentId);
      if (ps) {
        ps.influence += crisis.rewardInfluence;
        scoreChanges[agentId] = (scoreChanges[agentId] || 0) + crisis.rewardVP;
        ctx.recordBehaviorTag(agentId, "crisis_contributor", undefined, `Contributed to resolving ${crisis.type}`, "medium", 0.18);
        for (const otherId of Object.keys(crisis.contributions)) {
          if (otherId !== agentId) trustUpdates.push({ from: agentId, to: otherId, delta: 0.2, reason: "crisis_co_contributor" });
        }
      }
    }
    ctx.emitEvent("crisis.resolved", { crisis: crisis.type, resolved: true, contributors: Object.keys(crisis.contributions) }, { agents: "all", spectators: true });
  } else if (ctx.state.round - crisis.triggeredRound >= 3) {
    applyCrisisPenalty(ctx, crisis, scoreChanges);
    const contributors = new Set(Object.keys(crisis.contributions));
    for (const contributorId of contributors) {
      ctx.recordBehaviorTag(contributorId, "crisis_contributor", undefined, `Contributed during failed crisis ${crisis.type}`, "low", 0.08);
    }
    for (const agentId of ctx.state.players) {
      if (!contributors.has(agentId)) {
        ctx.recordBehaviorTag(agentId, "crisis_free_rider", undefined, `Did not contribute to ${crisis.type}`, "medium", -0.2);
        for (const contributorId of contributors) {
          trustUpdates.push({ from: contributorId, to: agentId, delta: -0.25, reason: "crisis_free_rider" });
        }
      }
    }
    ctx.emitEvent("crisis.resolved", {
      crisis: crisis.type,
      resolved: false,
      penalty: crisis.penaltyDescription,
      contributors: Array.from(contributors),
      freeRiders: ctx.state.players.filter((id: AgentId) => !contributors.has(id)),
    }, { agents: "all", spectators: true });
    ctx.state.crisisHistory.push(crisis);
    ctx.state.activeCrisis = null;
  }

  if (resolved) {
    ctx.state.crisisHistory.push(crisis);
    ctx.state.activeCrisis = null;
  }
}
