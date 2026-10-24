import { spawn } from "node:child_process";
import os from "node:os";
import { createInterface } from "node:readline/promises";
import { startAgent, type AgentState } from "./agent";
import { ApiError, createApi, type ApiProject, type ApiUser } from "./api";
import { formatRemaining } from "../shared/durations";
import { detectProject, findLocalAddress } from "./local";
import {
  accountKey,
  type Credentials,
  deleteCredentials,
  findMapping,
  forgetProject,
  readCredentials,
  readShares,
  removeShare,
  saveCredentials,
  saveMapping,
  writeShare,
} from "./store";
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
  /** From the dashboard setup: serve on the project's custom name, or a random link. */
  url?: "random" | "custom";
  hostHeader: "rewrite" | "preserve";
  browser: boolean;
  verbose: boolean;
  yes: boolean;
  /** --new (with an optional --name): share under a new project. */
  newProject?: boolean;
  name?: string;
};

type Api = ReturnType<typeof createApi>;
type Me = Awaited<ReturnType<Api["me"]>>;

/**
 * How to run this CLI again, for hints: "npx localians" when started through npx (npm sets npm_command=exec), else
 * "localians" (installed globally or run from a build). The same text works in Windows CMD, PowerShell, macOS and Linux.
 */
export function cliCommand(env: Record<string, string | undefined> = process.env) {
  return env.npm_command === "exec" ? "npx localians" : "localians";
}
const run = (args: string) => `${cliCommand()} ${args}`;

/** "@username", or the email for accounts (or servers) without one. */
export function displayName(user: ApiUser) {
  return user.username ? `@${user.username}` : user.email;
}
const signedInAs = (user: ApiUser) => (user.username ? `${c.bold(`@${user.username}`)} ${c.dim(`(${user.email})`)}` : c.bold(user.email));

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

const yes = (answer: string) => answer === "" || /^y(es)?$/i.test(answer);

/** Keeps the saved login in step with the server (it renews while used; usernames can change). */
function refreshCredentials(credentials: Credentials, me: Me): Credentials {
  const next = { ...credentials, user: { ...credentials.user, ...me.user }, workspace: me.workspace, ...(me.credential ? { expiresAt: me.credential.expiresAt } : {}) };
  if (JSON.stringify(next) !== JSON.stringify(credentials)) saveCredentials(next);
  return next;
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
    fail(error instanceof Error ? error.message : "Couldn't start login.", "Check your internet connection and try again.");
    return EXIT.gatewayUnavailable;
  }

  out(`  Confirm this code in your browser: ${c.bold(c.lime(start.user_code))}`);
  out(`  ${c.dim(start.verification_uri_complete)}`);
  out(`  ${c.dim(`(Or open ${start.verification_uri} and type the code.)`)}`);
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
      out(`  ${c.green("✔")} Signed in as ${signedInAs(result.user)}. You're ready to share.`);
      out(`  ${c.dim(`Workspace: ${result.workspace.name}. This computer stays signed in while you use it; revoke it any time in Settings → CLI.`)}`);
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
          fail("Sign-in was denied in the browser.", `Run \`${run("login")}\` to try again.`);
          return EXIT.auth;
        }
        if (error.code === "expired_token" || error.code === "invalid_grant") {
          fail("The sign-in code expired before it was approved.", `Run \`${run("login")}\` again and approve it in your browser within 10 minutes.`);
          return EXIT.auth;
        }
        if (error.code === "network") continue; // transient — keep polling until the code expires
      }
      fail(error instanceof Error ? error.message : "Sign-in failed.");
      return EXIT.error;
    }
  }
  fail("The sign-in code expired before it was approved.", `Run \`${run("login")}\` again and approve it in your browser within 10 minutes.`);
  return EXIT.auth;
}

function noServer() {
  fail("This copy of the CLI doesn't know which Localians server to use.", "Pass --api-url <url> or set LOCALIANS_API_URL.");
  return EXIT.usage;
}

/** Revokes a saved login on its server (best effort) and removes it locally. True when the server confirmed it. */
async function revokeAndForget(credentials: Credentials) {
  let revoked = false;
  try {
    await createApi(credentials.apiUrl, credentials.token, USER_AGENT).logout();
    revoked = true;
  } catch (error) {
    revoked = error instanceof ApiError && error.status === 401; // already invalid server-side
  }
  deleteCredentials();
  return revoked;
}

