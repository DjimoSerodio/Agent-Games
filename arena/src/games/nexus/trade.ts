import { AgentId, ActionOutcome, TrustUpdate } from "../../core/types.js";
import { TragedyAction, ResourceInventory, ResourceType } from "./types.js";

export function resolveMatchedTrades(
  ctx: any,
  submissions: Map<string, TragedyAction>,
  outcomes: ActionOutcome[],
  trustUpdates: TrustUpdate[],
  resolvedTrades: Array<{ from: AgentId; to: AgentId; round: number }>,
): void {
  const pairs = new Map<string, TragedyAction[]>();
  for (const [key, action] of submissions) {
    const pairKey = key.split(":")[0];
    if (!pairs.has(pairKey)) pairs.set(pairKey, []);
    pairs.get(pairKey)!.push(action);
  }

  for (const [, actions] of pairs) {
    if (actions.length === 2) {
      const [a1, a2] = actions;
      const ps1 = ctx.state.playerStates.get(a1.agentId)!;
      const ps2 = ctx.state.playerStates.get(a2.agentId)!;

      const give1 = (a1.params.give as Partial<ResourceInventory>) || {};
      const receive1 = (a1.params.receive as Partial<ResourceInventory>) || {};
      const give2 = (a2.params.give as Partial<ResourceInventory>) || {};
      const receive2 = (a2.params.receive as Partial<ResourceInventory>) || {};

      if (!ctx.resourceBagsEqual(give1, receive2) || !ctx.resourceBagsEqual(give2, receive1)) {
        outcomes.push(ctx.failOutcome(a1, `Trade with ${a2.agentId} failed - terms did not match`));
        outcomes.push(ctx.failOutcome(a2, `Trade with ${a1.agentId} failed - terms did not match`));
        continue;
      }

      let valid = true;
      for (const [res, amount] of Object.entries(give1)) {
        const resType = res as ResourceType;
        const amt = amount as number;
        if (amt < 0 || ps1.resources[resType] < amt) {
          valid = false;
          break;
        }
      }
      if (valid) {
        for (const [res, amount] of Object.entries(give2)) {
          const resType = res as ResourceType;
          const amt = amount as number;
          if (amt < 0 || ps2.resources[resType] < amt) {
            valid = false;
            break;
          }
        }
      }

      const total1 = Object.values(give1).reduce((s, v) => s + ((v as number) || 0), 0);
      const total2 = Object.values(give2).reduce((s, v) => s + ((v as number) || 0), 0);
      if (total1 === 0 && total2 === 0) valid = false;

      if (!valid) {
        outcomes.push(ctx.failOutcome(a1, `Trade with ${a2.agentId} failed - insufficient resources`));
        continue;
      }

      for (const [res, amount] of Object.entries(give1)) {
        const resType = res as ResourceType;
        const amt = amount as number;
        ps1.resources[resType] -= amt;
        ps2.resources[resType] += amt;
      }
      for (const [res, amount] of Object.entries(give2)) {
        const resType = res as ResourceType;
        const amt = amount as number;
        ps2.resources[resType] -= amt;
        ps1.resources[resType] += amt;
      }

      resolvedTrades.push({ from: a1.agentId, to: a2.agentId, round: ctx.state.round });
      ctx.recordBehaviorTag(a1.agentId, "stewardship", a2.agentId, `Completed a negotiated trade with ${a2.agentId}`, "low", 0.1);
      ctx.recordBehaviorTag(a2.agentId, "stewardship", a1.agentId, `Completed a negotiated trade with ${a1.agentId}`, "low", 0.1);

      trustUpdates.push(
        { from: a1.agentId, to: a2.agentId, delta: 0.15, reason: "completed_trade" },
        { from: a2.agentId, to: a1.agentId, delta: 0.15, reason: "completed_trade" },
      );

      ps1.influence += 1;
      ps2.influence += 1;

      outcomes.push(ctx.successOutcome(a1, `Trade completed with ${a2.agentId}`, []));
    } else if (actions.length === 1) {
      const a = actions[0];
      const partnerId = a.params.partnerId as AgentId;
      trustUpdates.push({ from: a.agentId, to: partnerId, delta: -0.05, reason: "trade_not_reciprocated" });
      outcomes.push(ctx.failOutcome(a, `Trade with ${partnerId} failed - partner did not submit`));
    }
  }
}
