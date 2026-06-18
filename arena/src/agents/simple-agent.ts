/**
 * Simple AI Agent - Baseline Implementation
 *
 * Demonstrates the agent interface and provides basic strategies.
 * In production, agents would be LLM-powered with skills.md files.
 * These simple agents are useful for testing and simulation.
 */

import { v4 as uuid } from "uuid";
import {
  GameAgent,
  GameConfig,
  AgentId,
  AgentIdentity,
  Message,
  Action,
  RoundResult,
  MessageType,
} from "../core/types.js";
import {
  TragedyAgentView,
  TragedyAction,
  ResourceType,
  RESOURCE_NAMES,
} from "../games/nexus/types.js";
import { createAgentIdentity } from "../core/agent-uri.js";

export type AgentStrategy =
  | "cooperator"   // Always cooperates, trades freely, contributes to crises
  | "defector"     // Takes advantage, breaks promises, sabotages
  | "tit_for_tat"  // Cooperates first, then mirrors opponent's last behavior
  | "builder"      // Focuses on building structures, minimal trading
  | "diplomat"     // Maximizes trust and influence through alliances
  | "opportunist"; // Cooperates when trust is high, defects when it's profitable

interface TradeOffer {
  give: Partial<Record<ResourceType, number>>;
  receive: Partial<Record<ResourceType, number>>;
}

interface AgentMemory {
  lastBehavior: Record<AgentId, "cooperated" | "defected" | "unknown">;
  allies: Set<AgentId>;
  enemies: Set<AgentId>;
  /** Trades I am OFFERING to others */
  myOffers: Map<AgentId, TradeOffer>;
  /** Trades others have OFFERED to me (parsed from messages) */
  incomingOffers: Map<AgentId, TradeOffer>;
  roundCount: number;
  /** Last round we reciprocated a trade */
  lastReciprocatedRound: Record<AgentId, number>;
  /** Ecosystem extraction history for sustainable use */
  extractionHistory: Map<string, { level: string; round: number }>;
  /** Partner for alliance VP tracking */
  alliancePartner: AgentId | null;
  /** Sustained cooperation rounds for alliance VP */
  allianceCooperationRounds: number;
}

export class SimpleAgent implements GameAgent {
  id: AgentId;
  identity: AgentIdentity;
  strategy: AgentStrategy;
  private memory: AgentMemory;
  private config: GameConfig | null = null;

  constructor(id: AgentId, strategy: AgentStrategy, name?: string) {
    this.id = id;
    this.strategy = strategy;
    this.identity = createAgentIdentity({
      id,
      name: name || `Agent_${id.slice(0, 6)}_${strategy}`,
      harness: {
        kind: "simple",
        capabilities: ["negotiation", "actions", "reflection"],
        operator: "local",
      },
    });
    this.memory = {
      lastBehavior: {},
      allies: new Set(),
      enemies: new Set(),
      myOffers: new Map(),
      incomingOffers: new Map(),
      roundCount: 0,
      lastReciprocatedRound: {},
      extractionHistory: new Map(),
      alliancePartner: null,
      allianceCooperationRounds: 0,
    };
  }

  async initialize(config: GameConfig, state: unknown, identity: AgentIdentity): Promise<void> {
    this.config = config;
    this.identity = identity;
  }

  async negotiate(
    state: unknown,
    incomingMessages: Message[],
    round: number,
  ): Promise<Message[]> {
    const view = state as TragedyAgentView;
    const messages: Message[] = [];
    this.memory.roundCount = round;

    // Clear pending trades each round
    this.memory.myOffers.clear();
    this.memory.incomingOffers.clear();

    // Parse incoming messages to detect trade offers
    this.processIncomingMessages(incomingMessages, view);

    switch (this.strategy) {
      case "cooperator":
        messages.push(...this.negotiateCooperator(view));
        break;
      case "defector":
        messages.push(...this.negotiateDefector(view));
        break;
      case "tit_for_tat":
        messages.push(...this.negotiateTitForTat(view));
        break;
      case "diplomat":
        messages.push(...this.negotiateDiplomat(view));
        break;
      case "builder":
        messages.push(...this.negotiateBuilder(view));
        break;
      case "opportunist":
        messages.push(...this.negotiateOpportunist(view));
        break;
    }

    return messages;
  }

