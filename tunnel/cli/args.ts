import { parseArgs } from "node:util";
import { parsePort } from "./local";
import { parseDuration } from "../shared/durations";

export const HELP = `Usage: localians <command> [options]

Commands:
  share <port>          Share the app running on localhost:<port> (signs you in first if needed)
  login                 Sign in to Localians through your browser (a one-time code)
  whoami                Show which account this computer is signed in to
  status                Show your login and everything this computer is sharing
  logout                Sign out and revoke this computer's CLI access

Options for share:
  --project <id|slug>   Project to share under (default: the one remembered for this folder,
                        else the project that uses this port; you choose if several do)
  --new                 Create a new project for this app (named after it, or --name)
  --name <name>         Name for the new project (with --new)
  -y, --yes             Don't ask: create a project for this app if none uses the port
  --setup <code>        Use the project, access and duration chosen in the dashboard's Share App page
  -d, --duration <time> How long to share: 5m, 15m, 30m, 1h, 12h or 24h (default 24h;
                        3d or 7d with a Preview Pass). The link stops working after that
  --host-header <mode>  "rewrite" (default) sends Host: localhost:<port>;
                        "preserve" forwards the public preview host

Global options:
  --api-url <url>       Localians server URL (or LOCALIANS_API_URL)
  --no-browser          Don't open the browser during login
  -v, --verbose         Print every forwarded request and connection details
  -h, --help            Show this help
  --version             Print the CLI version

Examples:
  npx localians login                        Sign in once on this computer
  npx localians share 3000                   Share a Next.js / React app on port 3000
  npx localians share 5173                   Share a Vite app (in another terminal: both stay live)
  npx localians share 3000 --duration 1h     Share for one hour
  npx localians share 3000 --project shop    Share under an existing project
  npx localians share 8000 --new --name API  Share under a new project called "API"
  npx localians whoami                       Check which account you're signed in to
  npx localians status                       See what this computer is sharing

Share several apps at once: run one "localians share" per app, each in its own terminal.
Stop sharing: press Ctrl+C in the window where "localians share" is running.
Switch accounts: "localians logout", then "localians login".
`;

export type ParsedCli =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | {
      kind: "command";
      command: Command;
      port: number | null;
      options: {
        apiUrl?: string;
        project?: string;
        setup?: string;
        durationMinutes?: number;
        hostHeader: "rewrite" | "preserve";
        browser: boolean;
        verbose: boolean;
        yes: boolean;
        /** --new: create a new project (named --name, or after the app). */
        newProject: boolean;
        name?: string;
      };
    };

const COMMANDS = ["login", "share", "status", "whoami", "logout"] as const;
type Command = (typeof COMMANDS)[number];

export function parseCli(argv: string[]): ParsedCli {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        "api-url": { type: "string" },
        project: { type: "string" },
        setup: { type: "string" },
        duration: { type: "string", short: "d" },
        "host-header": { type: "string" },
        "no-browser": { type: "boolean" },
        verbose: { type: "boolean", short: "v" },
        yes: { type: "boolean", short: "y" },
        new: { type: "boolean" },
        name: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean" },
      },
    });
  } catch (error) {
    return { kind: "error", message: (error as Error).message.replace(/^TypeError \[[A-Z_]+\]: /, "") };
  }
  const { values, positionals } = parsed;
  if (values.version) return { kind: "version" };
  if (values.help || positionals.length === 0 || positionals[0] === "help") return { kind: "help" };

  const [command, ...rest] = positionals;
  if (!(COMMANDS as readonly string[]).includes(command)) return { kind: "error", message: `Unknown command "${command}".` };

  const hostHeader = values["host-header"] ?? "rewrite";
  if (hostHeader !== "rewrite" && hostHeader !== "preserve") return { kind: "error", message: `--host-header must be "rewrite" or "preserve".` };

  if (values["api-url"]) {
    try {
      const url = new URL(values["api-url"]);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    } catch {
      return { kind: "error", message: "--api-url must be an http(s) URL." };
    }
  }

  let durationMinutes: number | undefined;
  if (values.duration !== undefined) {
    if (command !== "share") return { kind: "error", message: "--duration only applies to share." };
    const minutes = parseDuration(values.duration);
    if (minutes === null) return { kind: "error", message: `"${values.duration}" isn't a duration Localians offers. Use 5m, 15m, 30m, 1h, 12h or 24h (3d or 7d with a Preview Pass).` };
    durationMinutes = minutes;
  }

  if ((values.new || values.name !== undefined) && command !== "share") return { kind: "error", message: "--new and --name only apply to share." };
  if (values.name !== undefined && !values.new) return { kind: "error", message: "--name names a new project: use it with --new." };
  if (values.new && values.project) return { kind: "error", message: "Use --project for an existing project, or --new for a new one, not both." };
  if (values.new && values.setup) return { kind: "error", message: "--setup already says which project to use; leave out --new." };
  if (values.name !== undefined && !values.name.trim()) return { kind: "error", message: "--name can't be empty." };

  let port: number | null = null;
  if (command === "share") {
    if (rest.length !== 1) return { kind: "error", message: "Usage: localians share <port>   (for example: localians share 3000)" };
    port = parsePort(rest[0]);
    if (port === null) return { kind: "error", message: `"${rest[0]}" isn't a valid port. Use a number from 1 to 65535.` };
  } else if (rest.length) {
    return { kind: "error", message: `"${command}" doesn't take arguments.` };
  }

  return {
    kind: "command",
    command: command as Command,
    port,
    options: {
      apiUrl: values["api-url"],
      project: values.project,
      setup: values.setup,
      durationMinutes,
      hostHeader,
      browser: !values["no-browser"],
      verbose: Boolean(values.verbose),
      yes: Boolean(values.yes),
      newProject: Boolean(values.new),
      name: values.name?.trim().replace(/\s+/g, " ").slice(0, 80),
    },
  };
}
