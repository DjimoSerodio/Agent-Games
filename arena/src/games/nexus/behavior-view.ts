import { BehaviorTag, VisibleBehaviorTag } from "./types.js";

export function projectVisibleBehaviorTags(tags: BehaviorTag[]): VisibleBehaviorTag[] {
  return tags.map((tag) => ({
    id: tag.id,
    round: tag.round,
    actor: tag.actor,
    kind: tag.kind,
    severity: tag.severity,
    description: tag.description,
  }));
}