  async act(
    state: unknown,
    round: number,
    legalActions: Action[],
  ): Promise<Action[]> {
    const view = state as TragedyAgentView;
    const actions: TragedyAction[] = [];

    // 1. Crisis contribution (except defectors)
    if (view.activeCrisis && !view.activeCrisis.resolved && this.strategy !== "defector") {
      const contribution = this.decideCrisisContribution(view);
      if (contribution) {
        actions.push({
          type: "crisis_contribute",
          agentId: this.id,
          params: { contribution },
          round,
          timestamp: Date.now(),
        });
      }
    }

    // 2. Execute a trade if we have a matched offer
    if (actions.length < 2) {
      const tradeAction = this.decideTradeAction(view, round);
      if (tradeAction) actions.push(tradeAction);
    }

    // 3. Opportunists trailing the leader will try to destabilize the table before settling into build mode.
    if (actions.length < 2) {
      const pressureAction = this.decidePressureAction(view, round);
      if (pressureAction) actions.push(pressureAction);
    }

    // 4. Build something if possible
    if (actions.length < 2) {
      const buildAction = this.decideBuildAction(view, round);
      if (buildAction) actions.push(buildAction);
    }

    // 5. Explore or secondary action
    if (actions.length < 2) {
      const secondAction = this.decideSecondaryAction(view, legalActions, round);
      if (secondAction) actions.push(secondAction);
    }

    if (actions.length === 0) {
      actions.push({
        type: "pass",
        agentId: this.id,
        params: {},
        round,
        timestamp: Date.now(),
      });
    }

    return actions;
  }

  async reflect(results: RoundResult): Promise<void> {
    for (const outcome of results.outcomes) {
      if (outcome.action.agentId !== this.id) continue;
      if (outcome.action.type === "trade_player" && !outcome.success) {
        const partnerId = (outcome.action as TragedyAction).params.partnerId as AgentId;
        if (partnerId) {
          this.memory.lastBehavior[partnerId] = "defected";
          this.memory.enemies.add(partnerId);
          this.memory.allies.delete(partnerId);
          this.memory.alliancePartner = null;
          this.memory.allianceCooperationRounds = 0;
        }
      }
      // Track successful trades for alliance building
      if (outcome.action.type === "trade_player" && outcome.success) {
        const partnerId = (outcome.action as TragedyAction).params.partnerId as AgentId;
        if (partnerId) {
          this.memory.lastBehavior[partnerId] = "cooperated";
          // Increment alliance cooperation rounds if same partner
          if (this.memory.alliancePartner === partnerId) {
            this.memory.allianceCooperationRounds++;
          } else {
            this.memory.alliancePartner = partnerId;
            this.memory.allianceCooperationRounds = 1;
          }
        }
      }
    }

    for (const update of results.trustUpdates) {
      if (update.to === this.id && update.delta > 0) {
        this.memory.lastBehavior[update.from] = "cooperated";
        this.memory.allies.add(update.from);
        this.memory.enemies.delete(update.from);
      }
      if (update.to === this.id && update.delta < 0) {
        this.memory.lastBehavior[update.from] = "defected";
        this.memory.enemies.add(update.from);
        this.memory.allies.delete(update.from);
      }
    }
  }

  // ============================================================
  // Incoming message parsing -- detects trade offers from others
  // ============================================================