export async function login(options: Options): Promise<number> {
  const apiUrl = resolveApiUrl(options);
  if (!apiUrl) return noServer();
  banner();
  const existing = readCredentials();
  if (existing && existing.apiUrl === apiUrl) {
    try {
      const me = await createApi(apiUrl, existing.token, USER_AGENT).me();
      const current = refreshCredentials(existing, me);
      out(`  ${c.green("✔")} Already signed in as ${signedInAs(current.user)}. You're ready to share.`);
      out(`  ${c.dim(`To use another account, run \`${run("logout")}\`, then \`${run("login")}\`.`)}`);
      out();
      return EXIT.ok;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        fail(error instanceof Error ? error.message : "Couldn't reach Localians.", "Check your internet connection and try again.");
        return EXIT.gatewayUnavailable;
      }
      out(`  ${c.yellow("!")} Your saved login expired or was revoked. Let's sign in again.`);
      out();
      deleteCredentials();
    }
  } else if (existing) {
    // Signing in to another server replaces the saved login: revoke the old one rather than leave it valid.
    await revokeAndForget(existing);
  }
  const result = await deviceLogin(apiUrl, options);
  if (typeof result === "number") return result;
  out(`  Next: start your app, then run ${c.bold(run("share <port>"))} ${c.dim(`(for example: ${run("share 3000")})`)}`);
  out();
  return EXIT.ok;
}

// ------------------------------------------------------------------ logout

export async function logout(): Promise<number> {
  const credentials = readCredentials();
  if (!credentials) {
    out(`\n  You're not signed in.\n`);
    return EXIT.ok;
  }
  const live = readShares().filter((s) => s.pid !== process.pid);
  const revoked = await revokeAndForget(credentials);
  out();
  out(`  ${c.green("✔")} Signed out of ${signedInAs(credentials.user)}. This computer's CLI access was revoked.`);
  if (live.length) out(`  ${c.dim(`${live.length === 1 ? "The preview" : `The ${live.length} previews`} shared from this computer stop${live.length === 1 ? "s" : ""} too.`)}`);
  if (!revoked) {
    out(`  ${c.yellow("!")} Couldn't reach Localians to revoke this computer's access.`);
    out(`    ${c.dim("It was removed locally. Revoke it from Settings → CLI in the dashboard to be certain.")}`);
  }
  out(`  ${c.dim(`Sign in again (with any account): ${run("login")}`)}`);
  out();
  return EXIT.ok;
}

// ------------------------------------------------------------------ whoami / status

/** Verifies the saved login with the server. Prints and returns an exit code when it can't be used. */
async function verifiedLogin(options: Options): Promise<{ credentials: Credentials; me: Me | null } | number> {
  const credentials = readCredentials();
  if (!credentials) {
    fail("You're not signed in.", `Run: ${run("login")}`);
    return EXIT.auth;
  }
  try {
    const me = await createApi(options.apiUrl ?? credentials.apiUrl, credentials.token, USER_AGENT).me();
    return { credentials: refreshCredentials(credentials, me), me };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      deleteCredentials();
      fail("Your login on this computer expired or was revoked.", `Run: ${run("login")}`);
      return EXIT.auth;
    }
    return { credentials, me: null }; // offline: show what is saved, and say so
  }
}

export async function whoami(options: Options): Promise<number> {
  const result = await verifiedLogin(options);
  if (typeof result === "number") return result;
  const { credentials, me } = result;
  out();
  out(`  Signed in as ${signedInAs(credentials.user)}${me ? "." : ` ${c.yellow("(couldn't reach Localians to confirm)")}`}`);
  out();
  if (credentials.user.id) row("User ID", credentials.user.id);
  row("Workspace", credentials.workspace.name);
  row("Server", credentials.apiUrl);
  row("Login renews", `while used (next expiry ${new Date(credentials.expiresAt).toDateString()})`);
  out();
  out(`  ${c.dim(`Switch accounts: ${run("logout")}, then ${run("login")}.`)}`);
  out();
  return me ? EXIT.ok : EXIT.gatewayUnavailable;
}

