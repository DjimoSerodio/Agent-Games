import { describe, expect, it } from "vitest";
import { projectVisibleBehaviorTags } from "../src/games/nexus/behavior-view.js";
import { BehaviorTag } from "../src/games/nexus/types.js";

describe("projectVisibleBehaviorTags", () => {
  it("projects public behavior tags without trust hints or related-agent detail", () => {
    const tags: BehaviorTag[] = [
      {
        id: "tag-1",
        round: 3,
        actor: "agent-a",
        kind: "sabotage",
        severity: "high",
        description: "Damaged a shared ecosystem.",
        relatedAgentId: "agent-b",
        trustDeltaHint: -0.25,
      },
    ];

    expect(projectVisibleBehaviorTags(tags)).toEqual([
      {
        id: "tag-1",
        round: 3,
        actor: "agent-a",
        kind: "sabotage",
        severity: "high",
        description: "Damaged a shared ecosystem.",
      },
    ]);
  });
});
