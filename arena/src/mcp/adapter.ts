import { v4 as uuid } from "uuid";
import {
  Action,
  AgentId,
  AgentIdentity,
  GameAgent,
  GameConfig,
  Message,
  MessageType,
  RoundResult,
} from "../core/types.js";
import {
  ComedyAction,
  ComedyActionType,
  ComedyAgentView,
  ExtractionLevel,
  ResourceInventory,
  ResourceType,
  VertexStructure,
} from "../games/nexus/types.js";

type MessageChannel = "public" | "private" | "broadcast" | "diary";

interface TradeProposal {
  id: string;
  from: AgentId;
  to: AgentId;
  offer: Partial<ResourceInventory>;
  request: Partial<ResourceInventory>;
  round: number;
  createdAt: number;
}

const RESOURCE_KEYS: ResourceType[] = ["grain", "timber", "ore", "fish", "water", "energy"];

export class MCPAgentAdapter implements GameAgent {
  id: AgentId;
  identity: AgentIdentity;

  private config: GameConfig | null = null;
  private currentState: ComedyAgentView | null = null;
  private currentMessages: Message[] = [];
  private currentLegalActions: Action[] = [];
  private currentRound = 0;
  private lastRoundResult: RoundResult | null = null;

  private pendingActions: Action[] = [];
  private pendingMessages: Message[] = [];

  private actionResolve: ((actions: Action[]) => void) | null = null;
  private messageResolve: ((messages: Message[]) => void) | null = null;
  private actionTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageTimeout: ReturnType<typeof setTimeout> | null = null;

  private tradeProposals = new Map<string, TradeProposal>();

  constructor(id: AgentId, name?: string, private readonly waitTimeoutMs = 30_000) {
    this.id = id;
    this.identity = {
      id,
      name: name || `MCP_${id.slice(0, 6)}`,
      address: `0x${id.replace(/-/g, "").slice(0, 40).padEnd(40, "0")}`,
      skillsHash: "",
      registeredAt: Date.now(),
    };
  }

  async initialize(config: GameConfig, state: unknown, identity: AgentIdentity): Promise<void> {
    this.config = config;
    this.currentState = state as ComedyAgentView;
    this.identity = identity;
    this.currentRound = this.currentState?.round ?? 0;
  }

  async negotiate(state: unknown, incomingMessages: Message[], round: number): Promise<Message[]> {
    this.currentState = state as ComedyAgentView;
    this.currentMessages = incomingMessages;
    this.currentRound = round;
    this.captureIncomingTradeProposals(incomingMessages);

    return new Promise<Message[]>((resolve) => {
      this.messageResolve = resolve;
      this.messageTimeout = setTimeout(() => this.flushMessages(), this.waitTimeoutMs);
    });
  }

  async act(state: unknown, round: number, legalActions: Action[]): Promise<Action[]> {
    this.currentState = state as ComedyAgentView;
    this.currentRound = round;
    this.currentLegalActions = legalActions;

    return new Promise<Action[]>((resolve) => {
      this.actionResolve = resolve;
      this.actionTimeout = setTimeout(() => this.flushActionsWithDefaultPass(), this.waitTimeoutMs);
    });
  }

  async reflect(results: RoundResult): Promise<void> {
    this.lastRoundResult = results;
  }

  getGameState(): ComedyAgentView | null {
    return this.currentState;
  }

  getPublicPlayers(): Array<{ id: AgentId; score: number; influence: number }> {
    if (!this.currentState) return [];
    const scores = this.currentState.allScores;
    const influence = this.currentState.allInfluence;
    return Object.keys(scores).map((id) => ({
      id,
      score: scores[id] ?? 0,
      influence: influence[id] ?? 0,
    }));
  }

  getEcosystems() {
    return this.currentState?.ecosystemStates ?? [];
  }

  getVisibleTrustScores() {
    return this.currentState?.trustScores ?? {};
  }

  getTrustDossiers() {
    return this.currentState?.trustDossiers ?? {};
  }

  getTrustProjections() {
    return this.currentState?.trustProjectionByAgent ?? {};
  }

  getTrustSnapshotArtifact() {
    return this.currentState?.trustSnapshotArtifact ?? null;
  }

  getBehaviorMemory() {
    return this.currentState?.behaviorMemory ?? null;
  }

  getVisibleCommitments() {
    return this.currentState?.visibleCommitments ?? [];
  }

  getVisibleAttestations() {
    return this.currentState?.visibleAttestations ?? [];
  }

