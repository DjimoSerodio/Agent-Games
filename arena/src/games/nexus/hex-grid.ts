/**
 * Hex Grid Generator
 *
 * Generates the game map using axial coordinates.
 * Creates a balanced resource distribution with fog of war.
 */

import {
  HexCoord,
  HexTile,
  TerrainType,
  PRODUCTION_WHEEL,
} from "./types.js";

/**
 * Get the 6 neighbors of a hex in axial coordinates
 */
export function hexNeighbors(coord: HexCoord): HexCoord[] {
  const directions = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  return directions.map((d) => ({ q: coord.q + d.q, r: coord.r + d.r }));
}

/**
 * Convert hex coord to string key
 */
export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

/**
 * Parse hex key back to coord
 */
export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

/**
 * Hex distance between two coordinates
 */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.q + a.r - b.q - b.r),
  );
}

/**
 * Generate a hex grid for a given number of players
 *
 * Player count -> Ring count -> Total hexes:
 *   4 players -> 2 rings -> 19 hexes
 *   5 players -> 2 rings -> 19 hexes
 *   6 players -> 3 rings -> 37 hexes
 */
export function generateHexGrid(
  playerCount: number,
  seed?: number,
): Map<string, HexTile> {
  const rings = playerCount <= 5 ? 2 : 3;
  const grid = new Map<string, HexTile>();

  // Generate hex positions
  const positions: HexCoord[] = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = -rings; r <= rings; r++) {
      if (Math.abs(q + r) <= rings) {
        positions.push({ q, r });
      }
    }
  }

  // Distribute terrain types
  const terrainPool = generateTerrainPool(positions.length, playerCount);
  const productionNumbers = generateProductionNumbers(positions.length);

  // Simple seeded shuffle
  const rng = createRNG(seed ?? Date.now());
  shuffle(terrainPool, rng);
  shuffle(productionNumbers, rng);

  // Center hex is always the Nexus
  const centerIdx = positions.findIndex((p) => p.q === 0 && p.r === 0);
  if (centerIdx >= 0) {
    terrainPool[centerIdx] = "nexus";
    productionNumbers[centerIdx] = 7; // Nexus produces on 7
  }

  // Create tiles
  for (let i = 0; i < positions.length; i++) {
    const coord = positions[i];
    const terrain = terrainPool[i];
    const tile: HexTile = {
      coord,
      terrain,
      productionNumber: terrain === "wasteland" ? 0 : productionNumbers[i],
      revealed: false,
      revealedBy: [],
    };

    // Center and adjacent hexes start revealed
    if (hexDistance(coord, { q: 0, r: 0 }) <= 1) {
      tile.revealed = true;
    }

    grid.set(hexKey(coord), tile);
  }

  return grid;
}

/**
 * Generate balanced terrain distribution
 */
function generateTerrainPool(
  totalHexes: number,
  playerCount: number,
): TerrainType[] {
  // Distribution ratios (roughly):
  // Plains: 25%, Forest: 25%, Mountains: 20%, Rivers: 15%, Wasteland: 10%, Nexus: 1
  const pool: TerrainType[] = [];

  const plainsCount = Math.round(totalHexes * 0.25);
  const forestCount = Math.round(totalHexes * 0.25);
  const mountainsCount = Math.round(totalHexes * 0.20);
  const riversCount = Math.round(totalHexes * 0.15);
  const wastelandCount = Math.round(totalHexes * 0.10);

  for (let i = 0; i < plainsCount; i++) pool.push("plains");
  for (let i = 0; i < forestCount; i++) pool.push("forest");
  for (let i = 0; i < mountainsCount; i++) pool.push("mountains");
  for (let i = 0; i < riversCount; i++) pool.push("rivers");
  for (let i = 0; i < wastelandCount; i++) pool.push("wasteland");

  // Fill remainder with plains/forest
  while (pool.length < totalHexes) {
    pool.push(pool.length % 2 === 0 ? "plains" : "forest");
  }

  return pool;
}

/**
 * Generate production numbers for hexes
 * Uses the production wheel sequence distributed across hexes
 */
function generateProductionNumbers(totalHexes: number): number[] {
  const numbers: number[] = [];
  for (let i = 0; i < totalHexes; i++) {
    numbers.push(PRODUCTION_WHEEL[i % PRODUCTION_WHEEL.length]);
  }
  return numbers;
}

/**
 * Get starting positions for players (spread around the map perimeter)
 */
export function getStartingPositions(
  grid: Map<string, HexTile>,
  playerCount: number,
): HexCoord[] {
  const positions = Array.from(grid.values())
    .map((t) => t.coord)
    .filter((c) => {
      const dist = hexDistance(c, { q: 0, r: 0 });
      return dist >= 1 && dist <= 2; // Ring 1-2, not center
    })
    .filter((c) => {
      const tile = grid.get(hexKey(c));
      return tile && tile.terrain !== "wasteland" && tile.terrain !== "nexus";
    });

  // Space them out evenly
  const selected: HexCoord[] = [];
  const step = Math.floor(positions.length / playerCount);
  for (let i = 0; i < playerCount; i++) {
    selected.push(positions[(i * step) % positions.length]);
  }
  return selected;
}

// ============================================================
// Utility
// ============================================================

function createRNG(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function shuffle<T>(array: T[], rng: () => number): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
