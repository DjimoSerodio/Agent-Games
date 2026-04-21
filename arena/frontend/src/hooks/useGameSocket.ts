import { useEffect, useRef } from 'react';
import { AGENT_COLORS } from '../lib/colors';
import { getBackendWebSocketUrl } from '../lib/backend';
import { formatAgentName } from '../lib/format';
import { useGameStore, type AgentState, type Attestation, type Commitment, type HexTile, type VisibleBehaviorTag } from '../store';

function terrainFromWorldRegion(source: Record<string, unknown>): string {
  if (typeof source.terrain === 'string' && source.terrain.length > 0) return source.terrain;

  const resource = typeof source.primaryResource === 'string' ? source.primaryResource : '';
  if (resource === 'grain') return 'plains';
  if (resource === 'timber') return 'forest';
  if (resource === 'ore') return 'mountains';
  if (resource === 'energy') return 'commons';
  if (resource === 'fish' || resource === 'water') return 'rivers';

  const biome = typeof source.biome === 'string' ? source.biome : '';
  if (biome === 'volcanic') return 'mountains';

  return 'plains';
}

function toWelcomeHexTiles(worldMap: Record<string, unknown>): HexTile[] {
  const regions = Array.isArray(worldMap.regions) ? worldMap.regions : [];
  return regions.flatMap((region) => {
    if (!region || typeof region !== 'object') return [];
    const source = region as Record<string, unknown>;
    const coord = source.coord && typeof source.coord === 'object' ? (source.coord as Record<string, unknown>) : null;
    const q = coord ? Number(coord.q) : Number.NaN;
    const r = coord ? Number(coord.r) : Number.NaN;

    if (!Number.isFinite(q) || !Number.isFinite(r)) return [];

    const anchor = source.anchor && typeof source.anchor === 'object'
      ? (source.anchor as { x: number; y: number })
      : undefined;

    return [{
      q,
      r,
      terrain: terrainFromWorldRegion(source),
      productionNumber: Number(source.productionNumber ?? 0),
      revealed: true,
      revealedBy: [],
      regionId: typeof source.id === 'string' ? source.id : undefined,
      regionName: typeof source.name === 'string' ? source.name : undefined,
      biome: typeof source.biome === 'string' ? source.biome : undefined,
      primaryResource: typeof source.primaryResource === 'string' ? source.primaryResource : undefined,
      center: anchor,
      polygon: Array.isArray(source.polygon) ? (source.polygon as Array<{ x: number; y: number }>) : undefined,
      ecosystemIds: Array.isArray(source.ecosystemIds) ? (source.ecosystemIds as string[]) : undefined,
    }];
  });
}

function toHexTiles(hexes: unknown[]): HexTile[] {
  return hexes.map((hex) => {
    const source = hex as Record<string, unknown>;
    return {
      q: Number(source.q ?? 0),
      r: Number(source.r ?? 0),
      terrain: String(source.terrain ?? 'wasteland'),
      productionNumber: Number(source.productionNumber ?? 0),
      revealed: Boolean(source.revealed ?? true),
      revealedBy: Array.isArray(source.revealedBy) ? (source.revealedBy as string[]) : [],
      regionId: source.regionId ? String(source.regionId) : undefined,
      regionName: source.regionName ? String(source.regionName) : undefined,
      biome: source.biome ? String(source.biome) : undefined,
      primaryResource: source.primaryResource ? String(source.primaryResource) : undefined,
      center: (source.center as { x: number; y: number } | undefined) ?? undefined,
      polygon: (source.polygon as Array<{ x: number; y: number }> | undefined) ?? undefined,
      ecosystemIds: Array.isArray(source.ecosystemIds) ? (source.ecosystemIds as string[]) : undefined,
    };
  });
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]) {
  const byId = new Map<string, T>();
  existing.forEach((item) => byId.set(item.id, item));
  incoming.forEach((item) => byId.set(item.id, { ...(byId.get(item.id) ?? {}), ...item } as T));
  return Array.from(byId.values());
}