export async function status(options: Options): Promise<number> {
  banner();
  const result = await verifiedLogin(options);
  if (typeof result === "number") return result;
  const { credentials, me } = result;
  row("Authentication", me ? c.green("Signed in") : c.yellow("Couldn't verify (offline?)"));
  row("Account", credentials.user.username ? `@${credentials.user.username} (${credentials.user.email})` : credentials.user.email);
  row("Workspace", credentials.workspace.name);
  row("Server", credentials.apiUrl);
  out();

  const shares = readShares();
  if (!shares.length) {
    out(`  ${c.dim(`Nothing is being shared from this computer. Start one with: ${run("share <port>")}`)}\n`);
    return EXIT.ok;
  }
  out(`  ${c.bold(`${shares.length} ${shares.length === 1 ? "app" : "apps"} shared from this computer`)}${me?.limits ? c.dim(` (up to ${me.limits.activePreviews} at once per account)`) : ""}`);
  out();
  for (const share of shares.sort((a, b) => a.localPort - b.localPort)) {
    const tone = share.state === "connected" ? c.green : share.state === "reconnecting" ? c.yellow : c.dim;
    row("Project", share.project.name);
    row("Local", `http://localhost:${share.localPort}`);
    row("Preview link", c.lime(share.publicUrl));
    row("Status", tone(share.state[0].toUpperCase() + share.state.slice(1)));
    row("Uptime", formatDuration(Date.now() - new Date(share.startedAt).getTime()));
    if (share.expiresAt) row("Expires", expiresText(share.expiresAt));
    out();
  }
  out(`  ${c.dim("Stop one: press Ctrl+C in its terminal, or use Live Previews in the dashboard.")}\n`);
  return EXIT.ok;
}

// ------------------------------------------------------------------ share: which project

function projectNotFound(me: Me, port: number) {
  fail(
    "Project not found. Select an existing project or create a new one.",
    me.projects.length
      ? `Your projects: ${me.projects.map((p) => p.slug).join(", ")}. Run \`${run(`share ${port} --project <slug>`)}\`, or \`${run(`share ${port} --new`)}\` for a new one.`
      : `Run \`${run(`share ${port} --new`)}\` to create one.`,
  );
  return EXIT.usage;
}

async function createProjectFor(api: Api, name: string, framework: string | null, port: number): Promise<ApiProject | number> {
  try {
    const { project } = await api.createProject({ name, framework, defaultPort: port });
    out(`  ${c.green("✔")} Created project ${c.bold(project.name)} ${c.dim(`(uses port ${port})`)}`);
    return project;
  } catch (error) {
    fail(error instanceof Error ? error.message : "Couldn't create a project.");
    return EXIT.error;
  }
}

/**
 * Asks which project to share under: a new one (named after the app) or one of `options` (projects on this port
 * first). Only offered interactively; scripts get a clear error instead of a guess.
 */
async function promptProject(api: Api, me: Me, port: number, detected: { name: string; framework: string | null }, heading: string, choices: ApiProject[]): Promise<ApiProject | number> {
  const others = me.projects.filter((p) => !choices.includes(p));
  const listed = [...choices, ...others].slice(0, 9);
  out(`  ${heading}`);
  out();
  out(`    ${c.lime("1")}  Create a new project called ${c.bold(`"${detected.name}"`)}${choices.length ? "" : c.dim(" (recommended)")}`);
  listed.forEach((p, i) => out(`    ${c.lime(String(i + 2))}  Use ${p.name}${p.defaultPort ? c.dim(` (port ${p.defaultPort})`) : ""}`));
  out();
  const fallback = choices.length ? 2 : 1;
  const answer = await ask(`  Choose 1–${listed.length + 1} [${fallback}]: `);
  out();
  const choice = answer === "" ? fallback : Number(answer);
  if (choice === 1) return createProjectFor(api, detected.name, detected.framework, port);
  const existing = Number.isInteger(choice) ? listed[choice - 2] : undefined;
  if (!existing) {
    fail(`"${answer}" isn't one of the options.`, `Run \`${run(`share ${port}`)}\` again.`);
    return EXIT.usage;
  }
  return existing;
}

/**
 * The project to share under, never a silent guess:
 *   --new → a new project · --project → that one · the project remembered for this folder and port (per account) ·
 *   the only project using this port (confirmed the first time) · a choice when several do · create or pick otherwise.
 * Choices come from the signed-in workspace only (the API never offers another account's projects).
 */
