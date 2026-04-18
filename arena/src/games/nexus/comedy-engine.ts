/**
 * Comedy of the Commons Game Engine
 *
 * The flagship coordination game implementation.
 * Extends the abstract GameEngine with Comedy-specific logic.
 */

import { v4 as uuid } from "uuid";
import { GameEngine } from "../../core/game-engine.js";
import { EventBus } from "../../core/event-bus.js";
import {
  GameConfig,
  AgentId,
  Action,
  RoundResult,
  TrustUpdate,
  ActionOutcome,
  GameEffect,
  Message,
} from "../../core/types.js";
import {
  ComedyGameState,
  ComedyAgentView,
  ComedyAction,
  ComedyPlayerState,
  ResourceInventory,
  ResourceType,
  CrisisEvent,
  CrisisType,
  CRISIS_DEFINITIONS,
  STRUCTURE_COSTS,
  STRUCTURE_VP,
  TERRAIN_RESOURCE,
  BIOME_ALLOWED_RESOURCES,
  PRODUCTION_WHEEL,
  RESOURCE_CAP,
  EMPTY_INVENTORY,
  RESOURCE_NAMES,
  CommitmentCandidate,
  CommitmentCondition,
  CommitmentRecord,
  AttestationRecord,
  AttestationVerdict,
  BehaviorTag,
  CommonsHealthSnapshot,
  ContestedClaim,
  EvidenceRef,
  PayoutReceipt,
  ResolutionStatus,
  EcosystemState,
  EcosystemExtractionRecord,
  ExtractionLevel,
  ArmyState,
  ARMY_COST,
  ARMY_ATTACK_COST_PER_DISTANCE,
  HexCoord,
  HexVertex,
} from "./types.js";
import {
  hexKey,
  hexNeighbors,
  hexDistance,
} from "./hex-grid.js";
import { TrustGraph } from "../../trust/trust-graph.js";
import { ERC8004TrustIntegration, ERC8004Config } from "../../trust/erc8004.js";
import {
  createComedyWorldMap,
  getRegionByCoord,
  getRegionById,
  getStartingPositions as getWorldStartingPositions,
  projectWorldMapToHexGrid,
} from "./world-map.js";
import {
  buildBehaviorMemoryByAgent,
  buildBehaviorMemorySnapshot,
} from "./behavior-memory.js";

export class ComedyEngine extends GameEngine<ComedyGameState> {
  private static pendingPrizeCarryoverWei = 0n;

  private trustGraph: TrustGraph;
  private erc8004Integration: ERC8004TrustIntegration | null = null;
  private pendingTrades: Map<string, { from: AgentId; to: AgentId; give: Partial<ResourceInventory>; receive: Partial<ResourceInventory> }> = new Map();
  private crisisCooldownRounds = 3;
  private commitmentCounter = 1;
  private candidateCounter = 1;
  private attestationCounter = 1;
  private evidenceCounter = 1;
  private contestedCounter = 1;
  private behaviorCounter = 1;
  private payoutReceiptCounter = 1;

  constructor(config: GameConfig, eventBus: EventBus, trustGraph: TrustGraph, erc8004Config?: ERC8004Config) {
    super(config, eventBus);
    this.trustGraph = trustGraph;
    if (erc8004Config) {
      this.erc8004Integration = new ERC8004TrustIntegration(erc8004Config, trustGraph);
    }
  }

  override async run(): Promise<RoundResult[]> {
    const results = await super.run();
    this.finalizePostGameCommitments();
    return results;
  }

  // ============================================================
  // Abstract method implementations
  // ============================================================

  protected createInitialState(config: GameConfig): ComedyGameState {
    const worldMap = createComedyWorldMap();
    const hexGrid = projectWorldMapToHexGrid(worldMap);
    const carryoverPrizePool = ComedyEngine.takePrizeCarryover();

    // Determine hidden max rounds (20-30, agents don't know exact number)
    const actualMaxRounds = 20 + Math.floor(Math.random() * 11); // 20-30
    const initialCommonsHealth = this.buildCommonsHealthSnapshot(
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
      crisisCooldown: 3, // No crisis in first 3 rounds
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

  /**
   * Set up player starting positions and resources
   */
  protected override async initializeAgents(): Promise<void> {
    const startingPositions = getWorldStartingPositions(
      this.state.worldMap,
      this.state.players.length,
    );

    this.state.prizePool += BigInt(this.state.players.length) * this.config.entryFeeWei;
    this.state.payablePrizePool = this.state.prizePool;

    // Initialize each player's state
    for (let i = 0; i < this.state.players.length; i++) {
      const agentId = this.state.players[i];
      const startPos = startingPositions[i % startingPositions.length];

      const playerState: ComedyPlayerState = {
        id: agentId,
        resources: { grain: 2, timber: 2, ore: 1, fish: 1, water: 1, energy: 1 },
        influence: 0,
        structures: {
          villages: [],
          townships: [],
          cities: [],
          beacons: [],
          tradePosts: [],
          roads: [],
        },
        armies: [],
        vp: 1, // Start with 1 VP for initial village
        longestRoad: 0,
        revealedHexes: new Set(),
      };

      this.state.playerStates.set(agentId, playerState);
      this.state.scores[agentId] = 1;

      // Reveal starting area
      const startHex = this.state.hexGrid.get(hexKey(startPos));
      if (startHex) {
        startHex.revealed = true;
        startHex.revealedBy.push(agentId);
        for (const neighbor of hexNeighbors(startPos)) {
          const nHex = this.state.hexGrid.get(hexKey(neighbor));
          if (nHex) {
            nHex.revealed = true;
            nHex.revealedBy.push(agentId);
          }
        }
      }

      // Place initial village at starting position
      const startRegion = getRegionByCoord(this.state.worldMap, startPos);
      playerState.structures.villages.push({
        hexes: [startPos],
        structure: "village",
        owner: agentId,
        regionId: startRegion?.id,
      });

      // Register agent in trust graph
      this.trustGraph.addAgent(agentId);

      // Register agent in ERC-8004 if configured
      if (this.erc8004Integration) {
        try {
          const agentName = `agent_${agentId.slice(0, 8)}`;
          await this.erc8004Integration.registerAgentForGame(agentId, {
            name: agentName,
            description: `Comedy of the Commons game agent`,
            services: [{
              name: "comedy_engine",
              endpoint: `game://${this.config.id}`,
            }],
          });
        } catch (error) {
          console.warn(`Failed to register agent ${agentId} on ERC-8004:`, error);
        }
      }
    }

    await super.initializeAgents();

    this.refreshCommonsHealth();
  }

  /**
   * Called after game.started — emit map data so the frontend receives it
   * AFTER it has processed game.started (which resets state).
   */
  protected override onGameStarted(): void {
    this.emitHexGridData();
  }

  protected getAgentView(agentId: AgentId): ComedyAgentView {
    const playerState = this.state.playerStates.get(agentId);
    if (!playerState) throw new Error(`Unknown agent: ${agentId}`);

    // Collect visible hexes (revealed by this agent or globally revealed)
    const visibleHexes = Array.from(this.state.hexGrid.values()).filter(
      (h) => h.revealed || h.revealedBy.includes(agentId),
    );

    // All scores and influence are public
    const allScores: Record<AgentId, number> = {};
    const allInfluence: Record<AgentId, number> = {};
    for (const [id, ps] of this.state.playerStates) {
      allScores[id] = ps.vp;
      allInfluence[id] = ps.influence;
    }

    // Trust scores
    const trustScores: Record<AgentId, number> = {};
    const trustDossiers: Record<AgentId, ComedyAgentView["trustDossiers"][AgentId]> = {};
    const trustProjectionByAgent: Record<AgentId, ComedyAgentView["trustProjectionByAgent"][AgentId]> = {};
    for (const id of this.state.players) {
      trustScores[id] = this.trustGraph.getGlobalScore(id);
      trustDossiers[id] = this.trustGraph.getTrustDossier(id);
      trustProjectionByAgent[id] = this.trustGraph.getGraduatedProjection(id);
    }
    const behaviorMemory = buildBehaviorMemorySnapshot(
      this.state,
      agentId,
      trustDossiers[agentId],
      trustProjectionByAgent[agentId],
    );
    const trustSnapshotArtifact = this.trustGraph.getSnapshotArtifact();

    // Next 5 production numbers
    const nextProduction: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const pos = (this.state.wheelPosition + i) % this.state.productionWheel.length;
      nextProduction.push(this.state.productionWheel[pos]);
    }

    // Alliance info
    const myAllianceVP = this.state.allianceVP.get(agentId) || 0;
    const allianceCoop = this.state.allianceCooperationRounds.get(agentId);
    const alliancePartners: Array<{ agentId: AgentId; roundsOfCooperation: number }> = [];
    if (allianceCoop) {
      for (const [partnerId, rounds] of allianceCoop) {
        if (rounds > 0) {
          alliancePartners.push({ agentId: partnerId, roundsOfCooperation: rounds });
        }
      }
    }

    return {
      gameId: this.state.gameId,
      round: this.state.round,
      phase: this.state.phase,
      myId: agentId,
      visibleHexes,
      worldMap: this.state.worldMap,
      ecosystemStates: this.state.ecosystems.map((ecosystem) => ({
        ...ecosystem,
        regionIds: [...ecosystem.regionIds],
        extractionProfiles: ecosystem.extractionProfiles.map((profile) => ({ ...profile })),
      })),
      visibleVertices: this.state.vertices,
      visibleEdges: this.state.edges,
      myResources: { ...playerState.resources },
      myInfluence: playerState.influence,
      myVP: playerState.vp,
      myStructures: playerState.structures,
      allScores,
      allInfluence,
      trustScores,
      trustDossiers,
      trustProjectionByAgent,
      trustSnapshotArtifact,
      behaviorMemory,
      productionWheel: this.state.productionWheel,
      wheelPosition: this.state.wheelPosition,
      nextProduction,
      activeCrisis: this.state.activeCrisis,
      visibleArmies: Array.from(this.state.playerStates.values()).flatMap(ps => ps.armies),
      visibleCommitments: this.getVisibleCommitments(agentId),
      visibleAttestations: this.getVisibleAttestations(agentId),
      messageHistory: this.filterMessagesForAgent(agentId, this.messageLog),
      prizePool: this.state.prizePool.toString(),
      payablePrizePool: this.state.payablePrizePool.toString(),
      slashedPrizePool: this.state.slashedPrizePool.toString(),
      carryoverPrizePool: this.state.carryoverPrizePool.toString(),
      currentCommonsHealth: this.state.currentCommonsHealth,
      tournamentDay: 1,
      tournamentPrizePool: this.state.prizePool.toString(),
      cumulativeScores: { ...this.state.scores },
      allianceInfo: {
        myAllianceVP,
        alliancePartners,
      },
    };
  }

  protected getLegalActions(agentId: AgentId): Action[] {
    const ps = this.state.playerStates.get(agentId);
    if (!ps) return [];

    const actions: ComedyAction[] = [];
    const r = ps.resources;

    // Build actions (check if player has resources)
    if (r.grain >= 1 && r.timber >= 1) {
      actions.push(this.makeAction("build_road", agentId));
    }
    if (r.grain >= 1 && r.timber >= 1 && r.ore >= 1 && r.water >= 1) {
      actions.push(this.makeAction("build_village", agentId));
    }
    // Upgrade to township: 3 villages OR 1 village with army stationed
    if (r.grain >= 2 && r.timber >= 1 && r.ore >= 1 && r.water >= 1 && ps.structures.villages.length >= 3) {
      actions.push(this.makeAction("upgrade_township", agentId));
    }
    // Upgrade to city: 2 townships OR 1 township with army stationed
    if (r.grain >= 2 && r.ore >= 2 && r.water >= 1 && ps.structures.townships.length >= 2) {
      actions.push(this.makeAction("upgrade_city", agentId));
    }
    if (r.ore >= 1 && r.energy >= 1 && r.water >= 1) {
      actions.push(this.makeAction("build_beacon", agentId));
    }
    if (r.timber >= 1 && r.fish >= 1 && r.water >= 1) {
      actions.push(this.makeAction("build_trade_post", agentId));
    }

    // Army actions
    // Build army: costs 1 Ore + 1 Energy per unit
    if (r.ore >= 1 && r.energy >= 1) {
      actions.push(this.makeAction("build_army", agentId));
    }
    // Move army: if player has armies, they can move them
    for (const army of ps.armies) {
      if (army.owner === agentId) {
        actions.push(this.makeAction("move_army", agentId, { armyId: army.id }));
        break; // Only need one move action option per agent
      }
    }
    // Attack: if player has armies, they can attack enemy structures
    for (const army of ps.armies) {
      if (army.owner === agentId && army.count > 0) {
        // Find enemy structures
        for (const [otherId, otherPs] of this.state.playerStates) {
          if (otherId === agentId) continue;
          const enemyStructures = [
            ...otherPs.structures.villages,
            ...otherPs.structures.townships,
            ...otherPs.structures.cities,
          ];
          if (enemyStructures.length > 0) {
            actions.push(this.makeAction("attack_structure", agentId, { targetAgent: otherId }));
            break; // Only need one attack action option
          }
        }
        break;
      }
    }

    // Trade with other players (always available if you have resources)
    const totalResources = this.totalResources(r);
    if (totalResources > 0) {
      for (const otherId of this.state.players) {
        if (otherId !== agentId) {
          actions.push(this.makeAction("trade_player", agentId, { partnerId: otherId }));
        }
      }
    }

    // Bank trade (4:1, or 2:1 with trade post)
    const bankRatio = ps.structures.tradePosts.length > 0 ? 2 : 4;
    for (const resType of RESOURCE_NAMES) {
      if (r[resType] >= bankRatio) {
        actions.push(this.makeAction("trade_bank", agentId, {
          bankGiveType: resType,
          bankGiveAmount: bankRatio,
        }));
      }
    }

    // Explore
    actions.push(this.makeAction("explore", agentId));

    const accessibleEcosystems = this.getAccessibleEcosystems(agentId);
    if (accessibleEcosystems.length > 0) {
      actions.push(this.makeAction("extract_commons", agentId, {
        ecosystemId: accessibleEcosystems[0].id,
        extractionLevel: "medium",
      }));
      if (r.water >= 1 || r.energy >= 1 || r.grain >= 1) {
        actions.push(this.makeAction("restore_ecosystem", agentId, {
          ecosystemId: accessibleEcosystems[0].id,
        }));
      }
    }

    // Sabotage (costs 1 Energy + 1 Ore)
    if (r.energy >= 1 && r.ore >= 1) {
      actions.push(this.makeAction("sabotage", agentId));
    }

    // Crisis contribution (if active crisis)
    if (this.state.activeCrisis && !this.state.activeCrisis.resolved) {
      actions.push(this.makeAction("crisis_contribute", agentId));
    }

    // Always can pass
    actions.push(this.makeAction("pass", agentId));

    return actions;
  }

  protected executeProduction(): void {
    // Advance the wheel
    this.state.wheelPosition =
      (this.state.wheelPosition + 1) % this.state.productionWheel.length;
    const currentNumber =
      this.state.productionWheel[this.state.wheelPosition];

    this.emitEvent("game.action", {
      type: "production",
      wheelPosition: this.state.wheelPosition,
      productionNumber: currentNumber,
    }, { agents: "all", spectators: true });

    // Produce resources for matching regions
    for (const [_, tile] of this.state.hexGrid) {
      if (tile.productionNumber !== currentNumber) continue;
      if (tile.terrain === "wasteland") continue;

      const region = tile.regionId
        ? getRegionById(this.state.worldMap, tile.regionId)
        : getRegionByCoord(this.state.worldMap, tile.coord);
      const resource = region?.primaryResource ?? tile.primaryResource ?? TERRAIN_RESOURCE[tile.terrain];
      if (!resource) continue;

      // Enforce biome-resource constraints: skip if biome forbids this resource
      if (region?.biome) {
        const allowed = BIOME_ALLOWED_RESOURCES[region.biome];
        if (allowed && !allowed.includes(resource)) continue;
      }

      // Find players with structures adjacent to this hex
      for (const [agentId, ps] of this.state.playerStates) {
        const hasAdjacentStructure = this.hasStructureNearHex(agentId, tile.coord);
        if (!hasAdjacentStructure) continue;

        const totalResources = this.totalResources(ps.resources);
        if (totalResources >= RESOURCE_CAP) continue;

        let yieldAmount = 1;
        if (this.hasCityNearHex(agentId, tile.coord)) {
          yieldAmount += 1;
        }
        if (region) {
          yieldAmount += this.getRegionProductionModifier(region.id);
        }

        const safeYield = Math.max(0, yieldAmount);
        for (let index = 0; index < safeYield; index++) {
          if (this.totalResources(ps.resources) >= RESOURCE_CAP) break;
          ps.resources[resource] += 1;
        }
      }
    }

    // Check for crisis trigger
    if (this.state.crisisCooldown > 0) {
      this.state.crisisCooldown--;
    } else if (!this.state.activeCrisis && Math.random() < 0.15) {
      this.triggerCrisis();
    }
  }

  /**
   * Override negotiation to scan messages for promises and increment messageCount.
   */
  protected override async executeNegotiation(): Promise<Message[]> {
    const messages = await super.executeNegotiation();

    // Increment message count
    this.state.messageCount += messages.length;
    this.state.prizePool += this.config.messageFeeWei * BigInt(messages.length);

    // Update commitment ledger from negotiation traffic
    this.processMessagesForLedger(messages);

    return messages;
  }

  protected resolveActions(actions: Map<AgentId, Action[]>): RoundResult {
    const outcomes: ActionOutcome[] = [];
    const trustUpdates: TrustUpdate[] = [];
    const scoreChanges: Record<AgentId, number> = {};
    const resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }> = [];
    const sabotageEvents: Array<{ from: AgentId; to: AgentId; round: number }> = [];
    const crisisContributors = new Set<AgentId>();

    for (const agentId of this.state.players) {
      scoreChanges[agentId] = 0;
    }

    // Track submitted trades to match them
    const tradeSubmissions = new Map<string, ComedyAction>();

    // Process each agent's actions
    for (const [agentId, agentActions] of actions) {
      const ps = this.state.playerStates.get(agentId);
      if (!ps) continue;

      // Limit to 2 actions per turn
      const limitedActions = agentActions.slice(0, 2) as ComedyAction[];

      for (const action of limitedActions) {
        this.state.moveCount++;
        this.state.prizePool += this.config.moveFeeWei;

        const outcome = this.resolveAction(
          agentId,
          action,
          tradeSubmissions,
          trustUpdates,
          sabotageEvents,
        );
        outcomes.push(outcome);

        if (outcome.success) {
          for (const effect of outcome.effects) {
            if (effect.type === "vp_change") {
              const target = effect.target === "all" ? agentId : effect.target;
              scoreChanges[target] = (scoreChanges[target] || 0) + (effect.params.amount as number);
            }
          }
        }
      }
    }

    // Resolve matched trades
    this.resolveMatchedTrades(tradeSubmissions, outcomes, trustUpdates, resolvedTrades);

    // Resolve crisis if active
    if (this.state.activeCrisis && !this.state.activeCrisis.resolved) {
      this.resolveCrisis(outcomes, trustUpdates, scoreChanges, crisisContributors);
    }

    this.resolveCommonsCycle(trustUpdates);
    this.resolveCommitmentLedger(trustUpdates, resolvedTrades, sabotageEvents, crisisContributors);
    this.resolveAllianceVP(resolvedTrades, sabotageEvents, trustUpdates);
    this.refreshCommonsHealth();

    // Update scores (including Alliance VP)
    for (const [agentId, delta] of Object.entries(scoreChanges)) {
      const ps = this.state.playerStates.get(agentId);
      if (ps) {
        ps.vp += delta;
        // Add Alliance VP (hidden but contributes to score)
        ps.vp += this.getAllianceVP(agentId);
        this.state.scores[agentId] = ps.vp;
      }
    }

    // Update bonus holders
    this.updateBonusHolders();

    // Update trust graph
    this.trustGraph.applyUpdatesWithMeta(trustUpdates, {
      gameId: this.state.gameId,
      round: this.state.round,
      phase: this.state.phase,
      timestamp: Date.now(),
    });
    this.trustGraph.tick();

    // Emit trust updates
    if (trustUpdates.length > 0) {
      this.emitEvent("trust.updated", {
        updates: trustUpdates,
        snapshots: this.trustGraph.getAllSnapshots(),
        readModels: this.trustGraph.getAllReadModels(),
        dossiers: this.trustGraph.getAllTrustDossiers(),
        projections: this.trustGraph.getAllGraduatedProjections(),
        snapshotArtifact: this.trustGraph.getSnapshotArtifact(),
      }, { agents: "all", spectators: true });
    }

    // Emit full state update for frontend rendering
    this.emitStateUpdate(outcomes, resolvedTrades);

    return {
      gameId: this.state.gameId,
      round: this.state.round,
      actions: Object.fromEntries(actions),
      outcomes,
      scoreChanges,
      trustUpdates,
      messages: this.messageLog.filter((m) => m.round === this.state.round),
    };
  }