function agentColor(agentOrder: string[], id: string, index: number) {
  const colorIndex = agentOrder.indexOf(id) >= 0 ? agentOrder.indexOf(id) : index;
  return AGENT_COLORS[(colorIndex >= 0 ? colorIndex : index) % AGENT_COLORS.length];
}

function toVisibleBehaviorTag(source: Record<string, unknown>): VisibleBehaviorTag | null {
  const id = typeof source.id === 'string' ? source.id : null;
  const actor = typeof source.actor === 'string' ? source.actor : null;
  const kind = typeof source.kind === 'string' ? source.kind : null;
  const severity = typeof source.severity === 'string' ? source.severity : null;
  const description = typeof source.description === 'string' ? source.description.trim() : null;
  const round = typeof source.round === 'number' ? source.round : Number(source.round);

  if (!id || !actor || !kind || !severity || !description || !Number.isFinite(round)) {
    return null;
  }

  return {
    id,
    round,
    actor,
    kind,
    severity,
    description,
  };
}

function toVisibleBehaviorTags(source: unknown[]): VisibleBehaviorTag[] {
  return source.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const tag = toVisibleBehaviorTag(item as Record<string, unknown>);
    return tag ? [tag] : [];
  });
}

export function useGameSocket() {
  const setConnectionStatus = useGameStore((state) => state.setConnectionStatus);
  const setGameState = useGameStore((state) => state.setGameState);
  const addMessage = useGameStore((state) => state.addMessage);
  const clearMessages = useGameStore((state) => state.clearMessages);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      setConnectionStatus('connecting');
      const ws = new WebSocket(getBackendWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => setConnectionStatus('connected');

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type: string; data?: Record<string, unknown>; event?: { type: string; gameId?: string; data?: Record<string, unknown> } };
          const current = useGameStore.getState().gameState;

          if (message.type === 'welcome') {
            if (message.data?.trustGraph) setGameState({ trustMatrix: message.data.trustGraph as { agents: string[]; matrix: number[][] } });
            if (message.data?.worldMap) {
              const worldMap = message.data.worldMap as Record<string, unknown>;
              const welcomeHexTiles = toWelcomeHexTiles(worldMap);
              setGameState({
                worldMap,
                hexGrid: current.hexGrid.length > 0 ? current.hexGrid : welcomeHexTiles,
                ecosystemStates: Array.isArray(worldMap.ecosystems) ? (worldMap.ecosystems as Array<Record<string, unknown>>) : current.ecosystemStates,
              });
            }
            return;
          }

          if (message.type === 'trust_matrix') {
            setGameState({ trustMatrix: message.data as { agents: string[]; matrix: number[][] } });
            return;
          }

          if (message.type !== 'game_event' || !message.event) return;
          const eventType = message.event.type;
          const data = message.event.data ?? {};

          switch (eventType) {
            case 'game.started': {
              const players = Array.isArray(data.players) ? (data.players as string[]) : [];
              const nextAgents: Record<string, AgentState> = {};
              players.forEach((agentId, index) => {
                nextAgents[agentId] = {
                  id: agentId,
                  name: `Agent ${index + 1}`,
                  strategy: 'unclassified',
                  color: agentColor(players, agentId, index),
                  vp: 0,
                  influence: 0,
                  trust: 0,
                  longestRoad: 0,
                  resources: { grain: 0, timber: 0, ore: 0, fish: 0, water: 0, energy: 0 },
                  structures: { villages: 0, townships: 0, cities: 0, beacons: 0, tradePosts: 0, roads: 0 },
                  structureLocations: [],
                };
              });

              clearMessages();
              setGameState({
                gameId: message.event.gameId ?? null,
                round: 0,
                phase: 'setup',
                winnerId: null,
                activeCrisis: null,
                commitments: [],
                attestations: [],
                behaviorTags: [],
                agentIdentities: {},
                attestationReadiness: [],
                participationReadiness: [],
                productionNumber: 0,
                wheelPosition: 0,
                productionWheel: [],
                agentOrder: players,
                agents: nextAgents,
              });
              break;
            }

            case 'game.agent_info': {
              const infos = Array.isArray(data.agents) ? (data.agents as Array<{ id: string; name: string; strategy: string }>) : [];
              const pending = { ...current.pendingAgentInfo };
              const agents = { ...current.agents };
              infos.forEach((info, index) => {
                pending[info.id] = { name: info.name, strategy: info.strategy };
                agents[info.id] = {
                  ...(agents[info.id] ?? {}),
                  id: info.id,
                  name: info.name,
                  strategy: info.strategy,
                  color: agents[info.id]?.color ?? agentColor(current.agentOrder, info.id, index),
                };
              });
              setGameState({ pendingAgentInfo: pending, agents });
              break;
            }

            case 'game.map_data': {
              const updates: Record<string, unknown> = {};
              if (Array.isArray(data.hexes)) updates.hexGrid = toHexTiles(data.hexes);
              if (Array.isArray(data.productionWheel)) updates.productionWheel = data.productionWheel as number[];
              if (data.worldMap) {
                updates.worldMap = data.worldMap;
                const map = data.worldMap as Record<string, unknown>;
                if (current.ecosystemStates.length === 0 && Array.isArray(map.ecosystems)) {
                  updates.ecosystemStates = map.ecosystems as Array<Record<string, unknown>>;
                }
              }
              setGameState(updates);
              break;
            }

            case 'game.state_update': {
              const updates: Record<string, unknown> = {};
              if (data.round !== undefined) updates.round = data.round;
              if (data.phase !== undefined) updates.phase = data.phase;
              if (data.activeCrisis !== undefined) updates.activeCrisis = data.activeCrisis;
              if (data.wheelPosition !== undefined) updates.wheelPosition = data.wheelPosition;
              if (data.prizePool !== undefined) updates.prizePoolWei = String(data.prizePool);
              if (data.payablePrizePool !== undefined) updates.payablePrizePoolWei = String(data.payablePrizePool);
              if (data.slashedPrizePool !== undefined) updates.slashedPrizePoolWei = String(data.slashedPrizePool);
              if (data.carryoverPrizePool !== undefined) updates.carryoverPrizePoolWei = String(data.carryoverPrizePool);
              if (data.commonsHealth !== undefined) updates.commonsHealth = data.commonsHealth;
              if (Array.isArray(data.ecosystems)) updates.ecosystemStates = data.ecosystems;
              if (Array.isArray(data.commitments)) updates.commitments = mergeById(current.commitments, data.commitments as Commitment[]);
              if (Array.isArray(data.attestations)) updates.attestations = mergeById(current.attestations, data.attestations as Attestation[]);
              if (Array.isArray(data.behaviorTags)) updates.behaviorTags = toVisibleBehaviorTags(data.behaviorTags);

              if (data.agentStates && typeof data.agentStates === 'object') {
                const source = data.agentStates as Record<string, AgentState>;
                const agents = { ...current.agents };
                const ids = Object.keys(source);
                ids.forEach((id, index) => {
                  agents[id] = {
                    ...agents[id],
                    ...source[id],
                    id,
                    color: agents[id]?.color ?? agentColor(current.agentOrder, id, index),
                  };
                });
                updates.agents = agents;
                if (current.agentOrder.length === 0) updates.agentOrder = ids;
              }

              setGameState(updates);
              break;
            }

            case 'game.round.start':
              if (data.round !== undefined) setGameState({ round: Number(data.round) });
              break;

            case 'game.phase.change':
              if (data.phase !== undefined) setGameState({ phase: String(data.phase) });
              break;

            case 'game.action':
              if (data.type === 'production') {
                setGameState({
                  productionNumber: Number(data.productionNumber ?? 0),
                  wheelPosition: Number(data.wheelPosition ?? current.wheelPosition),
                });
              }
              break;

            case 'chat.public':
            case 'chat.private':
            case 'chat.diary': {
              const payload = data.message as { sender: string; recipient?: string; content: string; round?: number; phase?: string } | undefined;
              if (!payload) break;
              addMessage({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                sender: payload.sender,
                recipient: payload.recipient,
                content: payload.content,
                type: eventType === 'chat.public' ? 'public' : eventType === 'chat.private' ? 'private' : 'diary',
                round: payload.round ?? current.round,
                phase: payload.phase ?? current.phase,
                timestamp: Date.now(),
              });
              break;
            }

            case 'trust.snapshot':
              if (Array.isArray(data.agents) && Array.isArray(data.matrix)) {
                setGameState({ trustMatrix: { agents: data.agents as string[], matrix: data.matrix as number[][] } });
              }
              break;

            case 'trust.updated': {
              if (Array.isArray(data.snapshots)) {
                const snapshots = data.snapshots as Array<{ agentId: string; globalScore?: number; directScores?: Record<string, number> }>;
                const ids = snapshots.map((s) => s.agentId);
                const matrix = snapshots.map((snapshot) => ids.map((targetId) => (snapshot.agentId === targetId ? 0 : Number(snapshot.directScores?.[targetId] ?? 0))));
                const agents = { ...current.agents };
                snapshots.forEach((snapshot, index) => {
                  agents[snapshot.agentId] = {
                    ...agents[snapshot.agentId],
                    id: snapshot.agentId,
                    trust: snapshot.globalScore ?? 0,
                    color: agents[snapshot.agentId]?.color ?? agentColor(current.agentOrder, snapshot.agentId, index),
                  };
                });
                setGameState({ trustMatrix: { agents: ids, matrix }, agents });
              }
              break;
            }

            case 'crisis.triggered':
              setGameState({ activeCrisis: (data.crisis as { name?: string; type?: string; description?: string } | undefined) ?? null });
              break;

            case 'crisis.resolved':
              setGameState({ activeCrisis: null });
              break;

            case 'commitment.detected': {
              if (data.commitment) setGameState({ commitments: mergeById(current.commitments, [data.commitment as Commitment]) });
              break;
            }

            case 'commitment.attested': {
              if (data.attestation) setGameState({ attestations: mergeById(current.attestations, [data.attestation as Attestation]) });
              break;
            }

            case 'commitment.resolved': {
              const commitmentId = data.commitmentId ? String(data.commitmentId) : '';
              if (!commitmentId) break;
              setGameState({
                commitments: mergeById(current.commitments, [{
                  id: commitmentId,
                  resolutionStatus: data.status ? String(data.status) : undefined,
                  summary: data.summary ? String(data.summary) : undefined,
                }]),
              });
              break;
            }

            case 'behavior.tagged': {
              const tag = toVisibleBehaviorTag(data as Record<string, unknown>);
              if (!tag) break;
              const existing = current.behaviorTags.filter((item) => String(item.id) !== String(tag.id));
              setGameState({ behaviorTags: [tag, ...existing] });
              break;
            }

            case 'prize.slashed':
              setGameState({
                prizePoolWei: String(data.prizePoolWei ?? current.prizePoolWei),
                payablePrizePoolWei: String(data.payablePrizePoolWei ?? current.payablePrizePoolWei),
                slashedPrizePoolWei: String(data.slashedPrizePoolWei ?? current.slashedPrizePoolWei),
                carryoverPrizePoolWei: String(data.carryoverPrizePoolWei ?? current.carryoverPrizePoolWei),
                commonsHealth: (data.commonsHealth as { score: number; payableFraction: number; reasons?: string[] } | null | undefined) ?? current.commonsHealth,
              });
              break;

            case 'game.ended':
            case 'game.result':
              if (data.winner) {
                setGameState({ winnerId: String(data.winner) });
                addMessage({
                  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  sender: 'observatory',
                  content: `${formatAgentName(String(data.winner), { agents: current.agents, pendingAgentInfo: current.pendingAgentInfo })} wins the game.`,
                  type: 'system',
                  round: current.round,
                  phase: 'end',
                  timestamp: Date.now(),
                });
              }
              break;

            default:
              break;
          }
        } catch (err) {
          console.error('Failed to parse websocket message', err);
        }
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [addMessage, clearMessages, setConnectionStatus, setGameState]);

  return {
    sendMessage: (msg: unknown) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
    },
  };
}
