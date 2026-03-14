import {
  type HexCoord,
  type HexTile,
  type ResourceType,
  type WorldMap,
  type WorldPoint,
  type WorldRegion,
  type WorldEcosystem,
  type RegionBiome,
  type TerrainType,
} from "./types.js";

interface RegionSpec {
  id: string;
  name: string;
  coord: HexCoord;
  biome: RegionBiome;
  primaryResource: ResourceType;
  secondaryResources: ResourceType[];
  flavor: string;
  ecosystemIds: string[];
  drift?: WorldPoint;
  scale?: number;
}

interface EcosystemSpec {
  id: string;
  name: string;
  kind: WorldEcosystem["kind"];
  resource: ResourceType;
  regionIds: string[];
  label: WorldPoint;
  baseRegeneration: number;
  maxHealth: number;
  flourishThreshold: number;
  collapseThreshold: number;
  description: string;
}

const PRODUCTION_SEQUENCE = [5, 9, 6, 4, 10, 8, 11, 3, 12, 7, 6, 4, 10, 5, 8, 11, 9, 3, 6];

const REGION_ANCHORS: Record<string, WorldPoint> = {
  glacier_bay: { x: 370, y: 124 },
  aurora_fjord: { x: 254, y: 246 },
  mistbarrow: { x: 164, y: 386 },
  riverwake: { x: 214, y: 536 },
  pearl_delta: { x: 332, y: 704 },
  amber_steppe: { x: 340, y: 430 },
  oldcanopy: { x: 430, y: 284 },
  commons_heart: { x: 454, y: 524 },
  kelp_shoals: { x: 512, y: 688 },
  sunspine_basin: { x: 590, y: 402 },
  orchard_run: { x: 632, y: 548 },
  monsoon_reach: { x: 724, y: 704 },
  ironcrest: { x: 550, y: 134 },
  glass_dunes: { x: 648, y: 276 },
  copper_coast: { x: 774, y: 414 },
  verdant_weald: { x: 810, y: 548 },
  stormmarch: { x: 726, y: 116 },
  obsidian_ridge: { x: 874, y: 250 },
  solis_fields: { x: 940, y: 430 },
};

