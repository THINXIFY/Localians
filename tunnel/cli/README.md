# localians

Share the app running on your computer with a secure HTTPS preview link — public, or protected with a password.

```bash
npx localians share 3000
```

No install, no account setup in the terminal, no flags. Works on Windows, macOS and Linux with Node.js 20+.

1. Start your app as usual (`npm run dev`) and note its port (3000 for Next.js, 5173 for Vite, …).
2. In a second terminal, in your project folder, run `npx localians share <port>`. The first time, your browser opens
   so you can approve this computer — once.
3. Copy the preview link it prints and send it. Keep the command running while you share; press **Ctrl+C** to stop.

The project is named after your app (from `package.json`, `pyproject.toml`, `Cargo.toml`, `composer.json` or `go.mod`,
else the folder name). Prefer clicking? The dashboard’s **Share App** page gives you a ready-made command with your
project and password already chosen.

## Commands

| Command | What it does |
| --- | --- |
| `localians share <port>` | Share `localhost:<port>` (signs in first if needed) |
| `localians share <port> --setup <code>` | Use the project and access chosen in the dashboard's Share App page |
| `localians share <port> --project <name>` | Share under a specific project |
| `localians login` | Sign this computer in |
| `localians status` | Show your login and what this computer is sharing |
| `localians logout` | Sign out and revoke this computer's access |

Options: `-d, --duration <time>` (how long the link works: `5m`, `15m`, `30m`, `1h`, `12h` or `24h`; default 24h), `-y, --yes` (create a project without asking, for scripts), `--host-header preserve`, `-v, --verbose`,
`--no-browser`, `--api-url <url>` (only needed for a self-hosted server). Run `localians --help` for details.

Exit codes: `0` ok, `1` other error, `2` usage, `3` login needed, `4` nothing running on that port, `5` Localians unreachable.

## Security

- The CLI only forwards to your own computer (127.0.0.1 / ::1) on the port you choose.
- It connects outward over TLS — no router or firewall changes.
- Its access token is stored in your user config directory (owner-only permissions), never printed, and can be revoked
  from the dashboard at any time.
- Public previews can be opened by anyone with the link. Enable password protection in the dashboard to restrict access.

Requires Node.js 20 or newer on Windows, macOS or Linux. Docs: https://github.com/THINXIFY/Localians

## License

MIT — see [LICENSE](LICENSE). This license covers the `localians` CLI package only; the Localians service is not
open source.
