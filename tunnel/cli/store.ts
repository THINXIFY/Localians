import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApiUser } from "./api";

export type Credentials = {
  apiUrl: string;
  /** CLI access token. Never printed. */
  token: string;
  expiresAt: string;
  user: ApiUser;
  workspace: { id: string; name: string };
  createdAt: string;
};

export type ShareRecord = {
  pid: number;
  sessionId: string;
  publicUrl: string;
  localPort: number;
  project: { id: string; name: string };
  startedAt: string;
  /** When the link stops working (absent in records written by older versions). */
  expiresAt?: string;
  state: string;
};

/** Per-user config directory (overridable with LOCALIANS_CONFIG_DIR). */
export function configDir() {
  if (process.env.LOCALIANS_CONFIG_DIR) return process.env.LOCALIANS_CONFIG_DIR;
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "localians");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "localians");
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "localians");
}

const credentialsPath = () => path.join(configDir(), "credentials.json");
const projectsPath = () => path.join(configDir(), "projects.json");
const sharesDir = () => path.join(configDir(), "shares");

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/** Writes atomically with owner-only permissions (0600 on macOS/Linux; per-user profile ACLs on Windows). */
function writePrivate(file: string, data: unknown) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  if (process.platform !== "win32") fs.chmodSync(file, 0o600);
}

export function readCredentials(): Credentials | null {
  try {
    const value = JSON.parse(fs.readFileSync(credentialsPath(), "utf8")) as Credentials;
    return value.token && value.apiUrl ? value : null;
  } catch {
    return null;
  }
}

export const saveCredentials = (credentials: Credentials) => writePrivate(credentialsPath(), credentials);

export function deleteCredentials() {
  fs.rmSync(credentialsPath(), { force: true });
}

export const credentialsFile = credentialsPath;

export function writeShare(record: ShareRecord) {
  writePrivate(path.join(sharesDir(), `${record.pid}.json`), record);
}

export function removeShare(pid = process.pid) {
  fs.rmSync(path.join(sharesDir(), `${pid}.json`), { force: true });
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Shares started by `localians share` processes that are still running on this machine. */
export function readShares(): ShareRecord[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(sharesDir()).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out: ShareRecord[] = [];
  for (const file of files) {
    try {
      const record = JSON.parse(fs.readFileSync(path.join(sharesDir(), file), "utf8")) as ShareRecord;
      if (isAlive(record.pid)) out.push(record);
      else removeShare(record.pid);
    } catch {
      // ignore unreadable files
    }
  }
  return out;
}

// ------------------------------------------------------------------ project mappings

/**
 * Which project an app is shared under, remembered per account (server + workspace + user) so a later
 * `localians share` picks the same project again, and another account never sees or uses these choices.
 * Keyed by the app's folder (its project root) and port. Holds ids and names only, no secrets.
 */
export type ProjectMapping = { projectId: string; projectName: string; port: number; updatedAt: string };
type MappingFile = { version: 1; accounts: Record<string, Record<string, ProjectMapping>> };

export function accountKey(credentials: Pick<Credentials, "apiUrl" | "workspace" | "user">) {
  return `${credentials.apiUrl.replace(/\/+$/, "")}|${credentials.workspace.id}|${credentials.user.id ?? credentials.user.email.toLowerCase()}`;
}

/** Case-insensitive on Windows and macOS (their default filesystems are). */
function folderKey(folder: string) {
  const resolved = path.resolve(folder);
  return process.platform === "win32" || process.platform === "darwin" ? resolved.toLowerCase() : resolved;
}

function readMappings(): MappingFile {
  try {
    const value = JSON.parse(fs.readFileSync(projectsPath(), "utf8")) as MappingFile;
    if (value?.version === 1 && value.accounts && typeof value.accounts === "object") return value;
  } catch {
    // missing or unreadable: start over
  }
  return { version: 1, accounts: {} };
}

/** The project remembered for this folder and port; else the folder's only remembered project (the app moved port). */
export function findMapping(account: string, folder: string, port: number): ProjectMapping | null {
  const mine = readMappings().accounts[account] ?? {};
  const exact = mine[`${folderKey(folder)}#${port}`];
  if (exact) return exact;
  const sameFolder = Object.entries(mine).filter(([key]) => key.slice(0, key.lastIndexOf("#")) === folderKey(folder));
  return sameFolder.length === 1 ? sameFolder[0][1] : null;
}

export function saveMapping(account: string, folder: string, port: number, project: { id: string; name: string }) {
  const file = readMappings();
  const mine = (file.accounts[account] ??= {});
  mine[`${folderKey(folder)}#${port}`] = { projectId: project.id, projectName: project.name, port, updatedAt: new Date().toISOString() };
  writePrivate(projectsPath(), file);
}

/** Forgets a project that no longer exists (or was archived) for this account. */
export function forgetProject(account: string, projectId: string) {
  const file = readMappings();
  const mine = file.accounts[account];
  if (!mine) return;
  for (const [key, value] of Object.entries(mine)) if (value.projectId === projectId) delete mine[key];
  writePrivate(projectsPath(), file);
}
