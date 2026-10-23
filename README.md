# Localians

Secure localhost previews for developers who move fast.

Localians gives a web app running on a developer's computer a temporary HTTPS preview link — public or
password protected — without deploying anything. A small CLI opens an outbound tunnel to a gateway; the dashboard
manages projects, live previews, access and analytics.

## Status

Stage 1, Phases 1–5 are implemented and tested locally, including real end-to-end runs: HTTPS gateway with a local CA,
the real CLI, and real Next.js and Vite dev servers.

**Not done yet (Phase 6):**
- Public-internet deployment: domain, wildcard DNS and TLS, hosting.
- npm publication of the CLI.
- Production email (Resend) and GitHub OAuth credentials.

`docker-compose.yml` and the gateway `Dockerfile` are written but haven't been run.

## Features

- **Landing site and docs:** Getting Started, CLI, framework, troubleshooting and security guides.
- **Accounts:** email/password with verification and reset, optional GitHub sign-in, sessions, personal workspaces.
- **Projects:** create, edit, archive, restore and delete.
- **Share App wizard:** Choose Port → Run Command → Share Link. A one-time setup code carries the project and
  access choice to the CLI.
- **CLI:** `localians share <port>` signs the computer in through the browser when needed (RFC 8628 device flow).
  Also `login`, `status` and `logout`.
- **Tunnel:** HTTP, streaming and WebSockets, including hot reload. Reconnects with backoff; loopback-only forwarding.
- **Password-protected previews:** HTTP, API and WebSocket requests are all checked; revocable, expiring visitor
  access.
- **Live Previews dashboard:** real gateway status, copy/open/stop, details and history; updates live over SSE.
- **Analytics:** idempotent traffic metering in hourly buckets, charts, per-project breakdown.
- **Abuse protection:** shared PostgreSQL rate limiting, configurable quotas.
- **Operations:** health and readiness checks, structured logs, error reporting.

The table below maps the main parts of the codebase:

| Part | Path | What it is |
| --- | --- | --- |
| Web app / control plane | `src/` | Marketing site, auth, dashboard, project management, CLI + tunnel APIs (Next.js) |
| Tunnel gateway | `tunnel/gateway/` | Long-running service that serves preview hosts and accepts CLI tunnels |
| CLI | `tunnel/cli/` | `localians login / share / status / logout` (npm package `localians`, not yet published) |
| Shared protocol | `tunnel/shared/` | Protocol constants, header sanitisation, backoff |

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 7 · Better Auth · Zod ·
React Hook Form · Motion · `jose` (JWT) · Vitest · Playwright · esbuild

## Quick start (web app)

Requirements: Node.js 20+ (tested on Node 24). No system PostgreSQL or Docker is needed.

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then set BETTER_AUTH_SECRET, TUNNEL_TOKEN_SECRET, GATEWAY_API_SECRET
npm run db:start            # project-local PostgreSQL on :5433 — leave it running
npm run db:migrate          # apply migrations
npm run dev                 # http://localhost:3001
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

