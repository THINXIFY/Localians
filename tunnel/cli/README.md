# localians

Share the app running on your computer with a secure HTTPS preview link — public, or protected with a password.

```bash
npx localians share 5173
```

1. Start your app as usual (`npm run dev`) and note its port.
2. Run `localians share <port>` in another terminal. The first time, your browser opens to approve this computer.
3. Copy the preview link it prints and send it. Keep the command running while you share; press Ctrl+C to stop.

## Commands

| Command | What it does |
| --- | --- |
| `localians share <port>` | Share `localhost:<port>` (signs in first if needed) |
| `localians share <port> --setup <code>` | Use the project and access chosen in the dashboard's Share App page |
| `localians share <port> --project <name>` | Share under a specific project |
| `localians login` | Sign this computer in |
| `localians status` | Show your login and what this computer is sharing |
| `localians logout` | Sign out and revoke this computer's access |

Options: `-y, --yes` (create a project without asking, for scripts), `--host-header preserve`, `-v, --verbose`,
`--no-browser`, `--api-url <url>`. Run `localians --help` for details.

## Security

- The CLI only forwards to your own computer (127.0.0.1 / ::1) on the port you choose.
- It connects outward over TLS — no router or firewall changes.
- Its access token is stored in your user config directory (owner-only permissions), never printed, and can be revoked
  from the dashboard at any time.
- Public previews can be opened by anyone with the link. Enable password protection in the dashboard to restrict access.

Requires Node.js 20 or newer. Docs: https://github.com/THINXIFY/Localians
