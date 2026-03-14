/**
 * Nexus Game Engine
 *
 * The flagship coordination game implementation.
 * Extends the abstract GameEngine with Nexus-specific logic.
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
  NexusGameState,
  NexusAgentView,
  NexusAction,
  NexusPlayerState,
  ResourceInventory,
  ResourceType,
  CrisisEvent,
  CrisisType,
  CRISIS_DEFINITIONS,
  STRUCTURE_COSTS,
  STRUCTURE_VP,
  TERRAIN_RESOURCE,
  PRODUCTION_WHEEL,
  RESOURCE_CAP,
  EMPTY_INVENTORY,
  PromiseRecord,
} from "./types.js";
import {
  generateHexGrid,
  getStartingPositions,
  hexKey,
  hexNeighbors,
  hexDistance,
} from "./hex-grid.js";
import { TrustGraph } from "../../trust/trust-graph.js";

export class NexusEngine extends GameEngine<NexusGameState> {
  private trustGraph: TrustGraph;
  private promises: PromiseRecord[] = [];
  private pendingTrades: Map<string, { from: AgentId; to: AgentId; give: Partial<ResourceInventory>; receive: Partial<ResourceInventory> }> = new Map();
  private crisisCooldownRounds = 3;

  constructor(config: GameConfig, eventBus: EventBus, trustGraph: TrustGraph) {
    super(config, eventBus);
    this.trustGraph = trustGraph;
  }

  // ============================================================
  // Abstract method implementations
  // ============================================================

  protected createInitialState(config: GameConfig): NexusGameState {
    const hexGrid = generateHexGrid(config.maxPlayers, Date.now());

    // Determine hidden max rounds (20-30, agents don't know exact number)
    const actualMaxRounds = 20 + Math.floor(Math.random() * 11); // 20-30

    return {
      gameId: config.id,
      round: 0,
      phase: "setup",
      players: [],
      scores: {},
      isFinished: false,
      winner: null,
      hexGrid,
      vertices: [],
      edges: [],
      playerStates: new Map(),
      productionWheel: [...PRODUCTION_WHEEL],
      wheelPosition: 0,
      activeCrisis: null,
      crisisHistory: [],
      crisisCooldown: 3, // No crisis in first 3 rounds
      longestRoadHolder: null,
      mostInfluenceHolder: null,
      mostCrisisContribHolder: null,
      prizePool: 0n,
      moveCount: 0,
      messageCount: 0,
      actualMaxRounds,
    };
  }

  /**
   * Set up player starting positions and resources
   */
  protected override async initializeAgents(): Promise<void> {
    const startingPositions = getStartingPositions(
      this.state.hexGrid,
      this.state.players.length,
    );

    // Initialize each player's state
    for (let i = 0; i < this.state.players.length; i++) {
      const agentId = this.state.players[i];
      const startPos = startingPositions[i % startingPositions.length];

      const playerState: NexusPlayerState = {
        id: agentId,
        resources: { grain: 2, timber: 2, ore: 1, energy: 0 },
        influence: 0,
        structures: {
          settlements: [],
          cities: [],
          beacons: [],
          tradePosts: [],
          roads: [],
        },
        vp: 1, // Start with 1 VP for initial settlement
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

      // Place initial settlement at starting position
      playerState.structures.settlements.push({
        hexes: [startPos],
        structure: "settlement",
        owner: agentId,
      });

      // Register agent in trust graph
      this.trustGraph.addAgent(agentId);
    }

    await super.initializeAgents();

    // Emit hex grid data so the frontend can render the actual map
    this.emitHexGridData();
  }

  protected getAgentView(agentId: AgentId): NexusAgentView {
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
    for (const id of this.state.players) {
      trustScores[id] = this.trustGraph.getGlobalScore(id);
    }

    // Next 5 production numbers
    const nextProduction: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const pos = (this.state.wheelPosition + i) % this.state.productionWheel.length;
      nextProduction.push(this.state.productionWheel[pos]);
    }

    return {
      gameId: this.state.gameId,
      round: this.state.round,
      phase: this.state.phase,
      myId: agentId,
      visibleHexes,
      visibleVertices: this.state.vertices,
      visibleEdges: this.state.edges,
      myResources: { ...playerState.resources },
      myInfluence: playerState.influence,
      myVP: playerState.vp,
      myStructures: playerState.structures,
      allScores,
      allInfluence,
      trustScores,
      productionWheel: this.state.productionWheel,
      wheelPosition: this.state.wheelPosition,
      nextProduction,
      activeCrisis: this.state.activeCrisis,
      messageHistory: this.filterMessagesForAgent(agentId, this.messageLog),
      prizePool: this.state.prizePool.toString(),
    };
  }

  protected getLegalActions(agentId: AgentId): Action[] {
    const ps = this.state.playerStates.get(agentId);
    if (!ps) return [];

    const actions: NexusAction[] = [];
    const r = ps.resources;

    // Build actions (check if player has resources)
    if (r.grain >= 1 && r.timber >= 1) {
      actions.push(this.makeAction("build_road", agentId));
    }
    if (r.grain >= 1 && r.timber >= 1 && r.ore >= 1) {
      actions.push(this.makeAction("build_settlement", agentId));
    }
    if (r.grain >= 2 && r.ore >= 3 && ps.structures.settlements.length > 0) {
      actions.push(this.makeAction("build_city", agentId));
    }
    if (r.ore >= 1 && r.energy >= 2) {
      actions.push(this.makeAction("build_beacon", agentId));
    }
    if (r.timber >= 2 && r.energy >= 1) {
      actions.push(this.makeAction("build_trade_post", agentId));
    }

    // Trade with other players (always available if you have resources)
    const totalResources = r.grain + r.timber + r.ore + r.energy;
    if (totalResources > 0) {
      for (const otherId of this.state.players) {
        if (otherId !== agentId) {
          actions.push(this.makeAction("trade_player", agentId, { partnerId: otherId }));
        }
      }
    }

    // Bank trade (4:1, or 2:1 with trade post)
    const bankRatio = ps.structures.tradePosts.length > 0 ? 2 : 4;
    for (const resType of ["grain", "timber", "ore", "energy"] as ResourceType[]) {
      if (r[resType] >= bankRatio) {
        actions.push(this.makeAction("trade_bank", agentId, {
          bankGiveType: resType,
          bankGiveAmount: bankRatio,
        }));
      }
    }

    // Explore
    actions.push(this.makeAction("explore", agentId));

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

    // Produce resources for matching hexes
    for (const [_, tile] of this.state.hexGrid) {
      if (tile.productionNumber !== currentNumber) continue;
      if (tile.terrain === "wasteland") continue;

      const resource = TERRAIN_RESOURCE[tile.terrain];
      if (!resource && tile.terrain !== "nexus") continue;

      // Find players with structures adjacent to this hex
      for (const [agentId, ps] of this.state.playerStates) {
        // Simplified: each player with settlements near this hex gets resources
        // In full implementation, check vertex adjacency
        const hasAdjacentStructure = this.hasStructureNearHex(agentId, tile.coord);
        if (!hasAdjacentStructure) continue;

        const totalResources =
          ps.resources.grain + ps.resources.timber + ps.resources.ore + ps.resources.energy;
        if (totalResources >= RESOURCE_CAP) continue;

        if (tile.terrain === "nexus") {
          // Nexus: player chooses (simplified: give the most scarce)
          const minResource = this.getScarcestResource(ps.resources);
          ps.resources[minResource]++;
        } else if (resource) {
          ps.resources[resource]++;

          // Cities produce double
          if (this.hasCityNearHex(agentId, tile.coord)) {
            if (totalResources + 1 < RESOURCE_CAP) {
              ps.resources[resource]++;
            }
          }
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

    // Scan for promises in this round's messages
    this.scanMessagesForPromises(messages);

    return messages;
  }

  protected resolveActions(actions: Map<AgentId, Action[]>): RoundResult {
    const outcomes: ActionOutcome[] = [];
    const trustUpdates: TrustUpdate[] = [];
    const scoreChanges: Record<AgentId, number> = {};

    for (const agentId of this.state.players) {
      scoreChanges[agentId] = 0;
    }

    // Track submitted trades to match them
    const tradeSubmissions = new Map<string, NexusAction>();

    // Process each agent's actions
    for (const [agentId, agentActions] of actions) {
      const ps = this.state.playerStates.get(agentId);
      if (!ps) continue;

      // Limit to 2 actions per turn
      const limitedActions = agentActions.slice(0, 2) as NexusAction[];

      for (const action of limitedActions) {
        this.state.moveCount++;
        this.state.prizePool += this.config.moveFeeWei;

        const outcome = this.resolveAction(agentId, action, tradeSubmissions, trustUpdates);
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
    this.resolveMatchedTrades(tradeSubmissions, outcomes, trustUpdates);

    // Check for stale promises (unfulfilled after 3 rounds)
    this.checkStalePromises(trustUpdates);

    // Resolve crisis if active
    if (this.state.activeCrisis && !this.state.activeCrisis.resolved) {
      this.resolveCrisis(outcomes, trustUpdates, scoreChanges);
    }

    // Update scores
    for (const [agentId, delta] of Object.entries(scoreChanges)) {
      const ps = this.state.playerStates.get(agentId);
      if (ps) {
        ps.vp += delta;
        this.state.scores[agentId] = ps.vp;
      }
    }

    // Update bonus holders
    this.updateBonusHolders();

    // Update trust graph
    this.trustGraph.applyUpdates(trustUpdates, this.state.gameId);
    this.trustGraph.tick();

    // Emit trust updates
    if (trustUpdates.length > 0) {
      this.emitEvent("trust.updated", {
        updates: trustUpdates,
        snapshots: this.trustGraph.getAllSnapshots(),
      }, { agents: "all", spectators: true });
    }

    // Emit full state update for frontend rendering
    this.emitStateUpdate(outcomes);

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
    // Hidden round limit
    if (this.state.round >= this.state.actualMaxRounds) {
      return true;
    }

    // Check if any player reached VP threshold (15)
    for (const [_, ps] of this.state.playerStates) {
      if (ps.vp >= 15) return true;
    }

    return false;
  }

  protected computeFinalScores(): Record<AgentId, number> {
    const scores: Record<AgentId, number> = {};

    for (const [agentId, ps] of this.state.playerStates) {
      let totalVP = ps.vp;

      // Trust bonus (0-3 VP based on EigenTrust score)
      const trustScore = this.trustGraph.getGlobalScore(agentId);
      if (trustScore >= 0.8) totalVP += 3;
      else if (trustScore >= 0.6) totalVP += 2;
      else if (trustScore >= 0.3) totalVP += 1;

      scores[agentId] = totalVP;
    }

    return scores;
  }

  // ============================================================
  // Action resolution
  // ============================================================

  private resolveAction(
    agentId: AgentId,
    action: NexusAction,
    tradeSubmissions: Map<string, NexusAction>,
    trustUpdates: TrustUpdate[],
  ): ActionOutcome {
    const ps = this.state.playerStates.get(agentId)!;

    switch (action.type) {
      case "build_settlement": {
        const cost = STRUCTURE_COSTS.settlement;
        if (!this.canAfford(ps.resources, cost)) {
          return this.failOutcome(action, "Insufficient resources for settlement");
        }
        // Find a valid location (enforces distance rule: 2+ hexes from other settlements/cities)
        const settlementHex = this.findBuildableHex(agentId, true);
        if (!settlementHex) {
          return this.failOutcome(action, "No valid location for settlement (distance rule)");
        }
        this.deductResources(ps, cost);
        ps.vp += STRUCTURE_VP.settlement;
        ps.structures.settlements.push({
          hexes: [settlementHex],
          structure: "settlement",
          owner: agentId,
        });
        // Reveal hexes around the new settlement
        this.revealHexesAround(agentId, settlementHex);
        return this.successOutcome(action, "Built a settlement", [
          { type: "vp_change", target: agentId, params: { amount: STRUCTURE_VP.settlement } },
        ]);
      }

      case "build_city": {
        const cost = STRUCTURE_COSTS.city;
        if (!this.canAfford(ps.resources, cost)) {
          return this.failOutcome(action, "Insufficient resources for city");
        }
        if (ps.structures.settlements.length === 0) {
          return this.failOutcome(action, "No settlements to upgrade");
        }
        this.deductResources(ps, cost);
        // City replaces settlement: net +1 VP (city is 2, settlement was 1)
        ps.vp += 1;
        // Remove oldest settlement and add a city in its place
        const upgradedSettlement = ps.structures.settlements.shift()!;
        ps.structures.cities.push({
          hexes: upgradedSettlement.hexes,
          structure: "city",
          owner: agentId,
        });
        return this.successOutcome(action, "Upgraded settlement to city", [
          { type: "vp_change", target: agentId, params: { amount: 1 } },
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
          const neighbors = hexNeighbors(roadHex);
          const neighborHex = neighbors[Math.floor(Math.random() * neighbors.length)];
          ps.structures.roads.push({
            hexes: [roadHex, neighborHex],
            road: true,
            owner: agentId,
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
        ps.vp += STRUCTURE_VP.beacon;
        ps.structures.beacons.push({
          hexes: [beaconHex],
          structure: "beacon",
          owner: agentId,
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
        ps.structures.tradePosts.push({
          hexes: [tpHex],
          structure: "trade_post",
          owner: agentId,
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

        // Try to destroy a road first, then downgrade a settlement
        let description: string;
        if (targetPs.structures.roads.length > 0) {
          // Destroy the most recently built road
          targetPs.structures.roads.pop();
          targetPs.longestRoad = Math.max(0, targetPs.longestRoad - 1);
          description = `Sabotaged ${targetId}'s road (destroyed)`;
        } else if (targetPs.structures.settlements.length > 0) {
          // No roads to destroy — damage a settlement (remove it, -1 VP)
          targetPs.structures.settlements.pop();
          targetPs.vp = Math.max(0, targetPs.vp - 1);
          description = `Sabotaged ${targetId}'s settlement (destroyed, -1 VP)`;
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
    submissions: Map<string, NexusAction>,
    outcomes: ActionOutcome[],
    trustUpdates: TrustUpdate[],
  ): void {
    // Group by trade pair
    const pairs = new Map<string, NexusAction[]>();
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
        const give2 = a2.params.give as Partial<ResourceInventory> || {};

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

        // Track promise fulfillment: if a trade was promised in negotiation, mark fulfilled
        this.fulfillTradePromises(a1.agentId, a2.agentId, trustUpdates);

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

        // Check if a trade was promised but not reciprocated — broken promise
        this.breakTradePromises(a.agentId, partnerId, trustUpdates);

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
    const crisisTypes: CrisisType[] = ["blight", "storm", "famine", "nexus_surge", "the_rift"];
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
  ): void {
    const crisis = this.state.activeCrisis!;
    const threshold = crisis.threshold;

    // Sum all contributions
    const totalContrib: ResourceInventory = { ...EMPTY_INVENTORY };
    for (const contrib of Object.values(crisis.contributions)) {
      totalContrib.grain += contrib.grain;
      totalContrib.timber += contrib.timber;
      totalContrib.ore += contrib.ore;
      totalContrib.energy += contrib.energy;
    }

    // Check if threshold met
    const resolved =
      totalContrib.grain >= threshold.grain &&
      totalContrib.timber >= threshold.timber &&
      totalContrib.ore >= threshold.ore &&
      totalContrib.energy >= threshold.energy;

    crisis.resolved = resolved;

    if (resolved) {
      // Reward contributors
      for (const [agentId, _] of Object.entries(crisis.contributions)) {
        const ps = this.state.playerStates.get(agentId);
        if (ps) {
          ps.vp += crisis.rewardVP;
          ps.influence += crisis.rewardInfluence;
          scoreChanges[agentId] = (scoreChanges[agentId] || 0) + crisis.rewardVP;

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
        for (const agentId of this.state.players) {
          if (!contributors.has(agentId)) {
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

        // Check crisis promises — anyone who promised to contribute but didn't
        for (const promise of this.promises) {
          if (promise.type === "crisis" && promise.fulfilled === null) {
            if (!contributors.has(promise.from)) {
              promise.fulfilled = false;
              promise.detectedInRound = this.state.round;
              // General trust penalty for broken crisis promise
              for (const otherId of this.state.players) {
                if (otherId === promise.from) continue;
                trustUpdates.push({
                  from: otherId,
                  to: promise.from,
                  delta: -0.15,
                  reason: "broke_crisis_promise",
                });
              }
            } else {
              promise.fulfilled = true;
              promise.detectedInRound = this.state.round;
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
  private emitStateUpdate(outcomes: ActionOutcome[]): void {
    const agentStates: Record<string, {
      resources: ResourceInventory;
      vp: number;
      influence: number;
      longestRoad: number;
      structures: {
        settlements: number;
        cities: number;
        beacons: number;
        tradePosts: number;
        roads: number;
      };
      structureLocations: Array<{
        type: string;
        hexes: Array<{ q: number; r: number }>;
      }>;
    }> = {};

    for (const [agentId, ps] of this.state.playerStates) {
      const structureLocations: Array<{ type: string; hexes: Array<{ q: number; r: number }> }> = [];
      for (const s of ps.structures.settlements) {
        structureLocations.push({ type: "settlement", hexes: s.hexes });
      }
      for (const c of ps.structures.cities) {
        structureLocations.push({ type: "city", hexes: c.hexes });
      }
      for (const b of ps.structures.beacons) {
        structureLocations.push({ type: "beacon", hexes: b.hexes });
      }
      for (const tp of ps.structures.tradePosts) {
        structureLocations.push({ type: "trade_post", hexes: tp.hexes });
      }
      for (const r of ps.structures.roads) {
        structureLocations.push({ type: "road", hexes: r.hexes });
      }

      agentStates[agentId] = {
        resources: { ...ps.resources },
        vp: ps.vp,
        influence: ps.influence,
        longestRoad: ps.longestRoad,
        structures: {
          settlements: ps.structures.settlements.length,
          cities: ps.structures.cities.length,
          beacons: ps.structures.beacons.length,
          tradePosts: ps.structures.tradePosts.length,
          roads: ps.structures.roads.length,
        },
        structureLocations,
      };
    }

    this.emitEvent("game.state_update", {
      round: this.state.round,
      phase: this.state.phase,
      agentStates,
      activeCrisis: this.state.activeCrisis,
      wheelPosition: this.state.wheelPosition,
      moveCount: this.state.moveCount,
      prizePool: this.state.prizePool.toString(),
      bonusHolders: {
        longestRoad: this.state.longestRoadHolder,
        mostInfluence: this.state.mostInfluenceHolder,
      },
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
    }> = [];

    for (const [_, tile] of this.state.hexGrid) {
      hexes.push({
        q: tile.coord.q,
        r: tile.coord.r,
        terrain: tile.terrain,
        productionNumber: tile.productionNumber,
        revealed: tile.revealed,
      });
    }

    // Collect agent starting positions
    const agentPositions: Record<string, { q: number; r: number }> = {};
    for (const [agentId, ps] of this.state.playerStates) {
      if (ps.structures.settlements.length > 0) {
        const startHex = ps.structures.settlements[0].hexes[0];
        agentPositions[agentId] = { q: startHex.q, r: startHex.r };
      }
    }

    this.emitEvent("game.map_data", {
      hexes,
      agentPositions,
      productionWheel: this.state.productionWheel,
    }, { agents: "all", spectators: true });
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

  private makeAction(type: NexusAction["type"], agentId: AgentId, params: Record<string, unknown> = {}): NexusAction {
    return {
      type,
      agentId,
      params,
      round: this.state.round,
      timestamp: Date.now(),
    };
  }

  private canAfford(resources: ResourceInventory, cost: ResourceInventory): boolean {
    return (
      resources.grain >= cost.grain &&
      resources.timber >= cost.timber &&
      resources.ore >= cost.ore &&
      resources.energy >= cost.energy
    );
  }

  private deductResources(ps: NexusPlayerState, cost: ResourceInventory): void {
    ps.resources.grain -= cost.grain;
    ps.resources.timber -= cost.timber;
    ps.resources.ore -= cost.ore;
    ps.resources.energy -= cost.energy;
  }

  private hasStructureNearHex(agentId: AgentId, coord: import("./types.js").HexCoord): boolean {
    const ps = this.state.playerStates.get(agentId);
    if (!ps) return false;

    // Check if any structure (settlement, city, beacon, trade post) is on or adjacent to this hex
    const allStructureHexes = [
      ...ps.structures.settlements,
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
   * Collect ALL settlement/city hexes across ALL players (for distance rule enforcement).
   */
  private getAllSettlementCityHexes(): import("./types.js").HexCoord[] {
    const hexes: import("./types.js").HexCoord[] = [];
    for (const [_, ps] of this.state.playerStates) {
      for (const s of ps.structures.settlements) {
        hexes.push(...s.hexes);
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
    const allSettlementCities = this.getAllSettlementCityHexes();
    for (const existing of allSettlementCities) {
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
      ...ps.structures.settlements,
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
      for (const s of [...otherPs.structures.settlements, ...otherPs.structures.cities,
                        ...otherPs.structures.beacons, ...otherPs.structures.tradePosts]) {
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
      ...ps.structures.settlements,
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
        // "All Plains hexes skip next production cycle" — mark them as temporarily wasteland
        // Simplified: all players lose 1 grain
        for (const [agentId, ps] of this.state.playerStates) {
          const lost = Math.min(ps.resources.grain, 2);
          ps.resources.grain -= lost;
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
        // "Resource cap reduced to 5 for 3 rounds"
        // Simplified: all players lose excess resources down to cap of 5
        for (const [agentId, ps] of this.state.playerStates) {
          const total = ps.resources.grain + ps.resources.timber + ps.resources.ore + ps.resources.energy;
          if (total > 5) {
            // Remove resources proportionally, starting from most abundant
            let toRemove = total - 5;
            const types: ResourceType[] = ["grain", "timber", "ore", "energy"];
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
      case "nexus_surge": {
        // "Nexus hex becomes Wasteland for 5 rounds"
        // Mark the center hex as wasteland temporarily
        const nexusHex = this.state.hexGrid.get(hexKey({ q: 0, r: 0 }));
        if (nexusHex) {
          nexusHex.terrain = "wasteland";
          nexusHex.productionNumber = 0;
          // It will need to be restored later — for now this is permanent per-crisis
        }
        break;
      }
      case "the_rift": {
        // "Random hex becomes permanent Wasteland"
        const nonWasteland = Array.from(this.state.hexGrid.values()).filter(
          t => t.terrain !== "wasteland" && t.terrain !== "nexus"
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
  // Promise tracking
  // ============================================================

  /**
   * Record a trade promise between two agents.
   * Called when an agent sends a message containing trade-related language
   * to another specific agent during negotiation.
   */
  recordTradePromise(from: AgentId, to: AgentId, description: string): void {
    this.promises.push({
      id: `promise-${this.promises.length + 1}`,
      from,
      to,
      type: "trade",
      description,
      round: this.state.round,
      fulfilled: null,
      detectedInRound: null,
    });
  }

  /**
   * Record an alliance promise.
   */
  recordAlliancePromise(from: AgentId, to: AgentId, description: string): void {
    this.promises.push({
      id: `promise-${this.promises.length + 1}`,
      from,
      to,
      type: "alliance",
      description,
      round: this.state.round,
      fulfilled: null,
      detectedInRound: null,
    });
  }

  /**
   * Record a crisis contribution promise.
   */
  recordCrisisPromise(from: AgentId, description: string): void {
    this.promises.push({
      id: `promise-${this.promises.length + 1}`,
      from,
      to: "all", // Crisis promises are to everyone
      type: "crisis",
      description,
      round: this.state.round,
      fulfilled: null,
      detectedInRound: null,
    });
  }

  /**
   * Mark trade promises as fulfilled between two agents.
   */
  private fulfillTradePromises(agent1: AgentId, agent2: AgentId, trustUpdates: TrustUpdate[]): void {
    for (const promise of this.promises) {
      if (promise.fulfilled !== null) continue; // Already resolved
      if (promise.type !== "trade") continue;
      // Check if this trade fulfills a promise between these two agents
      if (
        (promise.from === agent1 && promise.to === agent2) ||
        (promise.from === agent2 && promise.to === agent1)
      ) {
        promise.fulfilled = true;
        promise.detectedInRound = this.state.round;
        // Bonus trust for keeping promises (on top of trade trust)
        trustUpdates.push({
          from: promise.to,
          to: promise.from,
          delta: 0.1,
          reason: "kept_promise",
        });
      }
    }
  }

  /**
   * Mark trade promises as broken when a promised trade doesn't happen.
   */
  private breakTradePromises(offerer: AgentId, nonReciprocator: AgentId, trustUpdates: TrustUpdate[]): void {
    for (const promise of this.promises) {
      if (promise.fulfilled !== null) continue;
      if (promise.type !== "trade") continue;
      // If the non-reciprocator promised to trade with the offerer
      if (promise.from === nonReciprocator && promise.to === offerer) {
        promise.fulfilled = false;
        promise.detectedInRound = this.state.round;
        trustUpdates.push({
          from: offerer,
          to: nonReciprocator,
          delta: -0.3,
          reason: "broke_promise",
        });
      }
    }
  }

  /**
   * Check for stale promises (unfulfilled after 3 rounds) and penalize.
   * Called at end of each round during resolution.
   */
  private checkStalePromises(trustUpdates: TrustUpdate[]): void {
    for (const promise of this.promises) {
      if (promise.fulfilled !== null) continue;
      if (this.state.round - promise.round >= 3) {
        // Promise expired unfulfilled
        promise.fulfilled = false;
        promise.detectedInRound = this.state.round;
        if (promise.to !== "all") {
          trustUpdates.push({
            from: promise.to,
            to: promise.from,
            delta: -0.2,
            reason: "stale_promise",
          });
        }
      }
    }
  }

  /**
   * Scan negotiation messages for trade/alliance/crisis keywords and
   * automatically create promise records. This is a heuristic — LLM agents
   * will use natural language, so we look for intent signals.
   */
  scanMessagesForPromises(messages: Message[]): void {
    const tradeKeywords = ["trade", "deal", "offer", "give you", "send you", "exchange", "swap"];
    const allianceKeywords = ["alliance", "ally", "team up", "partner", "pact", "work together"];
    const crisisKeywords = ["contribute", "help with crisis", "pitch in", "donate"];

    for (const msg of messages) {
      if (msg.type !== "private" || msg.recipient === "broadcast") continue;
      const lower = msg.content.toLowerCase();

      // Check for trade promises
      if (tradeKeywords.some(kw => lower.includes(kw))) {
        // Don't duplicate if we already have a pending promise between these two this round
        const existing = this.promises.find(p =>
          p.from === msg.sender && p.to === msg.recipient &&
          p.type === "trade" && p.fulfilled === null &&
          p.round === this.state.round
        );
        if (!existing) {
          this.recordTradePromise(msg.sender, msg.recipient as AgentId, msg.content.slice(0, 100));
        }
      }

      // Check for alliance promises
      if (allianceKeywords.some(kw => lower.includes(kw))) {
        const existing = this.promises.find(p =>
          p.from === msg.sender && p.to === msg.recipient &&
          p.type === "alliance" && p.fulfilled === null
        );
        if (!existing) {
          this.recordAlliancePromise(msg.sender, msg.recipient as AgentId, msg.content.slice(0, 100));
        }
      }
    }

    // Check for crisis promises in public messages
    for (const msg of messages) {
      if (msg.type !== "public") continue;
      const lower = msg.content.toLowerCase();
      if (crisisKeywords.some(kw => lower.includes(kw)) && this.state.activeCrisis) {
        const existing = this.promises.find(p =>
          p.from === msg.sender && p.type === "crisis" && p.fulfilled === null
        );
        if (!existing) {
          this.recordCrisisPromise(msg.sender, msg.content.slice(0, 100));
        }
      }
    }
  }

  private getScarcestResource(resources: ResourceInventory): ResourceType {
    const types: ResourceType[] = ["grain", "timber", "ore", "energy"];
    return types.reduce((min, r) =>
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