`npm run db:start` runs real PostgreSQL binaries (`embedded-postgres`) with data in `.localians-dev/postgres`.
Point `DATABASE_URL` at any other PostgreSQL to use that instead. `docker-compose.yml` offers the same
services for machines with Docker (written but not yet run — Docker wasn't available while building).

**Email:** with `EMAIL_TRANSPORT=console`, verification/reset emails are printed to the dev-server terminal
instead of being sent. Set `RESEND_API_KEY` + `EMAIL_FROM` for real delivery. Console/outbox transports are
refused in production. **GitHub sign-in** needs `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (callback
`<BETTER_AUTH_URL>/api/auth/callback/github`); without them the button shows "not configured".

## Running the tunnel locally

Local simulation uses `*.preview.localhost` (browsers resolve `*.localhost` to your machine) and a locally
generated certificate authority, so it exercises real TLS without public DNS.

```bash
npm run tunnel:certs        # local CA + gateway cert in .localians-dev/certs (needs openssl)
npm run tunnel:build        # bundles tunnel/cli/dist/localians.js and tunnel/gateway/dist/gateway.js
npm run gateway:start       # gateway on https://127.0.0.1:8443 (reads .env)

# Once: put your locally built `localians` command on your PATH (or run node tunnel/cli/dist/localians.js).
# (`npx localians` runs the published package, which talks to localians.com, not to this local server.)
cd tunnel/cli && npm link && cd ../..
export NODE_EXTRA_CA_CERTS="$PWD/.localians-dev/certs/ca.crt"   # trust the local CA (from the repo root)

# In your app's folder, with its dev server running (e.g. on :3000):
localians share 3000      # signs this computer in through the browser the first time
```

Open the printed `https://<label>.preview.localhost:8443` URL in Chrome/Edge (accept the local certificate,
or import `ca.crt`). `examples/next-app` and `examples/vite-app` are ready-made apps for trying it, including
hot reload. This is a **local simulation**: it does not prove internet reachability.

## How the tunnel works

```
Visitor ──HTTPS──▶ Gateway (<label>.<preview domain>) ──HTTP/2 stream──▶ CLI ──HTTP──▶ localhost:<port>
                     ▲                                       │
                     └──── outbound TLS connection from the CLI (no port forwarding needed)
Gateway ──reports connect / heartbeat / metering──▶ Control plane (Next.js) ──▶ PostgreSQL
```

1. `localians login` runs the OAuth 2.0 Device Authorization Grant (RFC 8628): the user approves a code at
   `/cli/activate`; the CLI receives a workspace-scoped token (`lcl_…`, 90 days, revocable). Only its SHA-256
   hash is stored. Dashboard session cookies are never used by the CLI.
2. `localians share <port>` checks the local port (loopback only), resolves the project, and creates a tunnel
   session. The control plane allocates an unguessable 60-bit label (never reused) and signs a 2-minute,
   single-use connect token (HS256 JWT).
3. The CLI connects to the gateway with `Upgrade: localians-tunnel/1`. After `101`, the socket carries
   **HTTP/2 with reversed roles** — each public request is one stream, giving multiplexing, flow control and
   cancellation from a standard protocol. WebSockets ride a stream as raw bytes after the local `101`.
4. The gateway pings each tunnel every 20s, reports to `/api/internal/gateway/events`, and terminates tunnels
   whose credential was revoked or whose session expired. If the CLI or the dev server stops, visitors get a
   branded error page — never stale content.

Session states: `CONNECTING → CONNECTED ⇄ RECONNECTING → DISCONNECTED | EXPIRED | REVOKED`. These are
separate from a project's Active/Archived status.

## Preview plans: Free and the 7-Day Pass

| | Free | 7-Day Preview Pass |
| --- | --- | --- |
| Price | $0 | $5 one-time (USDT on BSC), no renewal |
| Time | One 24-hour window per project, starting with its first share | 7 more days for one project; a renewal starts when the current pass ends |
| Link | Random, unguessable | Random, or the project's reserved custom URL (`agentaxio.preview.localians.com`) |
| Password protection | Yes | Yes |

Rules (server-enforced for the dashboard, CLI, VS Code and the API — `src/server/plans.ts`):

- A share is authorized inside the same database transaction that creates the session, under the project's row lock.
  The first share starts the project's free window (`free_preview_grants`); restarts, reconnects, another port or a
  new setup code stay inside it and never outlive it. Afterwards: `402 free_used` until a pass is added.
- Abuse limit: `QUOTA_FREE_PREVIEWS_PER_30_DAYS` (default 3) new free windows per workspace and per user per rolling
  30 days. Windows of deleted projects still count.
- Shorter auto-stops (5 min – 12 h; 24 h and 3 days with a pass) are optional; by default a share runs until the
  free window / pass ends. Live previews that run "until the plan ends" are extended when a pass is renewed.
