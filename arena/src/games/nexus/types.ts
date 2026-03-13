/**
 * Nexus Game Types
 *
 * The flagship coordination game: resource trading on a hex grid
 * with trust mechanics, shared crises, and per-move fees.
 */

import { AgentId, GameState, Action, GameId } from "../../core/types.js";

// ============================================================
// Map / Hex Grid
// ============================================================

export type TerrainType =
  | "plains"    // Produces Grain
  | "forest"    // Produces Timber
  | "mountains" // Produces Ore
  | "rivers"    // Produces Energy
  | "wasteland" // Produces nothing
  | "nexus";    // Produces any (wild)

export type ResourceType = "grain" | "timber" | "ore" | "energy";

export const TERRAIN_RESOURCE: Record<TerrainType, ResourceType | null> = {
  plains: "grain",
  forest: "timber",
  mountains: "ore",
  rivers: "energy",
  wasteland: null,
  nexus: null, // Special handling
};

export interface HexCoord {
  q: number; // Column (axial coordinates)
  r: number; // Row
}

export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
  productionNumber: number; // 2-12
  revealed: boolean; // Fog of war
  revealedBy: AgentId[];
}

export interface HexVertex {
  hexes: HexCoord[]; // The 3 hexes that share this vertex
  structure: VertexStructure | null;
  owner: AgentId | null;
}

export interface HexEdge {
  hexes: [HexCoord, HexCoord]; // The 2 hexes that share this edge
  road: boolean;
  owner: AgentId | null;
}

// ============================================================
// Structures
// ============================================================

export type VertexStructure = "settlement" | "city" | "beacon" | "trade_post";

export interface StructureCost {
  grain: number;
  timber: number;
  ore: number;
  energy: number;
}

export const STRUCTURE_COSTS: Record<VertexStructure | "road", StructureCost> = {
  road:       { grain: 1, timber: 1, ore: 0, energy: 0 },
  settlement: { grain: 1, timber: 1, ore: 1, energy: 0 },
  city:       { grain: 2, timber: 0, ore: 3, energy: 0 },
  beacon:     { grain: 0, timber: 0, ore: 1, energy: 2 },
  trade_post: { grain: 0, timber: 2, ore: 0, energy: 1 },
};

export const STRUCTURE_VP: Record<VertexStructure, number> = {
  settlement: 1,
  city: 2,
  beacon: 1,
  trade_post: 0,
};

// ============================================================
// Resources
// ============================================================

export interface ResourceInventory {
  grain: number;
  timber: number;
  ore: number;
  energy: number;
}

export const EMPTY_INVENTORY: ResourceInventory = {
  grain: 0,
  timber: 0,
  ore: 0,
  energy: 0,
};

export const RESOURCE_CAP = 10; // Max total resources

// ============================================================
// Production Wheel
// ============================================================

/** The fixed production sequence (replaces dice) */
export const PRODUCTION_WHEEL = [
  5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 3, 4, 5, 6, 11, 7, 2,
];

// ============================================================
// Crisis Events
// ============================================================

export type CrisisType = "blight" | "storm" | "famine" | "nexus_surge" | "the_rift";

export interface CrisisEvent {
  type: CrisisType;
  name: string;
  description: string;
  /** Resources needed collectively to resolve */
  threshold: ResourceInventory;
  /** VP/Influence reward for contributors if resolved */
  rewardVP: number;
  rewardInfluence: number;
  /** Penalty if not resolved */
  penaltyDescription: string;
  /** Current contributions */
  contributions: Record<AgentId, ResourceInventory>;
  /** Is this crisis resolved? */
  resolved: boolean;
  /** Round the crisis was triggered */
  triggeredRound: number;
}

export const CRISIS_DEFINITIONS: Record<CrisisType, Omit<CrisisEvent, "contributions" | "resolved" | "triggeredRound">> = {
  blight: {
    type: "blight",
    name: "The Blight",
    description: "A fungal plague threatens the grain fields. Contribute Grain to save the harvest.",
    threshold: { grain: 8, timber: 0, ore: 0, energy: 0 },
    rewardVP: 1,
    rewardInfluence: 2,
    penaltyDescription: "All Plains hexes skip next production cycle",
  },
  storm: {
    type: "storm",
    name: "The Great Storm",
    description: "A massive storm approaches. Contribute Energy to power the shields.",
    threshold: { grain: 0, timber: 0, ore: 0, energy: 6 },
    rewardVP: 0,
    rewardInfluence: 3,
    penaltyDescription: "Random roads destroyed across the map",
  },
  famine: {
    type: "famine",
    name: "The Famine",
    description: "Crops fail across the land. Contribute Grain and Timber for emergency shelters.",
    threshold: { grain: 5, timber: 3, ore: 0, energy: 0 },
    rewardVP: 1,
    rewardInfluence: 2,
    penaltyDescription: "Resource cap reduced to 5 for 3 rounds",
  },
  nexus_surge: {
    type: "nexus_surge",
    name: "Nexus Surge",
    description: "The Nexus is overcharging! Contribute Energy and Ore to stabilize it.",
    threshold: { grain: 0, timber: 0, ore: 4, energy: 4 },
    rewardVP: 1,
    rewardInfluence: 2,
    penaltyDescription: "Nexus hex becomes Wasteland for 5 rounds",
  },
  the_rift: {
    type: "the_rift",
    name: "The Rift",
    description: "A dimensional rift opens! Contribute ANY 10 resources to seal it.",
    threshold: { grain: 3, timber: 3, ore: 2, energy: 2 }, // Any 10 total
    rewardVP: 3,
    rewardInfluence: 3,
    penaltyDescription: "Random hex becomes permanent Wasteland",
  },
};

