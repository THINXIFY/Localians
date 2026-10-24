import { ConnectError } from "./agent";

export type ApiProject = {
  id: string;
  name: string;
  slug: string;
  framework: string | null;
  defaultPort: number | null;
  /** Reported by newer servers (GET /api/cli/me). */
  access?: "public" | "password";
  hasPassword?: boolean;
  /** The project's custom link (Preview Pass); absent from older servers. */
  customUrl?: string | null;
  /** What the project may do now (newer servers): free preview state, Preview Pass, and whether it can be shared. */
  plan?: { pass: boolean; passEndsAt: string | null; free: "available" | "active" | "used" | "limit_reached"; freeEndsAt: string | null; canShare: boolean } | null;
};

/** The signed-in account. id (LOC-…) and username come from newer servers. */
export type ApiUser = { id?: string; email: string; name: string; username?: string | null };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Thin client for the Localians control plane API. */
export function createApi(apiUrl: string, token: string | null, userAgent: string) {
  const base = apiUrl.replace(/\/+$/, "");

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "user-agent": userAgent,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause?.code;
      throw new ApiError(`Can't reach Localians at ${base}${cause ? ` (${cause})` : ""}.`, null, "network");
    }
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // non-JSON body
    }
    if (!response.ok) {
      throw new ApiError(String(data.message ?? `Request failed (HTTP ${response.status}).`), response.status, String(data.error ?? "http_error"));
    }
    return data as T;
  }

  return {
    startDeviceLogin: (clientName: string) =>
      call<{ device_code: string; user_code: string; verification_uri: string; verification_uri_complete: string; expires_in: number; interval: number }>(
        "POST",
        "/api/cli/device/code",
        { client_name: clientName },
      ),
    pollDeviceLogin: (deviceCode: string) =>
      call<{ access_token: string; expires_at: string; user: ApiUser; workspace: { id: string; name: string } }>(
        "POST",
        "/api/cli/device/token",
        { device_code: deviceCode },
      ),
    me: () =>
      call<{
        user: ApiUser;
        workspace: { id: string; name: string };
        projects: ApiProject[];
        /** Newer servers: when this login expires (it renews while used) and how many apps can be shared at once. */
        credential?: { expiresAt: string };
        limits?: { activePreviews: number };
      }>("GET", "/api/cli/me"),
    createProject: (input: { name: string; framework: string | null; defaultPort: number }) => call<{ project: ApiProject }>("POST", "/api/cli/projects", input),
    redeemSetup: (code: string, port: number, detected?: { name: string; framework: string | null }) =>
      call<{ project: ApiProject | null; access: "public" | "password"; durationMinutes?: number | null; url?: "random" | "custom" | null }>("POST", "/api/cli/setup", {
        code,
        port,
        projectName: detected?.name,
        framework: detected?.framework,
      }),
    /** durationMinutes is optional: the server then uses its default, and always checks it against the plan. */
    createTunnel: (projectId: string, localPort: number, durationMinutes?: number, url?: "random" | "custom") =>
      call<{
        sessionId: string;
        label: string;
        publicUrl: string;
        gatewayUrl: string;
        expiresAt: string;
        /** The chosen auto-stop, or null when it runs until the free preview / pass ends. */
        durationMinutes?: number | null;
        /** Which plan the preview runs on (newer servers). */
        plan?: "free" | "pass";
        /** The project's custom name when the preview is served on it (Preview Pass). */
        customName?: string | null;
        project: { id: string; name: string; slug: string };
        access?: "public" | "password";
        connectToken: string;
      }>("POST", "/api/cli/tunnels", { projectId, localPort, ...(durationMinutes !== undefined ? { durationMinutes } : {}), ...(url ? { url } : {}) }),
    connectToken: async (sessionId: string) => {
      try {
        return (await call<{ connectToken: string }>("POST", `/api/cli/tunnels/${encodeURIComponent(sessionId)}/connect-token`)).connectToken;
      } catch (error) {
        // Surface as ConnectError so the agent knows whether to keep retrying.
        if (error instanceof ApiError) throw new ConnectError(error.message, error.status, error.code);
        throw error;
      }
    },
    /** Turns on password protection / sets a new password. The server never lets this make a project public. */
    protectProject: (projectId: string, password: string) =>
      call<{ access: "password"; livePreviews: number }>("POST", `/api/cli/projects/${encodeURIComponent(projectId)}/access`, { password }),
    closeTunnel: (sessionId: string) => call<{ closed: boolean }>("POST", `/api/cli/tunnels/${encodeURIComponent(sessionId)}/close`),
    listTunnels: () =>
      call<{
        tunnels: { id: string; publicUrl: string | null; localPort: number; status: string; connectedAt: string | null; createdAt: string; expiresAt?: string; project: { name: string } }[];
      }>(
        "GET",
        "/api/cli/tunnels",
      ),
    logout: () => call<{ revoked: boolean }>("POST", "/api/cli/logout"),
  };
}
