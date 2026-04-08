import { AgentId } from "../../core/types.js";
import { hexDistance } from "./hex-grid.js";
import {
  ComedyGameState,
  ComedyPlayerState,
  EcosystemExtractionRecord,
  EcosystemState,
  ResourceInventory,
} from "./types.js";

export interface CommonsCycleResult {
  ecosystems: EcosystemState[];
  details: Array<{
    ecosystemId: string;
    extractions: EcosystemExtractionRecord[];
    totalPressure: number;
    totalYield: number;
    status: EcosystemState["status"];
  }>;
}

export interface CommonsHealthRefresh {
  ecosystemAverage: number;
  collapsed: number;
  strained: number;
  flourishing: number;
}

export function computeEcosystemStatus(ecosystem: EcosystemState): EcosystemState["status"] {
  if (ecosystem.health <= ecosystem.collapseThreshold) return "collapsed";
  if (ecosystem.health >= ecosystem.flourishThreshold) return "flourishing";
  if (ecosystem.health <= Math.round(ecosystem.flourishThreshold * 0.72)) return "strained";
  return "stable";
}

export function getEcosystemYieldMultiplier(ecosystem: EcosystemState): number {
  if (ecosystem.status === "flourishing") return 1.35;
  if (ecosystem.status === "collapsed") return 0.45;
  if (ecosystem.status === "strained") return 0.8;
  return 1;
}

export function getRestorationCost(kind: EcosystemState["kind"]): ResourceInventory {
  switch (kind) {
    case "fishery":
      return { grain: 0, timber: 0, ore: 0, fish: 0, water: 1, energy: 1 };
    case "forest":
      return { grain: 1, timber: 0, ore: 0, fish: 0, water: 1, energy: 0 };
    case "aquifer":
      return { grain: 0, timber: 0, ore: 0, fish: 0, water: 1, energy: 1 };
    case "wetland":
      return { grain: 1, timber: 0, ore: 0, fish: 0, water: 1, energy: 0 };
  }
}

export function computeCommonsCycleEffects(
  state: ComedyGameState,
  playerStates: Map<AgentId, ComedyPlayerState>,
): CommonsCycleResult {
  const roundExtractions = state.ecosystemExtractions.filter((entry) => entry.round === state.round);
  const ecosystems: EcosystemState[] = [];
  const details: CommonsCycleResult["details"] = [];

  for (const ecosystem of state.ecosystems) {
    const extractions = roundExtractions.filter((entry) => entry.ecosystemId === ecosystem.id);
    let totalPressure = extractions.reduce((sum, entry) => sum + entry.pressure, 0);

    for (const [, ps] of playerStates) {
      for (const army of ps.armies) {
        const armyHex = army.position;
        for (const regionId of ecosystem.regionIds) {
          const region = state.worldMap.regions.find((r) => r.id === regionId);
          if (!region) continue;
          if (hexDistance(armyHex, region.coord) <= 1) {
            totalPressure += army.count * 0.05;
            break;
          }
        }
      }
    }

    const totalYield = extractions.reduce((sum, entry) => sum + entry.yield, 0);
    const regenBonus = totalPressure === 0 && ecosystem.health < ecosystem.maxHealth ? 1 : 0;
    const delta = ecosystem.baseRegeneration + regenBonus - totalPressure;
    const next: EcosystemState = {
      ...ecosystem,
      regionIds: [...ecosystem.regionIds],
      extractionProfiles: ecosystem.extractionProfiles.map((profile) => ({ ...profile })),
      label: { ...ecosystem.label },
      lastPressure: totalPressure,
      lastYield: totalYield,
      lastDelta: delta,
      health: Math.max(0, Math.min(ecosystem.maxHealth, ecosystem.health + delta)),
    };
    next.status = computeEcosystemStatus(next);
    ecosystems.push(next);
    details.push({ ecosystemId: ecosystem.id, extractions, totalPressure, totalYield, status: next.status });
  }

  return { ecosystems, details };
}

export function computeCommonsHealthRefresh(ecosystems: EcosystemState[]): CommonsHealthRefresh {
  const ecosystemAverage = ecosystems.length > 0
    ? Math.round(ecosystems.reduce((sum, ecosystem) => sum + ecosystem.health, 0) / ecosystems.length)
    : 100;
  const collapsed = ecosystems.filter((ecosystem) => ecosystem.status === "collapsed").length;
  const strained = ecosystems.filter((ecosystem) => ecosystem.status === "strained").length;
  const flourishing = ecosystems.filter((ecosystem) => ecosystem.status === "flourishing").length;
  return { ecosystemAverage, collapsed, strained, flourishing };
}
