/**
 * Comedy of the Commons Game Types
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
  | "commons";  // Produces any (wild)

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
  commons: null, // Special handling
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

/**
 * Which resources each biome can produce.
 * Desert never produces water/timber. Farmland never produces ore/energy. Etc.
 */
export const BIOME_ALLOWED_RESOURCES: Record<RegionBiome, ResourceType[]> = {
  fjord:        ["water", "fish", "ore"],
  taiga:        ["timber", "water"],
  steppe:       ["grain", "energy"],
  wetland:      ["water", "fish", "grain"],
  highland:     ["ore", "energy"],
  desert:       ["energy", "ore"],
  rainforest:   ["timber", "water", "grain"],
  archipelago:  ["fish", "water", "ore", "energy"],
  farmland:     ["grain", "water", "timber"],
  volcanic:     ["energy", "ore"],
  riverland:    ["water", "fish", "grain"],
};

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
  hexSize: number;
}

// ============================================================
// Structures
// ============================================================

export type VertexStructure = "village" | "township" | "city" | "beacon" | "trade_post";

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
  village:    { grain: 1, timber: 1, ore: 1, fish: 0, water: 1, energy: 0 },
  township:   { grain: 2, timber: 1, ore: 1, fish: 0, water: 1, energy: 0 },
  city:       { grain: 2, timber: 0, ore: 2, fish: 0, water: 1, energy: 0 },
  beacon:     { grain: 0, timber: 0, ore: 1, fish: 0, water: 1, energy: 1 },
  trade_post: { grain: 0, timber: 1, ore: 0, fish: 1, water: 1, energy: 0 },
};