async function resolveProject(api: Api, me: Me, credentials: Credentials, port: number, options: Options): Promise<{ project: ApiProject; how: string } | number> {
  const detected = detectProject(process.cwd());
  const account = accountKey(credentials);

  if (options.newProject) {
    const created = await createProjectFor(api, options.name ?? detected.name, detected.framework, port);
    return typeof created === "number" ? created : { project: created, how: "new project" };
  }
  if (options.project) {
    const wanted = options.project.toLowerCase();
    const project = me.projects.find((p) => p.id === options.project || p.slug === wanted || p.name.toLowerCase() === wanted);
    return project ? { project, how: "--project" } : projectNotFound(me, port);
  }

  const remembered = findMapping(account, detected.root, port);
  if (remembered) {
    const project = me.projects.find((p) => p.id === remembered.projectId);
    if (project) return { project, how: "remembered for this folder" };
    forgetProject(account, remembered.projectId); // deleted or archived since
  }

  const onPort = me.projects.filter((p) => p.defaultPort === port);
  if (onPort.length === 1) {
    const [project] = onPort;
    if (!interactive() || options.yes) {
      out(`  ${c.dim(`Sharing under "${project.name}" (it uses port ${port}). Use --project or --new to choose another.`)}`);
      return { project, how: "uses this port" };
    }
    const answer = await ask(`  Share localhost:${port} as ${c.bold(project.name)}? ${c.dim("(it uses this port)")} [Y/n]: `);
    if (yes(answer)) return { project, how: "uses this port" };
    out();
    const picked = await promptProject(api, me, port, detected, "Which project should this app be shared under?", []);
    return typeof picked === "number" ? picked : { project: picked, how: "chosen" };
  }
  if (onPort.length > 1) {
    if (!interactive()) {
      fail(
        `Several projects use port ${port}: ${onPort.map((p) => p.slug).join(", ")}.`,
        `Say which one: \`${run(`share ${port} --project <slug>`)}\`, or create a new one with \`${run(`share ${port} --new`)}\`.`,
      );
      return EXIT.usage;
    }
    const picked = await promptProject(api, me, port, detected, `Several projects use port ${port}. Which one is this app?`, onPort);
    return typeof picked === "number" ? picked : { project: picked, how: "chosen" };
  }

  // No project uses this port yet. New projects need consent: an interactive answer, or --yes in scripts.
  if (options.yes) {
    const created = await createProjectFor(api, detected.name, detected.framework, port);
    return typeof created === "number" ? created : { project: created, how: "new project" };
  }
  if (!interactive()) {
    fail(
      `No project in ${me.workspace.name} uses port ${port} yet.`,
      `Run \`${run(`share ${port} --new`)}\` to create "${detected.name}", or \`${run(`share ${port} --project <slug>`)}\` to use an existing one.`,
    );
    return EXIT.usage;
  }
  const picked = await promptProject(api, me, port, detected, `No project in ${c.bold(me.workspace.name)} uses port ${port} yet.`, []);
  return typeof picked === "number" ? picked : { project: picked, how: "chosen" };
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

// ------------------------------------------------------------------ share

/** Signs in if needed (or again, if the saved login was revoked) and loads the account. */
async function signedIn(apiUrl: string, options: Options): Promise<{ api: Api; me: Me; credentials: Credentials } | number> {
  let credentials = readCredentials();
  if (credentials && credentials.apiUrl !== apiUrl) credentials = null; // a login for another server can't be used here
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!credentials) {
      banner();
      out(`  ${c.bold("First, connect this computer to your Localians account.")}`);
      out(`  ${c.dim("Your browser will ask you to approve it. You only do this once.")}`);
      out();
      const result = await deviceLogin(apiUrl, options);
      if (typeof result === "number") return result;
      credentials = result;
    }
    const api = createApi(apiUrl, credentials.token, USER_AGENT);
    try {
      const me = await api.me();
      return { api, me, credentials: refreshCredentials(credentials, me) };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && attempt === 0) {
        out(`  ${c.yellow("!")} Your login on this computer expired or was revoked. Let's sign in again.`);
        deleteCredentials();
        credentials = null;
        continue;
      }
      if (error instanceof ApiError && error.status === 401) {
        fail("You're not signed in.", `Run: ${run("login")}`);
        return EXIT.auth;
      }
      fail(error instanceof Error ? error.message : "Couldn't reach Localians.", "Check your internet connection and try again.");
      return EXIT.gatewayUnavailable;
    }
  }
  return EXIT.auth;
}