- Passes (`preview_passes`) are created only by an approved upgrade request or an operator. Revoking one (refund)
  cuts live previews back.
- At pass expiry previews stop (the gateway enforces the deadline); the custom URL stays reserved for 3 days for
  renewal, then is released into a 30-day quarantine. A pass never keeps a computer or app online: when the CLI or app
  stops, the preview shows Offline.
- **Migration policy:** nothing is retroactive. Projects that had previews before this release get their full free
  window at their next share; sessions live at deploy time keep their existing expiry.

### Preview timers

Every preview has a deadline (`tunnel_sessions.expiresAt`, the authority):

How the deadline is enforced:

- **Control plane:** `tunnel_sessions.expiresAt` is the authority. Expired sessions can't get a reconnect token
  ("This preview's time is up"), the stale sweep ends them, and gateway reports for them are answered with *terminate*.
- **Gateway:** the access policy it receives on connect and with every heartbeat carries `expiresAt`. The gateway
  refuses requests and WebSocket upgrades from that moment and closes the tunnel with its own timer, without waiting
  for a heartbeat. Visitors then get a 410 *This preview has expired* page. Gateways from before this change ignore
  the field and close the tunnel at their next heartbeat (about 20 s later).
- **Restarts and reconnects:** the deadline lives in the database, so a restarted gateway or a CLI reconnecting
  with a still-valid connect token is refused.

Statuses in the dashboard: **Connected**, **Reconnecting** (the CLI dropped and is coming back), **Expired** (its
time ran out) and **Offline** (it ended because the CLI or computer went away). "Share again" starts a new session.
`QUOTA_SESSIONS_PER_DAY` caps how many previews a user can start per 24 hours, so short free sessions can't be
restarted without limit.

## Admin panel and payments

`/admin` (Dashboard, Users, Payments) is for operators only. Every admin page and action checks on the server that the
account has the `ADMIN` role, is active, and signed in within the last 12 hours. `/admin/login` only gives sessions to
admin accounts (other accounts get the same "Invalid email or password" answer), is rate limited per IP and email, and
every sign-in is audited. There is no admin registration.

**Create the first administrator** (once, on the server, with the production environment):

```bash
sudo -u localians bash -c 'cd /srv/localians/current && node --env-file=/etc/localians/web.env node_modules/.bin/tsx scripts/create-admin.ts'
# asks for the password (hidden, twice) for hello@thinxify.com; --email to use another address
```

The password is hashed with Better Auth's scrypt and never printed, logged or stored elsewhere. The script refuses to
run when an administrator already exists, or when the email belongs to a regular account.

**Accounts.** Every user has a permanent public ID (`LOC-000001`, assigned in registration order) and a unique username
(chosen at sign-up; existing and GitHub accounts choose one at `/username`). The internal auth ID is never shown.
Admins can search users, edit name and username, suspend / reactivate (signs them out everywhere, revokes CLI logins,
stops their previews) and delete — which deactivates and anonymises the account but keeps payment and audit records.

**7-Day Pass payments (manual review).** While payments are on (Admin → Settings), "Upgrade for $5" creates an upgrade request with
an Order ID (`ORD-…`), holds the chosen custom URL for 15 minutes, emails `ADMIN_NOTIFY_EMAIL`, and shows the payment
details: 5 USDT on BNB Smart Chain (BEP20) to `0x2f94b75535eff533378c90f8dda29cf10208b174`, the QR code, and a field
for the transaction hash. In `/admin/payments` an operator:

1. **Marks it Under Review**, and attaches the hash if the customer only emailed it.
2. **Verifies on BSC** — the server checks, through `BSC_RPC_URL`: chain 56, the transaction succeeded, a Tether USD
   (BEP20, `0x55d3…7955`) transfer to the Localians wallet of at least 5 USDT, ≥ 15 confirmations, made after the
   request. The result is recorded on the request.
