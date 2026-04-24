import { AgentId } from "../../core/types.js";
import { hexDistance, hexKey, hexNeighbors } from "./hex-grid.js";
import { TragedyPlayerState, HexCoord, HexTile } from "./types.js";

export function hasStructureNearHex(ps: TragedyPlayerState, coord: HexCoord): boolean {
  const allStructureHexes = [
    ...ps.structures.villages,
    ...ps.structures.townships,
    ...ps.structures.cities,
    ...ps.structures.beacons,
    ...ps.structures.tradePosts,
  ];

  for (const structure of allStructureHexes) {
    for (const structHex of structure.hexes) {
      if (hexDistance(structHex, coord) <= 1) {
        return true;
      }
    }
  }
  return false;
}

export function hasCityNearHex(ps: TragedyPlayerState, coord: HexCoord): boolean {
  for (const city of ps.structures.cities) {
    for (const cityHex of city.hexes) {
      if (hexDistance(cityHex, coord) <= 1) {
        return true;
      }
    }
  }
  return false;
}

export function getAllStructureHexes(playerStates: Map<AgentId, TragedyPlayerState>): HexCoord[] {
  const hexes: HexCoord[] = [];
  for (const [, ps] of playerStates) {
    for (const v of ps.structures.villages) hexes.push(...v.hexes);
    for (const t of ps.structures.townships) hexes.push(...t.hexes);
    for (const c of ps.structures.cities) hexes.push(...c.hexes);
  }
  return hexes;
}

export function satisfiesDistanceRule(coord: HexCoord, allStructureHexes: HexCoord[]): boolean {
  for (const existing of allStructureHexes) {
    if (hexDistance(coord, existing) < 2) {
      return false;
    }
  }
  return true;
}

export function findBuildableHex(
  agentId: AgentId,
  playerStates: Map<AgentId, TragedyPlayerState>,
  hexGrid: Map<string, HexTile>,
  enforceDistanceRule = true,
): HexCoord | null {
  const ps = playerStates.get(agentId);
  if (!ps) return null;

  const networkKeys = new Set<string>();
  const networkHexes: HexCoord[] = [];
  const allStructures = [
    ...ps.structures.villages,
    ...ps.structures.townships,
    ...ps.structures.cities,
    ...ps.structures.beacons,
    ...ps.structures.tradePosts,
  ];

  for (const s of allStructures) {
    for (const h of s.hexes) {
      const key = hexKey(h);
      if (!networkKeys.has(key)) {
        networkKeys.add(key);
        networkHexes.push(h);
      }
    }
  }
  for (const road of ps.structures.roads) {
    for (const h of road.hexes) {
      const key = hexKey(h);
      if (!networkKeys.has(key)) {
        networkKeys.add(key);
        networkHexes.push(h);
      }
    }
  }

  const allStructureHexes = getAllStructureHexes(playerStates);

  if (networkHexes.length === 0) {
    const revealed = Array.from(hexGrid.values())
      .filter((t) => t.revealedBy.includes(agentId) && t.terrain !== "wasteland");
    if (revealed.length > 0) {
      const candidates = enforceDistanceRule
        ? revealed.filter((t) => satisfiesDistanceRule(t.coord, allStructureHexes))
        : revealed;
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)].coord;
      }
    }
    return null;
  }

  const allOccupied = new Set<string>();
  for (const [, otherPs] of playerStates) {
    for (const s of [
      ...otherPs.structures.villages,
      ...otherPs.structures.townships,
      ...otherPs.structures.cities,
      ...otherPs.structures.beacons,
      ...otherPs.structures.tradePosts,
    ]) {
      for (const h of s.hexes) {
        allOccupied.add(hexKey(h));
      }
    }
  }

  const candidates: HexCoord[] = [];
  for (const nh of networkHexes) {
    for (const neighbor of hexNeighbors(nh)) {
      const key = hexKey(neighbor);
      if (allOccupied.has(key)) continue;
      if (!hexGrid.has(key)) continue;
      const tile = hexGrid.get(key)!;
      if (tile.terrain === "wasteland") continue;
      if (enforceDistanceRule && !satisfiesDistanceRule(neighbor, allStructureHexes)) continue;
      candidates.push(neighbor);
    }
  }

  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  return null;
}

export function findStructureHex(ps: TragedyPlayerState): HexCoord | null {
  const allStructures = [
    ...ps.structures.villages,
    ...ps.structures.townships,
    ...ps.structures.cities,
    ...ps.structures.beacons,
    ...ps.structures.tradePosts,
  ];
  if (allStructures.length === 0) return null;
  const last = allStructures[allStructures.length - 1];
  return last.hexes[0] || null;
}

export function revealHexesAround(
  agentId: AgentId,
  coord: HexCoord,
  hexGrid: Map<string, HexTile>,
): void {
  const hex = hexGrid.get(hexKey(coord));
  if (hex && !hex.revealedBy.includes(agentId)) {
    hex.revealed = true;
    hex.revealedBy.push(agentId);
  }
  for (const neighbor of hexNeighbors(coord)) {
    const nHex = hexGrid.get(hexKey(neighbor));
    if (nHex && !nHex.revealedBy.includes(agentId)) {
      nHex.revealed = true;
      nHex.revealedBy.push(agentId);
    }
  }
}
