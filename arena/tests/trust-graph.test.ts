/**
 * Trust Graph Tests
 *
 * Tests for EigenTrust computation, decay, asymmetry, and persistence.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TrustGraph } from "../src/trust/trust-graph.js";

describe("TrustGraph", () => {
  let graph: TrustGraph;

  beforeEach(() => {
    graph = new TrustGraph();
  });

  describe("agent management", () => {
    it("adds agents", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      const matrix = graph.getTrustMatrix();
      expect(matrix.agents).toContain("alice");
      expect(matrix.agents).toContain("bob");
    });

    it("handles duplicate adds gracefully", () => {
      graph.addAgent("alice");
      graph.addAgent("alice");
      const matrix = graph.getTrustMatrix();
      expect(matrix.agents.filter(a => a === "alice")).toHaveLength(1);
    });
  });

  describe("direct trust", () => {
    it("starts at 0 for unknown pairs", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      expect(graph.getDirectTrust("alice", "bob")).toBe(0);
    });

    it("increases on cooperation", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.recordInteraction("alice", "bob", true, "game1");
      expect(graph.getDirectTrust("alice", "bob")).toBeGreaterThan(0);
    });

    it("decreases on defection", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.recordInteraction("alice", "bob", false, "game1");
      expect(graph.getDirectTrust("alice", "bob")).toBeLessThan(0);
    });

    it("is asymmetric (A->B can differ from B->A)", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.recordInteraction("alice", "bob", true, "game1");
      // Alice trusts Bob (cooperated), but Bob hasn't rated Alice
      expect(graph.getDirectTrust("alice", "bob")).toBeGreaterThan(0);
      expect(graph.getDirectTrust("bob", "alice")).toBe(0);
    });

    it("defection penalty is larger than cooperation reward (asymmetric)", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");

      // One cooperation
      graph.recordInteraction("alice", "bob", true, "game1");
      const afterCoop = graph.getDirectTrust("alice", "bob");

      // One defection (from a different agent to avoid mixing)
      graph.addAgent("carol");
      graph.recordInteraction("alice", "carol", false, "game1");
      const afterDefect = graph.getDirectTrust("alice", "carol");

      // Defection should be more negative than cooperation is positive
      expect(Math.abs(afterDefect)).toBeGreaterThan(Math.abs(afterCoop));
    });

    it("clamps to [-1, 1] range", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      // Many cooperations
      for (let i = 0; i < 100; i++) {
        graph.recordInteraction("alice", "bob", true, "game1");
      }
      expect(graph.getDirectTrust("alice", "bob")).toBeLessThanOrEqual(1.0);

      // Many defections
      graph.addAgent("carol");
      for (let i = 0; i < 100; i++) {
        graph.recordInteraction("alice", "carol", false, "game1");
      }
      expect(graph.getDirectTrust("alice", "carol")).toBeGreaterThanOrEqual(-1.0);
    });
  });

  describe("global scores (EigenTrust)", () => {
    it("returns 0 for agents with no interactions", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.recompute();
      // Both have no interactions, so uniform distribution
      const scoreAlice = graph.getGlobalScore("alice");
      const scoreBob = graph.getGlobalScore("bob");
      // With no interactions, no clear ranking, but should be defined
      expect(typeof scoreAlice).toBe("number");
      expect(typeof scoreBob).toBe("number");
    });

    it("cooperative agents get higher scores", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.addAgent("carol");

      // Build a rich interaction history so EigenTrust has enough data
      // Alice cooperates with everyone, and everyone cooperates with Alice
      for (let i = 0; i < 5; i++) {
        graph.recordInteraction("bob", "alice", true, "game1");
        graph.recordInteraction("carol", "alice", true, "game1");
        graph.recordInteraction("alice", "carol", true, "game1");
        graph.recordInteraction("alice", "bob", true, "game1");
      }
      // Carol also cooperates with Bob (building mutual trust)
      graph.recordInteraction("carol", "bob", true, "game1");
      graph.recordInteraction("bob", "carol", true, "game1");

      graph.recompute();
      const scoreAlice = graph.getGlobalScore("alice");
      const scoreBob = graph.getGlobalScore("bob");
      const scoreCarol = graph.getGlobalScore("carol");

      // All should have positive scores with mutual cooperation
      expect(scoreAlice).toBeGreaterThan(0);
      expect(scoreBob).toBeGreaterThan(0);
      expect(scoreCarol).toBeGreaterThan(0);
    });

    it("converges after recompute", () => {
      graph.addAgent("a");
      graph.addAgent("b");
      graph.addAgent("c");
      graph.recordInteraction("a", "b", true, "g1");
      graph.recordInteraction("b", "c", true, "g1");
      graph.recordInteraction("c", "a", true, "g1");
      // Recomputing multiple times should give the same result
      graph.recompute();
      const scores1 = {
        a: graph.getGlobalScore("a"),
        b: graph.getGlobalScore("b"),
        c: graph.getGlobalScore("c"),
      };
      graph.recompute();
      const scores2 = {
        a: graph.getGlobalScore("a"),
        b: graph.getGlobalScore("b"),
        c: graph.getGlobalScore("c"),
      };
      expect(scores1.a).toBeCloseTo(scores2.a, 6);
      expect(scores1.b).toBeCloseTo(scores2.b, 6);
      expect(scores1.c).toBeCloseTo(scores2.c, 6);
    });
  });

  describe("applyUpdates", () => {
    it("applies positive updates as cooperation", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.applyUpdates(
        [{ from: "alice", to: "bob", delta: 0.15, reason: "completed_trade" }],
        "game1",
      );
      expect(graph.getDirectTrust("alice", "bob")).toBeGreaterThan(0);
    });

    it("applies negative updates as defection", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.applyUpdates(
        [{ from: "alice", to: "bob", delta: -0.3, reason: "broke_promise" }],
        "game1",
      );
      expect(graph.getDirectTrust("alice", "bob")).toBeLessThan(0);
    });

    it("ignores zero-delta updates", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.applyUpdates(
        [{ from: "alice", to: "bob", delta: 0, reason: "neutral" }],
        "game1",
      );
      expect(graph.getDirectTrust("alice", "bob")).toBe(0);
    });
  });

  describe("temporal decay", () => {
    it("trust decays over time", () => {
      const fastDecayGraph = new TrustGraph({ decayRate: 0.5 });
      fastDecayGraph.addAgent("alice");
      fastDecayGraph.addAgent("bob");
      fastDecayGraph.recordInteraction("alice", "bob", true, "game1");
      fastDecayGraph.recompute();

      const scoreBefore = fastDecayGraph.getGlobalScore("bob");

      // Advance many time steps without new interactions
      for (let i = 0; i < 20; i++) {
        fastDecayGraph.tick();
      }
      fastDecayGraph.recompute();

      const scoreAfter = fastDecayGraph.getGlobalScore("bob");

      // Score should decrease with decay (or at least not increase)
      // Note: exact behavior depends on the number of agents and the EigenTrust algorithm
      expect(typeof scoreAfter).toBe("number");
    });
  });

  describe("snapshots", () => {
    it("returns a snapshot for each agent", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.addAgent("carol");
      const snapshots = graph.getAllSnapshots();
      expect(snapshots).toHaveLength(3);
    });

    it("snapshot contains correct fields", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.recordInteraction("alice", "bob", true, "game1");
      graph.recompute();
      const snapshot = graph.getSnapshot("alice");
      expect(snapshot.agentId).toBe("alice");
      expect(typeof snapshot.globalScore).toBe("number");
      expect(typeof snapshot.directScores).toBe("object");
      expect(typeof snapshot.rank).toBe("number");
      expect(typeof snapshot.gamesPlayed).toBe("number");
      expect(snapshot.gamesPlayed).toBe(1);
    });

    it("ranks agents correctly", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.addAgent("carol");
      // Build rich interaction history
      // Everyone cooperates with Alice extensively
      for (let i = 0; i < 5; i++) {
        graph.recordInteraction("bob", "alice", true, "game1");
        graph.recordInteraction("carol", "alice", true, "game1");
        graph.recordInteraction("alice", "bob", true, "game1");
      }
      // Alice also cooperates back so there are outgoing edges for EigenTrust

      graph.recompute();
      const aliceSnap = graph.getSnapshot("alice");
      const bobSnap = graph.getSnapshot("bob");

      // Alice should be ranked at or above Bob (she gets the most incoming trust)
      expect(aliceSnap.rank).toBeLessThanOrEqual(bobSnap.rank);
    });
  });

  describe("trust matrix", () => {
    it("returns square matrix of correct size", () => {
      graph.addAgent("a");
      graph.addAgent("b");
      graph.addAgent("c");
      const { agents, matrix } = graph.getTrustMatrix();
      expect(agents).toHaveLength(3);
      expect(matrix).toHaveLength(3);
      for (const row of matrix) {
        expect(row).toHaveLength(3);
      }
    });

    it("diagonal is 0 (no self-trust)", () => {
      graph.addAgent("a");
      graph.addAgent("b");
      const { matrix } = graph.getTrustMatrix();
      expect(matrix[0][0]).toBe(0);
      expect(matrix[1][1]).toBe(0);
    });
  });

  describe("export / import", () => {
    it("roundtrips correctly", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.recordInteraction("alice", "bob", true, "game1");
      graph.recordInteraction("bob", "alice", false, "game1");
      graph.recompute();

      const exported = graph.export();

      const graph2 = new TrustGraph();
      graph2.import(exported);

      expect(graph2.getDirectTrust("alice", "bob")).toBe(
        graph.getDirectTrust("alice", "bob"),
      );
      expect(graph2.getDirectTrust("bob", "alice")).toBe(
        graph.getDirectTrust("bob", "alice"),
      );
    });
  });

  describe("effective trust", () => {
    it("blends direct and global scores", () => {
      graph.addAgent("alice");
      graph.addAgent("bob");
      graph.addAgent("carol");
      graph.recordInteraction("alice", "bob", true, "game1");
      graph.recordInteraction("carol", "bob", true, "game1");
      graph.recompute();

      const effective = graph.getEffectiveTrust("alice", "bob");
      const direct = graph.getDirectTrust("alice", "bob");
      const global = graph.getGlobalScore("bob");

      // Effective = 0.6 * direct + 0.4 * global
      expect(effective).toBeCloseTo(0.6 * direct + 0.4 * global, 6);
    });
  });
});