3. **Approves & Activates** (only after a passing check — also enforced by a database constraint). One transaction
   creates the pass, enables the custom URL and records the reviewer; double approvals and reused hashes are
   impossible (row lock, unique hash, one pass per request). The customer is emailed. Or **Rejects** with a reason.

The QR is generated at render time from the wallet address itself (`src/lib/payment-qr.ts`, called from
`paymentInfo()`), so it can't disagree with the address beside it and no image file has to be deployed. A unit test
decodes the generated code and requires it to equal the address. While payments are off, the address and QR
are not sent to the browser at all and the dialog shows "Payments coming soon".

**Admin → Settings (`/admin/settings`)** is where payments are managed, without redeploying:

- *Payment system on/off* — stored in the `payment_settings` row, the single authority read by the checkout, the order
  API and the public pages. Turning it on asks for confirmation. Off: no new orders, no wallet or QR shown ("Payments
  coming soon"); existing orders, records and passes are untouched. Every change is in `audit_logs`. The homepage,
  Terms and Privacy Policy are static pages; a change revalidates them immediately (and they refresh every 5 minutes).
  The row is created on first use from `PAYMENTS_ENABLED`; after that the variable is ignored.
  `PAYMENTS_EMERGENCY_DISABLE=on` in `web.env` is a server-side kill switch that forces payments off (restart to apply).
- *USDT wallet (BNB Smart Chain, BEP20)* — new orders pay to it. Changing it validates the address (format + EIP-55
  checksum), shows old → new, requires the admin's password again, audits both values and emails hello@thinxify.com
  (and `ADMIN_NOTIFY_EMAIL`). Each order stores its own wallet and QR snapshot (`upgrade_requests.recipient`,
  `qrImageId`) and is verified on chain against that, so a change never affects open orders.
- *QR code* — generated from the wallet by default (always matches). An uploaded PNG/JPEG/WebP (≤ 2 MB) is decoded on
  the server and accepted only if it points to exactly the configured wallet; it is re-encoded (metadata stripped),
  stored outside `public/` under a random name and served by an access-checked route. Changing the wallet drops it.

**Turning payments on in production** (needs the owner's approval):
1. Add `LOCALIANS_UPLOAD_DIR=/srv/localians/uploads` to `/etc/localians/web.env` and create the folder (see
   `deploy/README.md`), then deploy: `sudo -u localians /srv/localians/bin/deploy.sh main`.
2. Sign in at `/admin/login` → **Settings** → turn **Accept payments** on → **Save changes** → confirm.
3. Check: sign in as a customer, open Share App → **Upgrade for $5**: the plan, wallet, QR, copy button and **Get my
   Order ID** show immediately. Create a test order, then cancel it.

**Payment risks to know about (documented, not solved by code):**
- *Shared wallet.* The recipient is a Binance deposit address. The chain proves that a transfer of at least 5 USDT
  reached the address, not who sent it. Anyone can submit someone else's hash; the first order to claim a hash keeps it
  (hashes are unique), and the real payer is then caught only by the admin's review of the emailed proof (Order ID,
  username, screenshot) and Binance's deposit history. Two customers paying the same amount at similar times can't be
  told apart on-chain. Stronger fixes need a code change: a unique amount per order, or a deposit address per order.
- *Off-chain transfers.* Binance-to-Binance (internal) transfers and Binance Pay don't appear on BSC and can't pass the
  on-chain check; ask the customer to send an on-chain BEP20 transfer.
- *Wrong network or token.* Funds sent on another network or token are usually unrecoverable.
- *The RPC node is trusted.* Verification reads BSC through `BSC_RPC_URL`; a malicious or broken node could answer
  falsely. It requires 15 confirmations and a human approval, but use a node you trust.
- *Screenshots are never proof.* Nothing activates from a screenshot or an emailed hash alone; approval is blocked
  until the server-side check passes (also a database constraint). Screenshots can contain personal data.
- *No secrets are involved.* The app holds only a public address: no private keys, seed phrases or exchange API keys.
  Changing the address means changing `PASS_PRICE.recipient` in code (reviewed, tested, redeployed).

**Deployment requirements for this release:** run the migrations (`npx prisma migrate deploy`, via `deploy.sh`), deploy
the gateway before setting `PREVIEW_CUSTOM_NAMES=on`, create the first admin as above, and keep
payments off in Admin → Settings until the payment workflow is approved.

## Live previews, analytics and session control (Phase 4)

The dashboard (**Live Previews**, preview details, project pages, **Analytics**, Overview) reads only real data
from the gateway and PostgreSQL.

**Status shown = what the gateway is doing.** A `CONNECTED` row isn't trusted on its own: the web app asks the
gateway's control API which tunnels it is routing (`GET /v1/tunnels`, cached 2 s per process). If the gateway
can't be reached, status falls back to heartbeat freshness (a connected session must have heartbeated within 45 s),
and the UI says so. `FAILED` is shown for sessions that ended without the CLI ever connecting.

**Stopping a preview** (`stopPreview` in `src/server/previews.ts`):
1. Session owner or workspace owner only. Other members get 403; other workspaces get 404.
2. The session is ended in the database (`REVOKED`, "Stopped from the dashboard"). From now on, every gateway
   report for it is answered with *terminate*, and the API refuses new connect tokens (410).
3. `POST /v1/sessions/<id>/terminate` on the gateway closes the tunnel immediately and blocks the session id,
   so even a still-valid connect token minted earlier can't reconnect it.
4. The gateway confirms it no longer routes the session. If it's unreachable, the stop still stands and the
   gateway drops the tunnel at its next heartbeat (≤ `GATEWAY_HEARTBEAT_MS`, default 20 s). The UI tells you which
   case happened. Repeated stops are harmless.

### Traffic accounting

| Question | Answer |
| --- | --- |
| What is one request? | One HTTP request forwarded to the CLI. A WebSocket upgrade counts as one request. Requests rejected by the gateway (rate limits, unknown host, oversized) aren't counted. |
| Bytes in / out | `bytesIn`: request bodies + visitor→app WebSocket data. `bytesOut`: response bodies + app→visitor WebSocket data. "Bandwidth" = in + out. |
| Overhead | Headers, TLS and HTTP/2 framing are **not** counted. |
| When is it written? | The gateway reports every heartbeat (20 s) and on disconnect. Each report carries **cumulative** counters for one physical connection (`connectionId`). |
| Double counting | The control plane stores the last counters applied per connection (`tunnel_connections`) and adds only the increase, inside a transaction that locks the session row. Redelivered, retried or out-of-order reports add nothing, and a reconnect or gateway restart starts a new connection with its own counters. Undelivered disconnect reports are queued on the gateway and retried. |
| Gaps | A gateway crash loses up to one heartbeat interval of that gateway's unreported traffic (an undercount, never a double count). |
| Time series | Increases go into per-session UTC-hour buckets (`tunnel_metrics`), indexed by workspace and project. Analytics folds them into hour, 6-hour or day bins. Traffic from before Phase 4 has no buckets and isn't charted. |
| Retention | Hourly buckets and lifecycle events: 90 days. Closed connection rows: 90 days. Session rows (and their lifetime totals) are kept. Pruning runs at most hourly. |

No request bodies, headers, paths or cookies are stored for analytics.

### Real-time updates

`GET /api/dashboard/events` streams Server-Sent Events to signed-in dashboard tabs:

- It is authenticated with the session cookie, scoped to the user's workspace membership, and re-checks the session every 15 s.
- Every 2 s (`DASHBOARD_EVENTS_POLL_MS`) it compares each preview's effective status and counters with what the
  tab already saw, and sends only the changes. Pages then refresh their server-rendered data and announce
  status changes to screen readers.
- Each stream ends after ~50 s. The browser reconnects automatically and resumes from `Last-Event-ID`, so it
  works on hosts that limit request duration (serverless included).
- `?mode=poll` returns one batch as JSON. The client falls back to it with backoff (5 s → 60 s) when streaming fails.
- Streams close while the tab is hidden and on navigation.
- The source of truth is PostgreSQL plus the gateway, so it works across several web instances without a
  message bus. The dashboard event channel is entirely separate from the tunnel protocol.

### Gateway control API

The gateway's admin listener (`GATEWAY_ADMIN_PORT`, bound to `GATEWAY_ADMIN_HOST`, default `127.0.0.1`) serves
`/healthz`, `/metrics` and, with `Authorization: Bearer <GATEWAY_API_SECRET>`, the control routes. It is never
reachable through preview hosts or the tunnel host. Set `GATEWAY_CONTROL_URL` on the web app to its address. If
the two run on different machines, expose it only on a private network.

### Security model

- Preview requests are routed only for exact `<label>.<preview domain>` hosts; absolute-form request targets
  are rejected (no open proxy). The forwarding target is fixed by the CLI's arguments and is always loopback.
- Hop-by-hop headers are stripped; client `X-Forwarded-*`/`Forwarded` are replaced with values the gateway
  computes; `localians.*` dashboard cookies are removed before reaching an app.
- Limits: request body (25 MB), response size (512 MB), response timeout (60s), per-tunnel and per-IP rate
  limits, streams per tunnel, tunnels per gateway, 5 active shares per user, 24h session lifetime.
- Logs are structured JSON with metadata only — no bodies, cookies, Authorization headers, tokens or query strings.
- Health/metrics run on a separate loopback-only listener.
- **Access model:** public previews can be opened by anyone with the link while sharing is on (random URLs are not
  access control). Password-protected previews require the project password first — see "Security & reliability".

## Deploying

The production runbook for a VPS (systemd + Nginx + PostgreSQL, web app on 127.0.0.1:4000) is in
[`deploy/README.md`](deploy/README.md), with environment template [`.env.production.example`](.env.production.example).
`docker-compose.yml` is for local development only. The summary below lists what any deployment needs.

**Production target** (not deployed yet — DNS, certificates and server setup are pending):

| Hostname | Role |
| --- | --- |
| `https://localians.com` (+ `www` redirect) | website, dashboard, auth, API, CLI authorization |
| `https://tunnel.localians.com` | CLI tunnel connections |
| `https://<label>.preview.localians.com` | preview links |

The web app runs on `127.0.0.1:4000` and the gateway on `127.0.0.1:4100`/`4101`, behind Nginx on a Hostinger VPS
(`2.25.169.72`) that also hosts other sites. DNS records, certificates (including the wildcard for previews) and the
step-by-step setup are in [`deploy/README.md`](deploy/README.md).

**Beta security note:** previews share the registrable domain `localians.com` with the dashboard. Auth cookies are
host-only `__Host-` cookies and cross-origin requests are rejected, but previews are same-site. See the risk
assessment in [`deploy/README.md` §8](deploy/README.md#8-security-previews-on-the-same-registrable-domain-beta), and
move previews to a separate registrable domain before opening sharing to untrusted users.

### Scaling beyond one gateway

The MVP keeps live tunnels in one gateway's memory. For several gateways: record `gatewayId` per session
(already stored), route `<label>` hosts to the owning gateway (a shared registry such as Redis, or consistent
hashing at the load balancer), move rate-limit and replay-guard state to that shared store, and have the
control plane hand the CLI a specific gateway URL.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Web app on port 3001 |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run db:start` / `db:migrate` / `db:deploy` / `db:studio` | Local PostgreSQL / migrations / Prisma Studio |
| `npm run tunnel:certs` / `tunnel:build` | Local TLS certificates / bundle CLI and gateway |
| `npm run gateway:start` | Run the bundled gateway with `.env` |
| `npm run cli -- <args>` | Run the CLI from source (tsx) |
| `npm test` | Unit + integration tests (real PostgreSQL test DB; includes in-process tunnel tests) |
| `npx playwright test -c playwright.tunnel.config.ts tests/tunnel-e2e/previews.spec.ts` | Phase 4 dashboard against the real CLI + HTTPS gateway (stop, live updates, analytics) |
| `npm run build && npm run test:e2e` | Browser tests for the site, auth and dashboard |
| `npm run build && npm run tunnel:build && npx playwright test -c playwright.tunnel.config.ts` | Real local tunnel E2E: CLI login, HTTPS gateway, Next.js + Vite dev servers with HMR |
| `BENCH=1 npx vitest run` | Tunnel latency/throughput measurement |

Tests use the `localians_test` database (migrated and emptied on every run); the dev database is never touched.

## Troubleshooting

- **Next.js hot reload doesn't work through a preview** — add `allowedDevOrigins: ["*.<preview domain>"]` to
  `next.config` (see `examples/next-app`).
- **Vite rejects the host** — only with `--host-header preserve`; add the preview domain to `server.allowedHosts`.
- **CLI: "self-signed certificate" locally** — set `NODE_EXTRA_CA_CERTS` to `.localians-dev/certs/ca.crt`.
- **CLI: "The tunnel service isn't configured"** — the web app is missing the `TUNNEL_*` variables.
- **Visitors see "The app isn't running"** — the tunnel is up but the local dev server isn't responding.
- **Dashboard says "statuses are based on the last heartbeat"** — the web app can't reach the gateway control API; check `GATEWAY_CONTROL_URL` and that the gateway runs with `GATEWAY_ADMIN_PORT`.
- **Live indicator says "Auto-refreshing"** — Server-Sent Events are blocked (e.g. a buffering proxy); the dashboard is polling instead. Disable response buffering for `/api/dashboard/events`.

## Developer onboarding (Share App)

- **Dashboard:** the Overview leads with what Localians does and how to share. **Share App** (`/dashboard/share`) is a
  three-step wizard: pick the port → copy the exact command → the real preview link appears as soon as the CLI
  connects. It only follows the signed-in user's own sessions in their workspace (`/api/dashboard/share-status`),
  never another user's preview on the same port.
- **CLI:** `localians share <port>` signs the computer in through the browser when needed (first run, expired or
  revoked login), then continues. If no project uses the port it asks before creating one (`--yes` allows it
  non-interactively; `--project` picks one). A port with nothing running gets a plain message, not a stack trace.
  The CLI approval page lets users with several workspaces choose which one the computer may share into.
- **Which server the CLI uses:** `npm run tunnel:build` bakes in `LOCALIANS_DEFAULT_API_URL` (falling back to
  `BETTER_AUTH_URL` from `.env`). Set it to the production web app before publishing the package.
- **npx:** the package is published on npm (`localians@0.1.0`). The dashboard shows `localians …` (the linked build) until a
  deployment sets `LOCALIANS_CLI_PUBLISHED=1`; then it shows `npx localians …`. This is deliberately a setting rather than an npm
  registry check, since someone else could publish a package with that name first.
- **Docs:** `/docs/getting-started`, `/docs/cli`, `/docs/frameworks`, `/docs/troubleshooting`, `/docs/security`.

## Security & reliability (Phase 5)

**Password-protected previews.** Access is a project setting (`Preview access` on the project page, or the Share App
wizard): `PUBLIC` or `PASSWORD`. Passwords are stored as salted scrypt hashes (`src/server/access.ts`).

- The **gateway enforces it** for every HTTP request, API call and WebSocket upgrade on the preview host. Without a
  valid visitor cookie, browsers get a branded password page (`401`), other clients a plain `401`. Nothing reaches the app.
- The password page posts to `/__localians/access` on the preview host. The gateway asks the control plane
  (`POST /api/internal/gateway/access`, bearer `GATEWAY_API_SECRET`); hashes never leave the control plane.
- On success the gateway sets `localians.preview_access` (`__Host-` prefixed over HTTPS): HttpOnly, SameSite=Lax,
  HMAC-signed `{label, policy version, expiry}`. It's valid only for that preview link, until the chosen duration
  (1 h–7 days), and until the password changes or visitors are signed out (the version bumps). Like every `localians.*`
  cookie, it's stripped before requests reach the app. Return paths are restricted to same-site paths.
- **Policy delivery:** each heartbeat verdict carries the session's policy. Dashboard changes are also pushed at once
  (`POST /v1/sessions/<id>/policy` on the gateway control API). A tunnel whose policy hasn't been confirmed yet serves
  `503` ("This preview is starting"), so a protected preview is never briefly public.
- **Brute force:** 5 quick attempts per visitor per preview at the gateway, plus 8 per visitor IP and 60 per preview
  per 5 minutes in the shared store.

**Shared rate limiting.** `rateLimit()` (`src/server/rate-limit.ts`) is a PostgreSQL fixed window (`rate_limit_windows`,
one atomic upsert per hit), so limits hold across any number of web instances. Redis isn't required at this scale.
The gateway keeps its per-request limits in memory, so they cost no network round trip.

**Quotas** (environment, per deployment):

| Variable | Default | Effect |
| --- | --- | --- |
| `QUOTA_ACTIVE_PREVIEWS_PER_USER` | 5 | Shares running at once per user |
| `QUOTA_MAX_SHARE_HOURS` | 24 | Longest free session (at most 24). Developers choose 5 min, 15 min, 30 min, 1 h, 12 h or 24 h; older CLI / VS Code versions that don't choose get this |
| `QUOTA_SESSIONS_PER_DAY` | 100 | New previews one user may start per rolling 24 hours (stops short free sessions from being restarted without limit) |
| `QUOTA_DAILY_BANDWIDTH_MB` | 10240 | Preview traffic per workspace per UTC day. New shares are refused, and live ones end at their next heartbeat (event `QUOTA_EXCEEDED`) |
| `GATEWAY_MAX_TUNNELS`, `GATEWAY_MAX_STREAMS_PER_TUNNEL`, `GATEWAY_RPS_PER_TUNNEL`, `GATEWAY_RPS_PER_IP`, `GATEWAY_MAX_REQUEST_BODY_BYTES`, `GATEWAY_MAX_RESPONSE_BYTES` | see `tunnel/gateway/config.ts` | Per-gateway connection and request limits |

**Setup codes.** Share App saves the developer's choices (new or existing project, public or password) to a `share_setups`
row and shows `localians share <port> --setup <code>`. The code is hashed at rest, single-use and valid for 30 minutes.
It's redeemable only by a CLI login of the same user and workspace (`POST /api/cli/setup`), so the CLI asks nothing.
Choosing "password" without setting one is refused rather than sharing publicly.

**Reliability.**
- **Stale sessions:** gateway reports trigger a cleanup sweep (at most every 30 s), so sessions are expired without a cron.
- **Health checks:** the gateway's `/healthz` (process up) and `/readyz` (control plane reachable; `503` after three
  failed heartbeats), and the web app's `/api/health` (database, gateway).
- **Logs:** the web app writes structured JSON (`src/server/log.ts`); server errors are reported through
  `src/instrumentation.ts` (set `ERROR_WEBHOOK_URL` to forward them to a monitor). Secret-looking fields are never logged.
- **Crash handling:** the gateway logs unhandled rejections; on an uncaught exception it closes its tunnels and exits
  for its supervisor to restart, and CLIs reconnect with backoff.
- **Stopped and revoked previews** can't reconnect: the database state, the gateway's blocked-session list and the
  connect-token check all refuse them.
- **Several gateways:** set a stable `GATEWAY_ID` on each and `GATEWAY_CONTROL_URLS="gw-a=http://…,gw-b=http://…"` on
  the web app. Commands go to the gateway that reported the session, and live status merges all of them. Routing
  visitors to the right gateway (DNS or load balancer by label) is still a deployment task.
