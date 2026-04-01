/**
 * ERC-8004 Trustless Agents - TypeScript Client
 *
 * Interface for interacting with ERC-8004 contracts:
 * - Identity Registry (ERC-721 NFT for agents)
 * - Reputation Registry (feedback/scoring system)
 * - Validation Registry (work verification)
 *
 * Docs: https://github.com/ChaosChain/trustless-agents-erc-ri
 * Spec: https://eips.ethereum.org/EIPS/eip-8004
 */

import { ethers } from "ethers";

export interface AgentRegistration {
  name: string;
  description: string;
  image?: string;
  services?: Array<{
    name: string;
    endpoint: string;
    version?: string;
    skills?: string[];
    domains?: string[];
  }>;
  x402Support?: boolean;
  active?: boolean;
}

export interface FeedbackEntry {
  value: number;
  valueDecimals: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
}

export interface AgentSummary {
  count: number;
  averageValue: number;
  averageValueDecimals: number;
}

export interface ValidationRequest {
  validatorAddress: string;
  agentId: number;
  requestURI: string;
  requestHash: string;
}

export interface ValidationStatus {
  validator: string;
  agentId: number;
  response: number;
  responseHash: string;
  tag: string;
  lastUpdate: number;
}

export class ERC8004Client {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Signer | null = null;

  private identityRegistry: ethers.Contract | null = null;
  private reputationRegistry: ethers.Contract | null = null;
  private validationRegistry: ethers.Contract | null = null;

  private identityRegistryAddress: string;
  private reputationRegistryAddress: string;
  private validationRegistryAddress: string;

  constructor(
    providerUrl: string,
    privateAddress?: string,
    addresses?: {
      identityRegistry?: string;
      reputationRegistry?: string;
      validationRegistry?: string;
    }
  ) {
    this.provider = new ethers.JsonRpcProvider(providerUrl);

    if (privateAddress) {
      this.signer = new ethers.Wallet(privateAddress, this.provider);
    }

    // Default Sepolia addresses (ChaosChain reference implementation)
    this.identityRegistryAddress = addresses?.identityRegistry || "0xf66e7CBdAE1Cb710fee7732E4e1f173624e137A7";
    this.reputationRegistryAddress = addresses?.reputationRegistry || "0x6E2a285294B5c74CB76d76AB77C1ef15c2A9E407";
    this.validationRegistryAddress = addresses?.validationRegistry || "0xC26171A3c4e1d958cEA196A5e84B7418C58DCA2C";
  }

  private getIdentityRegistry(): ethers.Contract {
    if (!this.identityRegistry) {
      const abi = [
        "function register(string agentURI, tuple(string metadataKey, bytes metadataValue)[] metadata) external returns (uint256 agentId)",
        "function register(string agentURI) external returns (uint256 agentId)",
        "function register() external returns (uint256 agentId)",
        "function setAgentURI(uint256 agentId, string newURI) external",
        "function getMetadata(uint256 agentId, string metadataKey) external view returns (bytes)",
        "function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue) external",
        "function getAgentWallet(uint256 agentId) external view returns (address)",
        "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature) external",
        "function unsetAgentWallet(uint256 agentId) external",
        "function ownerOf(uint256 agentId) external view returns (address)",
        "function tokenURI(uint256 agentId) external view returns (string)",
        "function balanceOf(address owner) external view returns (uint256)",
        "function totalSupply() external view returns (uint256)",
        "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
        "event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)",
        "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)",
      ];

      this.identityRegistry = new ethers.Contract(
        this.identityRegistryAddress,
        abi,
        this.signer || this.provider
      );
    }
    return this.identityRegistry;
  }

  private getReputationRegistry(): ethers.Contract {
    if (!this.reputationRegistry) {
      const abi = [
        "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
        "function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external",
        "function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string responseURI, bytes32 responseHash) external",
        "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
        "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) external view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)",
        "function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) external view returns (address[] memory clients, uint64[] memory feedbackIndexes, int128[] memory values, uint8[] memory valueDecimals, string[] memory tag1s, string[] memory tag2s, bool[] memory revokedStatuses)",
        "function getClients(uint256 agentId) external view returns (address[] memory)",
        "function getIdentityRegistry() external view returns (address)",
        "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
        "event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)",
      ];

      this.reputationRegistry = new ethers.Contract(
        this.reputationRegistryAddress,
        abi,
        this.signer || this.provider
      );
    }
    return this.reputationRegistry;
  }

