import type { GameState, ChatMessage, HexTile, AgentState, AgentIdentity } from '../store';

const AGENT_IDS = [
  'agent-0', 'agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5',
  'agent-6', 'agent-7', 'agent-8', 'agent-9', 'agent-10', 'agent-11',
];

function makeHex(q: number, r: number): HexTile {
  return {
    q,
    r,
    terrain: 'plains',
    productionNumber: 1,
    revealed: true,
    center: { x: q * 10, y: r * 10 },
    polygon: [
      { x: q * 10 + 5, y: r * 10 },
      { x: q * 10 + 10, y: r * 10 + 5 },
      { x: q * 10 + 5, y: r * 10 + 10 },
      { x: q * 10 - 5, y: r * 10 + 5 },
    ],
  };
}

function makeAgent(id: string): AgentState {
  return {
    id,
    name: `Agent ${id}`,
    strategy: 'cooperate',
    color: `#${id === 'agent-0' ? 'FF0000' : id === 'agent-1' ? '00FF00' : '0000FF'}`,
    resources: { wood: 10, stone: 5 },
    vp: 0,
    influence: 1,
    trust: 0.5,
    structures: { villages: 0, townships: 0, cities: 0, beacons: 0, tradePosts: 0, roads: 0 },
    armies: [],
  };
}

function baseState(gameId: string): GameState {
  return {
    gameId,
    round: 1,
    phase: 'planning',
    prizePoolWei: '1000000',
    payablePrizePoolWei: '1000000',
    slashedPrizePoolWei: '0',
    carryoverPrizePoolWei: '0',
    commonsHealth: { score: 100, payableFraction: 1.0 },
    activeCrisis: null,
    productionNumber: 1,
    wheelPosition: 0,
    productionWheel: [1, 2, 3, 4, 5, 6],
    hexGrid: [
      makeHex(0, 0), makeHex(1, 0), makeHex(-1, 0),
      makeHex(0, 1), makeHex(1, -1), makeHex(-1, 1),
      makeHex(0, -1), makeHex(1, 1), makeHex(-1, -1),
    ],
    worldMap: null,
    agents: { 'agent-0': makeAgent('agent-0') },
    pendingAgentInfo: {},
    agentOrder: ['agent-0'],
    ecosystemStates: [],
    commitments: [],
    attestations: [],
    behaviorTags: [],
    trustMatrix: null,
    winnerId: null,
    agentIdentities: {},
    attestationReadiness: [],
    participationReadiness: [],
  };
}

export function createIdleFixture(): GameState {
  return baseState('fixture-idle');
}