export async function share(port: number, options: Options): Promise<number> {
  const verbose = (line: string) => options.verbose && out(`  ${c.dim(line)}`);

  // 1. The local app must be running (loopback only).
  const localAddress = await findLocalAddress(port);
  if (!localAddress) {
    fail(
      `Nothing is running on localhost:${port}. Start your app and try again.`,
      `Start it as usual (for example \`npm run dev\`) and check the port it prints. If it uses another port, run \`${run("share <that port>")}\`.`,
    );
    return EXIT.localUnreachable;
  }
  verbose(`local app found on ${localAddress === "::1" ? "[::1]" : localAddress}:${port}`);

  // 2. One share per port per computer: another terminal already shares this one.
  const already = readShares().find((s) => s.localPort === port && s.pid !== process.pid);
  if (already) {
    fail(
      `localhost:${port} is already being shared from this computer (${already.project.name}): ${already.publicUrl}`,
      "Keep using that link, or stop it with Ctrl+C in its terminal first. Other apps can be shared at the same time on their own ports.",
    );
    return EXIT.usage;
  }

  // 3. Signed in? If not (or the login expired), sign in now and carry on.
  const apiUrl = options.apiUrl?.replace(/\/+$/, "") ?? resolveApiUrl(options);
  if (!apiUrl) return noServer();
  const auth = await signedIn(apiUrl, options);
  if (typeof auth === "number") return auth;
  let { api, me, credentials } = auth;

  // 4. Project: the dashboard's Share App setup, else --new / --project / remembered / this port / ask.
  let project: ApiProject | null = null;
  if (options.setup) {
    const setupCode = options.setup;
    const detected = detectProject(process.cwd());
    for (let attempt = 0; ; attempt++) {
      try {
        const setup = await api.redeemSetup(setupCode, port, { name: detected.name, framework: detected.framework });
        project = setup.project;
        // The dashboard's duration, unless --duration was given too.
        if (setup.durationMinutes && options.durationMinutes === undefined) options = { ...options, durationMinutes: setup.durationMinutes };
        if (setup.url) options = { ...options, url: setup.url };
        verbose(project ? `using project "${project.name}" from the dashboard setup` : "dashboard setup: project chosen automatically");
        break;
      } catch (error) {
        if (error instanceof ApiError && error.code === "setup_wrong_account" && attempt === 0 && interactive()) {
          // A login left over from another account: offer to switch instead of failing.
          out(`  ${c.yellow("!")} ${error.message}`);
          const answer = await ask(`  You're signed in as ${displayName(credentials.user)}. Sign out and sign in with the account that created this code? [Y/n]: `);
          out();
          if (!yes(answer)) return failSetup(error, port);
          await revokeAndForget(credentials);
          const switched = await signedIn(apiUrl, options);
          if (typeof switched === "number") return switched;
          ({ api, me, credentials } = switched);
          continue;
        }
        return failSetup(error, port);
      }
    }
    // The developer already chose in the dashboard: no questions here.
    if (!project) project = me.projects.find((p) => p.defaultPort === port) ?? null;
    if (!project) {
      const created = await createProjectFor(api, detected.name, detected.framework, port);
      if (typeof created === "number") return created;
      project = created;
    }
    saveMapping(accountKey(credentials), detected.root, port, project);
  } else {
    const resolved = await resolveProject(api, me, credentials, port, options);
    if (typeof resolved === "number") return resolved;
    project = resolved.project;
    saveMapping(accountKey(credentials), detectProject(process.cwd()).root, port, project);
    verbose(`sharing under project "${project.name}" (${resolved.how})`);
  }

  // 5. Tunnel session + preview hostname.
  let session;
  try {
    session = await api.createTunnel(project.id, port, options.durationMinutes, options.url);
  } catch (error) {
    return failCreate(error, port, project, apiUrl, credentials);
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
  record("connecting"); // visible to `status` and to other terminals' same-port check right away

  // 6. Connect, print the URL, forward until stopped.
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
          row("Signed in as", displayName(me.user));
          row("Workspace", me.workspace.name);
          row("Project", project!.name);
          row("Local", `http://localhost:${port}`);
          row("Preview link", c.bold(c.lime(session.publicUrl)));
          row("Status", c.green("● Connected"));
          row("Plan", session.plan === "pass" ? c.green("Preview Pass") : session.plan === "free" ? "Free preview" : "—");
          row("Access", session.access === "password" ? c.green("Password protected") : c.yellow("Public — anyone with the link"));
          row("Expires", expiresText(session.expiresAt));
          out();
          out(`  Send the preview link to anyone you want to show your app.`);
          if (session.access === "password") out(`  ${c.dim("Visitors enter the project password first. Change it in the dashboard.")}`);
          else out(`  ${c.yellow("!")} Anyone with this link can open your app while sharing is on. Protect it with a password in the dashboard.`);
          out(`  ${c.dim(`Keep this window open while you share. Press Ctrl+C to stop sharing. To share another app, run \`${run("share <port>")}\` in a new terminal.`)}`);
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
    fail("Sharing stopped: this computer's login was revoked or expired.", `Run: ${run("login")}`);
    return EXIT.auth;
  }
  // The server's message says why (stopped from the dashboard, expired, replaced, …) and how to get a new link.
  fail(`Sharing stopped. ${stopMessage ?? "This preview session has ended."}`, stopMessage ? undefined : `Run \`${run(`share ${port}`)}\` for a new link.`);
  return EXIT.error;
}