  protected checkGameEnd(): boolean {
    // Hidden round limit - agents don't know when game ends (prevents timing betrayal)
    if (this.state.round >= this.state.actualMaxRounds) {
      return true;
    }

    // Check if any player reached VP threshold (15)
    for (const [_, ps] of this.state.playerStates) {
      if (ps.vp >= 15) return true;
    }

    // Check if all players have passed consecutively (stall detection)
    const allPassed = Array.from(this.state.playerStates.values()).every(ps => (ps as any)._lastAction === 'pass');
    if (allPassed && this.state.round > 5) return true;

    return false;
  }

  protected computeFinalScores(): Record<AgentId, number> {
    this.finalizePrizePool();
    const scores: Record<AgentId, number> = {};

    for (const [agentId, ps] of this.state.playerStates) {
      // Final score includes base VP + Alliance VP (already added during round resolution)
      scores[agentId] = ps.vp;
    }

    // Sync trust scores to ERC-8004 if configured
    if (this.erc8004Integration) {
      this.syncTrustToERC8004();
    }

    return scores;
  }

  // ============================================================
  // Action resolution
  // ============================================================

  private resolveAction(
    agentId: AgentId,
    action: ComedyAction,
    tradeSubmissions: Map<string, ComedyAction>,
    trustUpdates: TrustUpdate[],
    sabotageEvents: Array<{ from: AgentId; to: AgentId; round: number }>,
  ): ActionOutcome {
    const ps = this.state.playerStates.get(agentId)!;

    switch (action.type) {
      case "build_village": {
        const cost = STRUCTURE_COSTS.village;
        if (!this.canAfford(ps.resources, cost)) {
          return this.failOutcome(action, "Insufficient resources for village");
        }
        // Find a valid location (enforces distance rule: 2+ hexes from other villages/townships/cities)
        const villageHex = this.findBuildableHex(agentId, true);
        if (!villageHex) {
          return this.failOutcome(action, "No valid location for village (distance rule)");
        }
        this.deductResources(ps, cost);
        const villageRegion = getRegionByCoord(this.state.worldMap, villageHex);
        ps.structures.villages.push({
          hexes: [villageHex],
          structure: "village",
          owner: agentId,
          regionId: villageRegion?.id,
        });
        // Reveal hexes around the new village
        this.revealHexesAround(agentId, villageHex);
        return this.successOutcome(action, "Built a village", [
          { type: "vp_change", target: agentId, params: { amount: STRUCTURE_VP.village } },
        ]);
      }

      case "upgrade_township": {
        const cost = STRUCTURE_COSTS.township;
        if (!this.canAfford(ps.resources, cost)) {
          return this.failOutcome(action, "Insufficient resources for township");
        }
        if (ps.structures.villages.length === 0) {
          return this.failOutcome(action, "No villages to upgrade");
        }
        this.deductResources(ps, cost);
        // Remove oldest village and add a township in its place
        const upgradedVillage = ps.structures.villages.shift()!;
        ps.structures.townships.push({
          hexes: upgradedVillage.hexes,
          structure: "township",
          owner: agentId,
          regionId: upgradedVillage.regionId,
        });
        return this.successOutcome(action, "Upgraded village to township", [
          { type: "vp_change", target: agentId, params: { amount: STRUCTURE_VP.township - STRUCTURE_VP.village } },
        ]);
      }

      case "upgrade_city": {
        const cost = STRUCTURE_COSTS.city;
        if (!this.canAfford(ps.resources, cost)) {
          return this.failOutcome(action, "Insufficient resources for city");
        }
        if (ps.structures.townships.length === 0) {
          return this.failOutcome(action, "No townships to upgrade");
        }
        this.deductResources(ps, cost);
        // Remove oldest township and add a city in its place
        const upgradedTownship = ps.structures.townships.shift()!;
        ps.structures.cities.push({
          hexes: upgradedTownship.hexes,
          structure: "city",
          owner: agentId,
          regionId: upgradedTownship.regionId,
        });
        return this.successOutcome(action, "Upgraded township to city", [
          { type: "vp_change", target: agentId, params: { amount: STRUCTURE_VP.city - STRUCTURE_VP.township } },
        ]);
      }

      case "build_road": {
        const cost = STRUCTURE_COSTS.road;
        if (!this.canAfford(ps.resources, cost)) {
          return this.failOutcome(action, "Insufficient resources for road");
        }
        this.deductResources(ps, cost);
        ps.longestRoad++;
        // Place road near an existing structure
        const roadHex = this.findStructureHex(agentId);
        if (roadHex) {
          const neighbors = hexNeighbors(roadHex)
            .filter((neighbor) => this.state.hexGrid.has(hexKey(neighbor)));
          const neighborHex = neighbors[Math.floor(Math.random() * neighbors.length)] || roadHex;
          const fromRegion = getRegionByCoord(this.state.worldMap, roadHex);
          const toRegion = getRegionByCoord(this.state.worldMap, neighborHex);
          ps.structures.roads.push({
            hexes: [roadHex, neighborHex],
            road: true,
            owner: agentId,
            regionIds: fromRegion && toRegion ? [fromRegion.id, toRegion.id] : undefined,
          });
        }
        return this.successOutcome(action, "Built a road", []);
      }

      case "build_beacon": {
        const cost = STRUCTURE_COSTS.beacon;
        if (!this.canAfford(ps.resources, cost)) {
          return this.failOutcome(action, "Insufficient resources for beacon");
        }
        // Beacons don't need the settlement distance rule
        const beaconHex = this.findBuildableHex(agentId, false);
        if (!beaconHex) {
          return this.failOutcome(action, "No valid location for beacon");
        }
        this.deductResources(ps, cost);
        const beaconRegion = getRegionByCoord(this.state.worldMap, beaconHex);
        ps.structures.beacons.push({
          hexes: [beaconHex],
          structure: "beacon",
          owner: agentId,
          regionId: beaconRegion?.id,
        });
        // Beacons reveal a wide area
        for (const neighbor of hexNeighbors(beaconHex)) {
          this.revealHexesAround(agentId, neighbor);
        }
        return this.successOutcome(action, "Built a beacon", [
          { type: "vp_change", target: agentId, params: { amount: STRUCTURE_VP.beacon } },
        ]);
      }

      case "build_trade_post": {
        const cost = STRUCTURE_COSTS.trade_post;
        if (!this.canAfford(ps.resources, cost)) {
          return this.failOutcome(action, "Insufficient resources for trade post");
        }
        // Trade posts don't need the settlement distance rule
        const tpHex = this.findBuildableHex(agentId, false);
        if (!tpHex) {
          return this.failOutcome(action, "No valid location for trade post");
        }
        this.deductResources(ps, cost);
        const tradePostRegion = getRegionByCoord(this.state.worldMap, tpHex);
        ps.structures.tradePosts.push({
          hexes: [tpHex],
          structure: "trade_post",
          owner: agentId,
          regionId: tradePostRegion?.id,
        });
        return this.successOutcome(action, "Built a trade post (2:1 bank trades enabled)", []);
      }

      case "trade_player": {
        // Record the trade submission for matching
        const partnerId = action.params.partnerId as AgentId;
        const tradeKey = [agentId, partnerId].sort().join("-");
        tradeSubmissions.set(`${tradeKey}:${agentId}`, action);
        return this.successOutcome(action, `Trade offer submitted to ${partnerId}`, []);
      }

      case "trade_bank": {
        const giveType = action.params.bankGiveType as ResourceType;
        const receiveType = action.params.bankReceiveType as ResourceType;
        const giveAmount = action.params.bankGiveAmount as number || 4;

        if (!giveType || !receiveType || giveType === receiveType) {
          return this.failOutcome(action, "Invalid bank trade parameters");
        }
        if (ps.resources[giveType] < giveAmount) {
          return this.failOutcome(action, `Insufficient ${giveType} for bank trade`);
        }

        ps.resources[giveType] -= giveAmount;
        ps.resources[receiveType]++;
        return this.successOutcome(action, `Bank trade: ${giveAmount} ${giveType} -> 1 ${receiveType}`, []);
      }

      case "explore": {
        // Reveal a random adjacent unrevealed hex
        // Simplified: reveal all hexes within distance 2 of starting area
        let revealed = 0;
        for (const [_, tile] of this.state.hexGrid) {
          if (!tile.revealedBy.includes(agentId)) {
            tile.revealed = true;
            tile.revealedBy.push(agentId);
            revealed++;
            if (revealed >= 3) break; // Explore reveals up to 3 hexes
          }
        }
        return this.successOutcome(action, `Explored and revealed ${revealed} hexes`, []);
      }

      case "extract_commons": {
        const ecosystem = this.chooseAccessibleEcosystem(agentId, action.params.ecosystemId as string | undefined);
        if (!ecosystem) {
          return this.failOutcome(action, "No accessible commons ecosystem to extract from");
        }

        const level = (action.params.extractionLevel as ExtractionLevel | undefined) || "medium";
        const profile = ecosystem.extractionProfiles.find((item) => item.level === level);
        if (!profile) {
          return this.failOutcome(action, "Invalid extraction level");
        }

        const availableCapacity = Math.max(0, RESOURCE_CAP - this.totalResources(ps.resources));
        if (availableCapacity <= 0) {
          return this.failOutcome(action, "Storage is full; cannot extract from the commons");
        }

        const yieldAmount = Math.min(
          profile.yield,
          availableCapacity,
          Math.max(1, Math.round(profile.yield * this.getEcosystemYieldMultiplier(ecosystem))),
        );
        ps.resources[ecosystem.resource] += yieldAmount;
        this.state.ecosystemExtractions.push({
          ecosystemId: ecosystem.id,
          agentId,
          level,
          pressure: profile.pressure,
          yield: yieldAmount,
          round: this.state.round,
        });

        if (level === "high") {
          this.recordBehaviorTag(
            agentId,
            "extractive",
            undefined,
            `Pushed ${ecosystem.name} at high extraction`,
            ecosystem.health <= ecosystem.flourishThreshold ? "high" : "medium",
            -0.12,
          );
        }

        return this.successOutcome(
          action,
          `Extracted ${yieldAmount} ${ecosystem.resource} from ${ecosystem.name} (${level})`,
          [],
        );
      }

      case "restore_ecosystem": {
        const ecosystem = this.chooseAccessibleEcosystem(agentId, action.params.ecosystemId as string | undefined);
        if (!ecosystem) {
          return this.failOutcome(action, "No accessible ecosystem to restore");
        }

        const restorationCost = this.getRestorationCost(ecosystem.kind);
        if (!this.canAfford(ps.resources, restorationCost)) {
          return this.failOutcome(action, `Insufficient resources to restore ${ecosystem.name}`);
        }

        this.deductResources(ps, restorationCost);
        const restored = Math.min(ecosystem.maxHealth - ecosystem.health, 8);
        ecosystem.health += restored;
        ecosystem.lastDelta += restored;
        ecosystem.status = this.getEcosystemStatus(ecosystem);
        this.recordBehaviorTag(
          agentId,
          "stewardship",
          undefined,
          `Restored ${ecosystem.name} by ${restored} health`,
          "medium",
          0.14,
        );

        return this.successOutcome(action, `Restored ${ecosystem.name}`, []);
      }

      case "sabotage": {
        if (ps.resources.energy < 1 || ps.resources.ore < 1) {
          return this.failOutcome(action, "Insufficient resources for sabotage");
        }

        // Determine target: use params.targetAgent or pick the player with the most roads
        let targetId = action.params.targetAgent as AgentId | undefined;
        if (!targetId || targetId === agentId || !this.state.playerStates.has(targetId)) {
          // Auto-target: opponent with the most roads
          let maxRoads = -1;
          for (const [id, opponent] of this.state.playerStates) {
            if (id === agentId) continue;
            if (opponent.structures.roads.length > maxRoads) {
              maxRoads = opponent.structures.roads.length;
              targetId = id;
            }
          }
        }

        if (!targetId || targetId === agentId) {
          return this.failOutcome(action, "No valid sabotage target");
        }

        const targetPs = this.state.playerStates.get(targetId)!;

        // Try to destroy a road first, then downgrade a settlement/village
        let description: string;
        if (targetPs.structures.roads.length > 0) {
          // Destroy the most recently built road
          targetPs.structures.roads.pop();
          targetPs.longestRoad = Math.max(0, targetPs.longestRoad - 1);
          description = `Sabotaged ${targetId}'s road (destroyed)`;
        } else if (targetPs.structures.villages.length > 0) {
          // No roads to destroy — damage a village (remove it, -1 VP)
          targetPs.structures.villages.pop();
          targetPs.vp = Math.max(0, targetPs.vp - 1);
          description = `Sabotaged ${targetId}'s village (destroyed, -1 VP)`;
        } else if (targetPs.structures.townships.length > 0) {
          // Downgrade township to village
          const township = targetPs.structures.townships.pop()!;
          targetPs.structures.villages.push({
            hexes: township.hexes,
            structure: "village",
            owner: targetId,
            regionId: township.regionId,
          });
          targetPs.vp = Math.max(0, targetPs.vp - (STRUCTURE_VP.township - STRUCTURE_VP.village));
          description = `Sabotaged ${targetId}'s township (downgraded to village, -1 VP)`;
        } else if (targetPs.structures.cities.length > 0) {
          // Downgrade city to township
          const city = targetPs.structures.cities.pop()!;
          targetPs.structures.townships.push({
            hexes: city.hexes,
            structure: "township",
            owner: targetId,
            regionId: city.regionId,
          });
          targetPs.vp = Math.max(0, targetPs.vp - (STRUCTURE_VP.city - STRUCTURE_VP.township));
          description = `Sabotaged ${targetId}'s city (downgraded to township, -1 VP)`;
        } else {
          // Target has nothing to destroy
          ps.resources.energy--;
          ps.resources.ore--;
          return this.failOutcome(action, `${targetId} has no structures to sabotage`);
        }

        // Pay the cost
        ps.resources.energy--;
        ps.resources.ore--;
        ps.influence -= 2; // Sabotage costs influence
        sabotageEvents.push({ from: agentId, to: targetId, round: this.state.round });
        this.recordBehaviorTag(
          agentId,
          "sabotage",
          targetId,
          `Sabotaged ${targetId}`,
          "high",
          -0.25,
        );

        // Trust penalties: everyone loses trust in the saboteur
        for (const otherId of this.state.players) {
          if (otherId === agentId) continue;
          const delta = otherId === targetId ? -0.4 : -0.15;
          trustUpdates.push({
            from: otherId,
            to: agentId,
            delta,
            reason: otherId === targetId ? "sabotage_victim" : "sabotage_witness",
          });
        }

        return this.successOutcome(action, `${description} (-2 Influence)`, []);
      }

      case "crisis_contribute": {
        if (!this.state.activeCrisis) {
          return this.failOutcome(action, "No active crisis");
        }
        const contribution = action.params.contribution as Partial<ResourceInventory> || {};
        let contributed = false;

        for (const [res, amount] of Object.entries(contribution)) {
          const resType = res as ResourceType;
          const amt = amount as number;
          if (amt > 0 && ps.resources[resType] >= amt) {
            ps.resources[resType] -= amt;
            if (!this.state.activeCrisis.contributions[agentId]) {
              this.state.activeCrisis.contributions[agentId] = { ...EMPTY_INVENTORY };
            }
            this.state.activeCrisis.contributions[agentId][resType] += amt;
            contributed = true;
          }
        }

        if (contributed) {
          ps.influence += 1; // Crisis contribution earns influence
          return this.successOutcome(action, "Contributed to crisis response (+1 Influence)", []);
        }
        return this.failOutcome(action, "No valid resources contributed");
      }

      case "build_army": {
        const cost = ARMY_COST;
        if (!this.canAfford(ps.resources, cost)) {
          return this.failOutcome(action, "Insufficient resources for army (need 1 Ore + 1 Energy)");
        }
        this.deductResources(ps, cost);
        const armyId = `army_${this.state.gameId}_${agentId}_${this.state.round}`;
        // Find a hex adjacent to one of the player's structures to place the army
        let armyPosition = { q: 0, r: 0 };
        if (ps.structures.villages.length > 0) {
          armyPosition = ps.structures.villages[0].hexes[0];
        } else if (ps.structures.townships.length > 0) {
          armyPosition = ps.structures.townships[0].hexes[0];
        } else if (ps.structures.cities.length > 0) {
          armyPosition = ps.structures.cities[0].hexes[0];
        }
        // Check if player already has an army - if so, add to it
        const existingArmy = ps.armies.find(a => a.owner === agentId);
        if (existingArmy) {
          existingArmy.count += 1;
        } else {
          ps.armies.push({
            id: armyId,
            owner: agentId,
            position: armyPosition,
            count: 1,
          });
        }
        return this.successOutcome(action, "Built an army unit", []);
      }

      case "move_army": {
        const armyId = action.params.armyId as string | undefined;
        const targetHex = action.params.targetHex as HexCoord | undefined;
        const army = ps.armies.find(a => a.id === armyId && a.owner === agentId);
        if (!army) {
          return this.failOutcome(action, "No army found to move");
        }
        if (!targetHex) {
          return this.failOutcome(action, "No target hex specified");
        }
        // Validate hex is adjacent (1 hex movement)
        const distance = hexDistance(army.position, targetHex);
        if (distance > 1) {
          return this.failOutcome(action, "Army can only move 1 hex per turn");
        }
        army.position = targetHex;
        return this.successOutcome(action, `Moved army to (${targetHex.q}, ${targetHex.r})`, []);
      }

      case "attack_structure": {
        const targetAgentId = action.params.targetAgent as AgentId | undefined;
        let targetStructureIndex = action.params.targetStructureIndex as number | undefined;
        if (!targetAgentId) {
          return this.failOutcome(action, "No target agent specified");
        }
        const targetPs = this.state.playerStates.get(targetAgentId);
        if (!targetPs) {
          return this.failOutcome(action, "Target agent not found");
        }
        // Find attacker's army
        const attackerArmy = ps.armies.find(a => a.owner === agentId && a.count > 0);
        if (!attackerArmy) {
          return this.failOutcome(action, "No army available to attack with");
        }
        // Find target structure
        let targetStructure: HexVertex | undefined;
        let structureArray: HexVertex[] | undefined;
        let structureType: "village" | "township" | "city" | undefined;
        
        const allStructures = [
          { array: targetPs.structures.villages, type: "village" as const },
          { array: targetPs.structures.townships, type: "township" as const },
          { array: targetPs.structures.cities, type: "city" as const },
        ];
        
        for (const { array, type } of allStructures) {
          const idx = targetStructureIndex !== undefined ? targetStructureIndex : 0;
          if (idx < array.length) {
            targetStructure = array[idx];
            structureArray = array;
            structureType = type;
            break;
          }
          if (targetStructureIndex !== undefined) {
            targetStructureIndex = targetStructureIndex - array.length;
          }
        }
        
        if (!targetStructure || !structureArray || !structureType) {
          return this.failOutcome(action, "Target structure not found");
        }
        
        // Calculate distance for attack cost
        const distance = hexDistance(attackerArmy.position, targetStructure.hexes[0]);
        const attackCost = 1 + Math.ceil(distance * ARMY_ATTACK_COST_PER_DISTANCE);
        
        if (ps.resources.energy < attackCost) {
          return this.failOutcome(action, `Insufficient energy for attack (need ${attackCost})`);
        }
        
        // Deduct attack cost
        ps.resources.energy -= attackCost;
        
        // Find defender's army at this structure (if any)
        const defenderArmy = targetPs.armies.find(a => a.owner === targetAgentId && 
          hexDistance(a.position, targetStructure!.hexes[0]) <= 1);
        const defenderCount = defenderArmy?.count || 0;
        
        // Combat resolution: odds = attacker_count / (attacker_count + defender_count)
        const attackerCount = attackerArmy.count;
        const total = attackerCount + defenderCount;
        const odds = attackerCount / total;
        const roll = Math.random();
        
        if (roll < odds) {
          // Attacker wins
          attackerArmy.count -= 1;
          if (attackerArmy.count === 0) {
            ps.armies = ps.armies.filter(a => a.id !== attackerArmy.id);
          }
          
          // Transfer ownership of structure to attacker (downgrade by 1 tier)
          // Remove from defender's array
          const structIndex = structureArray.findIndex(s => s.hexes[0].q === targetStructure!.hexes[0].q && 
            s.hexes[0].r === targetStructure!.hexes[0].r);
          if (structIndex !== -1) {
            structureArray.splice(structIndex, 1);
          }
          
          // Add to attacker's structures at one tier lower
          const newType = structureType === "city" ? "township" : 
                         structureType === "township" ? "village" : null;
          if (newType) {
            if (newType === "village") {
              ps.structures.villages.push({
                hexes: targetStructure.hexes,
                structure: "village",
                owner: agentId,
                regionId: targetStructure.regionId,
              });
            } else if (newType === "township") {
              ps.structures.townships.push({
                hexes: targetStructure.hexes,
                structure: "township",
                owner: agentId,
                regionId: targetStructure.regionId,
              });
            }
            
            // Record conquest for trust
            trustUpdates.push({
              from: agentId,
              to: targetAgentId,
              delta: -0.5,
              reason: "conquest",
            });
            
            // Record aggression in trust graph
            for (const otherId of this.state.players) {
              if (otherId !== agentId && otherId !== targetAgentId) {
                trustUpdates.push({
                  from: otherId,
                  to: agentId,
                  delta: -0.3,
                  reason: "aggression",
                });
              }
            }
          }
          
          return this.successOutcome(action, `Conquered ${targetAgentId}'s ${structureType}! (now a ${newType})`, []);
        } else {
          // Defender wins - attacker loses the army
          attackerArmy.count -= 1;
          if (attackerArmy.count === 0) {
            ps.armies = ps.armies.filter(a => a.id !== attackerArmy.id);
          }
          return this.failOutcome(action, `Attack on ${targetAgentId}'s ${structureType} failed!`);
        }
      }

      case "pass":
        return this.successOutcome(action, "Passed", []);

      default:
        return this.failOutcome(action, `Unknown action type: ${action.type}`);
    }
  }