// ============================================================
// Actions
// ============================================================

export type NexusActionType =
  | "build_road"
  | "build_settlement"
  | "build_city"
  | "build_beacon"
  | "build_trade_post"
  | "trade_player"
  | "trade_bank"
  | "explore"
  | "sabotage"
  | "crisis_contribute"
  | "pass";

export interface NexusAction extends Action {
  type: NexusActionType;
  params: {
    // For building: location
    location?: HexCoord | { hexes: HexCoord[] };
    // For trade_player: partner + resources
    partnerId?: AgentId;
    give?: Partial<ResourceInventory>;
    receive?: Partial<ResourceInventory>;
    // For trade_bank: resource types
    bankGiveType?: ResourceType;
    bankReceiveType?: ResourceType;
    bankGiveAmount?: number;
    // For explore: direction
    targetHex?: HexCoord;
    // For sabotage: target
    targetEdge?: { hexes: [HexCoord, HexCoord] };
    // For crisis_contribute: resources
    contribution?: Partial<ResourceInventory>;
  };
}

// ============================================================
// Player State
// ============================================================

export interface NexusPlayerState {
  id: AgentId;
  resources: ResourceInventory;
  influence: number;
  structures: {
    settlements: HexVertex[];
    cities: HexVertex[];
    beacons: HexVertex[];
    tradePosts: HexVertex[];
    roads: HexEdge[];
  };
  vp: number;
  longestRoad: number;
  revealedHexes: Set<HexCoord>;
}

// ============================================================
// Game State
// ============================================================

export interface NexusGameState extends GameState {
  // Map
  hexGrid: Map<string, HexTile>; // key = "q,r"
  vertices: HexVertex[];
  edges: HexEdge[];

  // Players
  playerStates: Map<AgentId, NexusPlayerState>;

  // Production
  productionWheel: number[];
  wheelPosition: number;

  // Crisis
  activeCrisis: CrisisEvent | null;
  crisisHistory: CrisisEvent[];
  crisisCooldown: number; // Rounds until next crisis can trigger

  // Scoring
  longestRoadHolder: AgentId | null;
  mostInfluenceHolder: AgentId | null;
  mostCrisisContribHolder: AgentId | null;

  // Economics
  prizePool: bigint; // Accumulated fees
  moveCount: number;
  messageCount: number;

  // Hidden state (not shown to agents)
  actualMaxRounds: number; // Hidden end condition
}

// ============================================================
// Agent View (what agents can see)
// ============================================================

export interface NexusAgentView {
  gameId: GameId;
  round: number;
  phase: string;
  myId: AgentId;

  // Map (only revealed hexes)
  visibleHexes: HexTile[];
  visibleVertices: HexVertex[];
  visibleEdges: HexEdge[];

  // My state
  myResources: ResourceInventory;
  myInfluence: number;
  myVP: number;
  myStructures: NexusPlayerState["structures"];

  // Public info
  allScores: Record<AgentId, number>; // VP is public
  allInfluence: Record<AgentId, number>; // Influence is public
  trustScores: Record<AgentId, number>; // Public trust graph

  // Production
  productionWheel: number[];
  wheelPosition: number;
  nextProduction: number[]; // Next 5 numbers on the wheel

  // Crisis
  activeCrisis: CrisisEvent | null;

  // Messages I can see
  messageHistory: import("../../core/types.js").Message[];

  // Prize pool
  prizePool: string; // Wei as string
}

// ============================================================
// Promises (for trust tracking)
// ============================================================

export interface PromiseRecord {
  id: string;
  from: AgentId;
  to: AgentId;
  type: "trade" | "crisis" | "alliance" | "other";
  description: string;
  round: number;
  fulfilled: boolean | null; // null = pending
  detectedInRound: number | null;
}
