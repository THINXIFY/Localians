import { spawn } from "node:child_process";
import os from "node:os";
import { createInterface } from "node:readline/promises";
import { startAgent, type AgentState } from "./agent";
import { ApiError, createApi, type ApiProject } from "./api";
import { formatRemaining } from "../shared/durations";
import { detectProject, findLocalAddress } from "./local";
import { type Credentials, deleteCredentials, readCredentials, readShares, removeShare, saveCredentials, writeShare } from "./store";
import { banner, c, EXIT, fail, formatDuration, out, row } from "./ui";

/** Set from tunnel/cli/package.json at build time, so `--version` and the User-Agent always match the package. */
declare const __LOCALIANS_CLI_VERSION__: string | undefined;
export const VERSION = typeof __LOCALIANS_CLI_VERSION__ === "string" ? __LOCALIANS_CLI_VERSION__ : "0.0.0-dev";
const USER_AGENT = `localians-cli/${VERSION} (${process.platform}; node ${process.versions.node})`;

/** Server URL baked in at build time (`LOCALIANS_DEFAULT_API_URL`), so `localians share 5173` needs no flags. */
declare const __LOCALIANS_DEFAULT_API_URL__: string | undefined;
const DEFAULT_API_URL = typeof __LOCALIANS_DEFAULT_API_URL__ === "string" && __LOCALIANS_DEFAULT_API_URL__ ? __LOCALIANS_DEFAULT_API_URL__ : undefined;

type Options = {
  apiUrl?: string;
  project?: string;
  setup?: string;
  durationMinutes?: number;
  hostHeader: "rewrite" | "preserve";
  browser: boolean;
  verbose: boolean;
  yes: boolean;
};

function resolveApiUrl(options: Options) {
  return (options.apiUrl ?? process.env.LOCALIANS_API_URL ?? readCredentials()?.apiUrl ?? DEFAULT_API_URL)?.replace(/\/+$/, "") ?? null;
}

/**
 * How to open a URL in the default browser. On Windows `cmd /c start` would split the URL at `&` and run the rest as
 * a command, so the URL handler is called directly instead. Only http(s) URLs are ever opened.
 */
export function browserCommand(url: string, platform: NodeJS.Platform = process.platform): [string, string[]] | null {
  if (!/^https?:\/\/[^\s"'`<>|^]+$/.test(url)) return null;
  if (platform === "win32") return ["rundll32.exe", ["url.dll,FileProtocolHandler", url]];
  if (platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}

function openBrowser(url: string) {
  const command = browserCommand(url);
  if (!command) return;
  const [cmd, args] = command;
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true }).on("error", () => {}).unref();
  } catch {
    // The URL is printed anyway.
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function ask(question: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

// ------------------------------------------------------------------ login

/**
 * RFC 8628 device login: the user approves this computer in the browser, the CLI receives
 * its own revocable token (never the dashboard session). Returns the saved credentials.
 */
async function deviceLogin(apiUrl: string, options: Options): Promise<Credentials | number> {
  const api = createApi(apiUrl, null, USER_AGENT);
  let start;
  try {
    start = await api.startDeviceLogin(`CLI on ${os.hostname()} (${process.platform})`.slice(0, 80));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Couldn't start login.", "Check your internet connection.");
    return EXIT.gatewayUnavailable;
  }

  out(`  Confirm this code in your browser: ${c.bold(c.lime(start.user_code))}`);
  out(`  ${c.dim(start.verification_uri_complete)}`);
  out();
  if (options.browser && process.stdout.isTTY) openBrowser(start.verification_uri_complete);
  out(`  ${c.dim("Waiting for you to approve it… (Ctrl+C to cancel)")}`);

  let interval = start.interval * 1000;
  const deadline = Date.now() + start.expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    try {
      const result = await api.pollDeviceLogin(start.device_code);
      const credentials: Credentials = {
        apiUrl,
        token: result.access_token,
        expiresAt: result.expires_at,
        user: result.user,
        workspace: result.workspace,
        createdAt: new Date().toISOString(),
      };
      saveCredentials(credentials);
      out();
      out(`  ${c.green("✔")} Logged in as ${c.bold(result.user.email)} ${c.dim(`(${result.workspace.name})`)}`);
      out(`  ${c.dim(`Access expires ${new Date(result.expires_at).toDateString()}. Revoke it any time in Settings → CLI.`)}`);
      out();
      return credentials;
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "authorization_pending") continue;
        if (error.code === "slow_down") {
          interval += 5000;
          continue;
        }
        if (error.code === "access_denied") {
          fail("Login was denied in the browser.");
          return EXIT.auth;
        }
        if (error.code === "expired_token" || error.code === "invalid_grant") {
          fail("The login request expired before it was approved.", "Run the command again and approve it in your browser.");
          return EXIT.auth;
        }
        if (error.code === "network") continue; // transient — keep polling until the code expires
      }
      fail(error instanceof Error ? error.message : "Login failed.");
      return EXIT.error;
    }
  }
  fail("The login request expired before it was approved.", "Run the command again and approve it in your browser.");
  return EXIT.auth;
}

