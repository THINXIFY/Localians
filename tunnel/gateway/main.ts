import fs from "node:fs";
import { loadGatewayConfig } from "./config";
import { createGateway } from "./gateway";
import { createLogger } from "./log";

/** Long-running gateway process. Deploy on a server/VM/container — not as a serverless function. */
async function main() {
  const log = createLogger();
  let config;
  try {
    config = loadGatewayConfig(process.env, (p) => fs.readFileSync(p, "utf8"));
  } catch (error) {
    log("error", "invalid gateway configuration", { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
  if (!config.tls && config.publicProto === "http") {
    log("warn", "TLS is disabled: plain-HTTP mode is for local simulation only. Set GATEWAY_TLS_CERT_FILE/GATEWAY_TLS_KEY_FILE or GATEWAY_BEHIND_TLS_PROXY=1 in deployments.");
  }
  const gateway = createGateway(config, { log });
  await gateway.listen();

  const shutdown = async (signal: string) => {
    log("info", "shutting down", { signal });
    await gateway.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  // A stray promise rejection is logged, not fatal: one failed report must not drop every tunnel.
  process.on("unhandledRejection", (reason) => log("error", "unhandled rejection", { error: reason instanceof Error ? reason.message : String(reason) }));
  // An exception means state may be corrupt: log it, close what we can, and exit so the supervisor
  // (systemd, Docker restart policy, Kubernetes) starts a clean process. CLIs reconnect automatically.
  process.on("uncaughtException", (error) => {
    log("error", "uncaught exception", { error: error.message });
    void gateway.close().finally(() => process.exit(1));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}

void main();