export function createChatBurstFixture(): GameState {
  const state = baseState('fixture-chat-burst');
  const messages: ChatMessage[] = [];
  const types: ChatMessage['type'][] = ['public', 'private', 'diary', 'system'];
  const senders = ['agent-0', 'agent-1', 'agent-2', 'agent-3'];

  for (let i = 0; i < 100; i++) {
    messages.push({
      id: `msg-${i}`,
      sender: senders[i % senders.length],
      recipient: types[i % 4] === 'private' ? 'agent-1' : undefined,
      content: `Chat message ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
      type: types[i % 4],
      round: Math.floor(i / 25) + 1,
      phase: 'planning',
      timestamp: 1000 + i * 100,
    });
  }

  (state as unknown as { messages: ChatMessage[] }).messages = messages;
  return state;
}

export function createTrustBurstFixture(): GameState {
  const agents: Record<string, AgentState> = {};
  const agentOrder: string[] = [];

  for (let i = 0; i < 12; i++) {
    const id = AGENT_IDS[i];
    agents[id] = makeAgent(id);
    agentOrder.push(id);
  }

  const matrix: number[][] = [];
  for (let i = 0; i < 12; i++) {
    const row: number[] = [];
    for (let j = 0; j < 12; j++) {
      row.push(i === j ? 1.0 : 0.5 + Math.abs(i - j) * 0.05);
    }
    matrix.push(row);
  }

  return {
    ...baseState('fixture-trust-burst'),
    agents,
    agentOrder,
    trustMatrix: { agents: agentOrder, matrix },
  };
}

export function createMaxPlayerFixture(): GameState {
  const state = createTrustBurstFixture();
  state.gameId = 'fixture-max-player';

  for (let i = 0; i < 5; i++) {
    state.commitments.push({
      id: `commitment-${i}`,
      type: 'cooperation',
      promisor: 'agent-0',
      counterparties: ['agent-1'],
      resolutionStatus: 'pending',
      summary: `Commitment ${i}`,
      dueByRound: state.round + 5,
      payoutShareBps: 500,
    });
  }

  for (let i = 0; i < 5; i++) {
    state.attestations.push({
      id: `attestation-${i}`,
      commitmentId: `commitment-${i}`,
      actor: 'agent-1',
      phase: 'planning',
      verdict: 'fulfilled',
      weight: 1.0,
    });
  }

  const messages: ChatMessage[] = [];
  for (let i = 0; i < 50; i++) {
    messages.push({
      id: `msg-max-${i}`,
      sender: AGENT_IDS[i % 12],
      content: `Max player message ${i}`,
      type: 'public',
      round: 1,
      phase: 'planning',
      timestamp: 1000 + i,
    });
  }
  (state as unknown as { messages: ChatMessage[] }).messages = messages;

  return state;
}

export function createReadinessFixture(): GameState {
  const state = createMaxPlayerFixture();
  state.gameId = 'fixture-readiness';

  const identities: Record<string, AgentIdentity> = {};
  for (let i = 0; i < 6; i++) {
    const id = AGENT_IDS[i];
    identities[id] = {
      agentId: id,
      walletAddress: `0x${String(i).repeat(40)}`,
      name: `Agent ${id}`,
      mcpEndpoint: i % 2 === 0 ? `http://mcp-${i}.local:3100` : undefined,
      capabilities: i % 3 === 0 ? ['trust-modeling', 'commitment-tracking'] : ['commitment-tracking'],
      registeredAt: 1700000000 + i * 1000,
      chainId: 8004,
    };
  }
  state.agentIdentities = identities;

  state.attestationReadiness = [
    { uid: 'att-read-0', schema: 'agent-performance-v1', gameId: 'fixture-readiness', agentId: 'agent-0', placement: 1, score: 95, trustDelta: 0.1, cooperationRate: 0.85, betrayalCount: 2, ecosystemImpact: 0.05, attestedAt: 1700000100 },
    { uid: 'att-read-1', schema: 'agent-performance-v1', gameId: 'fixture-readiness', agentId: 'agent-1', placement: 2, score: 88, trustDelta: 0.05, cooperationRate: 0.78, betrayalCount: 4, ecosystemImpact: -0.02, attestedAt: 1700000200 },
    { uid: 'att-read-2', schema: 'agent-performance-v1', gameId: 'fixture-readiness', agentId: 'agent-2', placement: 3, score: 82, trustDelta: -0.02, cooperationRate: 0.65, betrayalCount: 7, ecosystemImpact: -0.08, attestedAt: 1700000300 },
  ];

  state.participationReadiness = [
    { agentId: 'agent-0', status: 'active', mcpConnected: true, lastSeenAt: 1700000100, gamesPlayed: 12, trustScore: 0.92 },
    { agentId: 'agent-1', status: 'active', mcpConnected: true, lastSeenAt: 1700000200, gamesPlayed: 8, trustScore: 0.85 },
    { agentId: 'agent-2', status: 'registered', mcpConnected: true, lastSeenAt: 1700000300, gamesPlayed: 3, trustScore: 0.71 },
    { agentId: 'agent-3', status: 'inactive', mcpConnected: false, lastSeenAt: 1699999000, gamesPlayed: 1, trustScore: 0.45 },
    { agentId: 'agent-4', status: 'active', mcpConnected: true, lastSeenAt: 1700000400, gamesPlayed: 15, trustScore: 0.88 },
    { agentId: 'agent-5', status: 'unknown', mcpConnected: false, lastSeenAt: undefined, gamesPlayed: 0, trustScore: undefined },
  ];

  return state;
}

export type { GameState, ChatMessage, HexTile, AgentState };