const REGION_SPECS: RegionSpec[] = [
  {
    id: "mistbarrow",
    name: "Mistbarrow",
    coord: { q: -2, r: 0 },
    biome: "taiga",
    primaryResource: "timber",
    secondaryResources: ["water"],
    flavor: "A cedar frontier of peat, fog, and patient mills.",
    ecosystemIds: ["old_growth_ring"],
    drift: { x: -96, y: -8 },
    scale: 1.06,
  },
  {
    id: "riverwake",
    name: "Riverwake",
    coord: { q: -2, r: 1 },
    biome: "riverland",
    primaryResource: "water",
    secondaryResources: ["grain"],
    flavor: "Broad inland rivers, lockworks, and irrigated terraces.",
    ecosystemIds: ["sunspine_aquifer"],
    drift: { x: -118, y: 26 },
    scale: 1.08,
  },
  {
    id: "pearl_delta",
    name: "Pearl Delta",
    coord: { q: -2, r: 2 },
    biome: "wetland",
    primaryResource: "fish",
    secondaryResources: ["grain", "water"],
    flavor: "Floodplains of canals, rice barges, and reed cities.",
    ecosystemIds: ["silver_tide_fishery", "delta_bloom"],
    drift: { x: -94, y: 72 },
    scale: 1.16,
  },
  {
    id: "aurora_fjord",
    name: "Aurora Fjord",
    coord: { q: -1, r: -1 },
    biome: "fjord",
    primaryResource: "fish",
    secondaryResources: ["ore"],
    flavor: "Knife-edge inlets where cold water meets iron cliffs.",
    ecosystemIds: ["silver_tide_fishery"],
    drift: { x: -54, y: -84 },
    scale: 0.98,
  },
  {
    id: "amber_steppe",
    name: "Amber Steppe",
    coord: { q: -1, r: 0 },
    biome: "steppe",
    primaryResource: "grain",
    secondaryResources: ["energy"],
    flavor: "Wind-brushed plains with caravan roads and granaries.",
    ecosystemIds: [],
    drift: { x: -42, y: -10 },
    scale: 1.04,
  },
  {
    id: "commons_heart",
    name: "Commons Heart",
    coord: { q: -1, r: 1 },
    biome: "farmland",
    primaryResource: "grain",
    secondaryResources: ["water", "timber"],
    flavor: "The old treaty basin where roads, rivers, and councils meet.",
    ecosystemIds: ["old_growth_ring", "sunspine_aquifer"],
    drift: { x: -22, y: 34 },
    scale: 1.12,
  },
  {
    id: "kelp_shoals",
    name: "Kelp Shoals",
    coord: { q: -1, r: 2 },
    biome: "archipelago",
    primaryResource: "fish",
    secondaryResources: ["energy"],
    flavor: "Tidal islands stitched together by kelp ropes and tide mills.",
    ecosystemIds: ["silver_tide_fishery"],
    drift: { x: -26, y: 92 },
    scale: 0.94,
  },
  {
    id: "glacier_bay",
    name: "Glacier Bay",
    coord: { q: 0, r: -2 },
    biome: "fjord",
    primaryResource: "water",
    secondaryResources: ["fish"],
    flavor: "A high cold reservoir feeding half the continent.",
    ecosystemIds: ["silver_tide_fishery"],
    drift: { x: 12, y: -108 },
    scale: 1.02,
  },
  {
    id: "oldcanopy",
    name: "Old Canopy",
    coord: { q: 0, r: -1 },
    biome: "rainforest",
    primaryResource: "timber",
    secondaryResources: ["water"],
    flavor: "Dense canopy commons where logging and stewardship collide.",
    ecosystemIds: ["old_growth_ring"],
    drift: { x: 0, y: -44 },
    scale: 1.14,
  },
  {
    id: "sunspine_basin",
    name: "Sunspine Basin",
    coord: { q: 0, r: 0 },
    biome: "desert",
    primaryResource: "energy",
    secondaryResources: ["water", "ore"],
    flavor: "Solar salt basins and geothermal borefields around a hidden aquifer.",
    ecosystemIds: ["sunspine_aquifer"],
    drift: { x: 10, y: 2 },
    scale: 1.08,
  },
  {
    id: "orchard_run",
    name: "Orchard Run",
    coord: { q: 0, r: 1 },
    biome: "farmland",
    primaryResource: "grain",
    secondaryResources: ["water", "fish"],
    flavor: "High-yield orchards sustained by careful irrigation compacts.",
    ecosystemIds: ["sunspine_aquifer", "delta_bloom"],
    drift: { x: 14, y: 54 },
    scale: 1.08,
  },
  {
    id: "monsoon_reach",
    name: "Monsoon Reach",
    coord: { q: 0, r: 2 },
    biome: "wetland",
    primaryResource: "water",
    secondaryResources: ["fish", "grain"],
    flavor: "Storm-fed estuaries and floodgates at the edge of the southern sea.",
    ecosystemIds: ["silver_tide_fishery", "delta_bloom"],
    drift: { x: 6, y: 112 },
    scale: 1.18,
  },
  {
    id: "ironcrest",
    name: "Ironcrest",
    coord: { q: 1, r: -2 },
    biome: "highland",
    primaryResource: "ore",
    secondaryResources: ["energy"],
    flavor: "Ore seams and mountain roads suspended over deep valleys.",
    ecosystemIds: [],
    drift: { x: 74, y: -96 },
    scale: 0.98,
  },
  {
    id: "glass_dunes",
    name: "Glass Dunes",
    coord: { q: 1, r: -1 },
    biome: "desert",
    primaryResource: "energy",
    secondaryResources: ["ore"],
    flavor: "A sunburnt lattice of thermal towers and sand batteries.",
    ecosystemIds: [],
    drift: { x: 64, y: -48 },
    scale: 1.04,
  },
  {
    id: "copper_coast",
    name: "Copper Coast",
    coord: { q: 1, r: 0 },
    biome: "archipelago",
    primaryResource: "ore",
    secondaryResources: ["fish"],
    flavor: "Port foundries and copper reefs facing the eastern trade winds.",
    ecosystemIds: ["silver_tide_fishery"],
    drift: { x: 82, y: 2 },
    scale: 1.06,
  },
  {
    id: "verdant_weald",
    name: "Verdant Weald",
    coord: { q: 1, r: 1 },
    biome: "rainforest",
    primaryResource: "timber",
    secondaryResources: ["water", "grain"],
    flavor: "An old-growth belt where every cut is politically charged.",
    ecosystemIds: ["old_growth_ring"],
    drift: { x: 74, y: 56 },
    scale: 1.12,
  },
  {
    id: "stormmarch",
    name: "Stormmarch",
    coord: { q: 2, r: -2 },
    biome: "volcanic",
    primaryResource: "energy",
    secondaryResources: ["ore"],
    flavor: "A thunder coast of geothermal vents and unstable grids.",
    ecosystemIds: [],
    drift: { x: 134, y: -88 },
    scale: 0.98,
  },
  {
    id: "obsidian_ridge",
    name: "Obsidian Ridge",
    coord: { q: 2, r: -1 },
    biome: "highland",
    primaryResource: "ore",
    secondaryResources: ["energy"],
    flavor: "Blackstone uplands with defensive passes and deep mines.",
    ecosystemIds: [],
    drift: { x: 140, y: -34 },
    scale: 1.02,
  },
  {
    id: "solis_fields",
    name: "Solis Fields",
    coord: { q: 2, r: 0 },
    biome: "farmland",
    primaryResource: "grain",
    secondaryResources: ["water", "energy"],
    flavor: "Bright cereal plains tied together by irrigation syndicates.",
    ecosystemIds: ["sunspine_aquifer", "delta_bloom"],
    drift: { x: 144, y: 12 },
    scale: 1.04,
  },
];

