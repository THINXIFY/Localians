"use server";

import { revalidatePath } from "next/cache";
import { NotFoundError } from "../errors";
import { NameError } from "../preview-names";
import { rateLimit } from "../rate-limit";
import { getSession } from "../session";
import { cancelUpgradeRequest, createUpgradeRequest, submitTxHash, UpgradeError } from "../upgrades";
import { type ActionResult, SESSION_EXPIRED } from "./result";

function failure(error: unknown, context: string): ActionResult<never> {
  if (error instanceof UpgradeError) return { ok: false, error: error.message };
  if (error instanceof NameError) return { ok: false, error: error.message, fieldErrors: { name: error.message } };
  if (error instanceof NotFoundError) return { ok: false, error: "That project or order doesn't exist, or you don't have access to it." };
  console.error(`[action:${context}]`, error instanceof Error ? error.message : "Unknown error");
  return { ok: false, error: "Something went wrong. Please try again." };
}

async function limited(userId: string) {
  return !(await rateLimit(`upgrade:${userId}`, 20, 60 * 60_000)).allowed;
}

/** "Upgrade for $5": creates (or returns) the project's open upgrade request. */
export async function requestUpgradeAction(
  projectId: string,
  name?: string | null,
): Promise<ActionResult<{ orderId: string; status: "PENDING" | "UNDER_REVIEW"; txHash: string | null; created: boolean }>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (await limited(session.user.id)) return { ok: false, error: "Too many requests. Try again later." };
  try {
    const { request, created } = await createUpgradeRequest(session.user.id, String(projectId), { name: name ? String(name) : null });
    revalidatePath("/dashboard", "layout");
    // An open order for this project is returned instead of a second one (repeated clicks, other tabs).
    return { ok: true, data: { orderId: request.orderId, status: request.status === "UNDER_REVIEW" ? "UNDER_REVIEW" : "PENDING", txHash: request.txHash, created } };
  } catch (error) {
    return failure(error, "requestUpgrade");
  }
}

export async function submitTxHashAction(orderId: string, txHash: string): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (await limited(session.user.id)) return { ok: false, error: "Too many requests. Try again later." };
  try {
    await submitTxHash(session.user.id, String(orderId), String(txHash));
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "submitTxHash");
  }
}

export async function cancelUpgradeAction(orderId: string): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  try {
    await cancelUpgradeRequest(session.user.id, String(orderId));
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "cancelUpgrade");
  }
}