function noServer() {
  fail("This copy of the CLI doesn't know which Localians server to use.", "Pass --api-url <url> or set LOCALIANS_API_URL.");
  return EXIT.usage;
}

export async function login(options: Options): Promise<number> {
  const apiUrl = resolveApiUrl(options);
  if (!apiUrl) return noServer();
  banner();
  const result = await deviceLogin(apiUrl, options);
  return typeof result === "number" ? result : EXIT.ok;
}

// ------------------------------------------------------------------ logout

export async function logout(options: Options): Promise<number> {
  const credentials = readCredentials();
  if (!credentials) {
    out(`\n  You're not logged in.\n`);
    return EXIT.ok;
  }
  const api = createApi(options.apiUrl ?? credentials.apiUrl, credentials.token, USER_AGENT);
  let revoked = false;
  try {
    await api.logout();
    revoked = true;
  } catch (error) {
    // 401 means the token was already invalid server-side.
    revoked = error instanceof ApiError && error.status === 401;
  }
  deleteCredentials();
  out();
  out(`  ${c.green("✔")} Logged out of ${credentials.user.email}.`);
  if (!revoked) {
    out(`  ${c.yellow("!")} Couldn't reach Localians to revoke this computer's token.`);
    out(`    ${c.dim("It was removed locally. Revoke it from Settings → CLI in the dashboard to be certain.")}`);
  }
  out();
  return EXIT.ok;
}

// ------------------------------------------------------------------ status

export async function status(options: Options): Promise<number> {
  banner();
  const credentials = readCredentials();
  if (!credentials) {
    row("Authentication", c.yellow("Not logged in"));
    out(`\n  ${c.dim("Run `localians share <port>` to sign in and share an app.")}\n`);
    return EXIT.auth;
  }
  const api = createApi(options.apiUrl ?? credentials.apiUrl, credentials.token, USER_AGENT);
  let authState = c.green("Logged in");
  try {
    await api.me();
  } catch (error) {
    authState = error instanceof ApiError && error.status === 401 ? c.red("Expired or revoked — run `localians login`") : c.yellow("Couldn't verify (offline?)");
  }
  row("Authentication", authState);
  row("Account", credentials.user.email);
  row("Workspace", credentials.workspace.name);
  row("Server", credentials.apiUrl);
  out();

  const shares = readShares();
  if (!shares.length) {
    out(`  ${c.dim("Nothing is being shared from this computer.")}\n`);
    return EXIT.ok;
  }
  for (const share of shares) {
    const tone = share.state === "connected" ? c.green : share.state === "reconnecting" ? c.yellow : c.dim;
    row("Project", share.project.name);
    row("Local", `http://localhost:${share.localPort}`);
    row("Preview link", c.lime(share.publicUrl));
    row("Status", tone(share.state[0].toUpperCase() + share.state.slice(1)));
    row("Uptime", formatDuration(Date.now() - new Date(share.startedAt).getTime()));
    if (share.expiresAt) row("Expires", expiresText(share.expiresAt));
    out();
  }
  return EXIT.ok;
}

// ------------------------------------------------------------------ share

function pickProject(projects: ApiProject[], port: number, wanted?: string) {
  if (wanted) return projects.find((p) => p.id === wanted || p.slug === wanted.toLowerCase()) ?? null;
  return projects.find((p) => p.defaultPort === port) ?? null;
}

/**
 * No project uses this port yet. Projects are only created with the developer's consent:
 * an interactive prompt, or `--yes` in scripts. Choices come from the credential's own
 * workspace (the API never offers projects from elsewhere).
 */
