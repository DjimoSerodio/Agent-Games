import type { AgentId } from "../core/types.js";

export type AgentLogPhase = "negotiation" | "action" | "reflection";
export type AgentLogType = "decision" | "api_call" | "message" | "action" | "error";

export interface AgentApiMeta {
  method: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  action: string;
}

export interface AgentLogEntry {
  timestamp: number;
  agentId: AgentId;
  agentName: string;
  round: number;
  phase: AgentLogPhase;
  type: AgentLogType;
  data: {
    promptSummary?: string;
    responseSummary?: string;
    api?: AgentApiMeta;
    messages?: Array<{ recipient: string; content: string; type: string }>;
    actions?: Array<{ type: string; params: Record<string, unknown> }>;
    observations?: string;
    trustUpdates?: Record<string, number>;
    strategyAdjustment?: string;
    error?: string;
  };
}
