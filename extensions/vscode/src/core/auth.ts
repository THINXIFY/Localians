import { ApiError, createApi } from "@tunnel/cli/api";

export type Credentials = {
  apiUrl: string;
  /** Revocable CLI-style access token. Kept in SecretStorage only; never logged or shown. */
  token: string;
  expiresAt: string;
  user: { email: string; name: string; username?: string | null; id?: string };
  workspace: { id: string; name: string };
};

/** The subset of VS Code's SecretStorage the extension uses (lets tests supply an in-memory store). */
export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export const SECRET_KEY = "localians.credentials.v1";

export class LoginError extends Error {
  constructor(
    message: string,
    readonly kind: "denied" | "expired" | "cancelled" | "network" | "server",
  ) {
    super(message);
  }
}

export type LoginUi = {
  /** Show the code and open the approval page in the browser. Return false if the browser couldn't be opened. */
  open: (url: string, userCode: string) => PromiseLike<boolean> | boolean;
  isCancelled: () => boolean;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Sign-in with the same browser approval (RFC 8628 device flow) as the CLI. The token is bound to the server it was
 * issued by, and dropped if the server setting changes or it expires.
 */
export class Auth {
  constructor(
    private readonly secrets: SecretStore,
    private readonly userAgent: string,
  ) {}

  async load(apiUrl: string): Promise<Credentials | null> {
    let value: Credentials | null = null;
    try {
      value = JSON.parse((await this.secrets.get(SECRET_KEY)) ?? "null") as Credentials | null;
    } catch {
      value = null;
    }
    if (!value?.token || value.apiUrl !== apiUrl) return null;
    if (Date.parse(value.expiresAt) <= Date.now()) {
      await this.secrets.delete(SECRET_KEY);
      return null;
    }
    return value;
  }

  async signIn(apiUrl: string, clientName: string, ui: LoginUi): Promise<Credentials> {
    const sleep = ui.sleep ?? defaultSleep;
    const api = createApi(apiUrl, null, this.userAgent);
    let start;
    try {
      start = await api.startDeviceLogin(clientName.slice(0, 80));
    } catch (error) {
      throw new LoginError(error instanceof Error ? error.message : "Couldn't start sign-in.", error instanceof ApiError && error.code === "network" ? "network" : "server");
    }
    await ui.open(start.verification_uri_complete, start.user_code);

    let interval = Math.max(1, start.interval) * 1000;
    const deadline = Date.now() + start.expires_in * 1000;
    while (Date.now() < deadline) {
      await sleep(interval);
      if (ui.isCancelled()) throw new LoginError("Sign-in was cancelled.", "cancelled");
      try {
        const result = await api.pollDeviceLogin(start.device_code);
        const credentials: Credentials = { apiUrl, token: result.access_token, expiresAt: result.expires_at, user: result.user, workspace: result.workspace };
        await this.secrets.store(SECRET_KEY, JSON.stringify(credentials));
        return credentials;
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (error.code === "authorization_pending" || error.code === "network") continue;
        if (error.code === "slow_down") {
          interval += 5000;
          continue;
        }
        if (error.code === "access_denied") throw new LoginError("Sign-in was denied in the browser.", "denied");
        if (error.code === "expired_token" || error.code === "invalid_grant") throw new LoginError("The sign-in request expired before it was approved.", "expired");
        throw new LoginError(error.message, "server");
      }
    }
    throw new LoginError("The sign-in request expired before it was approved.", "expired");
  }

  /** Revokes the token on the server (best effort) and forgets it locally. */
  async signOut(credentials: Credentials | null): Promise<{ revoked: boolean }> {
    let revoked = false;
    if (credentials) {
      try {
        await createApi(credentials.apiUrl, credentials.token, this.userAgent).logout();
        revoked = true;
      } catch (error) {
        revoked = error instanceof ApiError && error.status === 401; // already invalid
      }
    }
    await this.secrets.delete(SECRET_KEY);
    return { revoked };
  }

  /** Saves an updated copy (username from the server, a renewed expiry). Same server, same token only. */
  async update(credentials: Credentials) {
    await this.secrets.store(SECRET_KEY, JSON.stringify(credentials));
  }

  /** Forgets the saved sign-in; with `token`, only if that is still the saved one (a newer sign-in is kept). */
  async forget(token?: string) {
    if (token) {
      let saved: string | undefined;
      try {
        saved = (JSON.parse((await this.secrets.get(SECRET_KEY)) ?? "null") as Credentials | null)?.token;
      } catch {
        saved = undefined;
      }
      if (saved && saved !== token) return;
    }
    await this.secrets.delete(SECRET_KEY);
  }
}
