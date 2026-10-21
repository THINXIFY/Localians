const colorEnabled = () => process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";

const wrap = (open: number, close: number) => (text: string) => (colorEnabled() ? `\x1b[${open}m${text}\x1b[${close}m` : text);

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  green: wrap(32, 39),
  lime: (text: string) => (colorEnabled() ? `\x1b[38;2;184;255;59m${text}\x1b[39m` : text),
  yellow: wrap(33, 39),
  red: wrap(31, 39),
  cyan: wrap(36, 39),
};

export const out = (line = "") => process.stdout.write(`${line}\n`);
export const err = (line = "") => process.stderr.write(`${line}\n`);

export function banner() {
  out();
  out(`  ${c.lime("■")} ${c.bold("LOCALIANS")}`);
  out();
}

export const row = (label: string, value: string) => out(`  ${c.dim(label.padEnd(18))}${value}`);

export function fail(message: string, hint?: string) {
  err(`\n  ${c.red("✖")} ${message}`);
  if (hint) err(`    ${c.dim(hint)}`);
  err();
}

export function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}

/** Exit codes, so scripts can react to specific failures. */
export const EXIT = {
  ok: 0,
  error: 1,
  usage: 2,
  auth: 3,
  localUnreachable: 4,
  gatewayUnavailable: 5,
  interrupted: 130,
} as const;
