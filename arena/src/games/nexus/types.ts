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

export type ResourceType =
  | "grain"
  | "timber"
  | "ore"
  | "fish"
  | "water"
  | "energy";

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
  regionId?: string;
  regionName?: string;
  biome?: RegionBiome;
  primaryResource?: ResourceType;
  center?: WorldPoint;
  polygon?: WorldPoint[];
  ecosystemIds?: string[];
}

export interface HexVertex {
  hexes: HexCoord[]; // The 3 hexes that share this vertex
  structure: VertexStructure | null;
  owner: AgentId | null;
  regionId?: string;
}

export interface HexEdge {
  hexes: [HexCoord, HexCoord]; // The 2 hexes that share this edge
  road: boolean;
  owner: AgentId | null;
  regionIds?: [string, string];
}

export interface WorldPoint {
  x: number;
  y: number;
}

export type RegionBiome =
  | "fjord"
  | "taiga"
  | "steppe"
  | "wetland"
  | "highland"
  | "desert"
  | "rainforest"
  | "archipelago"
  | "farmland"
  | "volcanic"
  | "riverland";

export interface WorldMapAssets {
  frame: string;
  compass: string;
  underlay: string;
  resourceIcons: Record<ResourceType, string>;
  ecosystemIcons: Record<EcosystemKind, string>;
}

export interface WorldRegion {
  id: string;
  name: string;
  coord: HexCoord;
  biome: RegionBiome;
  primaryResource: ResourceType;
  secondaryResources: ResourceType[];
  productionNumber: number;
  anchor: WorldPoint;
  polygon: WorldPoint[];
  label: WorldPoint;
  adjacentRegionIds: string[];
  ecosystemIds: string[];
  flavor: string;
  asset?: string;
}

export type EcosystemKind = "fishery" | "forest" | "aquifer" | "wetland";

export type ExtractionLevel = "low" | "medium" | "high";

export interface EcosystemExtractionProfile {
  level: ExtractionLevel;
  yield: number;
  pressure: number;
}

export interface WorldEcosystem {
  id: string;
  name: string;
  kind: EcosystemKind;
  resource: ResourceType;
  regionIds: string[];
  label: WorldPoint;
  baseRegeneration: number;
  maxHealth: number;
  flourishThreshold: number;
  collapseThreshold: number;
  extractionProfiles: EcosystemExtractionProfile[];
  description: string;
  asset: string;
}

export interface WorldMap {
  id: string;
  name: string;
  regions: WorldRegion[];
  ecosystems: WorldEcosystem[];
  assets: WorldMapAssets;
  startingRegionIds: string[];
}

// ============================================================
// Structures
// ============================================================

export type VertexStructure = "settlement" | "city" | "beacon" | "trade_post";

export interface StructureCost {
  grain: number;
  timber: number;
  ore: number;
  fish: number;
  water: number;
  energy: number;
}

export const STRUCTURE_COSTS: Record<VertexStructure | "road", StructureCost> = {
  road:       { grain: 1, timber: 1, ore: 0, fish: 0, water: 0, energy: 0 },
  settlement: { grain: 1, timber: 1, ore: 1, fish: 0, water: 1, energy: 0 },
  city:       { grain: 2, timber: 0, ore: 2, fish: 0, water: 1, energy: 0 },
  beacon:     { grain: 0, timber: 0, ore: 1, fish: 0, water: 1, energy: 1 },
  trade_post: { grain: 0, timber: 1, ore: 0, fish: 1, water: 1, energy: 0 },
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
  fish: number;
  water: number;
  energy: number;
}

export const EMPTY_INVENTORY: ResourceInventory = {
  grain: 0,
  timber: 0,
  ore: 0,
  fish: 0,
  water: 0,
  energy: 0,
};

export const RESOURCE_NAMES: ResourceType[] = [
  "grain",
  "timber",
  "ore",
  "fish",
  "water",
  "energy",
];

