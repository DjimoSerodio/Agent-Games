import { describe, expect, it } from "vitest";
import {
  buildAgentURIv0,
  createAgentIdentity,
  deriveAgentAddress,
  parseAgentURIv0,
  serializeAgentURIv0,
} from "../src/core/agent-uri.js";

describe("agentURI v0", () => {
  it("creates additive agent identities with serialized agentURI", () => {
    const identity = createAgentIdentity({
      id: "agent-1234",
      name: "Agent 1234",
      chainAgentId: 8004,
      harness: {
        kind: "mcp",
        endpoint: "http://mcp.local:3100",
        capabilities: ["trust-modeling"],
        operator: "local",
      },
      trust: {
        snapshotRef: "trust-snapshot-1",
        reducerVersion: "trust-v1",
      },
    });

    expect(identity.address).toBe(deriveAgentAddress("agent-1234"));
    expect(identity.agentURI).toBeTruthy();
    expect(identity.harnessKind).toBe("mcp");
    expect(identity.chainAgentId).toBe(8004);
  });

  it("serializes and parses the canonical agentURI payload", () => {
    const identity = createAgentIdentity({
      id: "agent-abc",
      name: "Agent ABC",
      harness: {
        kind: "simple",
        capabilities: ["actions"],
      },
    });

    const uri = serializeAgentURIv0(identity);
    const parsed = parseAgentURIv0(uri);

    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      schema: "coordination-games:agent-uri:v0",
      agentId: "agent-abc",
      name: "Agent ABC",
      walletAddress: identity.address,
      harness: {
        kind: "simple",
        capabilities: ["actions"],
      },
    });
  });

  it("builds payloads from existing identities", () => {
    const payload = buildAgentURIv0({
      id: "agent-z",
      name: "Agent Z",
      address: "0x0000000000000000000000000000000000000001",
      skillsHash: "skills-hash",
      registeredAt: 123,
      harnessKind: "llm",
      capabilities: ["negotiation"],
      mcpEndpoint: "http://localhost:9000/mcp",
      trustSnapshotRef: "snapshot-7",
      trustReducerVersion: "trust-v0",
    });

    expect(payload).toEqual({
      schema: "coordination-games:agent-uri:v0",
      agentId: "agent-z",
      name: "Agent Z",
      walletAddress: "0x0000000000000000000000000000000000000001",
      skillsHash: "skills-hash",
      registeredAt: 123,
      harness: {
        kind: "llm",
        endpoint: "http://localhost:9000/mcp",
        capabilities: ["negotiation"],
      },
      trust: {
        snapshotRef: "snapshot-7",
        reducerVersion: "trust-v0",
      },
    });
  });
});
