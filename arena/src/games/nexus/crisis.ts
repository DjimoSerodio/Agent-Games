import { AgentId } from "../../core/types.js";
import {
  CrisisEvent,
  CrisisType,
  EMPTY_INVENTORY,
  ResourceInventory,
  ComedyPlayerState,
} from "./types.js";

export interface CrisisResolutionResult {
  resolved: boolean;
  totalContrib: ResourceInventory;
  contributors: AgentId[];
}

export function selectCrisisType(activeCrises: CrisisType[], rng: () => number): CrisisType {
  const pool: CrisisType[] = activeCrises.length > 0
    ? activeCrises
    : ["blight", "storm", "famine", "current_surge", "the_rift"];
  return pool[Math.floor(rng() * pool.length)];
}

export function computeCrisisResolution(
  crisis: CrisisEvent,
  contributions: Map<AgentId, ResourceInventory>,
): CrisisResolutionResult {
  const totalContrib: ResourceInventory = { ...EMPTY_INVENTORY };
  for (const contribution of contributions.values()) {
    totalContrib.grain += contribution.grain;
    totalContrib.timber += contribution.timber;
    totalContrib.ore += contribution.ore;
    totalContrib.fish += contribution.fish;
    totalContrib.water += contribution.water;
    totalContrib.energy += contribution.energy;
  }

  const threshold = crisis.threshold;
  const resolved =
    totalContrib.grain >= threshold.grain &&
    totalContrib.timber >= threshold.timber &&
    totalContrib.ore >= threshold.ore &&
    totalContrib.fish >= threshold.fish &&
    totalContrib.water >= threshold.water &&
    totalContrib.energy >= threshold.energy;

  return {
    resolved,
    totalContrib,
    contributors: Array.from(contributions.keys()),
  };
}

export function computeCrisisPenalties(
  crisis: CrisisEvent,
  playerStates: Map<AgentId, ComedyPlayerState>,
): Map<AgentId, number> {
  const penalties = new Map<AgentId, number>();
  if (crisis.type !== "the_rift") {
    return penalties;
  }

  for (const agentId of playerStates.keys()) {
    penalties.set(agentId, -1);
  }
  return penalties;
}