export const RESOURCE_CAP = 14; // Max total resources

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
    description: "A fungal bloom tears through the breadbasket. Contribute Grain and Water to save the harvest.",
    threshold: { grain: 8, timber: 0, ore: 0, fish: 0, water: 2, energy: 0 },
    rewardVP: 1,
    rewardInfluence: 2,
    penaltyDescription: "All Plains hexes skip next production cycle",
  },
  storm: {
    type: "storm",
    name: "The Great Storm",
    description: "A cross-ocean storm front is incoming. Contribute Energy and Timber to brace the sea walls.",
    threshold: { grain: 0, timber: 2, ore: 0, fish: 0, water: 0, energy: 6 },
    rewardVP: 0,
    rewardInfluence: 3,
    penaltyDescription: "Random roads destroyed across the map",
  },
  famine: {
    type: "famine",
    name: "The Famine",
    description: "Crop failures ripple outward. Contribute Grain, Fish, Timber, and Water for emergency relief.",
    threshold: { grain: 5, timber: 3, ore: 0, fish: 2, water: 2, energy: 0 },
    rewardVP: 1,
    rewardInfluence: 2,
    penaltyDescription: "Resource cap reduced to 5 for 3 rounds",
  },
  nexus_surge: {
    type: "nexus_surge",
    name: "Current Surge",
    description: "The continental grid is overcharging. Contribute Energy, Ore, and Water to stabilize it.",
    threshold: { grain: 0, timber: 0, ore: 3, fish: 0, water: 1, energy: 4 },
    rewardVP: 1,
    rewardInfluence: 2,
    penaltyDescription: "A core production region becomes scorched and stalls",
  },
  the_rift: {
    type: "the_rift",
    name: "The Rift",
    description: "A dimensional rift opens! Contribute ANY 10 resources to seal it.",
    threshold: { grain: 2, timber: 2, ore: 2, fish: 1, water: 2, energy: 1 }, // Any 10 total
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
  | "extract_commons"
  | "restore_ecosystem"
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
    // For sabotage: target agent or edge
    targetAgent?: AgentId;
    targetEdge?: { hexes: [HexCoord, HexCoord] };
    // For crisis_contribute: resources
    contribution?: Partial<ResourceInventory>;
    // For ecosystem extraction / restoration
    ecosystemId?: string;
    extractionLevel?: ExtractionLevel;
    restoration?: Partial<ResourceInventory>;
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

export interface EcosystemState {
  id: string;
  name: string;
  kind: EcosystemKind;
  resource: ResourceType;
  regionIds: string[];
  label: WorldPoint;
  health: number;
  maxHealth: number;
  collapseThreshold: number;
  flourishThreshold: number;
  baseRegeneration: number;
  extractionProfiles: EcosystemExtractionProfile[];
  lastPressure: number;
  lastYield: number;
  lastDelta: number;
  status: "flourishing" | "stable" | "strained" | "collapsed";
  asset: string;
  description: string;
}

export interface EcosystemExtractionRecord {
  ecosystemId: string;
  agentId: AgentId;
  level: ExtractionLevel;
  pressure: number;
  yield: number;
  round: number;
}

// ============================================================
// Commitment Ledger
// ============================================================

export type CommitmentType =
  | "resource_transfer"
  | "non_attack"
  | "crisis_support"
  | "alliance"
  | "prize_share"
  | "non_build"
  | "other";

export type ResolutionStatus =
  | "candidate"
  | "pending"
  | "fulfilled"
  | "breached"
  | "non_triggered"
  | "contested"
  | "expired";

export type AttestationPhase = "existence" | "fulfillment";

export type AttestationVerdict =
  | "confirm"
  | "fulfill"
  | "breach"
  | "non_trigger"
  | "contest"
  | "receive";

export type EvidenceType =
  | "message"
  | "trade"
  | "absence"
  | "crisis_contribution"
  | "winner"
  | "payout_receipt"
  | "attestation"
  | "system";

export type BehaviorTagKind =
  | "sabotage"
  | "crisis_free_rider"
  | "crisis_contributor"
  | "stewardship"
  | "extractive"
  | "opportunistic_targeting";

export interface CommitmentCondition {
  type:
    | "if_i_win"
    | "if_agent_wins"
    | "if_no_attack"
    | "if_resource_transfer"
    | "if_crisis_contribution"
    | "by_round"
    | "manual";
  summary: string;
  agentId?: AgentId;
  resources?: Partial<ResourceInventory>;
  round?: number;
}

export interface EvidenceRef {
  id: string;
  type: EvidenceType;
  ref: string;
  summary: string;
  round: number;
  actorId?: AgentId;
}

export interface AttestationRecord {
  id: string;
  commitmentId: string;
  actor: AgentId;
  round: number;
  phase: AttestationPhase;
  verdict: AttestationVerdict;
  detail: string;
  evidenceRefs: string[];
  weight: number;
  accepted: boolean;
}

export interface ContestedClaim {
  id: string;
  commitmentId: string;
  actor: AgentId;
  round: number;
  reason: string;
  evidenceRefs: string[];
}

export interface PayoutReceipt {
  id: string;
  commitmentId: string;
  from: AgentId;
  to: AgentId;
  shareBps?: number;
  amountWei?: string;
  proof: string;
  round: number;
}

export interface BehaviorTag {
  id: string;
  round: number;
  actor: AgentId;
  kind: BehaviorTagKind;
  severity: "low" | "medium" | "high";
  description: string;
  relatedAgentId?: AgentId;
  trustDeltaHint?: number;
}

export interface CommitmentCandidate {
  id: string;
  messageId: string;
  round: number;
  sender: AgentId;
  counterparties: AgentId[];
  type: CommitmentType;
  visibility: "public" | "private";
  confidence: number;
  rawText: string;
  summary: string;
  conditions: CommitmentCondition[];
}

export interface CommitmentRecord extends CommitmentCandidate {
  candidateId: string;
  promisor: AgentId;
  resolutionStatus: ResolutionStatus;
  attestations: AttestationRecord[];
  evidence: EvidenceRef[];
  dueByRound: number | null;
  resolvedRound: number | null;
  contested: boolean;
  payoutShareBps: number | null;
  behaviorTags: BehaviorTag[];
}

export interface CommonsHealthSnapshot {
  round: number;
  score: number;
  payableFraction: number;
  reasons: string[];
  payablePrizePoolWei: string;
  slashedPrizePoolWei: string;
  carryoverPrizePoolWei: string;
}

// ============================================================
// Game State
// ============================================================

export interface NexusGameState extends GameState {
  // Map
  hexGrid: Map<string, HexTile>; // key = "q,r"
  worldMap: WorldMap;
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

  // Shared ecosystems
  ecosystems: EcosystemState[];
  ecosystemExtractions: EcosystemExtractionRecord[];

  // Scoring
  longestRoadHolder: AgentId | null;
  mostInfluenceHolder: AgentId | null;
  mostCrisisContribHolder: AgentId | null;

  // Economics
  prizePool: bigint; // Accumulated fees
  payablePrizePool: bigint;
  slashedPrizePool: bigint;
  carryoverPrizePool: bigint;
  moveCount: number;
  messageCount: number;

  // Commitment ledger
  commitmentCandidates: CommitmentCandidate[];
  commitments: CommitmentRecord[];
  attestations: AttestationRecord[];
  contestedClaims: ContestedClaim[];
  behaviorTags: BehaviorTag[];
  payoutReceipts: PayoutReceipt[];

  // Commons health / prize carryover
  commonsHealthHistory: CommonsHealthSnapshot[];
  currentCommonsHealth: CommonsHealthSnapshot;

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
  worldMap: WorldMap;
  ecosystemStates: EcosystemState[];
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

  // Commitment ledger
  visibleCommitments: CommitmentRecord[];
  visibleAttestations: AttestationRecord[];

  // Messages I can see
  messageHistory: import("../../core/types.js").Message[];

  // Prize pool / commons health
  prizePool: string; // Wei as string
  payablePrizePool: string;
  slashedPrizePool: string;
  carryoverPrizePool: string;
  currentCommonsHealth: CommonsHealthSnapshot;
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