const ECOSYSTEM_SPECS: EcosystemSpec[] = [
  {
    id: "silver_tide_fishery",
    name: "Silver Tide Fishery",
    kind: "fishery",
    resource: "fish",
    regionIds: ["glacier_bay", "aurora_fjord", "pearl_delta", "kelp_shoals", "monsoon_reach", "copper_coast"],
    label: { x: 338, y: 548 },
    baseRegeneration: 6,
    maxHealth: 100,
    flourishThreshold: 80,
    collapseThreshold: 22,
    description: "Cold and warm currents cross here; overfishing darkens whole coasts.",
  },
  {
    id: "old_growth_ring",
    name: "Old Growth Ring",
    kind: "forest",
    resource: "timber",
    regionIds: ["mistbarrow", "oldcanopy", "commons_heart", "verdant_weald"],
    label: { x: 488, y: 286 },
    baseRegeneration: 5,
    maxHealth: 100,
    flourishThreshold: 78,
    collapseThreshold: 26,
    description: "A contiguous canopy commons: sustainable harvests enrich everyone, strip-mining scars it for years.",
  },
  {
    id: "sunspine_aquifer",
    name: "Sunspine Aquifer",
    kind: "aquifer",
    resource: "water",
    regionIds: ["riverwake", "commons_heart", "sunspine_basin", "orchard_run", "solis_fields"],
    label: { x: 540, y: 402 },
    baseRegeneration: 5,
    maxHealth: 100,
    flourishThreshold: 82,
    collapseThreshold: 24,
    description: "A shared underground reserve that keeps half the breadbasket alive.",
  },
  {
    id: "delta_bloom",
    name: "Delta Bloom",
    kind: "wetland",
    resource: "grain",
    regionIds: ["pearl_delta", "orchard_run", "monsoon_reach", "solis_fields"],
    label: { x: 570, y: 594 },
    baseRegeneration: 4,
    maxHealth: 100,
    flourishThreshold: 76,
    collapseThreshold: 20,
    description: "Floodplain soils create abundance when water-sharing compacts hold.",
  },
];

const WORLD_ASSETS = {
  frame: "/assets/comedy/world-frame.svg",
  compass: "/assets/comedy/compass-rose.svg",
  underlay: "/assets/comedy/world-underlay.svg",
  resourceIcons: {
    grain: "/assets/comedy/resources/grain.svg",
    timber: "/assets/comedy/resources/timber.svg",
    ore: "/assets/comedy/resources/ore.svg",
    fish: "/assets/comedy/resources/fish.svg",
    water: "/assets/comedy/resources/water.svg",
    energy: "/assets/comedy/resources/energy.svg",
  },
  ecosystemIcons: {
    fishery: "/assets/comedy/ecosystems/fishery.svg",
    forest: "/assets/comedy/ecosystems/forest.svg",
    aquifer: "/assets/comedy/ecosystems/aquifer.svg",
    wetland: "/assets/comedy/ecosystems/wetland.svg",
  },
} as const;

export function createComedyWorldMap(): WorldMap {
  const regionIds = new Set(REGION_SPECS.map((region) => region.id));
  const regions: WorldRegion[] = REGION_SPECS.map((spec, index) => {
    const anchor = REGION_ANCHORS[spec.id] ?? anchorFromCoord(spec.coord, spec.drift);
    const scale = spec.scale ?? 1;
    return {
      id: spec.id,
      name: spec.name,
      coord: spec.coord,
      biome: spec.biome,
      primaryResource: spec.primaryResource,
      secondaryResources: spec.secondaryResources,
      productionNumber: PRODUCTION_SEQUENCE[index % PRODUCTION_SEQUENCE.length],
      anchor,
      polygon: organicPolygon(anchor, spec.id, scale),
      label: {
        x: anchor.x + ((seededNumber(`${spec.id}:lx`) - 0.5) * 18),
        y: anchor.y + ((seededNumber(`${spec.id}:ly`) - 0.5) * 14),
      },
      adjacentRegionIds: REGION_SPECS
        .filter((other) => other.id !== spec.id && axialDistance(spec.coord, other.coord) === 1)
        .map((other) => other.id)
        .filter((id) => regionIds.has(id)),
      ecosystemIds: spec.ecosystemIds,
      flavor: spec.flavor,
      asset: biomeTexture(spec.biome),
    };
  });

  const ecosystems: WorldEcosystem[] = ECOSYSTEM_SPECS.map((spec) => {
    const linkedRegions = regions.filter((region) => spec.regionIds.includes(region.id));
    const label = linkedRegions.length > 0
      ? {
        x: linkedRegions.reduce((sum, region) => sum + region.anchor.x, 0) / linkedRegions.length,
        y: linkedRegions.reduce((sum, region) => sum + region.anchor.y, 0) / linkedRegions.length,
      }
      : spec.label;

    return {
      ...spec,
      label,
      extractionProfiles: [
        { level: "low", yield: 1, pressure: 1 },
        { level: "medium", yield: 2, pressure: 3 },
        { level: "high", yield: 3, pressure: 5 },
      ],
      asset: WORLD_ASSETS.ecosystemIcons[spec.kind],
    };
  });

  return {
    id: "comedy_of_the_commons_world",
    name: "Comedy of the Commons",
    regions,
    ecosystems,
    assets: WORLD_ASSETS,
    startingRegionIds: ["riverwake", "glacier_bay", "obsidian_ridge", "monsoon_reach"],
  };
}

