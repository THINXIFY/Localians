import { HELP, parseCli } from "./args";
import { login, logout, share, status, VERSION } from "./commands";
import { EXIT, fail } from "./ui";

async function main(argv: string[]) {
  const parsed = parseCli(argv);
  switch (parsed.kind) {
    case "help":
      process.stdout.write(HELP);
      return EXIT.ok;
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return EXIT.ok;
    case "error":
      fail(parsed.message, "Run `localians --help` for usage.");
      return EXIT.usage;
  }
  const { command, port, options } = parsed;
  if (command === "login") return login(options);
  if (command === "logout") return logout(options);
  if (command === "status") return status(options);
  return share(port!, options);
}

const [major] = process.versions.node.split(".").map(Number);
if (major < 20) {
  fail(`Localians needs Node.js 20 or newer (you have ${process.versions.node}).`);
  process.exit(EXIT.error);
}

// Last-resort guard: print a readable message instead of a stack trace.
process.on("uncaughtException", (error) => {
  fail(`Unexpected error: ${error.message}`, process.argv.includes("--verbose") || process.argv.includes("-v") ? error.stack : "Re-run with --verbose for details.");
  process.exit(EXIT.error);
});

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    fail(error instanceof Error ? error.message : "Unexpected error.");
    process.exit(EXIT.error);
  },
);