  private processIncomingMessages(messages: Message[], view: TragedyAgentView): void {
    for (const msg of messages) {
      if (msg.sender === this.id) continue;

      const lower = msg.content.toLowerCase();

      // Parse trade offers: "I'll trade 1 X for 1 Y"
      const tradeMatch = lower.match(/trade\s+(\d+)\s+(\w+)\s+for\s+(\d+)\s+(\w+)/);
      if (tradeMatch) {
        const giveAmt = parseInt(tradeMatch[1]);
        const giveRes = this.parseResource(tradeMatch[2]);
        const receiveAmt = parseInt(tradeMatch[3]);
        const receiveRes = this.parseResource(tradeMatch[4]);

        if (giveRes && receiveRes && giveAmt > 0 && receiveAmt > 0) {
          // The sender wants to give giveRes and receive receiveRes
          // So from MY perspective, I receive giveRes and give receiveRes
          this.memory.incomingOffers.set(msg.sender, {
            give: { [receiveRes]: receiveAmt },   // I give what they want
            receive: { [giveRes]: giveAmt },       // I receive what they offer
          });
        }
      }

      // Track general cooperation signals
      if (lower.includes("alliance") || lower.includes("cooperat") || lower.includes("reliable")) {
        if (!this.memory.lastBehavior[msg.sender]) {
          this.memory.lastBehavior[msg.sender] = "unknown";
        }
      }
    }
  }

  private parseResource(s: string): ResourceType | null {
    const clean = s.toLowerCase().replace(/[^a-z]/g, "");
    if (clean.startsWith("grain")) return "grain";
    if (clean.startsWith("timber")) return "timber";
    if (clean.startsWith("ore")) return "ore";
    if (clean.startsWith("fish")) return "fish";
    if (clean.startsWith("water")) return "water";
    if (clean.startsWith("energy")) return "energy";
    return null;
  }

  // ============================================================
  // Strategy-specific negotiation
  // ============================================================

  private negotiateCooperator(view: TragedyAgentView): Message[] {
    const msgs: Message[] = [];
    const surplus = this.getSurplusResource(view);
    const need = this.getNeededResource(view);

    msgs.push(this.makeMessage(
      view.gameId, "broadcast",
      surplus && need
        ? `I'll trade ${surplus} for ${need} with anyone. Fair deals only!`
        : `Looking to cooperate. Let's build together!`,
      "public",
    ));

    // Offer trades to everyone
    for (const otherId of Object.keys(view.allScores)) {
      if (otherId === this.id) continue;
      if (surplus && need) {
        msgs.push(this.makeMessage(
          view.gameId, otherId,
          `I'll trade 1 ${surplus} for 1 ${need}. Fair deal?`,
          "private",
        ));
        this.memory.myOffers.set(otherId, {
          give: { [surplus]: 1 },
          receive: { [need]: 1 },
        });
      }
    }

    // Also accept any incoming offers if they seem reasonable
    for (const [senderId, offer] of this.memory.incomingOffers) {
      if (!this.memory.myOffers.has(senderId)) {
        // Accept the incoming offer by creating a matching entry
        this.memory.myOffers.set(senderId, offer);
      }
    }

    return msgs;
  }

  private negotiateDefector(view: TragedyAgentView): Message[] {
    const msgs: Message[] = [];

    msgs.push(this.makeMessage(
      view.gameId, "broadcast",
      `I'm a team player. Who wants to trade? I'll give great deals.`,
      "public",
    ));

    // Promise trades to build trust, but won't follow through in act()
    const leader = this.getLeadingAgent(view);
    if (leader && leader !== this.id) {
      msgs.push(this.makeMessage(
        view.gameId, leader,
        `Let's form an alliance. I'll trade 1 ore for 1 grain -- you need it, right?`,
        "private",
      ));
    }

    // Promise crisis help too
    if (view.activeCrisis) {
      msgs.push(this.makeMessage(
        view.gameId, "broadcast",
        `I'll contribute to the crisis. Count on me.`,
        "public",
      ));
    }

    return msgs;
  }

