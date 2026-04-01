/**
 * Core types for the Coordination Olympiad Arena
 */

// ============================================================
// Identity
// ============================================================

export type AgentId = string;
export type GameId = string;
export type RoundId = number;

export interface AgentIdentity {
  id: AgentId;
  name: string;
  address: string; // Ethereum address (ERC-8004)
  agentNftId?: number; // ERC-8004 token ID
  skillsHash: string; // Hash of the skills.md file
  registeredAt: number;
}

// ============================================================
// Communication
// ============================================================

export type MessageType = "public" | "private" | "diary";

export interface Message {
  id: string;
  gameId: GameId;
  round: RoundId;
  phase: GamePhase;
  sender: AgentId;
  recipient: AgentId | "broadcast";
  content: string;
  type: MessageType;
  timestamp: number;
}

export interface MessageFilter {
  /** What the agent can see */
  forAgent: AgentId;
  /** What spectators can see */
  forSpectator: boolean;
}

// ============================================================
// Trust
// ============================================================

export interface TrustEdge {
  from: AgentId;
  to: AgentId;
  weight: number; // -1.0 to 1.0
  interactions: number;
  cooperations: number;
  defections: number;
  lastInteraction: number;
  gameContexts: GameId[];
}

export interface TrustSnapshot {
  agentId: AgentId;
  globalScore: number; // 0.0 to 1.0 (EigenTrust)
  directScores: Record<AgentId, number>;
  rank: number;
  gamesPlayed: number;
  timestamp: number;
}

// ============================================================
// Game Engine (Generic)
// ============================================================

export type GamePhase =
  | "setup"
  | "production"
  | "negotiation"
  | "action"
  | "resolution"
  | "crisis"
  | "end";

export interface GameConfig {
  id: GameId;
  type: string; // "comedy_commons", "crab_bucket", etc.
  maxPlayers: number;
  minPlayers: number;
  maxRounds: number; // Hidden from agents
  entryFeeWei: bigint;
  moveFeeWei: bigint;
  messageFeeWei: bigint;
  timeouts: {
    negotiationMs: number; // Time limit for negotiation phase
    actionMs: number; // Time limit for action submission
  };
}

export interface GameState {
  gameId: GameId;
  round: RoundId;
  phase: GamePhase;
  players: AgentId[];
  scores: Record<AgentId, number>;
  isFinished: boolean;
  winner: AgentId | null;
}

export interface RoundResult {
  gameId: GameId;
  round: RoundId;
  actions: Record<AgentId, Action[]>;
  outcomes: ActionOutcome[];
  scoreChanges: Record<AgentId, number>;
  trustUpdates: TrustUpdate[];
  messages: Message[];
}

export interface TrustUpdate {
  from: AgentId;
  to: AgentId;
  delta: number; // Change in trust
  reason: string; // "kept_promise", "broke_promise", "crisis_contribution", etc.
}

// ============================================================
// Actions (Generic)
// ============================================================

export interface Action {
  type: string;
  agentId: AgentId;
  params: Record<string, unknown>;
  round: RoundId;
  timestamp: number;
}

export interface ActionOutcome {
  action: Action;
  success: boolean;
  description: string;
  effects: GameEffect[];
}

export interface GameEffect {
  type: string;
  target: AgentId | "all";
  params: Record<string, unknown>;
}

// ============================================================
// Prediction Market
// ============================================================

export interface PredictionMarket {
  id: string;
  gameId: GameId;
  question: string;
  outcomes: string[]; // e.g., ["Yes", "No"] or agent IDs
  resolved: boolean;
  winningOutcome: number | null;
  totalStaked: bigint;
  odds: number[]; // Current implied probabilities
  createdAt: number;
  resolvesAt: number;
}

export interface MarketBet {
  marketId: string;
  bettor: string; // Ethereum address
  outcomeIndex: number;
  amount: bigint;
  timestamp: number;
}

// ============================================================
// Events (Observable Bus)
// ============================================================

export type EventType =
  | "game.created"
  | "game.started"
  | "game.round.start"
  | "game.phase.change"
  | "game.action"
  | "game.state_update"
  | "game.map_data"
  | "game.agent_info"
  | "game.result"
  | "game.ended"
  | "chat.public"
  | "chat.private"
  | "chat.diary"
  | "trust.updated"
  | "trust.snapshot"
  | "market.created"
  | "market.trade"
  | "market.resolved"
  | "agent.registered"
  | "agent.joined"
  | "crisis.triggered"
  | "crisis.resolved"
  | "commitment.detected"
  | "commitment.attested"
  | "commitment.resolved"
  | "behavior.tagged"
  | "prize.slashed";

export interface ArenaEvent {
  type: EventType;
  gameId?: GameId;
  agentId?: AgentId;
  data: unknown;
  timestamp: number;
  /** Who can see this event */
  visibility: {
    agents: AgentId[] | "all" | "none";
    spectators: boolean;
  };
}

// ============================================================
// Agent Interface (what game-specific agents implement)
// ============================================================

export interface GameAgent {
  id: AgentId;
  identity: AgentIdentity;

  /** Called when the game starts */
  initialize(config: GameConfig, state: unknown, identity: AgentIdentity): Promise<void>;

  /** Called during negotiation phase - return messages to send */
  negotiate(
    state: unknown,
    incomingMessages: Message[],
    round: RoundId,
  ): Promise<Message[]>;

  /** Called during action phase - return chosen actions */
  act(
    state: unknown,
    round: RoundId,
    legalActions: Action[],
  ): Promise<Action[]>;

  /** Called after resolution with results */
  reflect(results: RoundResult): Promise<void>;
}