  private getValidationRegistry(): ethers.Contract {
    if (!this.validationRegistry) {
      const abi = [
        "function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash) external",
        "function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag) external",
        "function getValidationStatus(bytes32 requestHash) external view returns (address validator, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
        "function getSummary(uint256 agentId, address[] validatorAddresses, string tag) external view returns (uint64 count, uint8 averageResponse)",
        "function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory requestHashes)",
        "function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory requestHashes)",
        "function getIdentityRegistry() external view returns (address)",
        "event ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash)",
        "event ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)",
      ];

      this.validationRegistry = new ethers.Contract(
        this.validationRegistryAddress,
        abi,
        this.signer || this.provider
      );
    }
    return this.validationRegistry;
  }

  // ============================================================
  // Identity Registry
  // ============================================================

  async registerAgent(agentURI: string, metadata?: Array<{ key: string; value: string }>): Promise<number> {
    const registry = this.getIdentityRegistry();
    const signer = this.getSigner();

    if (!signer) {
      throw new Error("No signer available - wallet private key required for registration");
    }

    const formattedMetadata = metadata?.map(m => ({
      metadataKey: m.key,
      metadataValue: ethers.encodeBytes32String(m.value)
    })) || [];

    const tx = await registry.register(agentURI, formattedMetadata);
    const receipt = await tx.wait();

    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = registry.interface.parseLog(log);
        return parsed?.name === "Registered";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = registry.interface.parseLog(event);
      return parsed?.args[0] as number; // agentId
    }

    throw new Error("Registration event not found");
  }

  async getAgentURI(agentId: number): Promise<string> {
    const registry = this.getIdentityRegistry();
    return registry.tokenURI(agentId);
  }

  async getAgentOwner(agentId: number): Promise<string> {
    const registry = this.getIdentityRegistry();
    return registry.ownerOf(agentId);
  }

  async getAgentWallet(agentId: number): Promise<string> {
    const registry = this.getIdentityRegistry();
    return registry.getAgentWallet(agentId);
  }

  async setAgentMetadata(agentId: number, key: string, value: string): Promise<void> {
    const registry = this.getIdentityRegistry();
    const signer = this.getSigner();

    if (!signer) {
      throw new Error("No signer available");
    }

    const tx = await registry.setMetadata(
      agentId,
      key,
      ethers.encodeBytes32String(value)
    );
    await tx.wait();
  }

  async getAgentMetadata(agentId: number, key: string): Promise<string> {
    const registry = this.getIdentityRegistry();
    const result = await registry.getMetadata(agentId, key);
    return ethers.decodeBytes32String(result);
  }

  async totalAgents(): Promise<number> {
    const registry = this.getIdentityRegistry();
    return registry.totalSupply();
  }

  // ============================================================
  // Reputation Registry
  // ============================================================

  async submitFeedback(
    agentId: number,
    value: number,
    valueDecimals: number,
    options?: {
      tag1?: string;
      tag2?: string;
      endpoint?: string;
      feedbackURI?: string;
    }
  ): Promise<number> {
    const registry = this.getReputationRegistry();
    const signer = this.getSigner();

    if (!signer) {
      throw new Error("No signer available");
    }

    const tx = await registry.giveFeedback(
      agentId,
      Math.round(value * Math.pow(10, valueDecimals)),
      valueDecimals,
      options?.tag1 || "",
      options?.tag2 || "",
      options?.endpoint || "",
      options?.feedbackURI || "",
      ethers.ZeroHash
    );
    const receipt = await tx.wait();

    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = registry.interface.parseLog(log);
        return parsed?.name === "NewFeedback";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = registry.interface.parseLog(event);
      return parsed?.args[2] as number; // feedbackIndex
    }

    throw new Error("Feedback event not found");
  }

  async getAgentSummary(
    agentId: number,
    clientAddresses?: string[],
    tag1?: string,
    tag2?: string
  ): Promise<AgentSummary> {
    const registry = this.getReputationRegistry();
    const result = await registry.getSummary(
      agentId,
      clientAddresses || [],
      tag1 || "",
      tag2 || ""
    );

    return {
      count: Number(result[0]),
      averageValue: Number(result[1]) / Math.pow(10, Number(result[2])),
      averageValueDecimals: Number(result[2]),
    };
  }

  async getAgentClients(agentId: number): Promise<string[]> {
    const registry = this.getReputationRegistry();
    return registry.getClients(agentId);
  }

  async revokeFeedback(agentId: number, feedbackIndex: number): Promise<void> {
    const registry = this.getReputationRegistry();
    const signer = this.getSigner();

    if (!signer) {
      throw new Error("No signer available");
    }

    const tx = await registry.revokeFeedback(agentId, feedbackIndex);
    await tx.wait();
  }

  // ============================================================
  // Validation Registry
  // ============================================================

  async requestValidation(
    validatorAddress: string,
    agentId: number,
    requestURI: string,
    requestHash: string
  ): Promise<void> {
    const registry = this.getValidationRegistry();
    const signer = this.getSigner();

    if (!signer) {
      throw new Error("No signer available");
    }

    const tx = await registry.validationRequest(
      validatorAddress,
      agentId,
      requestURI,
      requestHash
    );
    await tx.wait();
  }

  async respondToValidation(
    requestHash: string,
    response: number,
    options?: {
      responseURI?: string;
      responseHash?: string;
      tag?: string;
    }
  ): Promise<void> {
    const registry = this.getValidationRegistry();
    const signer = this.getSigner();

    if (!signer) {
      throw new Error("No signer available");
    }

    const tx = await registry.validationResponse(
      requestHash,
      response,
      options?.responseURI || "",
      options?.responseHash || ethers.ZeroHash,
      options?.tag || ""
    );
    await tx.wait();
  }

  async getValidationStatus(requestHash: string): Promise<ValidationStatus> {
    const registry = this.getValidationRegistry();
    const result = await registry.getValidationStatus(requestHash);

    return {
      validator: result[0],
      agentId: Number(result[1]),
      response: Number(result[2]),
      responseHash: result[3],
      tag: result[4],
      lastUpdate: Number(result[5]),
    };
  }

  // ============================================================
  // Utilities
  // ============================================================

  private getSigner(): ethers.Signer | null {
    return this.signer;
  }

  isConnected(): boolean {
    return this.signer !== null;
  }

  async getNetwork(): Promise<string> {
    const network = await this.provider.getNetwork();
    return `Chain ID: ${network.chainId}`;
  }
}

