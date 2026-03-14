/**
 * Event Bus Tests
 *
 * Tests for pub/sub event routing with visibility filtering.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "../src/core/event-bus.js";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe("spectator subscription", () => {
    it("spectators receive events with spectators=true", () => {
      const received: any[] = [];
      bus.subscribeSpectator((event) => received.push(event));

      bus.emit({
        type: "game.started",
        gameId: "g1",
        data: { test: true },
        timestamp: Date.now(),
        visibility: { agents: "all", spectators: true },
      });

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("game.started");
    });

    it("spectators do NOT receive events with spectators=false", () => {
      const received: any[] = [];
      bus.subscribeSpectator((event) => received.push(event));

      bus.emit({
        type: "game.action",
        gameId: "g1",
        data: { secret: true },
        timestamp: Date.now(),
        visibility: { agents: "all", spectators: false },
      });

      expect(received).toHaveLength(0);
    });

    it("spectators see private messages (dramatic irony)", () => {
      const received: any[] = [];
      bus.subscribeSpectator((event) => received.push(event));

      bus.emit({
        type: "chat.private",
        gameId: "g1",
        data: { message: { content: "secret deal", sender: "alice", recipient: "bob" } },
        timestamp: Date.now(),
        visibility: { agents: ["alice", "bob"], spectators: true },
      });

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("chat.private");
    });
  });

  describe("agent subscription", () => {
    it("agents receive events visible to 'all'", () => {
      const received: any[] = [];
      bus.subscribeAgent("alice", (event) => received.push(event));

      bus.emit({
        type: "game.round.start",
        gameId: "g1",
        data: {},
        timestamp: Date.now(),
        visibility: { agents: "all", spectators: true },
      });

      expect(received).toHaveLength(1);
    });

    it("agents receive events addressed to them specifically", () => {
      const aliceEvents: any[] = [];
      const bobEvents: any[] = [];
      bus.subscribeAgent("alice", (event) => aliceEvents.push(event));
      bus.subscribeAgent("bob", (event) => bobEvents.push(event));

      bus.emit({
        type: "chat.private",
        gameId: "g1",
        data: { message: "just for alice" },
        timestamp: Date.now(),
        visibility: { agents: ["alice"], spectators: true },
      });

      expect(aliceEvents).toHaveLength(1);
      expect(bobEvents).toHaveLength(0);
    });

    it("agents do NOT receive events for 'none'", () => {
      const received: any[] = [];
      bus.subscribeAgent("alice", (event) => received.push(event));

      bus.emit({
        type: "game.action",
        gameId: "g1",
        data: {},
        timestamp: Date.now(),
        visibility: { agents: "none", spectators: true },
      });

      expect(received).toHaveLength(0);
    });
  });

  describe("event history", () => {
    it("stores events in history", () => {
      bus.emit({
        type: "game.started",
        gameId: "g1",
        data: {},
        timestamp: Date.now(),
        visibility: { agents: "all", spectators: true },
      });
      bus.emit({
        type: "game.ended",
        gameId: "g1",
        data: {},
        timestamp: Date.now(),
        visibility: { agents: "all", spectators: true },
      });

      const history = bus.getHistory({ gameId: "g1", spectator: true });
      expect(history).toHaveLength(2);
    });

    it("filters history by event type", () => {
      bus.emit({
        type: "game.started",
        gameId: "g1",
        data: {},
        timestamp: Date.now(),
        visibility: { agents: "all", spectators: true },
      });
      bus.emit({
        type: "chat.public",
        gameId: "g1",
        data: {},
        timestamp: Date.now(),
        visibility: { agents: "all", spectators: true },
      });

      const chatOnly = bus.getHistory({
        gameId: "g1",
        spectator: true,
        types: ["chat.public"],
      });
      expect(chatOnly).toHaveLength(1);
      expect(chatOnly[0].type).toBe("chat.public");
    });

    it("filters history by game ID", () => {
      bus.emit({
        type: "game.started",
        gameId: "g1",
        data: {},
        timestamp: Date.now(),
        visibility: { agents: "all", spectators: true },
      });
      bus.emit({
        type: "game.started",
        gameId: "g2",
        data: {},
        timestamp: Date.now(),
        visibility: { agents: "all", spectators: true },
      });

      const g1Only = bus.getHistory({ gameId: "g1", spectator: true });
      expect(g1Only).toHaveLength(1);
    });
  });
});