async function chooseProject(
  api: ReturnType<typeof createApi>,
  me: { workspace: { name: string }; projects: ApiProject[] },
  port: number,
  options: Options,
): Promise<ApiProject | number> {
  const detected = detectProject(process.cwd());
  const create = async () => {
    try {
      const { project } = await api.createProject({ name: detected.name, framework: detected.framework, defaultPort: port });
      out(`  ${c.green("✔")} Created project ${c.bold(project.name)} ${c.dim(`(uses port ${port})`)}`);
      return project;
    } catch (error) {
      fail(error instanceof Error ? error.message : "Couldn't create a project.");
      return EXIT.error;
    }
  };
  if (options.yes) return create();

  if (!interactive()) {
    fail(
      `No project in ${me.workspace.name} uses port ${port} yet.`,
      `Run \`localians share ${port} --yes\` to create "${detected.name}", or \`localians share ${port} --project <name>\` to use an existing one.`,
    );
    return EXIT.usage;
  }

  out(`  No project in ${c.bold(me.workspace.name)} uses port ${port} yet.`);
  out();
  out(`    ${c.lime("1")}  Create a new project called ${c.bold(`"${detected.name}"`)} ${c.dim("(recommended)")}`);
  me.projects.slice(0, 9).forEach((p, i) => out(`    ${c.lime(String(i + 2))}  Use ${p.name}${p.defaultPort ? c.dim(` (port ${p.defaultPort})`) : ""}`));
  out();
  const answer = await ask(`  Choose 1–${Math.min(me.projects.length, 9) + 1} [1]: `);
  out();
  const choice = answer === "" ? 1 : Number(answer);
  if (choice === 1) return create();
  const existing = Number.isInteger(choice) ? me.projects[choice - 2] : undefined;
  if (!existing) {
    fail(`"${answer}" isn't one of the options.`, `Run \`localians share ${port}\` again.`);
    return EXIT.usage;
  }
  return existing;
}

