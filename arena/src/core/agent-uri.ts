import type { AgentId, AgentIdentity } from "./types.js";

export type AgentHarnessKind =
  | "human"
  | "simple"
  | "llm"
  | "mcp"
  | "platform-bot"
  | "external-bot"
  | "emulator";

export interface AgentHarnessDescriptorV0 {
  kind: AgentHarnessKind;
  endpoint?: string;
  provider?: string;
  model?: string;
  capabilities?: string[];
  operator?: "self" | "platform" | "local";
}

export interface AgentTrustDescriptorV0 {
  snapshotRef?: string;
  reducerVersion?: string;
}

export interface AgentURIv0 {
  schema: "coordination-games:agent-uri:v0";
  agentId: AgentId;
  name: string;
  walletAddress: string;
  chainAgentId?: number;
  skillsHash?: string;
  registeredAt?: number;
  harness: AgentHarnessDescriptorV0;
  trust?: AgentTrustDescriptorV0;
}

export interface CreateAgentIdentityOptions {
  id: AgentId;
  name: string;
  harness: AgentHarnessDescriptorV0;
  address?: string;
  chainAgentId?: number;
  agentNftId?: number;
  skillsHash?: string;
  registeredAt?: number;
  chainId?: number;
  trust?: AgentTrustDescriptorV0;
}

export function deriveAgentAddress(agentId: AgentId): string {
  return `0x${agentId.replace(/-/g, "").slice(0, 40).padEnd(40, "0")}`;
}

export function buildAgentURIv0(identity: AgentIdentity): AgentURIv0 {
  return {
    schema: "coordination-games:agent-uri:v0",
    agentId: identity.id,
    name: identity.name,
    walletAddress: identity.address,
    ...(identity.chainAgentId !== undefined ? { chainAgentId: identity.chainAgentId } : {}),
    ...(identity.skillsHash ? { skillsHash: identity.skillsHash } : {}),
    ...(identity.registeredAt ? { registeredAt: identity.registeredAt } : {}),
    harness: {
      kind: (identity.harnessKind as AgentHarnessKind | undefined) ?? "human",
      ...(identity.mcpEndpoint ? { endpoint: identity.mcpEndpoint } : {}),
      ...(identity.capabilities?.length ? { capabilities: identity.capabilities } : {}),
    },
    ...(identity.trustSnapshotRef || identity.trustReducerVersion
      ? {
          trust: {
            ...(identity.trustSnapshotRef ? { snapshotRef: identity.trustSnapshotRef } : {}),
            ...(identity.trustReducerVersion ? { reducerVersion: identity.trustReducerVersion } : {}),
          },
        }
      : {}),
  };
}

export function serializeAgentURIv0(identity: AgentIdentity): string {
  return JSON.stringify(buildAgentURIv0(identity));
}

export function parseAgentURIv0(raw: string): AgentURIv0 | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AgentURIv0>;
    if (parsed.schema !== "coordination-games:agent-uri:v0") return null;
    if (!parsed.agentId || !parsed.name || !parsed.walletAddress || !parsed.harness?.kind) return null;
    return parsed as AgentURIv0;
  } catch {
    return null;
  }
}

export function createAgentIdentity(options: CreateAgentIdentityOptions): AgentIdentity {
  const registeredAt = options.registeredAt ?? Date.now();
  const address = options.address ?? deriveAgentAddress(options.id);
  const identity: AgentIdentity = {
    id: options.id,
    name: options.name,
    address,
    ...(options.chainAgentId !== undefined ? { chainAgentId: options.chainAgentId } : {}),
    ...(options.agentNftId !== undefined ? { agentNftId: options.agentNftId } : {}),
    skillsHash: options.skillsHash ?? "",
    registeredAt,
    ...(options.chainId !== undefined ? { chainId: options.chainId } : {}),
    harnessKind: options.harness.kind,
    ...(options.harness.endpoint ? { mcpEndpoint: options.harness.endpoint } : {}),
    ...(options.harness.capabilities ? { capabilities: options.harness.capabilities } : {}),
    ...(options.trust?.snapshotRef ? { trustSnapshotRef: options.trust.snapshotRef } : {}),
    ...(options.trust?.reducerVersion ? { trustReducerVersion: options.trust.reducerVersion } : {}),
  };
  identity.agentURI = serializeAgentURIv0(identity);
  return identity;
}
