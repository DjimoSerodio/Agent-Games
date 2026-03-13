/**
 * Observable Event Bus
 *
 * Central nervous system of the arena. All game events, messages,
 * trust updates, and market trades flow through here.
 *
 * Spectators subscribe to the full feed.
 * Agents only receive events matching their visibility filter.
 */

import { ArenaEvent, EventType, AgentId } from "./types.js";

export type EventHandler = (event: ArenaEvent) => void;

interface Subscription {
  id: string;
  filter: EventFilter;
  handler: EventHandler;
}

interface EventFilter {
  types?: EventType[];
  gameId?: string;
  /** If set, only receive events visible to this agent */
  agentId?: AgentId;
  /** If true, receive ALL events (spectator mode) */
  spectator?: boolean;
}

export class EventBus {
  private subscriptions: Map<string, Subscription> = new Map();
  private history: ArenaEvent[] = [];
  private nextSubId = 0;

  /**
   * Publish an event to all matching subscribers
   */
  emit(event: ArenaEvent): void {
    this.history.push(event);

    for (const sub of this.subscriptions.values()) {
      if (this.matches(event, sub.filter)) {
        try {
          sub.handler(event);
        } catch (err) {
          console.error(`Event handler error [${sub.id}]:`, err);
        }
      }
    }
  }

  /**
   * Subscribe to events matching a filter
   * Returns an unsubscribe function
   */
  subscribe(filter: EventFilter, handler: EventHandler): () => void {
    const id = `sub_${this.nextSubId++}`;
    this.subscriptions.set(id, { id, filter, handler });
    return () => this.subscriptions.delete(id);
  }

  /**
   * Subscribe as a spectator (sees everything including private messages)
   */
  subscribeSpectator(handler: EventHandler, gameId?: string): () => void {
    return this.subscribe(
      { spectator: true, gameId },
      handler,
    );
  }

  /**
   * Subscribe as an agent (only sees events visible to them)
   */
  subscribeAgent(agentId: AgentId, handler: EventHandler, gameId?: string): () => void {
    return this.subscribe(
      { agentId, gameId },
      handler,
    );
  }

  /**
   * Get event history, optionally filtered
   */
  getHistory(filter?: EventFilter): ArenaEvent[] {
    if (!filter) return [...this.history];
    return this.history.filter((e) => this.matches(e, filter));
  }

  /**
   * Clear history (for testing)
   */
  clear(): void {
    this.history = [];
    this.subscriptions.clear();
  }

  private matches(event: ArenaEvent, filter: EventFilter): boolean {
    // Type filter
    if (filter.types && !filter.types.includes(event.type)) {
      return false;
    }

    // Game filter
    if (filter.gameId && event.gameId !== filter.gameId) {
      return false;
    }

    // Visibility check
    if (filter.spectator) {
      // Spectators see everything marked as spectator-visible
      return event.visibility.spectators;
    }

    if (filter.agentId) {
      // Agents only see events visible to them
      const vis = event.visibility.agents;
      if (vis === "all") return true;
      if (vis === "none") return false;
      return vis.includes(filter.agentId);
    }

    // No visibility filter = see everything
    return true;
  }
}

/** Singleton event bus for the arena */
export const eventBus = new EventBus();
