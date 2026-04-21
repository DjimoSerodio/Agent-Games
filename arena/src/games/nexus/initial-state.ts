import { GameConfig } from "../../core/types.js";
import { CommonsHealthSnapshot, TragedyGameState, PRODUCTION_WHEEL } from "./types.js";
import { generateHexGrid, hexKey } from "./hex-grid.js";
import { createTragedyWorldMap, projectWorldMapToHexGrid } from "./world-map.js";

export function createInitialTragedyState(
  config: GameConfig,
  carryoverPrizePool: bigint,
  buildCommonsHealthSnapshot: (
    round: number,
    score: number,
    reasons: string[],
    payablePrizePool: bigint,
    slashedPrizePool: bigint,
    carryoverPrizePool: bigint,
  ) => CommonsHealthSnapshot,
): TragedyGameState {
  const mapPlayerCount = Math.max(4, Math.min(12, config.maxPlayers));
  const worldMap = createTragedyWorldMap();
  const hexGrid = generateHexGrid(mapPlayerCount);
  const worldGrid = projectWorldMapToHexGrid(worldMap);
  for (const [, worldTile] of worldGrid) {
    const key = hexKey(worldTile.coord);
    const base = hexGrid.get(key);
    if (base) {
      hexGrid.set(key, { ...base, ...worldTile });
    } else {
      hexGrid.set(key, worldTile);
    }
  }
  const actualMaxRounds = 20 + Math.floor(Math.random() * 11);
  const initialCommonsHealth = buildCommonsHealthSnapshot(
    0,
    100,
    ["Commons intact at game start"],
    carryoverPrizePool,
    0n,
    carryoverPrizePool,
  );

  return {
    gameId: config.id,
    round: 0,
    phase: "setup",
    players: [],
    scores: {},
    isFinished: false,
    winner: null,
    hexGrid,
    worldMap,
    vertices: [],
    edges: [],
    playerStates: new Map(),
    productionWheel: [...PRODUCTION_WHEEL],
    wheelPosition: 0,
    activeCrisis: null,
    crisisHistory: [],
    crisisCooldown: 3,
    ecosystems: worldMap.ecosystems.map((ecosystem) => ({
      id: ecosystem.id,
      name: ecosystem.name,
      kind: ecosystem.kind,
      resource: ecosystem.resource,
      regionIds: [...ecosystem.regionIds],
      label: ecosystem.label,
      health: ecosystem.maxHealth,
      maxHealth: ecosystem.maxHealth,
      collapseThreshold: ecosystem.collapseThreshold,
      flourishThreshold: ecosystem.flourishThreshold,
      baseRegeneration: ecosystem.baseRegeneration,
      extractionProfiles: ecosystem.extractionProfiles.map((profile) => ({ ...profile })),
      lastPressure: 0,
      lastYield: 0,
      lastDelta: 0,
      status: "stable",
      asset: ecosystem.asset,
      description: ecosystem.description,
    })),
    ecosystemExtractions: [],
    longestRoadHolder: null,
    mostInfluenceHolder: null,
    mostCrisisContribHolder: null,
    prizePool: carryoverPrizePool,
    payablePrizePool: carryoverPrizePool,
    slashedPrizePool: 0n,
    carryoverPrizePool,
    moveCount: 0,
    messageCount: 0,
    commitmentCandidates: [],
    commitments: [],
    attestations: [],
    contestedClaims: [],
    behaviorTags: [],
    payoutReceipts: [],
    commonsHealthHistory: [initialCommonsHealth],
    currentCommonsHealth: initialCommonsHealth,
    actualMaxRounds,
    allianceCooperationRounds: new Map(),
    allianceVP: new Map(),
  };
}
