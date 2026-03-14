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
  NexusAgentView,
  NexusAction,
  ResourceType,
  RESOURCE_NAMES,
} from "../games/nexus/types.js";

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
    this.identity = {
      id,
      name: name || `Agent_${id.slice(0, 6)}_${strategy}`,
      address: `0x${id.replace(/-/g, "").slice(0, 40)}`,
      skillsHash: "",
      registeredAt: Date.now(),
    };
    this.memory = {
      lastBehavior: {},
      allies: new Set(),
      enemies: new Set(),
      myOffers: new Map(),
      incomingOffers: new Map(),
      roundCount: 0,
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
    const view = state as NexusAgentView;
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
    const view = state as NexusAgentView;
    const actions: NexusAction[] = [];

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

    // 3. Build something if possible
    if (actions.length < 2) {
      const buildAction = this.decideBuildAction(view, round);
      if (buildAction) actions.push(buildAction);
    }

    // 4. Explore or secondary action
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
        const partnerId = (outcome.action as NexusAction).params.partnerId as AgentId;
        if (partnerId) {
          this.memory.lastBehavior[partnerId] = "defected";
          this.memory.enemies.add(partnerId);
          this.memory.allies.delete(partnerId);
        }
      }
    }

    for (const update of results.trustUpdates) {
      if (update.to === this.id && update.delta > 0) {
        this.memory.lastBehavior[update.from] = "cooperated";
      }
      if (update.to === this.id && update.delta < 0) {
        this.memory.lastBehavior[update.from] = "defected";
      }
    }
  }

  // ============================================================
  // Incoming message parsing -- detects trade offers from others
  // ============================================================

  private processIncomingMessages(messages: Message[], view: NexusAgentView): void {
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

  private negotiateCooperator(view: NexusAgentView): Message[] {
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

  private negotiateDefector(view: NexusAgentView): Message[] {
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

  private negotiateTitForTat(view: NexusAgentView): Message[] {
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

  private negotiateDiplomat(view: NexusAgentView): Message[] {
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

  private negotiateBuilder(view: NexusAgentView): Message[] {
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

  private negotiateOpportunist(view: NexusAgentView): Message[] {
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

  private decideTradeAction(view: NexusAgentView, round: number): NexusAction | null {
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

  private decideBuildAction(view: NexusAgentView, round: number): NexusAction | null {
    const r = view.myResources;

    // Upgrade to city if we have settlements and can afford it
    if (r.grain >= 2 && r.ore >= 2 && r.water >= 1 && view.myStructures.settlements.length > 0) {
      return { type: "build_city", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Build settlement
    if (r.grain >= 1 && r.timber >= 1 && r.ore >= 1 && r.water >= 1) {
      return { type: "build_settlement", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Build beacon (if diplomat or have excess energy)
    if ((this.strategy === "diplomat" || this.strategy === "cooperator") && r.ore >= 1 && r.energy >= 1 && r.water >= 1) {
      return { type: "build_beacon", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Build trade post (if builder)
    if (this.strategy === "builder" && r.timber >= 1 && r.fish >= 1 && r.water >= 1) {
      return { type: "build_trade_post", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Build road
    if (r.grain >= 1 && r.timber >= 1) {
      return { type: "build_road", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    return null;
  }

  private decideSecondaryAction(view: NexusAgentView, legalActions: Action[], round: number): NexusAction | null {
    const accessibleEcosystem = this.getAccessibleEcosystem(view);

    if (round <= 3) {
      return { type: "explore", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    // Sabotage if defector and can afford it
    if (this.strategy === "defector" && view.myResources.energy >= 1 && view.myResources.ore >= 1) {
      return { type: "sabotage", agentId: this.id, params: {}, round, timestamp: Date.now() };
    }

    if (accessibleEcosystem) {
      if (
        this.strategy !== "defector" &&
        accessibleEcosystem.health <= Math.max(accessibleEcosystem.collapseThreshold + 8, 34) &&
        this.canRestore(view)
      ) {
        return {
          type: "restore_ecosystem",
          agentId: this.id,
          params: { ecosystemId: accessibleEcosystem.id },
          round,
          timestamp: Date.now(),
        };
      }

      return {
        type: "extract_commons",
        agentId: this.id,
        params: {
          ecosystemId: accessibleEcosystem.id,
          extractionLevel: this.strategy === "defector" ? "high" : this.strategy === "builder" ? "medium" : "low",
        },
        round,
        timestamp: Date.now(),
      };
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

    // Explore more
    return { type: "explore", agentId: this.id, params: {}, round, timestamp: Date.now() };
  }

  private decideCrisisContribution(view: NexusAgentView): Partial<Record<ResourceType, number>> | null {
    if (!view.activeCrisis) return null;
    const threshold = view.activeCrisis.threshold;
    const contribution: Partial<Record<ResourceType, number>> = {};
    let totalContrib = 0;

    for (const res of RESOURCE_NAMES) {
      const needed = threshold[res] || 0;
      if (needed > 0 && view.myResources[res] > 1) { // Keep at least 1
        const amount = Math.min(2, view.myResources[res] - 1, needed);
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

  private getSurplusResource(view: NexusAgentView): ResourceType | null {
    const r = view.myResources;
    let maxRes: ResourceType = "grain";
    let maxVal = 0;
    for (const t of RESOURCE_NAMES) {
      if (r[t] > maxVal) { maxVal = r[t]; maxRes = t; }
    }
    return maxVal >= 2 ? maxRes : null;
  }

  private getNeededResource(view: NexusAgentView): ResourceType | null {
    const r = view.myResources;
    let minRes: ResourceType = "grain";
    let minVal = Infinity;
    for (const t of RESOURCE_NAMES) {
      if (r[t] < minVal) { minVal = r[t]; minRes = t; }
    }
    return minVal < 2 ? minRes : null;
  }

  private getLeadingAgent(view: NexusAgentView): AgentId | null {
    let maxScore = -1;
    let leader: AgentId | null = null;
    for (const [id, score] of Object.entries(view.allScores)) {
      if (id !== this.id && score > maxScore) { maxScore = score; leader = id; }
    }
    return leader;
  }

  private getAccessibleEcosystem(view: NexusAgentView) {
    const controlled = new Set<string>();
    const structures = [
      ...view.myStructures.settlements,
      ...view.myStructures.cities,
      ...view.myStructures.beacons,
      ...view.myStructures.tradePosts,
    ];
    for (const structure of structures) {
      if (structure.regionId) controlled.add(structure.regionId);
    }
    return view.ecosystemStates
      .filter((ecosystem) => ecosystem.regionIds.some((regionId) => controlled.has(regionId)))
      .sort((left, right) => left.health - right.health)[0] || null;
  }

  private canRestore(view: NexusAgentView): boolean {
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