/** "in 59 minutes (at 14:05)" — when the link stops working. */
function expiresText(expiresAt: string) {
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return "—";
  const left = at.getTime() - Date.now();
  const sameDay = at.toDateString() === new Date().toDateString();
  const clock = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `in ${formatRemaining(left)} (${sameDay ? `at ${clock}` : `${at.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${clock}`})`;
}

export async function share(port: number, options: Options): Promise<number> {
  const verbose = (line: string) => options.verbose && out(`  ${c.dim(line)}`);

  // 1. The local app must be running (loopback only).
  const localAddress = await findLocalAddress(port);
  if (!localAddress) {
    fail(
      `We couldn't find a website running on port ${port}. Start your app and try again.`,
      `Start it as usual (for example \`npm run dev\`) and check the port it prints. If it uses another port, run \`localians share <that port>\`.`,
    );
    return EXIT.localUnreachable;
  }
  verbose(`local app found on ${localAddress === "::1" ? "[::1]" : localAddress}:${port}`);

  // 2. Signed in? If not (or the login expired), sign in now and carry on.
  let credentials = readCredentials();
  const apiUrl = options.apiUrl ?? credentials?.apiUrl ?? resolveApiUrl(options);
  if (!apiUrl) return noServer();
  let api = createApi(apiUrl, credentials?.token ?? null, USER_AGENT);
  let me;
  for (let attempt = 0; attempt < 2 && !me; attempt++) {
    if (!credentials) {
      banner();
      out(`  ${c.bold("First, connect this computer to your Localians account.")}`);
      out(`  ${c.dim("Your browser will ask you to approve it. You only do this once.")}`);
      out();
      const result = await deviceLogin(apiUrl, options);
      if (typeof result === "number") return result;
      credentials = result;
      api = createApi(apiUrl, credentials.token, USER_AGENT);
    }
    try {
      me = await api.me();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && attempt === 0) {
        out(`  ${c.yellow("!")} Your login on this computer expired or was revoked. Let's sign in again.`);
        deleteCredentials();
        credentials = null;
        continue;
      }
      if (error instanceof ApiError && error.status === 401) {
        fail("Localians didn't accept this computer's login.", "Run `localians login` and try again.");
        return EXIT.auth;
      }
      fail(error instanceof Error ? error.message : "Couldn't reach Localians.", "Check your internet connection.");
      return EXIT.gatewayUnavailable;
    }
  }
  if (!me) return EXIT.auth;

  // 3. Project: from the dashboard's Share App setup, else --project, else the project that uses this port, else ask.
  let project: ApiProject | null = null;
  if (options.setup) {
    try {
      const setup = await api.redeemSetup(options.setup, port, detectProject(process.cwd()));
      project = setup.project;
      // The dashboard's duration, unless --duration was given too.
      if (setup.durationMinutes && options.durationMinutes === undefined) options = { ...options, durationMinutes: setup.durationMinutes };
      verbose(project ? `using project "${project.name}" from the dashboard setup` : "dashboard setup: project chosen automatically");
    } catch (error) {
      fail(error instanceof Error ? error.message : "Couldn't use that setup code.", `Or run \`localians share ${port}\` without --setup.`);
      return EXIT.usage;
    }
    // The developer already chose in the dashboard: no questions here.
    if (!project) project = pickProject(me.projects, port);
    if (!project) options = { ...options, yes: true };
  }
  if (!project) project = pickProject(me.projects, port, options.project);
  if (!project && options.project) {
    fail(`Project "${options.project}" wasn't found in ${me.workspace.name}.`, me.projects.length ? `Available: ${me.projects.map((p) => p.slug).join(", ")}` : "Leave out --project to create one.");
    return EXIT.error;
  }
  if (!project) {
    const chosen = await chooseProject(api, me, port, options);
    if (typeof chosen === "number") return chosen;
    project = chosen;
  }
  verbose(`sharing under project "${project.name}"`);

  // 5–7. Tunnel session + preview hostname.
  let session;
  try {
    session = await api.createTunnel(project.id, port, options.durationMinutes);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      fail("Your CLI login has expired or was revoked.", "Run `localians login` to sign in again.");
      return EXIT.auth;
    }
    if (error instanceof ApiError && error.status === 404) {
      fail("You don't have access to that project.", "Check the project in the dashboard, or omit --project.");
      return EXIT.auth;
    }
    if (error instanceof ApiError && (error.code === "plan_required" || error.code === "invalid_duration")) {
      fail(error.message, `For example: localians share ${port} --duration 1h`);
      return EXIT.usage;
    }
    fail(error instanceof Error ? error.message : "Couldn't create the preview.", error instanceof ApiError && error.code === "tunnels_unavailable" ? "Sharing isn't set up on this Localians server yet." : undefined);
    return EXIT.gatewayUnavailable;
  }

  const startedAt = new Date();
  let firstToken: string | null = session.connectToken;
  const record = (state: AgentState) =>
    writeShare({
      pid: process.pid,
      sessionId: session.sessionId,
      publicUrl: session.publicUrl,
      localPort: port,
      project: { id: session.project.id, name: session.project.name },
      startedAt: startedAt.toISOString(),
      expiresAt: session.expiresAt,
      state,
    });

  // 8–10. Connect, print the URL, forward until stopped.
  let printed = false;
  let stopMessage: string | undefined;
  const agent = startAgent({
    gatewayUrl: session.gatewayUrl,
    localPort: port,
    localAddress,
    hostHeader: options.hostHeader,
    userAgent: USER_AGENT,
    getConnectToken: async () => {
      if (firstToken) {
        const t = firstToken;
        firstToken = null;
        return t;
      }
      return api.connectToken(session.sessionId);
    },
    onRequest: options.verbose
      ? (e) => out(`  ${c.dim(new Date().toLocaleTimeString())} ${e.websocket ? c.cyan("WS ") : ""}${e.method.padEnd(6)} ${String(e.status).padStart(3)} ${e.path.split("?")[0]} ${c.dim(`${e.ms}ms`)}`)
      : undefined,
    onState: (state, info) => {
      if (state === "stopped") stopMessage = info.reason;
      else record(state);
      if (state === "connected") {
        if (!printed) {
          printed = true;
          banner();
          row("Signed in as", me.user.email);
          row("Workspace", me.workspace.name);
          row("Project", project!.name);
          row("Local", `http://localhost:${port}`);
          row("Preview link", c.bold(c.lime(session.publicUrl)));
          row("Status", c.green("● Connected"));
          row("Access", session.access === "password" ? c.green("Password protected") : c.yellow("Public — anyone with the link"));
          row("Expires", expiresText(session.expiresAt));
          out();
          out(`  Send the preview link to anyone you want to show your app.`);
          if (session.access === "password") out(`  ${c.dim("Visitors enter the project password first. Change it in the dashboard.")}`);
          else out(`  ${c.yellow("!")} Anyone with this link can open your app while sharing is on. Protect it with a password in the dashboard.`);
          out(`  ${c.dim("Keep this window open while you share. Press Ctrl+C to stop sharing.")}`);
          out();
        } else {
          out(`  ${c.green("●")} Reconnected — ${session.publicUrl}`);
        }
      } else if (state === "reconnecting") {
        out(`  ${c.yellow("●")} Connection lost${info.reason ? ` (${info.reason})` : ""}. Reconnecting in ${Math.ceil((info.delayMs ?? 0) / 1000)}s…`);
      }
    },
  });

  let interrupted = false;
  const onSignal = () => {
    if (interrupted) process.exit(EXIT.interrupted); // second Ctrl+C: force quit
    interrupted = true;
    out(`\n  ${c.dim("Stopping…")}`);
    agent.stop();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const reason = await agent.done;
  removeShare();
  try {
    await api.closeTunnel(session.sessionId);
  } catch {
    // The gateway's disconnect report / stale sweep will end the session anyway.
  }

  if (reason === "user") {
    out(`  ${c.green("✔")} Stopped sharing. ${session.publicUrl} is no longer serving your app.\n`);
    return EXIT.ok;
  }
  if (reason === "auth") {
    fail("Sharing stopped: your CLI access was revoked or expired.", "Run `localians login` to sign in again.");
    return EXIT.auth;
  }
  // The server's message says why (stopped from the dashboard, expired, …) and how to get a new link.
  fail(`Sharing stopped. ${stopMessage ?? "This preview session has ended."}`, stopMessage ? undefined : `Run \`localians share ${port}\` for a new link.`);
  return EXIT.error;
}
