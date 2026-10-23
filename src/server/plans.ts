import "server-only";
import { FREE_MAX_MINUTES } from "@tunnel/shared/durations";
import { quotas } from "./cli/config";

/**
 * What a workspace may do, decided on the server only. Every client (dashboard, CLI, VS Code) is checked against
 * this, so nothing a client sends can lengthen a session past its plan.
 */
export type PlanLimits = {
  tier: "free";
  /** Longest session that can be started. */
  maxDurationMinutes: number;
};

export async function getPlanLimits(workspaceId: string): Promise<PlanLimits> {
  void workspaceId; // per-workspace entitlements (Preview Pass) come next
  return { tier: "free", maxDurationMinutes: Math.min(FREE_MAX_MINUTES, quotas().maxShareMs / 60_000) };
}