// ============================================================
// Integration with TrustGraph
// ============================================================

import { AgentId } from "../core/types.js";
import { TrustGraph } from "./trust-graph.js";

export interface ERC8004Config {
  providerUrl: string;
  privateKey?: string;
  addresses?: {
    identityRegistry?: string;
    reputationRegistry?: string;
    validationRegistry?: string;
  };
}

export class ERC8004TrustIntegration {
  private erc8004: ERC8004Client;
  private trustGraph: TrustGraph;
  private agentIds: Map<AgentId, number> = new Map(); // Maps agentId to ERC-8004 agentId

  constructor(erc8004Config: ERC8004Config, trustGraph: TrustGraph) {
    this.erc8004 = new ERC8004Client(
      erc8004Config.providerUrl,
      erc8004Config.privateKey,
      erc8004Config.addresses
    );
    this.trustGraph = trustGraph;
  }

  async registerAgentForGame(agentId: AgentId, registration: AgentRegistration): Promise<number> {
    try {
      const agentURI = JSON.stringify({
        type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        ...registration
      });

      const erc8004AgentId = await this.erc8004.registerAgent(agentURI);
      this.agentIds.set(agentId, erc8004AgentId);
      return erc8004AgentId;
    } catch (error) {
      console.error(`Failed to register agent ${agentId} on ERC-8004:`, error);
      throw error;
    }
  }

  async syncTrustToERC8004(agentId: AgentId, trustScore: number): Promise<void> {
    const erc8004AgentId = this.agentIds.get(agentId);
    if (erc8004AgentId === undefined) {
      console.warn(`Agent ${agentId} not registered on ERC-8004`);
      return;
    }

    try {
      // Convert trust score (-1 to 1) to ERC-8004 format (0-100 with 2 decimals)
      const normalizedScore = Math.round((trustScore + 1) * 50 * 100); // Maps -1..1 to 0..10000
      const value = normalizedScore / 100;
      const decimals = 2;

      await this.erc8004.submitFeedback(erc8004AgentId, value, decimals, {
        tag1: "trust_score",
        tag2: "coordination_game",
        endpoint: "https://coordination.game"
      });
    } catch (error) {
      console.error(`Failed to sync trust for agent ${agentId}:`, error);
    }
  }

  async getAgentReputation(agentId: AgentId): Promise<AgentSummary | null> {
    const erc8004AgentId = this.agentIds.get(agentId);
    if (erc8004AgentId === undefined) {
      return null;
    }

    try {
      return await this.erc8004.getAgentSummary(erc8004AgentId);
    } catch (error) {
      console.error(`Failed to get reputation for agent ${agentId}:`, error);
      return null;
    }
  }

  getERC8004AgentId(agentId: AgentId): number | undefined {
    return this.agentIds.get(agentId);
  }

  isRegistered(agentId: AgentId): boolean {
    return this.agentIds.has(agentId);
  }
}
