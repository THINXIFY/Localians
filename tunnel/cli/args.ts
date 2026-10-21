import { parseArgs } from "node:util";
import { parsePort } from "./local";

export const HELP = `Usage: localians <command> [options]

Commands:
  share <port>          Share the app running on localhost:<port> (signs you in first if needed)
  login                 Sign in to Localians through your browser
  status                Show your login and active shares
  logout                Sign out and revoke this computer's CLI access

Options for share:
  --project <id|slug>   Project to share under (default: the project that uses this port)
  -y, --yes             Create a project for this app without asking, if none uses the port
  --setup <code>        Use the project and access chosen in the dashboard's Share App page
  --host-header <mode>  "rewrite" (default) sends Host: localhost:<port>;
                        "preserve" forwards the public preview host

Global options:
  --api-url <url>       Localians server URL (or LOCALIANS_API_URL)
  --no-browser          Don't open the browser during login
  -v, --verbose         Print every forwarded request and connection details
  -h, --help            Show this help
  --version             Print the CLI version

Examples:
  localians share 5173
  localians share 5173 --project client-dashboard
  localians status
`;

export type ParsedCli =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | {
      kind: "command";
      command: "login" | "share" | "status" | "logout";
      port: number | null;
      options: { apiUrl?: string; project?: string; setup?: string; hostHeader: "rewrite" | "preserve"; browser: boolean; verbose: boolean; yes: boolean };
    };

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
        "host-header": { type: "string" },
        "no-browser": { type: "boolean" },
        verbose: { type: "boolean", short: "v" },
        yes: { type: "boolean", short: "y" },
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
  if (command !== "login" && command !== "share" && command !== "status" && command !== "logout") {
    return { kind: "error", message: `Unknown command "${command}".` };
  }

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
    command,
    port,
    options: {
      apiUrl: values["api-url"],
      project: values.project,
      setup: values.setup,
      hostHeader,
      browser: !values["no-browser"],
      verbose: Boolean(values.verbose),
      yes: Boolean(values.yes),
    },
  };
}