  // ============================================================
  // Trade matching
  // ============================================================

  private resolveMatchedTrades(
    submissions: Map<string, ComedyAction>,
    outcomes: ActionOutcome[],
    trustUpdates: TrustUpdate[],
    resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }>,
  ): void {
    // Group by trade pair
    const pairs = new Map<string, ComedyAction[]>();
    for (const [key, action] of submissions) {
      const pairKey = key.split(":")[0];
      if (!pairs.has(pairKey)) pairs.set(pairKey, []);
      pairs.get(pairKey)!.push(action);
    }

    for (const [_, actions] of pairs) {
      if (actions.length === 2) {
        // Both sides submitted - execute trade
        const [a1, a2] = actions;
        const ps1 = this.state.playerStates.get(a1.agentId)!;
        const ps2 = this.state.playerStates.get(a2.agentId)!;

        const give1 = a1.params.give as Partial<ResourceInventory> || {};
        const receive1 = a1.params.receive as Partial<ResourceInventory> || {};
        const give2 = a2.params.give as Partial<ResourceInventory> || {};
        const receive2 = a2.params.receive as Partial<ResourceInventory> || {};

        if (!this.resourceBagsEqual(give1, receive2) || !this.resourceBagsEqual(give2, receive1)) {
          outcomes.push(this.failOutcome(a1, `Trade with ${a2.agentId} failed - terms did not match`));
          outcomes.push(this.failOutcome(a2, `Trade with ${a1.agentId} failed - terms did not match`));
          continue;
        }

        // Validate both sides can afford what they're giving
        let valid = true;
        for (const [res, amount] of Object.entries(give1)) {
          const resType = res as ResourceType;
          const amt = amount as number;
          if (amt < 0 || ps1.resources[resType] < amt) {
            valid = false;
            break;
          }
        }
        if (valid) {
          for (const [res, amount] of Object.entries(give2)) {
            const resType = res as ResourceType;
            const amt = amount as number;
            if (amt < 0 || ps2.resources[resType] < amt) {
              valid = false;
              break;
            }
          }
        }

        // Check that at least one side is giving something
        const total1 = Object.values(give1).reduce((s, v) => s + (v as number || 0), 0);
        const total2 = Object.values(give2).reduce((s, v) => s + (v as number || 0), 0);
        if (total1 === 0 && total2 === 0) valid = false;

        if (!valid) {
          outcomes.push(this.failOutcome(a1, `Trade with ${a2.agentId} failed - insufficient resources`));
          continue;
        }

        // Execute resource transfer
        for (const [res, amount] of Object.entries(give1)) {
          const resType = res as ResourceType;
          const amt = amount as number;
          ps1.resources[resType] -= amt;
          ps2.resources[resType] += amt;
        }
        for (const [res, amount] of Object.entries(give2)) {
          const resType = res as ResourceType;
          const amt = amount as number;
          ps2.resources[resType] -= amt;
          ps1.resources[resType] += amt;
        }

        resolvedTrades.push({ from: a1.agentId, to: a2.agentId, round: this.state.round });
        this.recordBehaviorTag(
          a1.agentId,
          "stewardship",
          a2.agentId,
          `Completed a negotiated trade with ${a2.agentId}`,
          "low",
          0.1,
        );
        this.recordBehaviorTag(
          a2.agentId,
          "stewardship",
          a1.agentId,
          `Completed a negotiated trade with ${a1.agentId}`,
          "low",
          0.1,
        );

        // Trust boost for completed trade
        trustUpdates.push(
          { from: a1.agentId, to: a2.agentId, delta: 0.15, reason: "completed_trade" },
          { from: a2.agentId, to: a1.agentId, delta: 0.15, reason: "completed_trade" },
        );

        // Influence for fair trade
        ps1.influence += 1;
        ps2.influence += 1;

        outcomes.push(this.successOutcome(a1, `Trade completed with ${a2.agentId}`, []));
      } else if (actions.length === 1) {
        // Only one side submitted - trade failed
        const a = actions[0];
        const partnerId = a.params.partnerId as AgentId;

        // Mild trust penalty
        trustUpdates.push({
          from: a.agentId,
          to: partnerId,
          delta: -0.05,
          reason: "trade_not_reciprocated",
        });

        outcomes.push(this.failOutcome(a, `Trade with ${partnerId} failed - partner did not submit`));
      }
    }
  }

  // ============================================================
  // Crisis resolution
  // ============================================================

  private triggerCrisis(): void {
    const crisisTypes: CrisisType[] = ["blight", "storm", "famine", "current_surge", "the_rift"];
    const type = crisisTypes[Math.floor(Math.random() * crisisTypes.length)];
    const def = CRISIS_DEFINITIONS[type];

    this.state.activeCrisis = {
      ...def,
      contributions: {},
      resolved: false,
      triggeredRound: this.state.round,
    };
    this.state.crisisCooldown = this.crisisCooldownRounds;

    this.emitEvent("crisis.triggered", {
      crisis: this.state.activeCrisis,
    }, { agents: "all", spectators: true });
  }

  private resolveCrisis(
    outcomes: ActionOutcome[],
    trustUpdates: TrustUpdate[],
    scoreChanges: Record<AgentId, number>,
    crisisContributors: Set<AgentId>,
  ): void {
    const crisis = this.state.activeCrisis!;
    const threshold = crisis.threshold;

    // Sum all contributions
    const totalContrib: ResourceInventory = { ...EMPTY_INVENTORY };
    for (const contrib of Object.values(crisis.contributions)) {
      totalContrib.grain += contrib.grain;
      totalContrib.timber += contrib.timber;
      totalContrib.ore += contrib.ore;
      totalContrib.fish += contrib.fish;
      totalContrib.water += contrib.water;
      totalContrib.energy += contrib.energy;
    }

    // Check if threshold met
    const resolved =
      totalContrib.grain >= threshold.grain &&
      totalContrib.timber >= threshold.timber &&
      totalContrib.ore >= threshold.ore &&
      totalContrib.fish >= threshold.fish &&
      totalContrib.water >= threshold.water &&
      totalContrib.energy >= threshold.energy;

    crisis.resolved = resolved;

    if (resolved) {
      // Reward contributors
        for (const [agentId, _] of Object.entries(crisis.contributions)) {
          crisisContributors.add(agentId);
          const ps = this.state.playerStates.get(agentId);
          if (ps) {
            ps.influence += crisis.rewardInfluence;
            scoreChanges[agentId] = (scoreChanges[agentId] || 0) + crisis.rewardVP;
            this.recordBehaviorTag(
            agentId,
            "crisis_contributor",
            undefined,
            `Contributed to resolving ${crisis.type}`,
            "medium",
            0.18,
          );

          // Trust boost among contributors
          for (const otherId of Object.keys(crisis.contributions)) {
            if (otherId !== agentId) {
              trustUpdates.push({
                from: agentId,
                to: otherId,
                delta: 0.2,
                reason: "crisis_co_contributor",
              });
            }
          }
        }
      }

      this.emitEvent("crisis.resolved", {
        crisis: crisis.type,
        resolved: true,
        contributors: Object.keys(crisis.contributions),
      }, { agents: "all", spectators: true });
    } else {
      // Penalty for everyone (crisis failed after 3 rounds of being active)
      if (this.state.round - crisis.triggeredRound >= 3) {
        // Apply crisis-specific penalties
        this.applyCrisisPenalty(crisis, scoreChanges);

        // Non-contributors lose trust from contributors
        const contributors = new Set(Object.keys(crisis.contributions));
        for (const contributorId of contributors) {
          this.recordBehaviorTag(
            contributorId,
            "crisis_contributor",
            undefined,
            `Contributed during failed crisis ${crisis.type}`,
            "low",
            0.08,
          );
        }
        for (const agentId of this.state.players) {
          if (!contributors.has(agentId)) {
            this.recordBehaviorTag(
              agentId,
              "crisis_free_rider",
              undefined,
              `Did not contribute to ${crisis.type}`,
              "medium",
              -0.2,
            );
            // Free-rider penalty
            for (const contributorId of contributors) {
              trustUpdates.push({
                from: contributorId,
                to: agentId,
                delta: -0.25,
                reason: "crisis_free_rider",
              });
            }
          }
        }

        this.emitEvent("crisis.resolved", {
          crisis: crisis.type,
          resolved: false,
          penalty: crisis.penaltyDescription,
          contributors: Array.from(contributors),
          freeRiders: this.state.players.filter(id => !contributors.has(id)),
        }, { agents: "all", spectators: true });

        this.state.crisisHistory.push(crisis);
        this.state.activeCrisis = null;
      }
    }

    // Clear resolved crisis
    if (resolved) {
      this.state.crisisHistory.push(crisis);
      this.state.activeCrisis = null;
    }
  }

  // ============================================================
  // State emission for frontend
  // ============================================================

  /**
   * Emit full per-agent state update for frontend rendering.
   * Called after each resolution phase.
   */
  private emitStateUpdate(
    outcomes: ActionOutcome[],
    resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }>,
  ): void {
    const agentStates: Record<string, {
      resources: ResourceInventory;
      vp: number;
      influence: number;
      longestRoad: number;
      structures: {
        villages: number;
        townships: number;
        cities: number;
        beacons: number;
        tradePosts: number;
        roads: number;
      };
      structureLocations: Array<{
        type: string;
        hexes: Array<{ q: number; r: number }>;
        regionId?: string;
        regionIds?: string[];
      }>;
      armies: Array<{ id: string; owner: AgentId; position: HexCoord; count: number }>;
    }> = {};

      for (const [agentId, ps] of this.state.playerStates) {
      const structureLocations: Array<{
        type: string;
        hexes: Array<{ q: number; r: number }>;
        regionId?: string;
        regionIds?: string[];
      }> = [];
      for (const v of ps.structures.villages) {
        structureLocations.push({ type: "village", hexes: v.hexes, regionId: v.regionId });
      }
      for (const t of ps.structures.townships) {
        structureLocations.push({ type: "township", hexes: t.hexes, regionId: t.regionId });
      }
      for (const c of ps.structures.cities) {
        structureLocations.push({ type: "city", hexes: c.hexes, regionId: c.regionId });
      }
      for (const b of ps.structures.beacons) {
        structureLocations.push({ type: "beacon", hexes: b.hexes, regionId: b.regionId });
      }
      for (const tp of ps.structures.tradePosts) {
        structureLocations.push({ type: "trade_post", hexes: tp.hexes, regionId: tp.regionId });
      }
      for (const r of ps.structures.roads) {
        structureLocations.push({ type: "road", hexes: r.hexes, regionIds: r.regionIds ? [...r.regionIds] : undefined });
      }

      agentStates[agentId] = {
        resources: { ...ps.resources },
        vp: ps.vp,
        influence: ps.influence,
        longestRoad: ps.longestRoad,
        structures: {
          villages: ps.structures.villages.length,
          townships: ps.structures.townships.length,
          cities: ps.structures.cities.length,
          beacons: ps.structures.beacons.length,
          tradePosts: ps.structures.tradePosts.length,
          roads: ps.structures.roads.length,
        },
        structureLocations,
        armies: ps.armies.map(a => ({ ...a })),
      };
    }

    const trustDossiers: Record<AgentId, ComedyAgentView["trustDossiers"][AgentId]> = {};
    const trustProjectionByAgent: Record<AgentId, ComedyAgentView["trustProjectionByAgent"][AgentId]> = {};
    for (const id of this.state.players) {
      trustDossiers[id] = this.trustGraph.getTrustDossier(id);
      trustProjectionByAgent[id] = this.trustGraph.getGraduatedProjection(id);
    }
    const behaviorMemoryByAgent = buildBehaviorMemoryByAgent(
      this.state,
      trustDossiers,
      trustProjectionByAgent,
    );

    this.emitEvent("game.state_update", {
      round: this.state.round,
      phase: this.state.phase,
      agentStates,
      activeCrisis: this.state.activeCrisis,
      wheelPosition: this.state.wheelPosition,
      moveCount: this.state.moveCount,
      prizePool: this.state.prizePool.toString(),
      payablePrizePool: this.state.payablePrizePool.toString(),
      slashedPrizePool: this.state.slashedPrizePool.toString(),
      carryoverPrizePool: this.state.carryoverPrizePool.toString(),
      commonsHealth: this.state.currentCommonsHealth,
      ecosystems: this.state.ecosystems.map((ecosystem) => ({
        id: ecosystem.id,
        name: ecosystem.name,
        kind: ecosystem.kind,
        resource: ecosystem.resource,
        health: ecosystem.health,
        maxHealth: ecosystem.maxHealth,
        status: ecosystem.status,
        regionIds: ecosystem.regionIds,
        label: ecosystem.label,
        lastPressure: ecosystem.lastPressure,
        lastYield: ecosystem.lastYield,
        lastDelta: ecosystem.lastDelta,
        flourishThreshold: ecosystem.flourishThreshold,
        collapseThreshold: ecosystem.collapseThreshold,
        asset: ecosystem.asset,
      })),
      commitments: this.state.commitments.map((commitment) => ({
        id: commitment.id,
        type: commitment.type,
        promisor: commitment.promisor,
        counterparties: commitment.counterparties,
        resolutionStatus: commitment.resolutionStatus,
        summary: commitment.summary,
        dueByRound: commitment.dueByRound,
        payoutShareBps: commitment.payoutShareBps,
      })),
      attestations: this.state.attestations.map((attestation) => ({
        id: attestation.id,
        commitmentId: attestation.commitmentId,
        actor: attestation.actor,
        phase: attestation.phase,
        verdict: attestation.verdict,
        weight: attestation.weight,
        detail: attestation.detail,
        round: attestation.round,
        accepted: attestation.accepted,
        evidenceRefs: [...attestation.evidenceRefs],
      })),
      contestedClaims: this.state.contestedClaims.map((claim) => ({
        id: claim.id,
        commitmentId: claim.commitmentId,
        actor: claim.actor,
        round: claim.round,
        reason: claim.reason,
        evidenceRefs: [...claim.evidenceRefs],
      })),
      behaviorTags: this.state.behaviorTags.map((tag) => ({ ...tag })),
      payoutReceipts: this.state.payoutReceipts.map((receipt) => ({ ...receipt })),
      behaviorMemoryByAgent,
      bonusHolders: {
        longestRoad: this.state.longestRoadHolder,
        mostInfluence: this.state.mostInfluenceHolder,
      },
      recentTrades: resolvedTrades,
      recentExtractions: this.state.ecosystemExtractions.filter((entry) => entry.round === this.state.round),
      // Include summarized outcomes for the frontend comms feed
      actionSummary: outcomes
        .filter(o => o.success)
        .map(o => ({
          agentId: o.action.agentId,
          type: o.action.type,
          description: o.description,
        })),
    }, { agents: "all", spectators: true });
  }

  /**
   * Emit hex grid data at game start for frontend map rendering.
   */
  private emitHexGridData(): void {
    const hexes: Array<{
      q: number;
      r: number;
      terrain: string;
      productionNumber: number;
      revealed: boolean;
      regionId?: string;
      regionName?: string;
      biome?: string;
      primaryResource?: string;
      center?: { x: number; y: number };
      polygon?: Array<{ x: number; y: number }>;
      ecosystemIds?: string[];
    }> = [];

    for (const [_, tile] of this.state.hexGrid) {
      hexes.push({
        q: tile.coord.q,
        r: tile.coord.r,
        terrain: tile.terrain,
        productionNumber: tile.productionNumber,
        revealed: tile.revealed,
        regionId: tile.regionId,
        regionName: tile.regionName,
        biome: tile.biome,
        primaryResource: tile.primaryResource,
        center: tile.center,
        polygon: tile.polygon,
        ecosystemIds: tile.ecosystemIds,
      });
    }

    // Collect agent starting positions
    const agentPositions: Record<string, { q: number; r: number }> = {};
    const agentRegions: Record<string, string> = {};
    for (const [agentId, ps] of this.state.playerStates) {
      if (ps.structures.villages.length > 0) {
        const startHex = ps.structures.villages[0].hexes[0];
        agentPositions[agentId] = { q: startHex.q, r: startHex.r };
        const startRegion = getRegionByCoord(this.state.worldMap, startHex);
        if (startRegion) {
          agentRegions[agentId] = startRegion.id;
        }
      }
    }

    this.emitEvent("game.map_data", {
      hexes,
      agentPositions,
      agentRegions,
      productionWheel: this.state.productionWheel,
      worldMap: {
        id: this.state.worldMap.id,
        name: this.state.worldMap.name,
        assets: this.state.worldMap.assets,
        regions: this.state.worldMap.regions,
        ecosystems: this.state.ecosystems.map((ecosystem) => ({
          id: ecosystem.id,
          name: ecosystem.name,
          kind: ecosystem.kind,
          resource: ecosystem.resource,
          regionIds: ecosystem.regionIds,
          label: ecosystem.label,
          health: ecosystem.health,
          maxHealth: ecosystem.maxHealth,
          status: ecosystem.status,
          asset: ecosystem.asset,
        })),
      },
    }, { agents: "all", spectators: true });
  }

  /**
   * Get a full state snapshot for browser refresh recovery.
   * This allows the frontend to reconstruct the game state after a refresh.
   */
  public getStateSnapshot(): {
    gameId: string;
    round: number;
    phase: string;
    isFinished: boolean;
    winner: AgentId | null;
    hexGrid: Array<{
      q: number;
      r: number;
      terrain: string;
      productionNumber: number;
      revealed: boolean;
      regionId?: string;
      regionName?: string;
      biome?: string;
      primaryResource?: string;
      center?: { x: number; y: number };
      polygon?: Array<{ x: number; y: number }>;
      ecosystemIds?: string[];
    }>;
    agentStates: Record<string, {
      resources: ResourceInventory;
      vp: number;
      influence: number;
      longestRoad: number;
      structures: {
        villages: number;
        townships: number;
        cities: number;
        beacons: number;
        tradePosts: number;
        roads: number;
      };
      structureLocations: Array<{
        type: string;
        hexes: Array<{ q: number; r: number }>;
        regionId?: string;
        regionIds?: string[];
      }>;
      armies: Array<{ id: string; owner: AgentId; position: HexCoord; count: number }>;
    }>;
    agentPositions: Record<string, { q: number; r: number }>;
    agentRegions: Record<string, string>;
    productionWheel: number[];
    wheelPosition: number;
    activeCrisis: CrisisEvent | null;
    ecosystems: Array<{
      id: string;
      name: string;
      kind: string;
      resource: string;
      health: number;
      maxHealth: number;
      status: string;
      regionIds: string[];
      label: { x: number; y: number };
      lastPressure: number;
      lastYield: number;
      lastDelta: number;
    }>;
    prizePool: string;
    payablePrizePool: string;
    slashedPrizePool: string;
    carryoverPrizePool: string;
    commonsHealth: CommonsHealthSnapshot;
    commitments: Array<{
      id: string;
      type: string;
      promisor: AgentId;
      counterparties: AgentId[];
      resolutionStatus: string;
      summary: string;
      dueByRound: number | null;
      payoutShareBps: number | null;
    }>;
    attestations: Array<{
      id: string;
      commitmentId: string;
      actor: AgentId;
      phase: string;
      verdict: string;
      weight: number;
    }>;
    behaviorTags: Array<{
      id: string;
      round: number;
      actor: AgentId;
      kind: string;
      severity: string;
      description: string;
    }>;
    bonusHolders: {
      longestRoad: AgentId | null;
      mostInfluence: AgentId | null;
    };
    trustMatrix: { agents: AgentId[]; matrix: number[][] };
  } {
    const hexes: Array<{
      q: number;
      r: number;
      terrain: string;
      productionNumber: number;
      revealed: boolean;
      regionId?: string;
      regionName?: string;
      biome?: string;
      primaryResource?: string;
      center?: { x: number; y: number };
      polygon?: Array<{ x: number; y: number }>;
      ecosystemIds?: string[];
    }> = [];

    for (const [_, tile] of this.state.hexGrid) {
      hexes.push({
        q: tile.coord.q,
        r: tile.coord.r,
        terrain: tile.terrain,
        productionNumber: tile.productionNumber,
        revealed: tile.revealed,
        regionId: tile.regionId,
        regionName: tile.regionName,
        biome: tile.biome,
        primaryResource: tile.primaryResource,
        center: tile.center,
        polygon: tile.polygon,
        ecosystemIds: tile.ecosystemIds,
      });
    }

    const agentStates: Record<string, {
      resources: ResourceInventory;
      vp: number;
      influence: number;
      longestRoad: number;
      structures: {
        villages: number;
        townships: number;
        cities: number;
        beacons: number;
        tradePosts: number;
        roads: number;
      };
      structureLocations: Array<{
        type: string;
        hexes: Array<{ q: number; r: number }>;
        regionId?: string;
        regionIds?: string[];
      }>;
      armies: Array<{ id: string; owner: AgentId; position: HexCoord; count: number }>;
    }> = {};

    const agentPositions: Record<string, { q: number; r: number }> = {};
    const agentRegions: Record<string, string> = {};

    for (const [agentId, ps] of this.state.playerStates) {
      const structureLocations: Array<{
        type: string;
        hexes: Array<{ q: number; r: number }>;
        regionId?: string;
        regionIds?: string[];
      }> = [];

      for (const v of ps.structures.villages) {
        structureLocations.push({ type: "village", hexes: v.hexes, regionId: v.regionId });
      }
      for (const t of ps.structures.townships) {
        structureLocations.push({ type: "township", hexes: t.hexes, regionId: t.regionId });
      }
      for (const c of ps.structures.cities) {
        structureLocations.push({ type: "city", hexes: c.hexes, regionId: c.regionId });
      }
      for (const b of ps.structures.beacons) {
        structureLocations.push({ type: "beacon", hexes: b.hexes, regionId: b.regionId });
      }
      for (const tp of ps.structures.tradePosts) {
        structureLocations.push({ type: "trade_post", hexes: tp.hexes, regionId: tp.regionId });
      }
      for (const r of ps.structures.roads) {
        structureLocations.push({ type: "road", hexes: r.hexes, regionIds: r.regionIds ? [...r.regionIds] : undefined });
      }

      agentStates[agentId] = {
        resources: { ...ps.resources },
        vp: ps.vp,
        influence: ps.influence,
        longestRoad: ps.longestRoad,
        structures: {
          villages: ps.structures.villages.length,
          townships: ps.structures.townships.length,
          cities: ps.structures.cities.length,
          beacons: ps.structures.beacons.length,
          tradePosts: ps.structures.tradePosts.length,
          roads: ps.structures.roads.length,
        },
        structureLocations,
        armies: ps.armies.map(a => ({ ...a })),
      };

      if (ps.structures.villages.length > 0) {
        const startHex = ps.structures.villages[0].hexes[0];
        agentPositions[agentId] = { q: startHex.q, r: startHex.r };
        const startRegion = getRegionByCoord(this.state.worldMap, startHex);
        if (startRegion) {
          agentRegions[agentId] = startRegion.id;
        }
      }
    }

    return {
      gameId: this.state.gameId,
      round: this.state.round,
      phase: this.state.phase,
      isFinished: this.state.isFinished,
      winner: this.state.winner,
      hexGrid: hexes,
      agentStates,
      agentPositions,
      agentRegions,
      productionWheel: [...this.state.productionWheel],
      wheelPosition: this.state.wheelPosition,
      activeCrisis: this.state.activeCrisis,
      ecosystems: this.state.ecosystems.map((ecosystem) => ({
        id: ecosystem.id,
        name: ecosystem.name,
        kind: ecosystem.kind,
        resource: ecosystem.resource,
        health: ecosystem.health,
        maxHealth: ecosystem.maxHealth,
        status: ecosystem.status,
        regionIds: ecosystem.regionIds,
        label: ecosystem.label,
        lastPressure: ecosystem.lastPressure,
        lastYield: ecosystem.lastYield,
        lastDelta: ecosystem.lastDelta,
      })),
      prizePool: this.state.prizePool.toString(),
      payablePrizePool: this.state.payablePrizePool.toString(),
      slashedPrizePool: this.state.slashedPrizePool.toString(),
      carryoverPrizePool: this.state.carryoverPrizePool.toString(),
      commonsHealth: this.state.currentCommonsHealth,
      commitments: this.state.commitments.map((commitment) => ({
        id: commitment.id,
        type: commitment.type,
        promisor: commitment.promisor,
        counterparties: commitment.counterparties,
        resolutionStatus: commitment.resolutionStatus,
        summary: commitment.summary,
        dueByRound: commitment.dueByRound,
        payoutShareBps: commitment.payoutShareBps,
      })),
      attestations: this.state.attestations.map((attestation) => ({
        id: attestation.id,
        commitmentId: attestation.commitmentId,
        actor: attestation.actor,
        phase: attestation.phase,
        verdict: attestation.verdict,
        weight: attestation.weight,
      })),
      behaviorTags: this.state.behaviorTags.map((tag) => ({
        id: tag.id,
        round: tag.round,
        actor: tag.actor,
        kind: tag.kind,
        severity: tag.severity,
        description: tag.description,
      })),
      bonusHolders: {
        longestRoad: this.state.longestRoadHolder,
        mostInfluence: this.state.mostInfluenceHolder,
      },
      trustMatrix: this.trustGraph.getTrustMatrix(),
    };
  }

  private getControlledRegionIds(agentId: AgentId): string[] {
    const ps = this.state.playerStates.get(agentId);
    if (!ps) return [];

    const regionIds = new Set<string>();
    const structures = [
      ...ps.structures.villages,
      ...ps.structures.townships,
      ...ps.structures.cities,
      ...ps.structures.beacons,
      ...ps.structures.tradePosts,
    ];
    for (const structure of structures) {
      if (structure.regionId) {
        regionIds.add(structure.regionId);
        continue;
      }
      const region = structure.hexes[0]
        ? getRegionByCoord(this.state.worldMap, structure.hexes[0])
        : undefined;
      if (region) {
        regionIds.add(region.id);
      }
    }
    return [...regionIds];
  }

  private getAccessibleEcosystems(agentId: AgentId): EcosystemState[] {
    const controlled = new Set(this.getControlledRegionIds(agentId));
    return this.state.ecosystems
      .filter((ecosystem) => ecosystem.regionIds.some((regionId) => controlled.has(regionId)))
      .sort((left, right) => left.health - right.health);
  }

  private chooseAccessibleEcosystem(agentId: AgentId, ecosystemId?: string): EcosystemState | null {
    const accessible = this.getAccessibleEcosystems(agentId);
    if (accessible.length === 0) return null;
    if (ecosystemId) {
      return accessible.find((ecosystem) => ecosystem.id === ecosystemId) || null;
    }
    return accessible[0] || null;
  }

  private getRegionProductionModifier(regionId: string): number {
    let modifier = 0;
    for (const ecosystem of this.state.ecosystems) {
      if (!ecosystem.regionIds.includes(regionId)) continue;
      if (ecosystem.status === "collapsed") modifier -= 1;
      else if (ecosystem.status === "strained") modifier -= 0;
      else if (ecosystem.status === "flourishing") modifier += 1;
    }
    return modifier;
  }

  private getEcosystemYieldMultiplier(ecosystem: EcosystemState): number {
    if (ecosystem.status === "flourishing") return 1.35;
    if (ecosystem.status === "collapsed") return 0.45;
    if (ecosystem.status === "strained") return 0.8;
    return 1;
  }

  private getRestorationCost(kind: EcosystemState["kind"]): ResourceInventory {
    switch (kind) {
      case "fishery":
        return { grain: 0, timber: 0, ore: 0, fish: 0, water: 1, energy: 1 };
      case "forest":
        return { grain: 1, timber: 0, ore: 0, fish: 0, water: 1, energy: 0 };
      case "aquifer":
        return { grain: 0, timber: 0, ore: 0, fish: 0, water: 1, energy: 1 };
      case "wetland":
        return { grain: 1, timber: 0, ore: 0, fish: 0, water: 1, energy: 0 };
    }
  }

  private getEcosystemStatus(ecosystem: EcosystemState): EcosystemState["status"] {
    if (ecosystem.health <= ecosystem.collapseThreshold) return "collapsed";
    if (ecosystem.health >= ecosystem.flourishThreshold) return "flourishing";
    if (ecosystem.health <= Math.round(ecosystem.flourishThreshold * 0.72)) return "strained";
    return "stable";
  }

  private resolveCommonsCycle(trustUpdates: TrustUpdate[]): void {
    const roundExtractions = this.state.ecosystemExtractions.filter((entry) => entry.round === this.state.round);

    for (const ecosystem of this.state.ecosystems) {
      const extractions = roundExtractions.filter((entry) => entry.ecosystemId === ecosystem.id);
      let totalPressure = extractions.reduce((sum, entry) => sum + entry.pressure, 0);

      // Army pressure: each army unit adjacent to ecosystem adds +0.05 pressure per round
      const ecosystemRegionIds = new Set(ecosystem.regionIds);
      for (const [_, ps] of this.state.playerStates) {
        for (const army of ps.armies) {
          // Check if army is adjacent to any region of this ecosystem
          const armyHex = army.position;
          for (const regionId of ecosystem.regionIds) {
            const region = this.state.worldMap.regions.find(r => r.id === regionId);
            if (region) {
              const regionHex = region.coord;
              if (hexDistance(armyHex, regionHex) <= 1) {
                totalPressure += army.count * 0.05;
                break;
              }
            }
          }
        }
      }

      const totalYield = extractions.reduce((sum, entry) => sum + entry.yield, 0);
      const regenBonus = totalPressure === 0 && ecosystem.health < ecosystem.maxHealth ? 1 : 0;
      const delta = ecosystem.baseRegeneration + regenBonus - totalPressure;

      ecosystem.lastPressure = totalPressure;
      ecosystem.lastYield = totalYield;
      ecosystem.lastDelta = delta;
      ecosystem.health = Math.max(0, Math.min(ecosystem.maxHealth, ecosystem.health + delta));
      ecosystem.status = this.getEcosystemStatus(ecosystem);

      if (ecosystem.status === "collapsed" && extractions.length > 0) {
        for (const extraction of extractions) {
          this.recordBehaviorTag(
            extraction.agentId,
            "extractive",
            undefined,
            `${ecosystem.name} collapsed under extraction pressure`,
            "high",
            -0.18,
          );
          for (const otherId of this.state.players) {
            if (otherId === extraction.agentId) continue;
            trustUpdates.push({
              from: otherId,
              to: extraction.agentId,
              delta: -0.08,
              reason: "commons_collapsed",
            });
          }
        }
      } else if (ecosystem.status === "flourishing" && totalPressure > 0 && totalPressure <= ecosystem.baseRegeneration) {
        for (const extraction of extractions) {
          if (extraction.level === "high") continue;
          this.recordBehaviorTag(
            extraction.agentId,
            "stewardship",
            undefined,
            `${ecosystem.name} remained healthy under restrained extraction`,
            "low",
            0.08,
          );
        }
      }
    }
  }

  /**
   * Alliance VP System:
   * - Sustained cooperation (successful trades with same partner) earns Alliance VP
   * - Breaking an alliance costs Alliance VP
   * - Alliance VP is hidden but contributes to final score
   */
  private resolveAllianceVP(
    resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }>,
    sabotageEvents: Array<{ from: AgentId; to: AgentId; round: number }>,
    trustUpdates: TrustUpdate[],
  ): void {
    const SUSTAINED_COOPERATION_THRESHOLD = 3; // Rounds of cooperation needed for Alliance VP
    const ALLIANCE_VP_PER_RENEWAL = 1; // VP awarded per sustained cooperation renewal
    const ALLIANCE_BREAK_PENALTY = 2; // VP lost when breaking an alliance

    // Process this round's trades to track cooperation
    for (const trade of resolvedTrades) {
      const fromAgent = trade.from;
      const toAgent = trade.to;

      // Initialize maps if needed
      if (!this.state.allianceCooperationRounds.has(fromAgent)) {
        this.state.allianceCooperationRounds.set(fromAgent, new Map());
      }
      if (!this.state.allianceCooperationRounds.has(toAgent)) {
        this.state.allianceCooperationRounds.set(toAgent, new Map());
      }

      // Increment cooperation rounds for both parties
      const fromCoop = this.state.allianceCooperationRounds.get(fromAgent)!;
      const toCoop = this.state.allianceCooperationRounds.get(toAgent)!;

      const prevFromCoop = fromCoop.get(toAgent) || 0;
      const prevToCoop = toCoop.get(fromAgent) || 0;

      fromCoop.set(toAgent, prevFromCoop + 1);
      toCoop.set(fromAgent, prevToCoop + 1);

      // Check if sustained cooperation threshold reached - award Alliance VP
      if (prevFromCoop + 1 >= SUSTAINED_COOPERATION_THRESHOLD && prevFromCoop < SUSTAINED_COOPERATION_THRESHOLD) {
        const fromVP = this.state.allianceVP.get(fromAgent) || 0;
        const toVP = this.state.allianceVP.get(toAgent) || 0;
        this.state.allianceVP.set(fromAgent, fromVP + ALLIANCE_VP_PER_RENEWAL);
        this.state.allianceVP.set(toAgent, toVP + ALLIANCE_VP_PER_RENEWAL);

        // Emit event for alliance formation
        this.emitEvent("alliance.formed", {
          agents: [fromAgent, toAgent],
          roundsOfCooperation: prevFromCoop + 1,
          allianceVP: ALLIANCE_VP_PER_RENEWAL,
        }, { agents: "all", spectators: true });
      }
    }

    // Process sabotage events - breaking alliance costs VP
    for (const sabotage of sabotageEvents) {
      const saboteur = sabotage.from;
      const victim = sabotage.to;

      // Check if there was an alliance between these agents
      const saboteurCoop = this.state.allianceCooperationRounds.get(saboteur);
      const victimCoop = this.state.allianceCooperationRounds.get(victim);
      const saboteurPrevCoop = saboteurCoop?.get(victim) || 0;
      const victimPrevCoop = victimCoop?.get(saboteur) || 0;

      if (saboteurPrevCoop >= SUSTAINED_COOPERATION_THRESHOLD || victimPrevCoop >= SUSTAINED_COOPERATION_THRESHOLD) {
        // Alliance was active - penalize the saboteur
        const saboteurVP = this.state.allianceVP.get(saboteur) || 0;
        this.state.allianceVP.set(saboteur, Math.max(0, saboteurVP - ALLIANCE_BREAK_PENALTY));

        // Reset cooperation tracking
        saboteurCoop?.set(victim, 0);
        victimCoop?.set(saboteur, 0);

        // Emit event for alliance broken
        this.emitEvent("alliance.broken", {
          saboteur,
          victim,
          penalty: ALLIANCE_BREAK_PENALTY,
          trustUpdates: trustUpdates.length,
        }, { agents: "all", spectators: true });
      }
    }
  }

  /**
   * Get Alliance VP for an agent (for final score computation)
   */
  private getAllianceVP(agentId: AgentId): number {
    return this.state.allianceVP.get(agentId) || 0;
  }

  // ============================================================
  // Bonus tracking
  // ============================================================

  private updateBonusHolders(): void {
    // Longest road
    let maxRoad = 0;
    let roadHolder: AgentId | null = null;
    for (const [id, ps] of this.state.playerStates) {
      if (ps.longestRoad > maxRoad) {
        maxRoad = ps.longestRoad;
        roadHolder = id;
      }
    }
    if (roadHolder !== this.state.longestRoadHolder && maxRoad >= 5) {
      // Transfer bonus VP
      if (this.state.longestRoadHolder) {
        const oldPs = this.state.playerStates.get(this.state.longestRoadHolder);
        if (oldPs) oldPs.vp -= 2;
      }
      if (roadHolder) {
        const newPs = this.state.playerStates.get(roadHolder);
        if (newPs) newPs.vp += 2;
      }
      this.state.longestRoadHolder = roadHolder;
    }

    // Most influence
    let maxInfluence = 0;
    let influenceHolder: AgentId | null = null;
    for (const [id, ps] of this.state.playerStates) {
      if (ps.influence > maxInfluence) {
        maxInfluence = ps.influence;
        influenceHolder = id;
      }
    }
    if (influenceHolder !== this.state.mostInfluenceHolder && maxInfluence >= 3) {
      if (this.state.mostInfluenceHolder) {
        const oldPs = this.state.playerStates.get(this.state.mostInfluenceHolder);
        if (oldPs) oldPs.vp -= 2;
      }
      if (influenceHolder) {
        const newPs = this.state.playerStates.get(influenceHolder);
        if (newPs) newPs.vp += 2;
      }
      this.state.mostInfluenceHolder = influenceHolder;
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private makeAction(type: ComedyAction["type"], agentId: AgentId, params: Record<string, unknown> = {}): ComedyAction {
    return {
      type,
      agentId,
      params,
      round: this.state.round,
      timestamp: Date.now(),
    };
  }

  private canAfford(resources: ResourceInventory, cost: ResourceInventory): boolean {
    return RESOURCE_NAMES.every((resource) => resources[resource] >= cost[resource]);
  }

  private deductResources(ps: ComedyPlayerState, cost: ResourceInventory): void {
    for (const resource of RESOURCE_NAMES) {
      ps.resources[resource] -= cost[resource];
    }
  }

  private totalResources(resources: ResourceInventory): number {
    return RESOURCE_NAMES.reduce((sum, resource) => sum + resources[resource], 0);
  }

  private resourceBagsEqual(
    left: Partial<ResourceInventory>,
    right: Partial<ResourceInventory>,
  ): boolean {
    return RESOURCE_NAMES.every((resource) => (left[resource] || 0) === (right[resource] || 0));
  }

  private hasStructureNearHex(agentId: AgentId, coord: import("./types.js").HexCoord): boolean {
    const ps = this.state.playerStates.get(agentId);
    if (!ps) return false;

    // Check if any structure (village, township, city, beacon, trade post) is on or adjacent to this hex
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

  private hasCityNearHex(agentId: AgentId, coord: import("./types.js").HexCoord): boolean {
    const ps = this.state.playerStates.get(agentId);
    if (!ps) return false;

    for (const city of ps.structures.cities) {
      for (const cityHex of city.hexes) {
        if (hexDistance(cityHex, coord) <= 1) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Collect ALL village/township/city hexes across ALL players (for distance rule enforcement).
   */
  private getAllStructureHexes(): import("./types.js").HexCoord[] {
    const hexes: import("./types.js").HexCoord[] = [];
    for (const [_, ps] of this.state.playerStates) {
      for (const v of ps.structures.villages) {
        hexes.push(...v.hexes);
      }
      for (const t of ps.structures.townships) {
        hexes.push(...t.hexes);
      }
      for (const c of ps.structures.cities) {
        hexes.push(...c.hexes);
      }
    }
    return hexes;
  }

  /**
   * Check if a hex satisfies the distance rule: must be at least 2 hexes
   * from any other settlement or city (any player).
   */
  private satisfiesDistanceRule(coord: import("./types.js").HexCoord): boolean {
    const allStructureHexes = this.getAllStructureHexes();
    for (const existing of allStructureHexes) {
      if (hexDistance(coord, existing) < 2) {
        return false;
      }
    }
    return true;
  }

  /**
   * Find a hex near existing structures where a new structure can be placed.
   * Settlements/cities must be at least 2 hexes from any other settlement/city.
   * Beacons/trade posts only need to be on an unoccupied non-wasteland hex.
   * Must be adjacent to this agent's road network or existing structure.
   */
  private findBuildableHex(agentId: AgentId, enforceDistanceRule: boolean = true): import("./types.js").HexCoord | null {
    const ps = this.state.playerStates.get(agentId);
    if (!ps) return null;

    // Gather all hexes where this agent has structures or roads (the network)
    const networkKeys = new Set<string>();
    const networkHexes: import("./types.js").HexCoord[] = [];
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
    // Roads extend the network
    for (const road of ps.structures.roads) {
      for (const h of road.hexes) {
        const key = hexKey(h);
        if (!networkKeys.has(key)) {
          networkKeys.add(key);
          networkHexes.push(h);
        }
      }
    }

    // If no network, pick a random revealed hex
    if (networkHexes.length === 0) {
      const revealed = Array.from(this.state.hexGrid.values())
        .filter(t => t.revealedBy.includes(agentId) && t.terrain !== "wasteland");
      if (revealed.length > 0) {
        const candidates = enforceDistanceRule
          ? revealed.filter(t => this.satisfiesDistanceRule(t.coord))
          : revealed;
        if (candidates.length > 0) {
          return candidates[Math.floor(Math.random() * candidates.length)].coord;
        }
      }
      return null;
    }

    // Collect all hexes occupied by any structure (any player)
    const allOccupied = new Set<string>();
    for (const [_, otherPs] of this.state.playerStates) {
      for (const s of [...otherPs.structures.villages, ...otherPs.structures.townships,
                        ...otherPs.structures.cities, ...otherPs.structures.beacons,
                        ...otherPs.structures.tradePosts]) {
        for (const h of s.hexes) {
          allOccupied.add(hexKey(h));
        }
      }
    }

    // Find adjacent hexes that are valid and unoccupied
    const candidates: import("./types.js").HexCoord[] = [];
    for (const nh of networkHexes) {
      for (const neighbor of hexNeighbors(nh)) {
        const key = hexKey(neighbor);
        if (allOccupied.has(key)) continue;
        if (!this.state.hexGrid.has(key)) continue;
        const tile = this.state.hexGrid.get(key)!;
        if (tile.terrain === "wasteland") continue;
        if (enforceDistanceRule && !this.satisfiesDistanceRule(neighbor)) continue;
        candidates.push(neighbor);
      }
    }

    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // No valid position found (board is too crowded)
    return null;
  }

  /**
   * Find a hex where this agent already has a structure (for road placement).
   */
  private findStructureHex(agentId: AgentId): import("./types.js").HexCoord | null {
    const ps = this.state.playerStates.get(agentId);
    if (!ps) return null;

    const allStructures = [
      ...ps.structures.villages,
      ...ps.structures.townships,
      ...ps.structures.cities,
      ...ps.structures.beacons,
      ...ps.structures.tradePosts,
    ];

    if (allStructures.length === 0) return null;
    // Return the most recently placed structure's hex
    const last = allStructures[allStructures.length - 1];
    return last.hexes[0] || null;
  }

  /**
   * Reveal hexes around a coordinate for an agent.
   */
  private revealHexesAround(agentId: AgentId, coord: import("./types.js").HexCoord): void {
    const hex = this.state.hexGrid.get(hexKey(coord));
    if (hex && !hex.revealedBy.includes(agentId)) {
      hex.revealed = true;
      hex.revealedBy.push(agentId);
    }
    for (const neighbor of hexNeighbors(coord)) {
      const nHex = this.state.hexGrid.get(hexKey(neighbor));
      if (nHex && !nHex.revealedBy.includes(agentId)) {
        nHex.revealed = true;
        nHex.revealedBy.push(agentId);
      }
    }
  }

  // ============================================================
  // Crisis penalties
  // ============================================================

  /**
   * Apply the mechanical penalty for a failed crisis.
   */
  private applyCrisisPenalty(crisis: CrisisEvent, scoreChanges: Record<AgentId, number>): void {
    switch (crisis.type) {
      case "blight": {
        for (const [_agentId, ps] of this.state.playerStates) {
          const lost = Math.min(ps.resources.grain, 2);
          ps.resources.grain -= lost;
          if (ps.resources.water > 0) {
            ps.resources.water -= 1;
          }
        }
        break;
      }
      case "storm": {
        // "Random roads destroyed across the map"
        for (const [agentId, ps] of this.state.playerStates) {
          if (ps.structures.roads.length > 0) {
            ps.structures.roads.pop();
            ps.longestRoad = Math.max(0, ps.longestRoad - 1);
          }
        }
        break;
      }
      case "famine": {
        for (const [_agentId, ps] of this.state.playerStates) {
          const total = this.totalResources(ps.resources);
          if (total > 5) {
            let toRemove = total - 5;
            const types: ResourceType[] = [...RESOURCE_NAMES];
            types.sort((a, b) => ps.resources[b] - ps.resources[a]);
            for (const resType of types) {
              const remove = Math.min(ps.resources[resType], toRemove);
              ps.resources[resType] -= remove;
              toRemove -= remove;
              if (toRemove <= 0) break;
            }
          }
        }
        break;
      }
      case "current_surge": {
        const basinHex = this.state.hexGrid.get(hexKey({ q: 0, r: 0 }));
        if (basinHex) {
          basinHex.terrain = "wasteland";
          basinHex.productionNumber = 0;
        }
        break;
      }
      case "the_rift": {
        // "Random hex becomes permanent Wasteland"
        const nonWasteland = Array.from(this.state.hexGrid.values()).filter(
          t => t.terrain !== "wasteland" && t.terrain !== "commons"
        );
        if (nonWasteland.length > 0) {
          const target = nonWasteland[Math.floor(Math.random() * nonWasteland.length)];
          target.terrain = "wasteland";
          target.productionNumber = 0;
        }
        // VP penalty for everyone
        for (const agentId of this.state.players) {
          scoreChanges[agentId] = (scoreChanges[agentId] || 0) - 1;
        }
        break;
      }
    }
  }

  // ============================================================
  // Commitment ledger
  // ============================================================

  public submitCommitmentAttestation(
    commitmentId: string,
    actor: AgentId,
    verdict: AttestationVerdict,
    detail: string,
    phase: "existence" | "fulfillment" = "fulfillment",
  ): AttestationRecord | null {
    const commitment = this.state.commitments.find((item) => item.id === commitmentId);
    if (!commitment || !this.canActorAttest(commitment, actor)) {
      return null;
    }

    const attestation = this.createAttestationRecord(
      commitment,
      actor,
      phase,
      verdict,
      detail,
      [],
    );
    if (!attestation) return null;

    const trustUpdates = this.resolveSingleCommitment(commitment);
    this.applyImmediateTrustUpdates(trustUpdates);
    return attestation;
  }

  public recordPayoutReceipt(
    commitmentId: string,
    from: AgentId,
    to: AgentId,
    proof: string,
    shareBps?: number,
    amountWei?: bigint,
  ): PayoutReceipt | null {
    const commitment = this.state.commitments.find((item) => item.id === commitmentId);
    if (!commitment || commitment.type !== "prize_share") {
      return null;
    }

    const receipt: PayoutReceipt = {
      id: `receipt-${this.payoutReceiptCounter++}`,
      commitmentId,
      from,
      to,
      shareBps,
      amountWei: amountWei?.toString(),
      proof,
      round: this.state.round,
    };
    this.state.payoutReceipts.push(receipt);

    const evidence = this.appendEvidence(
      commitment,
      "payout_receipt",
      receipt.id,
      `Payout receipt submitted: ${proof}`,
      this.state.round,
      from,
    );

    this.emitEvent("commitment.attested", {
      commitmentId,
      actor: from,
      verdict: "fulfill",
      evidence,
      receipt,
    }, { agents: "all", spectators: true });

    const trustUpdates = this.resolveSingleCommitment(commitment);
    this.applyImmediateTrustUpdates(trustUpdates);
    return receipt;
  }

  private processMessagesForLedger(messages: Message[]): void {
    for (const message of messages) {
      this.detectCommitmentFromMessage(message);
      this.detectAttestationFromMessage(message);
    }
  }

  private detectCommitmentFromMessage(message: Message): void {
    const lower = message.content.toLowerCase();
    const type = this.classifyCommitmentType(lower);
    if (!type) return;

    const conditions = this.extractCommitmentConditions(lower, message);
    const summary = message.content.trim().slice(0, 160);
    const counterparties =
      message.recipient === "broadcast" ? [] : [message.recipient as AgentId];

    const duplicate = this.state.commitments.find((item) =>
      item.promisor === message.sender &&
      item.type === type &&
      item.round === message.round &&
      item.summary === summary,
    );
    if (duplicate) return;

    const candidate: CommitmentCandidate = {
      id: `candidate-${this.candidateCounter++}`,
      messageId: message.id,
      round: message.round,
      sender: message.sender,
      counterparties,
      type,
      visibility: message.type === "public" ? "public" : "private",
      confidence: this.estimateCommitmentConfidence(type, lower),
      rawText: message.content,
      summary,
      conditions,
    };
    this.state.commitmentCandidates.push(candidate);

    const commitment: CommitmentRecord = {
      ...candidate,
      id: `commitment-${this.commitmentCounter++}`,
      candidateId: candidate.id,
      promisor: message.sender,
      resolutionStatus: "pending",
      attestations: [],
      evidence: [],
      dueByRound: this.inferDueRound(type, conditions),
      resolvedRound: null,
      contested: false,
      payoutShareBps: this.extractPayoutShareBps(lower),
      behaviorTags: [],
    };

    this.appendEvidence(
      commitment,
      "message",
      message.id,
      `Extracted from ${message.type} message`,
      message.round,
      message.sender,
    );

    this.state.commitments.push(commitment);

    this.emitEvent("commitment.detected", {
      candidate,
      commitment,
    }, { agents: "all", spectators: true });
  }

  private detectAttestationFromMessage(message: Message): void {
    const lower = message.content.toLowerCase();
    const match = lower.match(/\bcommitment-(\d+)\b/);
    if (!match) return;

    const commitmentId = `commitment-${match[1]}`;
    const commitment = this.state.commitments.find((item) => item.id === commitmentId);
    if (!commitment || !this.canActorAttest(commitment, message.sender)) {
      return;
    }

    const parsed = this.parseAttestationMessage(lower);
    if (!parsed) return;

    const evidenceRefs: string[] = [];
    const txMatch = message.content.match(/0x[a-fA-F0-9]{8,}/);
    if (txMatch) {
      const evidence = this.appendEvidence(
        commitment,
        "payout_receipt",
        txMatch[0],
        `Message-attached proof ${txMatch[0]}`,
        message.round,
        message.sender,
      );
      evidenceRefs.push(evidence.id);
    }

    const attestation = this.createAttestationRecord(
      commitment,
      message.sender,
      parsed.phase,
      parsed.verdict,
      message.content.trim().slice(0, 160),
      evidenceRefs,
    );
    if (!attestation) return;

    const trustUpdates = this.resolveSingleCommitment(commitment);
    this.applyImmediateTrustUpdates(trustUpdates);
  }

  private createAttestationRecord(
    commitment: CommitmentRecord,
    actor: AgentId,
    phase: "existence" | "fulfillment",
    verdict: AttestationVerdict,
    detail: string,
    evidenceRefs: string[],
  ): AttestationRecord | null {
    const alreadyExists = commitment.attestations.some((item) =>
      item.actor === actor && item.phase === phase,
    );
    if (alreadyExists) {
      return null;
    }

    const attestation: AttestationRecord = {
      id: `attestation-${this.attestationCounter++}`,
      commitmentId: commitment.id,
      actor,
      round: this.state.round,
      phase,
      verdict,
      detail,
      evidenceRefs,
      weight: this.computeAttestationWeight(commitment, actor),
      accepted: true,
    };

    commitment.attestations.push(attestation);
    this.state.attestations.push(attestation);

    this.emitEvent("commitment.attested", {
      commitmentId: commitment.id,
      attestation,
    }, { agents: "all", spectators: true });

    return attestation;
  }

  private resolveCommitmentLedger(
    trustUpdates: TrustUpdate[],
    resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }>,
    sabotageEvents: Array<{ from: AgentId; to: AgentId; round: number }>,
    crisisContributors: Set<AgentId>,
  ): void {
    for (const commitment of this.state.commitments) {
      if (commitment.resolutionStatus !== "pending") continue;

      if (commitment.type === "resource_transfer") {
        const matchedTrade = resolvedTrades.find((trade) =>
          trade.from === commitment.promisor &&
          commitment.counterparties.includes(trade.to),
        );
        if (matchedTrade) {
          this.appendEvidence(
            commitment,
            "trade",
            `${matchedTrade.from}:${matchedTrade.to}:${matchedTrade.round}`,
            `Resolved trade between ${matchedTrade.from} and ${matchedTrade.to}`,
            matchedTrade.round,
            matchedTrade.from,
          );
        }
      }

      if (commitment.type === "non_attack") {
        const targetId =
          commitment.counterparties[0] ??
          commitment.conditions.find((item) => item.type === "if_no_attack")?.agentId;
        const sabotage = sabotageEvents.find((item) =>
          item.from === commitment.promisor && item.to === targetId,
        );
        if (sabotage) {
          this.appendEvidence(
            commitment,
            "system",
            `sabotage:${sabotage.from}:${sabotage.to}:${sabotage.round}`,
            `${sabotage.from} attacked ${sabotage.to}`,
            sabotage.round,
            sabotage.from,
          );
        } else if (targetId && commitment.dueByRound !== null && this.state.round >= commitment.dueByRound) {
          this.appendEvidence(
            commitment,
            "absence",
            `no-sabotage:${commitment.promisor}:${targetId}:${this.state.round}`,
            `${commitment.promisor} did not attack ${targetId} through round ${this.state.round}`,
            this.state.round,
            commitment.promisor,
          );
        }
      }

      if (commitment.type === "crisis_support" && crisisContributors.has(commitment.promisor)) {
        this.appendEvidence(
          commitment,
          "crisis_contribution",
          `${commitment.promisor}:${this.state.round}`,
          `${commitment.promisor} contributed to the active crisis`,
          this.state.round,
          commitment.promisor,
        );
      }

      trustUpdates.push(...this.resolveSingleCommitment(commitment));
    }
  }

  private resolveSingleCommitment(commitment: CommitmentRecord): TrustUpdate[] {
    if (commitment.resolutionStatus !== "pending") {
      return [];
    }

    const trustUpdates: TrustUpdate[] = [];
    const existenceWeight = commitment.attestations
      .filter((item) => item.phase === "existence" && item.verdict === "confirm" && item.accepted)
      .reduce((sum, item) => sum + item.weight, 0);
    if (existenceWeight <= 0) {
      return [];
    }

    const objectiveStatus = this.getObjectiveResolutionStatus(commitment);
    const fulfillWeight = commitment.attestations
      .filter((item) => item.phase === "fulfillment" && ["fulfill", "receive"].includes(item.verdict) && item.accepted)
      .reduce((sum, item) => sum + item.weight, 0);
    const breachWeight = commitment.attestations
      .filter((item) => item.phase === "fulfillment" && item.verdict === "breach" && item.accepted)
      .reduce((sum, item) => sum + item.weight, 0);
    const contestWeight = commitment.attestations
      .filter((item) => item.phase === "fulfillment" && item.verdict === "contest" && item.accepted)
      .reduce((sum, item) => sum + item.weight, 0);

    let nextStatus: ResolutionStatus | null = null;
    if (objectiveStatus === "non_triggered") {
      nextStatus = "non_triggered";
    } else if (objectiveStatus === "fulfilled") {
      nextStatus = contestWeight > 0.75 ? "contested" : "fulfilled";
    } else if (objectiveStatus === "breached") {
      nextStatus = contestWeight > breachWeight ? "contested" : "breached";
    } else if (fulfillWeight > 0 && breachWeight > 0 && Math.abs(fulfillWeight - breachWeight) < 0.35) {
      nextStatus = "contested";
    } else if (fulfillWeight >= 1.2) {
      nextStatus = "fulfilled";
    } else if (breachWeight >= 1.2) {
      nextStatus = "breached";
    } else if (
      commitment.dueByRound !== null &&
      this.state.round > commitment.dueByRound &&
      breachWeight > 0
    ) {
      nextStatus = "breached";
    }

    if (!nextStatus) {
      return [];
    }

    commitment.resolutionStatus = nextStatus;
    commitment.resolvedRound = this.state.round;
    commitment.contested = nextStatus === "contested";

    if (nextStatus === "contested") {
      const claim: ContestedClaim = {
        id: `contested-${this.contestedCounter++}`,
        commitmentId: commitment.id,
        actor: commitment.promisor,
        round: this.state.round,
        reason: "Conflicting attestations or insufficient proof",
        evidenceRefs: commitment.evidence.map((item) => item.id),
      };
      this.state.contestedClaims.push(claim);
    }

    if (nextStatus === "fulfilled") {
      for (const counterparty of commitment.counterparties) {
        trustUpdates.push({
          from: counterparty,
          to: commitment.promisor,
          delta: 0.18,
          reason: "attested_commitment_fulfilled",
        });
      }
    } else if (nextStatus === "breached") {
      const reporters = commitment.counterparties.length > 0
        ? commitment.counterparties
        : this.state.players.filter((id) => id !== commitment.promisor);
      for (const reporter of reporters) {
        trustUpdates.push({
          from: reporter,
          to: commitment.promisor,
          delta: -0.22,
          reason: "attested_commitment_breached",
        });
      }
    }

    this.emitEvent("commitment.resolved", {
      commitmentId: commitment.id,
      status: commitment.resolutionStatus,
      summary: commitment.summary,
      evidence: commitment.evidence,
      attestations: commitment.attestations,
    }, { agents: "all", spectators: true });

    return trustUpdates;
  }

  private getObjectiveResolutionStatus(commitment: CommitmentRecord): ResolutionStatus | null {
    const hasTradeEvidence = commitment.evidence.some((item) => item.type === "trade");
    const hasPayoutReceipt = commitment.evidence.some((item) => item.type === "payout_receipt");
    const hasAbsenceEvidence = commitment.evidence.some((item) => item.type === "absence");
    const hasSystemBreach = commitment.evidence.some((item) =>
      item.type === "system" && item.summary.toLowerCase().includes("attacked"),
    );
    const hasCrisisContribution = commitment.evidence.some((item) => item.type === "crisis_contribution");

    if (commitment.type === "resource_transfer" && hasTradeEvidence) {
      return "fulfilled";
    }
    if (commitment.type === "non_attack" && hasSystemBreach) {
      return "breached";
    }
    if (commitment.type === "non_attack" && hasAbsenceEvidence) {
      return "fulfilled";
    }
    if (commitment.type === "crisis_support" && hasCrisisContribution) {
      return "fulfilled";
    }
    if (commitment.type === "prize_share") {
      if (hasPayoutReceipt) return "fulfilled";
      const conditionalWin = commitment.conditions.find((item) => item.type === "if_i_win");
      if (conditionalWin && this.state.winner && this.state.winner !== commitment.promisor) {
        this.appendEvidence(
          commitment,
          "winner",
          this.state.winner,
          `${commitment.promisor} did not win the game`,
          this.state.round,
          this.state.winner,
        );
        return "non_triggered";
      }
    }

    return null;
  }

  private finalizePostGameCommitments(): void {
    if (!this.state.winner) return;
    const trustUpdates: TrustUpdate[] = [];
    for (const commitment of this.state.commitments) {
      if (commitment.resolutionStatus === "pending") {
        trustUpdates.push(...this.resolveSingleCommitment(commitment));
      }
    }
    this.applyImmediateTrustUpdates(trustUpdates);
  }

  private applyImmediateTrustUpdates(trustUpdates: TrustUpdate[]): void {
    if (trustUpdates.length === 0) return;

    this.trustGraph.applyUpdatesWithMeta(trustUpdates, {
      gameId: this.state.gameId,
      round: this.state.round,
      phase: this.state.phase,
      timestamp: Date.now(),
    });
    this.trustGraph.tick();
    this.emitEvent("trust.updated", {
      updates: trustUpdates,
      snapshots: this.trustGraph.getAllSnapshots(),
      readModels: this.trustGraph.getAllReadModels(),
      dossiers: this.trustGraph.getAllTrustDossiers(),
      projections: this.trustGraph.getAllGraduatedProjections(),
      snapshotArtifact: this.trustGraph.getSnapshotArtifact(),
    }, { agents: "all", spectators: true });
  }

  private getVisibleCommitments(agentId: AgentId): CommitmentRecord[] {
    return this.state.commitments.filter((commitment) =>
      commitment.visibility === "public" ||
      commitment.promisor === agentId ||
      commitment.counterparties.includes(agentId),
    );
  }

  private getVisibleAttestations(agentId: AgentId): AttestationRecord[] {
    const visibleIds = new Set(this.getVisibleCommitments(agentId).map((item) => item.id));
    return this.state.attestations.filter((attestation) =>
      visibleIds.has(attestation.commitmentId) || attestation.actor === agentId,
    );
  }

  private canActorAttest(commitment: CommitmentRecord, actor: AgentId): boolean {
    if (actor === commitment.promisor) return true;
    if (commitment.counterparties.includes(actor)) return true;
    return commitment.visibility === "public" && commitment.counterparties.length === 0;
  }

  private classifyCommitmentType(lower: string): CommitmentRecord["type"] | null {
    if (/(split|share).*(prize|pot|winnings)/.test(lower)) return "prize_share";
    if (/(don't attack|do not attack|won't attack|will not attack|non-aggression)/.test(lower)) return "non_attack";
    if (/(don't build|do not build|won't build|will not build)/.test(lower)) return "non_build";
    if (/(contribute|help with crisis|pitch in|donate)/.test(lower) && this.state.activeCrisis) return "crisis_support";
    if (/(give you|send you|trade|deal|offer|exchange|swap)/.test(lower)) return "resource_transfer";
    if (/(alliance|ally|team up|partner|pact|work together)/.test(lower)) return "alliance";
    return null;
  }

  private estimateCommitmentConfidence(type: CommitmentRecord["type"], lower: string): number {
    const hasDirectPromise = /\b(i will|i'll|i promise|we will|we'll)\b/.test(lower);
    const hasConditional = /\bif\b/.test(lower);
    let base = hasDirectPromise ? 0.82 : 0.58;
    if (hasConditional) base += 0.08;
    if (type === "prize_share") base += 0.05;
    return Math.min(0.99, base);
  }

  private extractCommitmentConditions(lower: string, message: Message): CommitmentCondition[] {
    const conditions: CommitmentCondition[] = [];

    if (/\bif i win\b/.test(lower) || /\bif we win\b/.test(lower)) {
      conditions.push({ type: "if_i_win", summary: "Only applies if the promisor wins" });
    }
    if (message.recipient !== "broadcast" && /\bif you don't attack me\b|\bif you do not attack me\b/.test(lower)) {
      conditions.push({
        type: "if_no_attack",
        summary: `Only applies if ${message.recipient} does not attack ${message.sender}`,
        agentId: message.recipient as AgentId,
      });
    }
    if (message.recipient !== "broadcast" && /\bif you give me\b|\bif you send me\b|\bif you trade me\b/.test(lower)) {
      conditions.push({
        type: "if_resource_transfer",
        summary: `Only applies if ${message.recipient} transfers resources`,
        agentId: message.recipient as AgentId,
      });
    }
    if (/\bnext round\b/.test(lower)) {
      conditions.push({
        type: "by_round",
        summary: "Due next round",
        round: this.state.round + 1,
      });
    }
    if (this.state.activeCrisis && /(contribute|help with crisis|pitch in|donate)/.test(lower)) {
      conditions.push({
        type: "if_crisis_contribution",
        summary: `Must contribute while ${this.state.activeCrisis.type} is active`,
      });
    }
    if (conditions.length === 0) {
      conditions.push({ type: "manual", summary: "Inferred from dialogue" });
    }

    return conditions;
  }

  private extractPayoutShareBps(lower: string): number | null {
    const match = lower.match(/(\d+)\s*%/);
    if (!match) return null;
    const pct = parseInt(match[1], 10);
    if (Number.isNaN(pct)) return null;
    return Math.max(0, Math.min(10000, pct * 100));
  }

  private inferDueRound(type: CommitmentRecord["type"], conditions: CommitmentCondition[]): number | null {
    const explicitRound = conditions.find((item) => item.type === "by_round")?.round;
    if (explicitRound !== undefined) return explicitRound;

    if (type === "resource_transfer" || type === "non_attack" || type === "crisis_support") {
      return this.state.round + 1;
    }
    if (type === "alliance" || type === "non_build") {
      return this.state.round + 2;
    }

    return null;
  }

  private parseAttestationMessage(lower: string): { phase: "existence" | "fulfillment"; verdict: AttestationVerdict } | null {
    if (/(attest|confirm|acknowledge).*(exists|promise|commitment)/.test(lower)) {
      return { phase: "existence", verdict: "confirm" };
    }
    if (/(fulfilled|kept|honored|paid|delivered)/.test(lower)) {
      return { phase: "fulfillment", verdict: "fulfill" };
    }
    if (/\breceived\b/.test(lower)) {
      return { phase: "fulfillment", verdict: "receive" };
    }
    if (/(betrayed|broke|defaulted|did not pay|didn't pay|failed to honor)/.test(lower)) {
      return { phase: "fulfillment", verdict: "breach" };
    }
    if (/(did not trigger|didn't trigger|i did not win|i didn't win|no payout due)/.test(lower)) {
      return { phase: "fulfillment", verdict: "non_trigger" };
    }
    if (/(contest|dispute|disagree)/.test(lower)) {
      return { phase: "fulfillment", verdict: "contest" };
    }
    return null;
  }

  private computeAttestationWeight(commitment: CommitmentRecord, actor: AgentId): number {
    const relevance =
      actor === commitment.promisor
        ? 1
        : commitment.counterparties.includes(actor)
          ? 0.95
          : 0.45;
    const reliability = 0.5 + this.trustGraph.getGlobalScore(actor) * 0.5;
    return Math.round(relevance * reliability * 100) / 100;
  }

  private appendEvidence(
    commitment: CommitmentRecord,
    type: EvidenceRef["type"],
    ref: string,
    summary: string,
    round: number,
    actorId?: AgentId,
  ): EvidenceRef {
    const existing = commitment.evidence.find((item) => item.type === type && item.ref === ref);
    if (existing) return existing;

    const evidence: EvidenceRef = {
      id: `evidence-${this.evidenceCounter++}`,
      type,
      ref,
      summary,
      round,
      actorId,
    };
    commitment.evidence.push(evidence);
    return evidence;
  }

  private recordBehaviorTag(
    actor: AgentId,
    kind: BehaviorTag["kind"],
    relatedAgentId: AgentId | undefined,
    description: string,
    severity: BehaviorTag["severity"],
    trustDeltaHint?: number,
  ): BehaviorTag {
    const tag: BehaviorTag = {
      id: `behavior-${this.behaviorCounter++}`,
      round: this.state.round,
      actor,
      kind,
      severity,
      description,
      relatedAgentId,
      trustDeltaHint,
    };
    this.state.behaviorTags.push(tag);
    this.emitEvent("behavior.tagged", tag, { agents: "all", spectators: true });
    return tag;
  }

  private refreshCommonsHealth(): void {
    const ecosystemAverage = this.state.ecosystems.length > 0
      ? Math.round(
        this.state.ecosystems.reduce((sum, ecosystem) => sum + ecosystem.health, 0) /
        this.state.ecosystems.length,
      )
      : 100;
    const collapsed = this.state.ecosystems.filter((ecosystem) => ecosystem.status === "collapsed").length;
    const strained = this.state.ecosystems.filter((ecosystem) => ecosystem.status === "strained").length;
    const flourishing = this.state.ecosystems.filter((ecosystem) => ecosystem.status === "flourishing").length;
    const failedCrises = this.state.crisisHistory.filter((crisis) => !crisis.resolved).length;
    const sabotageCount = this.state.behaviorTags.filter((tag) => tag.kind === "sabotage").length;

    let score = ecosystemAverage;
    score -= strained * 5;
    score -= collapsed * 12;
    score -= failedCrises * 10;
    score -= sabotageCount * 5;
    score = Math.max(0, Math.min(100, score));

    const payableFraction = score / 100;
    const payablePrizePool = this.applyFractionToBigInt(this.state.prizePool, payableFraction);
    const slashedPrizePool = this.state.prizePool - payablePrizePool;
    const reasons: string[] = [];
    reasons.push(`${ecosystemAverage} avg ecosystem health`);
    if (flourishing > 0) reasons.push(`${flourishing} ecosystems flourishing`);
    if (strained > 0) reasons.push(`${strained} ecosystems strained`);
    if (collapsed > 0) reasons.push(`${collapsed} ecosystems collapsed`);
    if (failedCrises > 0) reasons.push(`${failedCrises} failed crises`);
    if (sabotageCount > 0) reasons.push(`${sabotageCount} sabotage incidents`);
    if (reasons.length === 0) reasons.push("Commons stable");

    const snapshot = this.buildCommonsHealthSnapshot(
      this.state.round,
      score,
      reasons,
      payablePrizePool,
      slashedPrizePool,
      this.state.carryoverPrizePool,
    );
    this.state.currentCommonsHealth = snapshot;

    const last = this.state.commonsHealthHistory[this.state.commonsHealthHistory.length - 1];
    if (!last || last.round !== snapshot.round) {
      this.state.commonsHealthHistory.push(snapshot);
    } else {
      this.state.commonsHealthHistory[this.state.commonsHealthHistory.length - 1] = snapshot;
    }
  }

  private async syncTrustToERC8004(): Promise<void> {
    if (!this.erc8004Integration) return;

    for (const [agentId, ps] of this.state.playerStates) {
      const trustScore = this.trustGraph.getGlobalScore(agentId);
      try {
        await this.erc8004Integration.syncTrustToERC8004(agentId, trustScore);
      } catch (error) {
        console.warn(`Failed to sync trust for agent ${agentId}:`, error);
      }
    }
  }

  private finalizePrizePool(): void {
    this.refreshCommonsHealth();
    const fraction = this.state.currentCommonsHealth.payableFraction;
    this.state.payablePrizePool = this.applyFractionToBigInt(this.state.prizePool, fraction);
    this.state.slashedPrizePool = this.state.prizePool - this.state.payablePrizePool;
    this.state.carryoverPrizePool = this.state.slashedPrizePool;
    ComedyEngine.pendingPrizeCarryoverWei = this.state.carryoverPrizePool;

    this.state.currentCommonsHealth = this.buildCommonsHealthSnapshot(
      this.state.round,
      this.state.currentCommonsHealth.score,
      this.state.currentCommonsHealth.reasons,
      this.state.payablePrizePool,
      this.state.slashedPrizePool,
      this.state.carryoverPrizePool,
    );

    this.emitEvent("prize.slashed", {
      prizePoolWei: this.state.prizePool.toString(),
      payablePrizePoolWei: this.state.payablePrizePool.toString(),
      slashedPrizePoolWei: this.state.slashedPrizePool.toString(),
      carryoverPrizePoolWei: this.state.carryoverPrizePool.toString(),
      commonsHealth: this.state.currentCommonsHealth,
    }, { agents: "all", spectators: true });
  }

  private buildCommonsHealthSnapshot(
    round: number,
    score: number,
    reasons: string[],
    payablePrizePool: bigint,
    slashedPrizePool: bigint,
    carryoverPrizePool: bigint,
  ): CommonsHealthSnapshot {
    return {
      round,
      score,
      payableFraction: Math.max(0, Math.min(1, score / 100)),
      reasons,
      payablePrizePoolWei: payablePrizePool.toString(),
      slashedPrizePoolWei: slashedPrizePool.toString(),
      carryoverPrizePoolWei: carryoverPrizePool.toString(),
    };
  }

  private applyFractionToBigInt(value: bigint, fraction: number): bigint {
    const bps = BigInt(Math.max(0, Math.min(10000, Math.round(fraction * 10000))));
    return value * bps / 10000n;
  }

  private static takePrizeCarryover(): bigint {
    const carryover = ComedyEngine.pendingPrizeCarryoverWei;
    ComedyEngine.pendingPrizeCarryoverWei = 0n;
    return carryover;
  }

  private getScarcestResource(resources: ResourceInventory): ResourceType {
    return RESOURCE_NAMES.reduce((min, r) =>
      resources[r] < resources[min] ? r : min,
    );
  }

  private successOutcome(action: Action, description: string, effects: GameEffect[]): ActionOutcome {
    return { action, success: true, description, effects };
  }

  private failOutcome(action: Action, description: string): ActionOutcome {
    return { action, success: false, description, effects: [] };
  }
}