export const STRUCTURE_VP: Record<VertexStructure, number> = {
  village: 1,
  township: 2,
  city: 3,
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
// Armies
// ============================================================

export interface ArmyState {
  id: string;
  owner: AgentId;
  position: HexCoord; // Hex where army is stationed
  count: number; // Number of army units
}

export const ARMY_COST: ResourceInventory = { grain: 0, timber: 0, ore: 1, fish: 0, water: 0, energy: 1 }; // Cost to build 1 army unit

export const ARMY_ATTACK_COST_PER_DISTANCE = 0.5; // Energy cost per hex distance for attacking

export type ArmyActionType = "build_army" | "move_army" | "attack_structure";

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

export type CrisisType = "blight" | "storm" | "famine" | "current_surge" | "the_rift";

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
  current_surge: {
    type: "current_surge",
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

export type ComedyActionType =
  | "build_road"
  | "build_village"
  | "upgrade_township"
  | "upgrade_city"
  | "build_beacon"
  | "build_trade_post"
  | "trade_player"
  | "trade_bank"
  | "explore"
  | "extract_commons"
  | "restore_ecosystem"
  | "sabotage"
  | "crisis_contribute"
  | "build_army"
  | "move_army"
  | "attack_structure"
  | "pass";

export interface ComedyAction extends Action {
  type: ComedyActionType;
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
    // For army actions
    armyId?: string;
    targetStructureIndex?: number;
    // For upgrades
    upgradeTargetIndex?: number;
  };
}

// ============================================================
// Player State
// ============================================================

export interface ComedyPlayerState {
  id: AgentId;
  resources: ResourceInventory;
  influence: number;
  structures: {
    villages: HexVertex[];
    townships: HexVertex[];
    cities: HexVertex[];
    beacons: HexVertex[];
    tradePosts: HexVertex[];
    roads: HexEdge[];
  };
  armies: ArmyState[];
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

export interface BehaviorMemoryObligation {
  id: string;
  type: CommitmentType;
  promisor: AgentId;
  counterparties: AgentId[];
  summary: string;
  scope?: CommitmentScope;
  resolutionStatus: ResolutionStatus;
  dueByRound: number | null;
  resolvedRound: number | null;
  contested: boolean;
  payoutShareBps: number | null;
  behaviorTags: BehaviorTagKind[];
}

export interface BehaviorMemoryOutcome {
  id: string;
  kind: "evidence" | "behavior_tag" | "payout_receipt";
  sourceType: string;
  round: number;
  actorId?: AgentId;
  counterparties: AgentId[];
  summary: string;
  refs: string[];
}

export interface BehaviorMemoryRelation {
  kind: "counterparty" | "alliance" | "contest" | "association_risk";
  primaryAgentId: AgentId;
  secondaryAgentId?: AgentId;
  round?: number;
  summary: string;
  strength?: number;
  refs: string[];
}

export interface BehaviorMemorySnapshot {
  agentId?: AgentId;
  obligations: BehaviorMemoryObligation[];
  outcomes: BehaviorMemoryOutcome[];
  attestations: AttestationRecord[];
  relations: BehaviorMemoryRelation[];
  updatedAt: number;
}

export type CommitmentScope = "round" | "game" | "olympiad";

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
  scope?: CommitmentScope;
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

export interface ComedyGameState extends GameState {
  // Map
  hexGrid: Map<string, HexTile>; // key = "q,r"
  worldMap: WorldMap;
  vertices: HexVertex[];
  edges: HexEdge[];

  // Players
  playerStates: Map<AgentId, ComedyPlayerState>;

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

  // Alliance VP tracking
  allianceCooperationRounds: Map<AgentId, Map<AgentId, number>>; // agent -> partner -> rounds of sustained cooperation
  allianceVP: Map<AgentId, number>; // agent -> alliance VP earned
}

// ============================================================
// Agent View (what agents can see)
// ============================================================

export interface ComedyAgentView {
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
  myStructures: ComedyPlayerState["structures"];

  // Public info
  allScores: Record<AgentId, number>; // VP is public
  allInfluence: Record<AgentId, number>; // Influence is public
  trustScores: Record<AgentId, number>; // Public trust graph
  trustDossiers: Record<AgentId, import("../../core/types.js").TrustDossier>;
  trustProjectionByAgent: Record<AgentId, import("../../core/types.js").GraduatedTrustProjection>;
  trustSnapshotArtifact: import("../../core/types.js").TrustSnapshotArtifact;
  behaviorMemory: BehaviorMemorySnapshot;

  // Production
  productionWheel: number[];
  wheelPosition: number;
  nextProduction: number[]; // Next 5 numbers on the wheel

  // Crisis
  activeCrisis: CrisisEvent | null;

  // Armies (all armies visible to all agents)
  visibleArmies: ArmyState[];

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

  // Tournament context (what agents can see)
  tournamentDay: number; // Visible: "Day 1", "Day 2" - but actual game count is hidden
  tournamentPrizePool: string; // Wei as string - total accumulated

  // Alliance VP (hidden from agents but shown to spectators)
  allianceInfo: {
    myAllianceVP: number;
    alliancePartners: Array<{ agentId: AgentId; roundsOfCooperation: number }>;
  };
  cumulativeScores: Record<AgentId, number>; // Cumulative scores across session
}

// ============================================================
// Tournament / Session State
// ============================================================

export interface TournamentState {
  sessionId: string;
  gamesPlayed: number; // Hidden from agents
  continuationProbability: number; // Hidden - probability each game continues
  tournamentPrizePool: bigint; // Accumulates across games
  cumulativeScores: Record<AgentId, number>; // Cumulative across session
  currentGameId: GameId | null;
  isActive: boolean;
}

export interface TournamentConfig {
  continuationProbability: number; // e.g., 0.95 = each game has 95% chance to continue
  entryFeePerGameWei: bigint;
  prizeDistribution: {
    first: number; // bps, e.g., 5000 = 50%
    second: number;
    third: number;
    fourth: number;
  };
}

export const DEFAULT_TOURNAMENT_CONFIG: TournamentConfig = {
  continuationProbability: 0.95,
  entryFeePerGameWei: BigInt(50000000000000000), // 0.05 ETH
  prizeDistribution: {
    first: 5000,
    second: 2500,
    third: 1500,
    fourth: 1000,
  },
};

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