  private negotiateTitForTat(view: TragedyAgentView): Message[] {
    const msgs: Message[] = [];
    const surplus = this.getSurplusResource(view);
    const need = this.getNeededResource(view);

    for (const otherId of Object.keys(view.allScores)) {
      if (otherId === this.id) continue;
      const lastBehavior = this.memory.lastBehavior[otherId] || "unknown";

      if (lastBehavior === "cooperated" || lastBehavior === "unknown") {
        if (surplus && need) {
          msgs.push(this.makeMessage(
            view.gameId, otherId,
            `You've been reliable. I'll trade 1 ${surplus} for 1 ${need}?`,
            "private",
          ));
          this.memory.myOffers.set(otherId, {
            give: { [surplus]: 1 },
            receive: { [need]: 1 },
          });
        }

        // Accept incoming offers from cooperators
        const incoming = this.memory.incomingOffers.get(otherId);
        if (incoming && !this.memory.myOffers.has(otherId)) {
          this.memory.myOffers.set(otherId, incoming);
        }
      } else {
        msgs.push(this.makeMessage(
          view.gameId, otherId,
          `You broke trust last round. No trades until you prove yourself.`,
          "private",
        ));
      }
    }

    return msgs;
  }

  private negotiateDiplomat(view: TragedyAgentView): Message[] {
    const msgs: Message[] = [];
    const surplus = this.getSurplusResource(view);
    const need = this.getNeededResource(view);

    msgs.push(this.makeMessage(
      view.gameId, "broadcast",
      `I propose a crisis response coalition. Contributors get priority trades from me.`,
      "public",
    ));

    // Form alliances with trusted agents and offer trades
    const trustworthy = Object.entries(view.trustScores)
      .filter(([id]) => id !== this.id)
      .sort((a, b) => b[1] - a[1]);

    for (const [otherId] of trustworthy.slice(0, 3)) {
      this.memory.allies.add(otherId);
      if (surplus && need) {
        msgs.push(this.makeMessage(
          view.gameId, otherId,
          `Alliance offer: I'll trade 1 ${surplus} for 1 ${need}. Long-term partnership?`,
          "private",
        ));
        this.memory.myOffers.set(otherId, {
          give: { [surplus]: 1 },
          receive: { [need]: 1 },
        });
      }
    }

    // Accept all incoming offers (diplomat is generous)
    for (const [senderId, offer] of this.memory.incomingOffers) {
      if (!this.memory.myOffers.has(senderId)) {
        this.memory.myOffers.set(senderId, offer);
      }
    }

    return msgs;
  }

  private negotiateBuilder(view: TragedyAgentView): Message[] {
    const msgs: Message[] = [];
    const need = this.getNeededResource(view);
    const surplus = this.getSurplusResource(view);

    if (need && surplus) {
      msgs.push(this.makeMessage(
        view.gameId, "broadcast",
        `Need ${need} badly! I'll trade 1 ${surplus} for 1 ${need}.`,
        "public",
      ));
      // Offer to everyone
      for (const otherId of Object.keys(view.allScores)) {
        if (otherId !== this.id) {
          this.memory.myOffers.set(otherId, {
            give: { [surplus]: 1 },
            receive: { [need]: 1 },
          });
        }
      }
    }

    // Accept incoming offers
    for (const [senderId, offer] of this.memory.incomingOffers) {
      if (!this.memory.myOffers.has(senderId)) {
        this.memory.myOffers.set(senderId, offer);
      }
    }

    return msgs;
  }

  private negotiateOpportunist(view: TragedyAgentView): Message[] {
    const msgs: Message[] = [];
    const myScore = view.myVP;
    const maxOtherScore = Math.max(
      ...Object.entries(view.allScores)
        .filter(([id]) => id !== this.id)
        .map(([_, s]) => s),
      0,
    );

    if (myScore >= maxOtherScore - 2) {
      msgs.push(this.makeMessage(
        view.gameId, "broadcast",
        `Great game! Let's keep trading and growing together.`,
        "public",
      ));
      // Accept all incoming offers when ahead
      for (const [senderId, offer] of this.memory.incomingOffers) {
        this.memory.myOffers.set(senderId, offer);
      }
    } else {
      msgs.push(this.makeMessage(
        view.gameId, "broadcast",
        `Who wants to team up against the leader? I have resources to share.`,
        "public",
      ));
      // Only accept offers from non-leaders
      const leader = this.getLeadingAgent(view);
      for (const [senderId, offer] of this.memory.incomingOffers) {
        if (senderId !== leader) {
          this.memory.myOffers.set(senderId, offer);
        }
      }
    }

    return msgs;
  }

