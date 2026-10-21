import { gatewayControlConfigured, getLiveTunnels } from "@/server/cli/gateway-control";
import { prisma } from "@/server/db";

/**
 * Liveness/readiness for load balancers and uptime monitors. 200 when the database answers;
 * the gateway check is informational (previews keep working on their own if it's briefly down).
 * Reveals no data beyond up/down.
 */
export async function GET() {
  let database = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }
  const gateway = !gatewayControlConfigured() ? "not_configured" : (await getLiveTunnels()) ? "ok" : "unreachable";
  const ok = database === "ok";
  return Response.json({ ok, database, gateway }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