  getTrustQuerySurface() {
    return {
      trustScores: this.getVisibleTrustScores(),
      trustDossiers: this.getTrustDossiers(),
      trustProjectionByAgent: this.getTrustProjections(),
      trustSnapshotArtifact: this.getTrustSnapshotArtifact(),
      behaviorMemory: this.getBehaviorMemory(),
      visibleCommitments: this.getVisibleCommitments(),
      visibleAttestations: this.getVisibleAttestations(),
    };
  }

  getVisibleMessages() {
    const history = this.currentState?.messageHistory ?? [];
    return [...history, ...this.currentMessages];
  }

  getLastRoundResult() {
    return this.lastRoundResult;
  }

  submitAction(actionType: string, params: Record<string, unknown> = {}): ComedyAction {
    const normalizedType = this.normalizeActionType(actionType, params);
    this.ensureActionAllowed(normalizedType);

    const action: ComedyAction = {
      type: normalizedType,
      agentId: this.id,
      params,
      round: this.currentRound,
      timestamp: Date.now(),
    };

    this.pendingActions.push(action);
    if (this.pendingActions.length >= 2) {
      this.flushActions();
    }

    return action;
  }

  sendMessage(channel: MessageChannel, recipient: AgentId | undefined, text: string): Message {
    const { type, resolvedRecipient } = this.normalizeMessageChannel(channel, recipient);

    const message: Message = {
      id: uuid(),
      gameId: this.config?.id ?? this.currentState?.gameId ?? "pending-game",
      round: this.currentRound,
      phase: "negotiation",
      sender: this.id,
      recipient: resolvedRecipient,
      content: text,
      type,
      timestamp: Date.now(),
    };

    this.pendingMessages.push(message);
    return message;
  }

  submitNegotiationMessages(): Message[] {
    return this.flushMessages();
  }

  submitCurrentActions(): Action[] {
    return this.flushActions();
  }

  proposeTrade(
    partner: AgentId,
    offer: Partial<ResourceInventory>,
    request: Partial<ResourceInventory>,
  ): TradeProposal {
    const proposal: TradeProposal = {
      id: uuid(),
      from: this.id,
      to: partner,
      offer: this.cleanResourcePatch(offer),
      request: this.cleanResourcePatch(request),
      round: this.currentRound,
      createdAt: Date.now(),
    };

    this.tradeProposals.set(proposal.id, proposal);
    this.sendMessage(
      "private",
      partner,
      `TRADE_PROPOSAL ${proposal.id} ${JSON.stringify({
        from: proposal.from,
        to: proposal.to,
        offer: proposal.offer,
        request: proposal.request,
        round: proposal.round,
      })}`,
    );

    return proposal;
  }

  respondTrade(tradeId: string, accept: boolean): { tradeId: string; accept: boolean; action?: ComedyAction } {
    const proposal = this.tradeProposals.get(tradeId);
    if (!proposal) {
      throw new Error(`Unknown trade proposal: ${tradeId}`);
    }

    if (!accept) {
      this.sendMessage("private", proposal.from, `TRADE_RESPONSE ${tradeId} REJECT`);
      return { tradeId, accept };
    }

    this.sendMessage("private", proposal.from, `TRADE_RESPONSE ${tradeId} ACCEPT`);

    if (proposal.to !== this.id) {
      return { tradeId, accept };
    }

    const action = this.submitAction("trade_player", {
      partnerId: proposal.from,
      give: proposal.request,
      receive: proposal.offer,
    });

    return { tradeId, accept, action };
  }

  extractEcosystem(ecosystemId: string, level: ExtractionLevel): ComedyAction {
    return this.submitAction("extract_commons", { ecosystemId, extractionLevel: level });
  }

  contributeCrisis(crisisId: string, resources: Partial<ResourceInventory>): ComedyAction {
    return this.submitAction("crisis_contribute", { crisisId, contribution: this.cleanResourcePatch(resources) });
  }

  formAlliance(partnerId: AgentId): Message {
    return this.sendMessage("private", partnerId, `ALLIANCE_FORM ${this.id} ${partnerId}`);
  }

  breakAlliance(partnerId: AgentId): Message {
    return this.sendMessage("private", partnerId, `ALLIANCE_BREAK ${this.id} ${partnerId}`);
  }

  build(structureType: VertexStructure | "road", location?: unknown): ComedyAction {
    const mappedType = this.mapBuildStructureToAction(structureType);
    return this.submitAction(mappedType, location ? { location } : {});
  }

  passTurn(): ComedyAction {
    return this.submitAction("pass", {});
  }

  private flushMessages(): Message[] {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }

    const payload = [...this.pendingMessages];
    this.pendingMessages = [];

