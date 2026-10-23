import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type Credentials = {
  apiUrl: string;
  /** CLI access token. Never printed. */
  token: string;
  expiresAt: string;
  user: { email: string; name: string };
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