export function projectWorldMapToHexGrid(worldMap: WorldMap): Map<string, HexTile> {
  const grid = new Map<string, HexTile>();
  for (const region of worldMap.regions) {
    const terrain = terrainFromBiome(region.biome, region.primaryResource);
    grid.set(`${region.coord.q},${region.coord.r}`, {
      coord: region.coord,
      terrain,
      productionNumber: region.productionNumber,
      revealed: true,
      revealedBy: [],
      regionId: region.id,
      regionName: region.name,
      biome: region.biome,
      primaryResource: region.primaryResource,
      center: region.anchor,
      polygon: region.polygon,
      ecosystemIds: region.ecosystemIds,
    });
  }
  return grid;
}

export function getStartingPositions(worldMap: WorldMap, playerCount: number): HexCoord[] {
  return worldMap.startingRegionIds
    .slice(0, playerCount)
    .map((id) => getRegionById(worldMap, id)?.coord)
    .filter((coord): coord is HexCoord => Boolean(coord));
}

export function getRegionById(worldMap: WorldMap, regionId: string): WorldRegion | undefined {
  return worldMap.regions.find((region) => region.id === regionId);
}

export function getRegionByCoord(worldMap: WorldMap, coord: HexCoord): WorldRegion | undefined {
  return worldMap.regions.find((region) => region.coord.q === coord.q && region.coord.r === coord.r);
}

function anchorFromCoord(coord: HexCoord, drift: WorldPoint = { x: 0, y: 0 }): WorldPoint {
  const baseX = 520 + coord.q * 136 + coord.r * 72;
  const baseY = 348 + coord.r * 118 - coord.q * 26;
  const current = Math.sin((coord.q + coord.r * 0.7) * 1.28) * 18;
  const continental = Math.cos((coord.q * 0.9 - coord.r * 1.1) * 1.04) * 14;
  return {
    x: baseX + current + drift.x,
    y: baseY + continental + drift.y,
  };
}

function organicPolygon(anchor: WorldPoint, seed: string, scale: number): WorldPoint[] {
  const points: WorldPoint[] = [];
  const corners = 14;
  const radiusBase = 90 * scale;
  const rotation = (seededNumber(`${seed}:rotation`) - 0.5) * 0.9;
  for (let index = 0; index < corners; index++) {
    const angle = ((Math.PI * 2) / corners) * index - Math.PI / 2 + rotation;
    const variance = 0.72 + seededNumber(`${seed}:${index}`) * 0.42;
    const lobe = 1 + Math.sin(index * 1.6 + seededNumber(`${seed}:wave`) * Math.PI) * 0.08;
    const radius = radiusBase * variance * lobe;
    const skewX = 0.88 + seededNumber(`${seed}:${index}:x`) * 0.34;
    const skewY = 0.8 + seededNumber(`${seed}:${index}:y`) * 0.3;
    points.push({
      x: anchor.x + Math.cos(angle) * radius * skewX,
      y: anchor.y + Math.sin(angle) * radius * skewY,
    });
  }
  return points;
}

function biomeTexture(biome: RegionBiome): string {
  void biome;
  return "/assets/comedy/region-texture.svg";
}

function terrainFromBiome(biome: RegionBiome, resource: ResourceType): TerrainType {
  if (resource === "grain") return "plains";
  if (resource === "timber") return "forest";
  if (resource === "ore") return "mountains";
  if (resource === "energy") return "nexus";
  if (resource === "fish" || resource === "water") return "rivers";
  if (biome === "volcanic") return "mountains";
  return "plains";
}

function axialDistance(a: HexCoord, b: HexCoord): number {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.q + a.r - b.q - b.r),
  );
}

function seededNumber(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}