    if (this.messageResolve) {
      const resolve = this.messageResolve;
      this.messageResolve = null;
      resolve(payload);
    }

    return payload;
  }

  private flushActions(): Action[] {
    if (this.actionTimeout) {
      clearTimeout(this.actionTimeout);
      this.actionTimeout = null;
    }

    const payload = [...this.pendingActions];
    this.pendingActions = [];

    if (this.actionResolve) {
      const resolve = this.actionResolve;
      this.actionResolve = null;
      resolve(payload);
    }

    return payload;
  }

  private flushActionsWithDefaultPass(): Action[] {
    if (this.pendingActions.length === 0) {
      this.pendingActions.push({
        type: "pass",
        agentId: this.id,
        params: {},
        round: this.currentRound,
        timestamp: Date.now(),
      });
    }
    return this.flushActions();
  }

  private normalizeActionType(actionType: string, params: Record<string, unknown>): ComedyActionType {
    const normalized = actionType.trim().toLowerCase();
    const aliases: Record<string, ComedyActionType> = {
      build: this.mapBuildStructureToAction((params.structure_type as VertexStructure | "road") ?? "village"),
      trade: "trade_player",
      extract: "extract_commons",
      restore: "restore_ecosystem",
      army_build: "build_army",
      army_move: "move_army",
      army_attack: "attack_structure",
      pass: "pass",
      crisis_contribute: "crisis_contribute",
      trade_player: "trade_player",
      trade_bank: "trade_bank",
      explore: "explore",
      extract_commons: "extract_commons",
      restore_ecosystem: "restore_ecosystem",
      sabotage: "sabotage",
      build_road: "build_road",
      build_village: "build_village",
      upgrade_township: "upgrade_township",
      upgrade_city: "upgrade_city",
      build_beacon: "build_beacon",
      build_trade_post: "build_trade_post",
      build_army: "build_army",
      move_army: "move_army",
      attack_structure: "attack_structure",
    };

    const mapped = aliases[normalized];
    if (!mapped) {
      throw new Error(`Unsupported action type: ${actionType}`);
    }
    return mapped;
  }

  private ensureActionAllowed(actionType: ComedyActionType): void {
    if (this.currentLegalActions.length === 0) return;

    const legal = new Set(this.currentLegalActions.map((a) => a.type));
    if (!legal.has(actionType) && actionType !== "pass") {
      throw new Error(`Action not currently legal: ${actionType}`);
    }
  }

  private mapBuildStructureToAction(structureType: VertexStructure | "road"): ComedyActionType {
    switch (structureType) {
      case "road":
        return "build_road";
      case "village":
        return "build_village";
      case "township":
        return "upgrade_township";
      case "city":
        return "upgrade_city";
      case "beacon":
        return "build_beacon";
      case "trade_post":
        return "build_trade_post";
      default:
        return "build_village";
    }
  }

  private normalizeMessageChannel(
    channel: MessageChannel,
    recipient: AgentId | undefined,
  ): { type: MessageType; resolvedRecipient: AgentId | "broadcast" } {
    if (channel === "public" || channel === "broadcast") {
      return { type: "public", resolvedRecipient: "broadcast" };
    }

    if (channel === "diary") {
      return { type: "diary", resolvedRecipient: this.id };
    }

    if (!recipient) {
      throw new Error("recipient is required for private messages");
    }

    return { type: "private", resolvedRecipient: recipient };
  }

  private cleanResourcePatch(input: Partial<ResourceInventory>): Partial<ResourceInventory> {
    const out: Partial<ResourceInventory> = {};
    for (const key of RESOURCE_KEYS) {
      const value = input[key];
      if (typeof value === "number" && value > 0) {
        out[key] = value;
      }
    }
    return out;
  }

  private captureIncomingTradeProposals(incomingMessages: Message[]): void {
    for (const message of incomingMessages) {
      if (!message.content.startsWith("TRADE_PROPOSAL ")) continue;

      const parts = message.content.split(" ");
      const tradeId = parts[1];
      const payload = message.content.slice(`TRADE_PROPOSAL ${tradeId} `.length);

      try {
        const parsed = JSON.parse(payload) as {
          from: AgentId;
          to: AgentId;
          offer: Partial<ResourceInventory>;
          request: Partial<ResourceInventory>;
          round: number;
        };

        this.tradeProposals.set(tradeId, {
          id: tradeId,
          from: parsed.from,
          to: parsed.to,
          offer: parsed.offer,
          request: parsed.request,
          round: parsed.round,
          createdAt: message.timestamp,
        });
      } catch {
      }
    }
  }
}
