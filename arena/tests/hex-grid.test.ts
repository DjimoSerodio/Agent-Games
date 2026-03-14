/**
 * Hex Grid Tests
 *
 * Tests for hex coordinate utilities and grid generation.
 */

import { describe, it, expect } from "vitest";
import {
  hexNeighbors,
  hexKey,
  parseHexKey,
  hexDistance,
  generateHexGrid,
  getStartingPositions,
} from "../src/games/nexus/hex-grid.js";

describe("hexKey / parseHexKey", () => {
  it("converts coord to string and back", () => {
    const coord = { q: 3, r: -2 };
    const key = hexKey(coord);
    expect(key).toBe("3,-2");
    expect(parseHexKey(key)).toEqual(coord);
  });

  it("handles origin", () => {
    expect(hexKey({ q: 0, r: 0 })).toBe("0,0");
    expect(parseHexKey("0,0")).toEqual({ q: 0, r: 0 });
  });
});

describe("hexNeighbors", () => {
  it("returns exactly 6 neighbors", () => {
    const neighbors = hexNeighbors({ q: 0, r: 0 });
    expect(neighbors).toHaveLength(6);
  });

  it("returns correct neighbors for origin", () => {
    const neighbors = hexNeighbors({ q: 0, r: 0 });
    const keys = neighbors.map(hexKey).sort();
    expect(keys).toEqual(["-1,0", "-1,1", "0,-1", "0,1", "1,-1", "1,0"].sort());
  });

  it("returns correct neighbors for non-origin hex", () => {
    const neighbors = hexNeighbors({ q: 1, r: 1 });
    expect(neighbors).toHaveLength(6);
    // All neighbors should be distance 1 from the original hex
    for (const n of neighbors) {
      expect(hexDistance(n, { q: 1, r: 1 })).toBe(1);
    }
  });
});

describe("hexDistance", () => {
  it("returns 0 for same hex", () => {
    expect(hexDistance({ q: 3, r: -1 }, { q: 3, r: -1 })).toBe(0);
  });

  it("returns 1 for adjacent hexes", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: -1, r: 1 })).toBe(1);
  });

  it("returns correct distance for distant hexes", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -2 })).toBe(2);
    expect(hexDistance({ q: -2, r: 2 }, { q: 2, r: -2 })).toBe(4);
  });

  it("is symmetric", () => {
    const a = { q: 1, r: -2 };
    const b = { q: -1, r: 3 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });
});

describe("generateHexGrid", () => {
  it("generates 19 hexes for 4 players (2 rings)", () => {
    const grid = generateHexGrid(4, 42);
    expect(grid.size).toBe(19);
  });

  it("generates 19 hexes for 5 players (2 rings)", () => {
    const grid = generateHexGrid(5, 42);
    expect(grid.size).toBe(19);
  });

  it("generates 37 hexes for 6 players (3 rings)", () => {
    const grid = generateHexGrid(6, 42);
    expect(grid.size).toBe(37);
  });

  it("has a nexus hex at the center", () => {
    const grid = generateHexGrid(4, 42);
    const center = grid.get("0,0");
    expect(center).toBeDefined();
    expect(center!.terrain).toBe("nexus");
    expect(center!.productionNumber).toBe(7);
  });

  it("center hex is revealed by default", () => {
    const grid = generateHexGrid(4, 42);
    const center = grid.get("0,0");
    expect(center!.revealed).toBe(true);
  });

  it("assigns production numbers to non-wasteland hexes", () => {
    const grid = generateHexGrid(4, 42);
    for (const tile of grid.values()) {
      if (tile.terrain === "wasteland") {
        expect(tile.productionNumber).toBe(0);
      } else {
        expect(tile.productionNumber).toBeGreaterThan(0);
        expect(tile.productionNumber).toBeLessThanOrEqual(12);
      }
    }
  });

  it("is deterministic with the same seed", () => {
    const grid1 = generateHexGrid(4, 12345);
    const grid2 = generateHexGrid(4, 12345);
    for (const [key, tile1] of grid1) {
      const tile2 = grid2.get(key);
      expect(tile2).toBeDefined();
      expect(tile1.terrain).toBe(tile2!.terrain);
      expect(tile1.productionNumber).toBe(tile2!.productionNumber);
    }
  });

  it("produces different grids with different seeds", () => {
    const grid1 = generateHexGrid(4, 111);
    const grid2 = generateHexGrid(4, 222);
    // At least some terrains should differ (very unlikely to be identical)
    let differences = 0;
    for (const [key, tile1] of grid1) {
      const tile2 = grid2.get(key);
      if (tile2 && tile1.terrain !== tile2.terrain) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it("contains all required terrain types", () => {
    const grid = generateHexGrid(4, 42);
    const terrains = new Set(Array.from(grid.values()).map(t => t.terrain));
    expect(terrains.has("nexus")).toBe(true);
    // Should have at least plains, forest, mountains (may or may not have rivers/wasteland depending on seed)
    expect(terrains.size).toBeGreaterThanOrEqual(3);
  });
});

describe("getStartingPositions", () => {
  it("returns correct number of positions for player count", () => {
    const grid = generateHexGrid(4, 42);
    const positions = getStartingPositions(grid, 4);
    expect(positions).toHaveLength(4);
  });

  it("positions are on rings 1-2 (not center, not edge)", () => {
    const grid = generateHexGrid(4, 42);
    const positions = getStartingPositions(grid, 4);
    for (const pos of positions) {
      const dist = hexDistance(pos, { q: 0, r: 0 });
      expect(dist).toBeGreaterThanOrEqual(1);
      expect(dist).toBeLessThanOrEqual(2);
    }
  });

  it("positions are not on wasteland or nexus", () => {
    const grid = generateHexGrid(4, 42);
    const positions = getStartingPositions(grid, 4);
    for (const pos of positions) {
      const tile = grid.get(hexKey(pos));
      expect(tile).toBeDefined();
      expect(tile!.terrain).not.toBe("wasteland");
      expect(tile!.terrain).not.toBe("nexus");
    }
  });
});
