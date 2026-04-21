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

const HEX_SIZE = 90;

function hexToDesignPixel(coord: HexCoord): WorldPoint {
  return {
    x: 600 + HEX_SIZE * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r),
    y: 400 + HEX_SIZE * (1.5 * coord.r),
  };
}

function hexPolygon(anchor: WorldPoint, size: number): WorldPoint[] {
  const points: WorldPoint[] = [];
  for (let corner = 0; corner < 6; corner++) {
    const angle = (Math.PI / 3) * corner - Math.PI / 6;
    points.push({
      x: anchor.x + size * Math.cos(angle),
      y: anchor.y + size * Math.sin(angle),
    });
  }
  return points;
}

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
  },
  {
    id: "riverwake",
    name: "Riverwake",
    coord: { q: -2, r: 1 },
    biome: "riverland",
    primaryResource: "water",
    secondaryResources: ["fish", "grain"],
    flavor: "Broad inland rivers, lockworks, and irrigated terraces.",
    ecosystemIds: ["sunspine_aquifer"],
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
  },
  {
    id: "kelp_shoals",
    name: "Kelp Shoals",
    coord: { q: -1, r: 2 },
    biome: "archipelago",
    primaryResource: "fish",
    secondaryResources: ["water", "energy"],
    flavor: "Tidal islands stitched together by kelp ropes and tide mills.",
    ecosystemIds: ["silver_tide_fishery"],
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
  },
  {
    id: "sunspine_basin",
    name: "Sunspine Basin",
    coord: { q: 0, r: 0 },
    biome: "desert",
    primaryResource: "energy",
    secondaryResources: ["ore"],
    flavor: "Solar salt basins and geothermal borefields rich in buried minerals.",
    ecosystemIds: [],
  },
  {
    id: "orchard_run",
    name: "Orchard Run",
    coord: { q: 0, r: 1 },
    biome: "farmland",
    primaryResource: "grain",
    secondaryResources: ["water", "timber"],
    flavor: "High-yield orchards sustained by careful irrigation compacts.",
    ecosystemIds: ["sunspine_aquifer", "delta_bloom"],
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
  },
  {
    id: "solis_fields",
    name: "Solis Fields",
    coord: { q: 2, r: 0 },
    biome: "farmland",
    primaryResource: "grain",
    secondaryResources: ["water", "timber"],
    flavor: "Bright cereal plains tied together by irrigation syndicates.",
    ecosystemIds: ["sunspine_aquifer", "delta_bloom"],
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
    baseRegeneration: 0,
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
    baseRegeneration: 0,
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
    regionIds: ["riverwake", "commons_heart", "orchard_run", "solis_fields"],
    label: { x: 540, y: 402 },
    baseRegeneration: 0,
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
    baseRegeneration: 0,
    maxHealth: 100,
    flourishThreshold: 76,
    collapseThreshold: 20,
    description: "Floodplain soils create abundance when water-sharing compacts hold.",
  },
];

const WORLD_ASSETS = {
  frame: "/assets/tragedy/world-frame.svg",
  compass: "/assets/tragedy/compass-rose.svg",
  underlay: "/assets/tragedy/world-underlay.svg",
  resourceIcons: {
    grain: "/assets/tragedy/resources/grain.svg",
    timber: "/assets/tragedy/resources/timber.svg",
    ore: "/assets/tragedy/resources/ore.svg",
    fish: "/assets/tragedy/resources/fish.svg",
    water: "/assets/tragedy/resources/water.svg",
    energy: "/assets/tragedy/resources/energy.svg",
  },
  ecosystemIcons: {
    fishery: "/assets/tragedy/ecosystems/fishery.svg",
    forest: "/assets/tragedy/ecosystems/forest.svg",
    aquifer: "/assets/tragedy/ecosystems/aquifer.svg",
    wetland: "/assets/tragedy/ecosystems/wetland.svg",
  },
} as const;

export function createTragedyWorldMap(): WorldMap {
  const regionIds = new Set(REGION_SPECS.map((region) => region.id));
  const regions: WorldRegion[] = REGION_SPECS.map((spec, index) => {
    const anchor = hexToDesignPixel(spec.coord);
    return {
      id: spec.id,
      name: spec.name,
      coord: spec.coord,
      biome: spec.biome,
      primaryResource: spec.primaryResource,
      secondaryResources: spec.secondaryResources,
      productionNumber: PRODUCTION_SEQUENCE[index % PRODUCTION_SEQUENCE.length],
      anchor,
      polygon: hexPolygon(anchor, HEX_SIZE),
      label: { x: anchor.x, y: anchor.y },
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
    id: "tragedy_of_the_commons_world",
    name: "Tragedy of the Commons",
    hexSize: HEX_SIZE,
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


function biomeTexture(biome: RegionBiome): string {
  void biome;
  return "/assets/tragedy/region-texture.svg";
}

function terrainFromBiome(biome: RegionBiome, resource: ResourceType): TerrainType {
  if (resource === "grain") return "plains";
  if (resource === "timber") return "forest";
  if (resource === "ore") return "mountains";
  if (resource === "energy") return "commons";
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