function failSetup(error: unknown, port: number) {
  const code = error instanceof ApiError ? error.code : "";
  const fresh = "Copy a fresh command from Share App in the dashboard.";
  if (code === "setup_wrong_account") {
    fail(
      "This setup code belongs to another account. Sign in with the correct account or generate a new code.",
      `Switch accounts: \`${run("logout")}\`, then \`${run("login")}\`. Or ${fresh.charAt(0).toLowerCase()}${fresh.slice(1)}`,
    );
  } else if (code === "setup_expired" || code === "setup_used" || code === "setup_invalid") {
    fail(error instanceof Error ? error.message : "That setup code can't be used.", `${fresh} Or run \`${run(`share ${port}`)}\` without --setup.`);
  } else {
    fail(error instanceof Error ? error.message : "Couldn't use that setup code.", `Or run \`${run(`share ${port}`)}\` without --setup.`);
  }
  return code === "setup_wrong_account" ? EXIT.auth : EXIT.usage;
}

function failCreate(error: unknown, port: number, project: ApiProject, apiUrl: string, credentials: Credentials) {
  if (error instanceof ApiError && error.status === 401) {
    fail("You're not signed in: this computer's login expired or was revoked.", `Run: ${run("login")}`);
    return EXIT.auth;
  }
  if (error instanceof ApiError && error.status === 404) {
    forgetProject(accountKey(credentials), project.id);
    fail("Project not found. Select an existing project or create a new one.", `Run \`${run(`share ${port}`)}\` to choose, or \`${run(`share ${port} --new`)}\`.`);
    return EXIT.usage;
  }
  if (error instanceof ApiError && (error.code === "free_used" || error.code === "free_limit")) {
    fail(
      error.code === "free_used" ? "This project's preview period has ended. Upgrade or renew your Preview Pass." : error.message,
      `${error.code === "free_used" ? `${error.message} ` : ""}Get or renew it in the dashboard: ${apiUrl}/dashboard/projects/${project.id}#plan`,
    );
    return EXIT.error;
  }
  if (error instanceof ApiError && (error.code === "plan_required" || error.code === "invalid_duration" || error.code === "no_custom_name")) {
    fail(error.message, `For example: ${run(`share ${port} --duration 1h`)}`);
    return EXIT.usage;
  }
  if (error instanceof ApiError && error.code === "too_many_tunnels") {
    fail(error.message, `See what's running: ${run("status")}, or Live Previews in the dashboard.`);
    return EXIT.error;
  }
  if (error instanceof ApiError && error.code === "project_archived") {
    fail(error.message, `Or share under another project: ${run(`share ${port} --project <slug>`)}`);
    return EXIT.usage;
  }
  fail(error instanceof Error ? error.message : "Couldn't create the preview.", error instanceof ApiError && error.code === "tunnels_unavailable" ? "Sharing isn't set up on this Localians server yet." : undefined);
  return EXIT.gatewayUnavailable;
}