  // ============================================================
  // Action decisions
  // ============================================================

  private decideTradeAction(view: TragedyAgentView, round: number): TragedyAction | null {
    // Defectors never follow through on trades
    if (this.strategy === "defector") return null;

    // Find the best trade to execute
    for (const [partnerId, trade] of this.memory.myOffers) {
      // Check we can afford to give
      let canAfford = true;
      for (const [res, amt] of Object.entries(trade.give)) {
        if ((view.myResources[res as ResourceType] || 0) < (amt as number)) {
          canAfford = false;
          break;
        }
      }
      if (!canAfford) continue;

      return {
        type: "trade_player",
        agentId: this.id,
        params: {
          partnerId,
          give: trade.give,
          receive: trade.receive,
        },
        round,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  private decideBuildAction(view: TragedyAgentView, round: number): TragedyAction | null {
    const r = view.myResources;
    const totalStructures = view.myStructures.villages.length + 
                          view.myStructures.townships.length + 
                          view.myStructures.cities.length;

    // Build army if we can afford it (for defense/conquest)
    if (r.ore >= 1 && r.energy >= 1 && view.myStructures.villages.length >= 1) {
      return { type: "build_army", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Upgrade to city if we have townships and can afford it
    if (r.grain >= 2 && r.ore >= 2 && r.water >= 1 && view.myStructures.townships.length >= 1) {
      return { type: "upgrade_city", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Upgrade to township if we have villages and can afford it
    if (r.grain >= 2 && r.timber >= 1 && r.ore >= 1 && r.water >= 1 && view.myStructures.villages.length >= 1) {
      return { type: "upgrade_township", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Build village if we need more structures for income
    if (r.grain >= 1 && r.timber >= 1 && r.ore >= 1 && r.water >= 1 && totalStructures < 5) {
      return { type: "build_village", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Build beacon (if diplomat or cooperator and have resources)
    if ((this.strategy === "diplomat" || this.strategy === "cooperator") && 
        r.ore >= 1 && r.energy >= 1 && r.water >= 1 && view.myStructures.beacons.length < 2) {
      return { type: "build_beacon", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Build trade post (if builder and need trade infrastructure)
    if (this.strategy === "builder" && 
        r.timber >= 1 && r.fish >= 1 && r.water >= 1 && view.myStructures.tradePosts.length < 2) {
      return { type: "build_trade_post", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Build road to expand territory
    if (r.grain >= 1 && r.timber >= 1) {
      return { type: "build_road", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    return null;
  }

  private decidePressureAction(view: TragedyAgentView, round: number): TragedyAction | null {
    if (this.strategy !== "opportunist" || round <= 4) return null;

    const leader = this.getLeadingAgent(view);
    if (!leader) return null;

    const leaderScore = view.allScores[leader] || 0;
    const myDeficit = leaderScore - view.myVP;
    if (myDeficit < 2) return null;

    if (view.myResources.energy < 1 || view.myResources.ore < 1) return null;

    return {
      type: "sabotage",
      agentId: this.id,
      params: { targetAgent: leader },
      round,
      timestamp: Date.now(),
    };
  }

  private decideSecondaryAction(view: TragedyAgentView, legalActions: Action[], round: number): TragedyAction | null {
    const accessibleEcosystem = this.getAccessibleEcosystem(view);

    // Early game: explore more
    if (round <= 3) {
      return { type: "explore", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Defectors prefer direct sabotage pressure when they can afford it.
    if (this.strategy === "defector" && view.myResources.energy >= 1 && view.myResources.ore >= 1) {
      const leader = this.getLeadingAgent(view);
      return {
        type: "sabotage",
        agentId: this.id,
        params: leader ? { targetAgent: leader } : {},
        round,
        timestamp: Date.now(),
      };
    }

    // Intentional extraction/restoration based on ecosystem health
    if (accessibleEcosystem) {
      const ecosystemId = accessibleEcosystem.id;
      const lastExtraction = this.memory.extractionHistory.get(ecosystemId);
      const extractionCooldown = 3; // Only extract same ecosystem every 3 rounds
      
      const builderEmergencyThreshold = accessibleEcosystem.collapseThreshold + 15;
      const shouldRestore =
        this.strategy === "cooperator" ||
        this.strategy === "diplomat" ||
        (this.strategy === "tit_for_tat" && this.memory.enemies.size === 0)
          ? accessibleEcosystem.health <= accessibleEcosystem.flourishThreshold
          : this.strategy === "builder"
            ? accessibleEcosystem.health <= builderEmergencyThreshold
            : false;

      // Restore if ecosystem is unhealthy enough for the current strategy.
      if (shouldRestore && this.canRestore(view)) {
        this.memory.extractionHistory.delete(ecosystemId); // Reset extraction history
        return {
          type: "restore_ecosystem",
          agentId: this.id,
          params: { ecosystemId },
          round,
          timestamp: Date.now(),
        };
      }

      // Extract only if we haven't extracted recently or ecosystem is healthy
      const canExtract = !lastExtraction || (round - lastExtraction.round >= extractionCooldown);
      const isHealthy = accessibleEcosystem.status === "flourishing" || 
                        accessibleEcosystem.health > accessibleEcosystem.flourishThreshold;
      
      if (this.strategy === "builder" && round <= 6) {
        return { type: "explore", agentId: this.id, params: {}, round, timestamp: Date.now() };
      }

      if (canExtract || isHealthy) {
        // Determine extraction level based on strategy and ecosystem health
        let extractionLevel: "low" | "medium" | "high" = "low";
        if (isHealthy && this.strategy !== "cooperator" && this.strategy !== "diplomat") {
          if (this.strategy === "defector") {
            extractionLevel = "high";
          } else if (this.strategy === "opportunist") {
            extractionLevel = "high";
          } else if (this.strategy === "builder") {
            extractionLevel = "low";
          } else {
            extractionLevel = "medium";
          }
        }
        
        this.memory.extractionHistory.set(ecosystemId, { level: extractionLevel, round });
        return {
          type: "extract_commons",
          agentId: this.id,
          params: { ecosystemId, extractionLevel },
          round,
          timestamp: Date.now(),
        };
      }
    }

    // Try a bank trade if we have excess of one resource
    const surplus = this.getSurplusResource(view);
    const need = this.getNeededResource(view);
    if (surplus && need && view.myResources[surplus] >= 4) {
      return {
        type: "trade_bank", agentId: this.id,
        params: { bankGiveType: surplus, bankReceiveType: need, bankGiveAmount: 4 },
        round, timestamp: Date.now(),
      };
    }

    // Reciprocate trades if someone offered to us recently
    for (const [senderId, offer] of this.memory.incomingOffers) {
      const lastReciprocated = this.memory.lastReciprocatedRound[senderId] || 0;
      if (round - lastReciprocated >= 2) { // Reciprocate within 2 rounds
        // Check if we can afford to reciprocate
        let canAfford = true;
        for (const [res, amt] of Object.entries(offer.give)) {
          if ((view.myResources[res as ResourceType] || 0) < (amt as number)) {
            canAfford = false;
            break;
          }
        }
        if (canAfford) {
          this.memory.lastReciprocatedRound[senderId] = round;
          return {
            type: "trade_player",
            agentId: this.id,
            params: { partnerId: senderId, give: offer.give, receive: offer.receive },
            round,
            timestamp: Date.now(),
          };
        }
      }
    }

    // Explore more
    return { type: "explore", agentId: this.id, params: {}, round, timestamp: Date.now() };
  }

  private decideCrisisContribution(view: TragedyAgentView): Partial<Record<ResourceType, number>> | null {
    if (!view.activeCrisis) return null;
    const threshold = view.activeCrisis.threshold;
    if (this.strategy === "opportunist") {
      const leader = this.getLeadingAgent(view);
      const leaderScore = leader ? view.allScores[leader] || 0 : 0;
      if (leaderScore - view.myVP > 1) return null;
    }

    const reserve = this.strategy === "cooperator" || this.strategy === "diplomat" ? 0 : 1;
    const maxPerResource =
      this.strategy === "cooperator" || this.strategy === "diplomat"
        ? 3
        : this.strategy === "tit_for_tat"
          ? 1
          : 2;
    const contribution: Partial<Record<ResourceType, number>> = {};
    let totalContrib = 0;

    for (const res of RESOURCE_NAMES) {
      const needed = threshold[res] || 0;
      if (needed > 0 && view.myResources[res] > reserve) {
        const amount = Math.min(maxPerResource, view.myResources[res] - reserve, needed);
        if (amount > 0) {
          contribution[res] = amount;
          totalContrib += amount;
        }
      }
    }

    return totalContrib > 0 ? contribution : null;
  }

  // ============================================================
  // Helpers
  // ============================================================

  private getSurplusResource(view: TragedyAgentView): ResourceType | null {
    const r = view.myResources;
    let maxRes: ResourceType = "grain";
    let maxVal = 0;
    for (const t of RESOURCE_NAMES) {
      if (r[t] > maxVal) { maxVal = r[t]; maxRes = t; }
    }
    return maxVal >= 2 ? maxRes : null;
  }

  private getNeededResource(view: TragedyAgentView): ResourceType | null {
    const r = view.myResources;
    let minRes: ResourceType = "grain";
    let minVal = Infinity;
    for (const t of RESOURCE_NAMES) {
      if (r[t] < minVal) { minVal = r[t]; minRes = t; }
    }
    return minVal < 2 ? minRes : null;
  }

  private getLeadingAgent(view: TragedyAgentView): AgentId | null {
    let maxScore = -1;
    let leader: AgentId | null = null;
    for (const [id, score] of Object.entries(view.allScores)) {
      if (id !== this.id && score > maxScore) { maxScore = score; leader = id; }
    }
    return leader;
  }

  private getAccessibleEcosystem(view: TragedyAgentView) {
    const controlled = new Set<string>();
    const structures = [
      ...view.myStructures.villages,
      ...view.myStructures.townships,
      ...view.myStructures.cities,
      ...view.myStructures.beacons,
      ...view.myStructures.tradePosts,
    ];
    for (const structure of structures) {
      if (structure.regionId) controlled.add(structure.regionId);
    }
    const accessible = view.ecosystemStates.filter((ecosystem) =>
      ecosystem.regionIds.some((regionId) => controlled.has(regionId)),
    );
    if (accessible.length === 0) return null;

    const sorted = [...accessible];
    if (this.strategy === "defector" || this.strategy === "opportunist") {
      sorted.sort((left, right) => right.health - left.health);
    } else if (this.strategy === "builder") {
      sorted.sort((left, right) =>
        Math.abs(left.health - left.flourishThreshold) - Math.abs(right.health - right.flourishThreshold),
      );
    } else {
      sorted.sort((left, right) => left.health - right.health);
    }

    return sorted[0] || null;
  }

  private canRestore(view: TragedyAgentView): boolean {
    return (view.myResources.water || 0) >= 1 && (((view.myResources.energy || 0) >= 1) || ((view.myResources.grain || 0) >= 1));
  }

  private makeMessage(gameId: string, recipient: string, content: string, type: MessageType): Message {
    return {
      id: uuid(), gameId, round: this.memory.roundCount, phase: "negotiation",
      sender: this.id, recipient: recipient as AgentId | "broadcast",
      content, type, timestamp: Date.now(),
    };
  }
}
