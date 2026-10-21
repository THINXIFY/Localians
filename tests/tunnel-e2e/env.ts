import path from "node:path";

const root = path.resolve(__dirname, "..", "..");
const certs = path.join(root, ".localians-dev", "certs");
const TOKEN_SECRET = "tunnel-e2e-token-secret-0123456789abcdefghij";
const API_SECRET = "tunnel-e2e-gateway-api-secret-0123456789abcd";
const GATEWAY_PORT = 8643;

export const TUNNEL_E2E = {
  root,
  certs,
  gatewayPort: GATEWAY_PORT,
  adminPort: GATEWAY_PORT + 1,
  apiUrl: "http://localhost:3123",
  previewDomain: "preview.localhost",
  controlPlaneEnv: {
    TUNNEL_PREVIEW_DOMAIN: "preview.localhost",
    TUNNEL_PUBLIC_SCHEME: "https",
    TUNNEL_PUBLIC_PORT: String(GATEWAY_PORT),
    TUNNEL_GATEWAY_URL: `https://127.0.0.1:${GATEWAY_PORT}`,
    TUNNEL_TOKEN_SECRET: TOKEN_SECRET,
    GATEWAY_API_SECRET: API_SECRET,
    GATEWAY_CONTROL_URL: `http://127.0.0.1:${GATEWAY_PORT + 1}`,
    DASHBOARD_EVENTS_POLL_MS: "500",
  },
  gatewayEnv: {
    TUNNEL_PREVIEW_DOMAIN: "preview.localhost",
    TUNNEL_TOKEN_SECRET: TOKEN_SECRET,
    GATEWAY_API_SECRET: API_SECRET,
    CONTROL_PLANE_URL: "http://localhost:3123",
    GATEWAY_PORT: String(GATEWAY_PORT),
    GATEWAY_HOST: "127.0.0.1",
    GATEWAY_TUNNEL_HOST: "127.0.0.1",
    GATEWAY_TLS_CERT_FILE: path.join(certs, "gateway.crt"),
    GATEWAY_TLS_KEY_FILE: path.join(certs, "gateway.key"),
    GATEWAY_ADMIN_PORT: String(GATEWAY_PORT + 1),
    GATEWAY_HEARTBEAT_MS: "3000",
  },
};
