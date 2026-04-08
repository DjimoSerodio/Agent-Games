import { createServer as createHttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createIdleFixture, createChatBurstFixture, createTrustBurstFixture, createMaxPlayerFixture, createReadinessFixture } from './frontend/src/harness/fixtures.ts';

const FIXTURES = {
  idle: createIdleFixture,
  'chat-burst': createChatBurstFixture,
  'trust-burst': createTrustBurstFixture,
  'max-player': createMaxPlayerFixture,
  readiness: createReadinessFixture,
};

const PORT = Number(process.env.MOCK_QA_PORT ?? 3002);

function asPlayers(state) {
  return state.agentOrder.length > 0 ? state.agentOrder : Object.keys(state.agents);
}

function makeWorldMap(state) {
  return {
    title: 'Fixture World',
    ecosystems: state.ecosystemStates,
    regions: state.hexGrid.map((hex) => ({
      id: `${hex.q},${hex.r}`,
      name: hex.regionName ?? `${hex.terrain} region`,
      biome: hex.biome ?? hex.terrain,
      primaryResource: hex.primaryResource ?? hex.terrain,
      hexes: [{ q: hex.q, r: hex.r }],
    })),
  };
}

function send(ws, payload) {
  ws.send(JSON.stringify(payload));
}

function seedFixture(ws, fixtureName) {
  const factory = FIXTURES[fixtureName] ?? FIXTURES.idle;
  const state = factory();
  const players = asPlayers(state);

  send(ws, {
    type: 'welcome',
    data: {
      trustGraph: state.trustMatrix,
      worldMap: makeWorldMap(state),
    },
  });

  send(ws, {
    type: 'game_event',
    event: {
      type: 'game.started',
      gameId: state.gameId,
      data: { players },
    },
  });

  send(ws, {
    type: 'game_event',
    event: {
      type: 'game.agent_info',
      gameId: state.gameId,
      data: {
        agents: players.map((agentId, index) => ({
          id: agentId,
          name: state.agentIdentities[agentId]?.name ?? state.agents[agentId]?.name ?? `Agent ${index}`,
          strategy: state.agents[agentId]?.strategy ?? 'cooperate',
        })),
      },
    },
  });

  send(ws, {
    type: 'game_event',
    event: {
      type: 'game.map_data',
      gameId: state.gameId,
      data: {
        hexes: state.hexGrid,
        productionWheel: state.productionWheel,
        worldMap: makeWorldMap(state),
      },
    },
  });

  send(ws, {
    type: 'game_event',
    event: {
      type: 'game.state_update',
      gameId: state.gameId,
      data: {
        round: state.round,
        phase: state.phase,
        activeCrisis: state.activeCrisis,
        wheelPosition: state.wheelPosition,
        prizePool: state.prizePoolWei,
        payablePrizePool: state.payablePrizePoolWei,
        slashedPrizePool: state.slashedPrizePoolWei,
        carryoverPrizePool: state.carryoverPrizePoolWei,
        commonsHealth: state.commonsHealth,
        ecosystems: state.ecosystemStates,
        commitments: state.commitments,
        attestations: state.attestations,
        behaviorTags: state.behaviorTags,
        agentStates: state.agents,
      },
    },
  });

  if (state.trustMatrix) {
    send(ws, { type: 'trust_matrix', data: state.trustMatrix });
  }

  for (const message of state.messages ?? []) {
    const suffix = message.type === 'system' ? 'public' : message.type;
    send(ws, {
      type: 'game_event',
      event: {
        type: `chat.${suffix}`,
        gameId: state.gameId,
        data: {
          message: {
            sender: message.sender,
            recipient: message.recipient,
            content: message.content,
            round: message.round,
            phase: message.phase,
          },
        },
      },
    });
  }

  if (fixtureName === 'chat-burst') {
    for (let i = 100; i < 125; i += 1) {
      send(ws, {
        type: 'game_event',
        event: {
          type: 'chat.public',
          gameId: state.gameId,
          data: {
            message: {
              sender: players[i % players.length] ?? 'agent-0',
              content: `Chat message ${i}: Follow-up burst verification payload.`,
              round: Math.floor(i / 25) + 1,
              phase: state.phase,
            },
          },
        },
      });
    }
  }
}

const server = createHttpServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const fixtureName = url.searchParams.get('fixture') ?? 'idle';

  if (url.pathname === '/fixture') {
    const factory = FIXTURES[fixtureName] ?? FIXTURES.idle;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(factory()));
    return;
  }

  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`mock qa server fixture=${fixtureName}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const fixtureName = url.searchParams.get('fixture') ?? 'idle';
  seedFixture(ws, fixtureName);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock QA websocket server listening on ws://127.0.0.1:${PORT}`);
});
