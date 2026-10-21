# Deploying Localians to production (localians.com)

Production runbook for the Hostinger VPS at `2.25.169.72` (Ubuntu 24.04, Nginx 1.24).

| Hostname | Serves |
| --- | --- |
| `https://localians.com` | Website, dashboard, sign-in, API, CLI authorization (`/cli/activate`) |
| `https://www.localians.com` | Redirects to `https://localians.com` |
| `https://tunnel.localians.com` | CLI connections to the tunnel gateway |
| `https://<label>.preview.localians.com` | Public preview links |

The server **already hosts another site**, which must keep working. Every step adds Localians next to it without
touching that site's Nginx configuration, TLS behaviour, Node.js, database or certificates.

> **Status:** nothing has been deployed and no DNS has been changed. The tooling here is tested where that's
> possible without the server: configuration checks, a proxy test that mirrors this Nginx config, and CLI
> packaging. Steps on the VPS are marked **[VPS]**; steps in your DNS or provider accounts are marked **[owner]**.

## 1. Architecture and ports

```
                      ┌──────────────────────── VPS 2.25.169.72 ────────────────────────────────┐
 browsers  ──443──▶   │ Nginx ─┬─ localians.com (+www → redirect) ──▶ 127.0.0.1:4000  web        │
 CLIs      ──443──▶   │        ├─ tunnel.localians.com            ──▶ 127.0.0.1:4100  gateway    │
 visitors  ──443──▶   │        └─ *.preview.localians.com         ──▶ 127.0.0.1:4100  gateway    │
                      │ gateway ──▶ 127.0.0.1:4000 (reports, password checks)                    │
                      │ web     ──▶ 127.0.0.1:4101 (gateway control: status, stop, access policy)│
                      │ web     ──▶ 127.0.0.1:5432 PostgreSQL                                    │
                      └──────────────────────────────────────────────────────────────────────────┘
```

| Port | Service | Exposure |
| --- | --- | --- |
| 22 | SSH | public, keys only, fail2ban |
| 80 | Nginx: ACME challenges, HTTP→HTTPS redirect | public |
| 443 | Nginx: TLS for the app, tunnel host and previews | public |
| 4000 | Localians web app (`localians-web`) | 127.0.0.1 only |
| 4100 | Tunnel gateway, public listener (`localians-gateway`) | 127.0.0.1 only (behind Nginx) |
| 4101 | Gateway admin: `/healthz`, `/readyz`, `/metrics`, control API (bearer secret) | 127.0.0.1 only |
| 5432 | PostgreSQL | 127.0.0.1 only |

These ports are unrelated to the ports developers share from their own computers (any port, 5173 suggested).

Processes run under systemd as the unprivileged `localians` user, with sandboxing, memory limits and
`Restart=always`. Releases live in `/srv/localians/releases/<time>-<sha>`, with `/srv/localians/current` pointing
at the live one. Secrets live only in `/etc/localians/*.env` (mode 640, root:localians).

**Coexisting with the existing site.** The Localians Nginx site has its own file
(`/etc/nginx/sites-available/localians.conf`) and only matches the hostnames above:
- It has no `default_server`, so unknown hosts still reach the existing site.
- It adds no `http2` or IPv6 listen options. In Nginx 1.24 those apply to every site on the same port, so the
  other site's TLS behaviour stays exactly as it is.
- Every change is checked with `nginx -t` and rolled back automatically if the check fails.

## 2. What's needed from you

| Needed | Why | Status |
| --- | --- | --- |
| DNS records for `localians.com` (§3) | so the hostnames point at the VPS | **done** — all four resolve to 2.25.169.72; no AAAA or CAA records (checked 21 Oct 2026) |
| DNS API access for `localians.com` (move nameservers to Cloudflare, §3.2) | automatic renewal of the wildcard certificate (SiteGround has no certbot plugin) | **to decide [owner]** |
| SSH access to the VPS (sudo user + key) | provisioning and deploys | **missing** |
| Resend account, verified domain, API key | verification and reset emails | **done** — `localians.com` verified in Resend (21 Oct 2026); use a sending-only key on the server |
| GitHub OAuth app (optional) | "Continue with GitHub" | **missing** |
| npm account to own `localians`, a license choice, approval to publish | `npx localians` | **missing** (name currently unclaimed) |

## 3. DNS and certificates

### 3.1 DNS records **[owner]**

Create these at the DNS host for `localians.com`. **As of 21 Oct 2026 its nameservers are SiteGround's**
(`ns1/ns2.siteground.net`), so records are managed in SiteGround Site Tools → Domain → DNS Zone Editor, or at
Cloudflare if you move the nameservers there (§3.2). Use TTL 300 while setting up.

> **Current state (checked read-only on 21 Oct 2026):** `localians.com`, `www`, `tunnel` and `*.preview` already
> resolve to `2.25.169.72`. Because Localians isn't installed on the VPS yet, these requests reach the server's
> existing default site. HTTPS shows that site's certificate (`dashboard.cnbppasavings.com`), so browsers warn;
> HTTP returns 404. This resolves once the Localians Nginx site and certificates are installed (§3.2, §5).

| Type | Name (host) | Value | Purpose |
| --- | --- | --- | --- |
| A | `@` | `2.25.169.72` | localians.com — website and dashboard |
| A | `www` | `2.25.169.72` | redirect to localians.com |
| A | `tunnel` | `2.25.169.72` | CLI connections |
| A | `*.preview` | `2.25.169.72` | every preview link (`<label>.preview.localians.com`) |
| CAA | `@` | `0 issue "letsencrypt.org"` | optional: only Let's Encrypt may issue certificates |

- **Remove conflicting records first.** Registrars often add defaults: an `A`/`AAAA` record for `@` pointing at a
  parking page, a `CNAME` for `www`, or a wildcard `*`. Any `AAAA` record for these names must go too, or be
  pointed at the VPS's IPv6 address, which isn't configured in Nginx here.
- **If you use Cloudflare:** set all four records to **DNS only** (grey cloud). Cloudflare's proxy would break CLI
  tunnels and long-lived WebSockets, and isn't needed.
- **Email records** (Resend: SPF/DKIM, and DMARC if you choose) are added later. Their exact values come from the
  Resend dashboard (§7).

Check propagation from outside the server; every answer must be `2.25.169.72`:

```bash
for h in localians.com www.localians.com tunnel.localians.com test123.preview.localians.com; do
  printf '%-34s ' "$h"; dig +short A "$h" @1.1.1.1; done
```

### 3.2 Certificates **[VPS]**

Two certificates (Let's Encrypt):

| Certificate (certbot name) | Covers | Challenge | Renewal |
| --- | --- | --- | --- |
| `localians.com` | `localians.com`, `www.localians.com`, `tunnel.localians.com` | HTTP-01 (webroot) | automatic |
| `preview.localians.com` | `*.preview.localians.com` | DNS-01 (wildcards require it) | automatic with a DNS API, otherwise manual every 90 days |

**1. App and tunnel host (HTTP-01):**

```bash
sudo bash /srv/localians/repo/deploy/scripts/install.sh --bootstrap      # HTTP-only Localians site for the challenge
sudo certbot certonly --webroot -w /var/www/localians-acme \
     --cert-name localians.com -d localians.com -d www.localians.com -d tunnel.localians.com \
     --deploy-hook "systemctl reload nginx"
```

**2. Wildcard for previews (DNS-01).** Pick one:

- **Recommended: Cloudflare DNS (free).** Move the nameservers of `localians.com` to Cloudflare, recreate the
  records in §3.1 as DNS only, and create an API token limited to *Zone → DNS → Edit* for `localians.com`. Then:
  ```bash
  sudo apt-get install -y python3-certbot-dns-cloudflare
  sudo install -m 600 /dev/null /etc/letsencrypt/cloudflare-localians.ini
  sudo -e /etc/letsencrypt/cloudflare-localians.ini      # dns_cloudflare_api_token = <token>
  sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare-localians.ini \
       --cert-name preview.localians.com -d '*.preview.localians.com' --deploy-hook "systemctl reload nginx"
  ```
- **Stay on SiteGround DNS (manual).** Run
  `sudo certbot certonly --manual --preferred-challenges dns --cert-name preview.localians.com -d '*.preview.localians.com'`.
  Add the `_acme-challenge.preview` TXT record it shows in SiteGround's DNS Zone Editor, wait for it to resolve
  (`dig +short TXT _acme-challenge.preview.localians.com @1.1.1.1`), then continue. This must be repeated
  **before every 90-day expiry**; previews stop working if it lapses.

Check that renewal works with `sudo certbot renew --dry-run`. certbot's systemd timer renews automatically.

## 4. Provision the server **[VPS]**

```bash
sudo git clone https://github.com/THINXIFY/Localians.git /root/localians-setup
sudo bash /root/localians-setup/deploy/scripts/provision.sh            # PLAN ONLY: prints what it would change
sudo bash /root/localians-setup/deploy/scripts/provision.sh --apply    # after reviewing the plan
```

Plan-only is the default; `--apply` is refused unless the read-only preflight passes. It only touches
Localians' own resources and leaves everything else on the shared server alone:
- Node.js 24 (current LTS, checksum-verified) in `/opt/localians/node-v<version>`, with `/opt/localians/node` as a
  symlink. It never deletes or replaces an existing `/opt/localians/node` directory, and stops if one is there.
- A dedicated PostgreSQL role and database `localians` with a random password written only to
  `/etc/localians/web.env`. Other databases are never touched.
- The `localians` user and its directories (`/srv/localians`, `/etc/localians`, `/var/backups/localians`).
- Only missing packages (nginx, postgresql, certbot, curl, git); no `apt upgrade`, no unattended-upgrades.
- A sudoers rule allowing only `systemctl restart localians-*`.

Preflight fails safely (exit code 2, nothing changed) on: Nginx or PostgreSQL not running, `nginx -t` already
failing, ports 4000/4100/4101 in use, a `localians` user with a different home, existing non-empty Localians
directories owned by someone else, an existing real `/opt/localians/node`, or an inconsistent PostgreSQL state.

Server-wide changes are **off by default** and each needs its own flag: `--with-swap` (2 GB, only if there is
no swap), `--with-journald` (size limits + journald restart), `--with-firewall` (adds ufw rules for 80/443 only
when ufw is already active; ufw is never enabled) and `--with-fail2ban`. Existing Docker containers, Nginx sites,
certificates and services are never modified.

Then create the environment files from [`.env.production.example`](../.env.production.example). It already contains
the production hostnames:

```bash
sudo -e /etc/localians/web.env       # section A (DATABASE_URL is already there)
sudo -e /etc/localians/gateway.env   # section B
sudo chown root:localians /etc/localians/*.env && sudo chmod 640 /etc/localians/*.env
```

`deploy.sh` runs `scripts/check-production-env.mjs`, which refuses to deploy if any hostname differs from the
table at the top:
- `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` must be `https://localians.com`.
- `TUNNEL_GATEWAY_URL` must be `https://tunnel.localians.com`.
- `TUNNEL_PREVIEW_DOMAIN` must be `preview.localians.com`.
- `GATEWAY_TUNNEL_HOST` must be `tunnel.localians.com`.

It also refuses placeholder secrets, development fallbacks, and ports that are publicly bound or clash.

## 5. Install and first deploy **[VPS]**

```bash
sudo bash /srv/localians/repo/deploy/scripts/install.sh     # units, scripts, Nginx site (needs both certificates)
sudo -u localians /srv/localians/bin/deploy.sh main
```

`deploy.sh` does the following:
1. Exports the exact commit (without `.git`). If `/srv/localians/bin/deploy.sh` (a copy made at install time) differs
   from the release's own `deploy.sh`, it replaces it and re-runs, so a deploy never uses stale logic.
2. Validates both env files.
3. Installs dependencies **including devDependencies** (`web.env` sets `NODE_ENV=production`, which would make npm skip
   the build tools), checks that the build tools exist, then builds the web app and the gateway/CLI bundles.
4. Backs up the database.
5. Runs `prisma migrate deploy`.
6. Switches the `current` symlink.
7. Restarts the web app, and the gateway only if its code changed.
8. Health-checks both services, and rolls back to the previous release if they fail.

## 6. Verify

On the VPS:

```bash
curl -s http://127.0.0.1:4000/api/health      # {"ok":true,"database":"ok","gateway":"ok"}
curl -s http://127.0.0.1:4101/readyz          # {"ready":true,...}
systemctl status localians-web localians-gateway --no-pager
sudo ss -ltnp | grep -E ':(4000|4100|4101|5432)\b'   # all bound to 127.0.0.1
curl -sI https://dashboard.cnbppasavings.com | head -1   # the existing site still answers as before
```

From another network:
- `curl -I https://localians.com` returns 200 with a valid certificate.
- `curl -I https://www.localians.com` returns a 301 to `https://localians.com/`.
- `curl -I https://abc.preview.localians.com` returns 404 "This preview link isn't active".
- `nmap -p 4000,4100,4101,5432 2.25.169.72` shows all four filtered or closed.
- [SSL Labs](https://www.ssllabs.com/ssltest/) rates `localians.com` and a preview host.

**Public acceptance test** (a laptop on a different network, plus a phone on mobile data):
1. Sign up at `https://localians.com` and receive the verification email; reset a password and receive that email.
2. Build the CLI with `npm run cli:release`, or install the published package.
3. In a Vite app, run `npm run dev`, then `localians share 5173` (or the Share App command). Approve the computer
   at `https://localians.com/cli/activate`.
4. Open the `https://<label>.preview.localians.com` link on the phone. Check that pages, assets, navigation, API
   calls and forms work, and that hot reload works after an edit.
5. Turn on password protection. A wrong password is rejected and the right one works; the API and WebSockets work
   after signing in. Change the password and confirm the phone is signed out.
6. Check that the dashboard shows the requests and bandwidth.
7. Click Stop Sharing and confirm the link returns 404 and the CLI exits.
8. Reboot the VPS in a maintenance window, then check that Localians and the existing site both come back by themselves.

## 7. Email (Resend) **[owner + VPS]**

1. Domain: `localians.com` is already **verified** in Resend (region ap-northeast-1). Keep its SPF/DKIM records in place.
   Optionally add DMARC: `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<you>`.
2. Create a **sending-only** API key for the server (Resend → API Keys → Permission: Sending access, domain localians.com).
   In `web.env` set `RESEND_API_KEY` to it and `EMAIL_FROM="Localians <auth@localians.com>"`, then deploy.
3. Test sign-up, verification and password reset with a real inbox, and check spam placement.

With `LOCALIANS_DEPLOYMENT=production` the app refuses console or outbox email even if they're configured.

## 8. Security: previews on the same registrable domain (beta)

Preview pages run developers' own, untrusted code. With previews on `*.preview.localians.com`, that code is
**same-site** with `https://localians.com`, since both share the registrable domain `localians.com`. This is the
assessment.

**Mitigated:**

| Risk | Mitigation | Verified by |
| --- | --- | --- |
| A preview reads or steals dashboard cookies | Auth cookies are host-only: no `Domain` attribute, so browsers never send them to subdomains. The gateway also strips any `localians.*` cookie before a request reaches a preview app. | `tests/integration/cookies.test.ts` |
| Cookie tossing: a preview sets `Domain=localians.com` to plant or shadow the session cookie | Over HTTPS every auth cookie is named `__Host-localians.*`. Browsers reject a `__Host-` cookie with a `Domain` attribute, and the app only ever reads the `__Host-` names (`src/lib/auth-cookies.ts`). | `cookies.test.ts` (names and attributes) |
| A preview submits forms or calls the dashboard API (SameSite cookies don't stop same-site requests) | Better Auth checks `Origin` against `https://localians.com` (preview origins get 403); Next.js server actions reject a mismatched `Origin`; JSON APIs aren't readable cross-origin (no CORS). | `cookies.test.ts` (sign-in from a preview origin → 403) |
| A preview frames the dashboard (clickjacking) | `X-Frame-Options: DENY` on the app | `next.config.ts` |
| A preview reaches internal services | Previews only reach the gateway; the gateway only reaches the developer's own loopback port; internal APIs are loopback-only and `/api/internal/*` is blocked at Nginx. | tunnel and security integration tests |

**Residual risk (accepted for a closed beta only):**
1. **Domain reputation.** A malicious preview (phishing, malware) is served under `localians.com`. Safe Browsing
   or antivirus vendors may then flag `*.preview.localians.com`, or the whole `localians.com` including the
   dashboard and your email domain.
2. **Same-site privileges.** Browsers treat preview pages as the same site as the dashboard, for example in
   SameSite=Lax/Strict decisions and some storage-partitioning heuristics. The protections above don't depend
   on this, but any future feature that relied on SameSite alone would be exposed.
3. **Cookies set by previews for the parent domain** (`Domain=localians.com`, non-`__Host-` names) are still sent
   to the dashboard. They're ignored by the app today, but count toward the browser's cookie and header-size
   limits. A preview could flood them and break sign-in for that visitor (a self-inflicted, per-browser denial of
   service).
4. **Phishing credibility.** A preview can mimic the Localians login page under a `localians.com` address.

**Recommendation:** keep sharing to invited testers while previews are on `localians.com`. Before opening public
sharing to untrusted users, move previews to a **separate registrable domain** (for example
`localians-preview.com`, set as `TUNNEL_PREVIEW_DOMAIN` with a wildcard DNS record and certificate), or have
`preview.localians.com` accepted into the Public Suffix List. The checker prints this as a warning for every
deploy until then.

## 9. GitHub sign-in (optional) **[owner]**

Create an OAuth app (GitHub → Settings → Developer settings → OAuth Apps):
- Homepage URL: `https://localians.com`
- Authorization callback URL: `https://localians.com/api/auth/callback/github`

Put `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `web.env` and deploy, then test sign-in with a real account.
Accounts aren't linked automatically by email address.

## 10. CLI on npm **[owner approval required]**

```bash
npm run cli:release                     # bakes in https://localians.com; refuses non-public URLs
cd tunnel/cli && npm pack --dry-run     # expect 3 files: dist/localians.js, README.md, package.json
```

Before publishing:
1. Choose a license (currently `UNLICENSED`).
2. Remove `"private": true`.
3. Run `npm publish` from the npm account that will own `localians`.

Then set `LOCALIANS_CLI_PUBLISHED=1` in `web.env` and deploy; the dashboard switches to `npx localians …`.
(CLIs built by `deploy.sh` on the server also point at `https://localians.com`.)

## 11. Operations

| Task | How |
| --- | --- |
| Deploy | `sudo -u localians /srv/localians/bin/deploy.sh <ref>`, or GitHub Actions → **Deploy** (manual) |
| Roll back the code | `ls /srv/localians/releases`, then `ln -sfn <release> /srv/localians/current && sudo systemctl restart localians-web localians-gateway` |
| Logs | `journalctl -u localians-web -u localians-gateway -f` (JSON lines; no secrets) · `/var/log/nginx/localians-*.log` · `/srv/localians/deploy.log` |
| Back up now | `sudo -u localians bash -c 'set -a; . /etc/localians/web.env; /srv/localians/bin/backup.sh manual'` |
| Prove a backup restores | `sudo /srv/localians/bin/verify-restore.sh` (temporary database; live data untouched) |
| Restore (destructive) | `sudo /srv/localians/bin/restore.sh /var/backups/localians/<file>.dump` |
| Health | the `localians-healthcheck.timer` runs every minute and restarts a service after 3 failed checks. Optional `ALERT_WEBHOOK_URL` in `/etc/localians/monitor.env` |
| Metrics | `curl -s 127.0.0.1:4101/metrics` |

**Backups:** daily at 03:17 (kept 14 days) and before every deploy (newest 10 kept), in `/var/backups/localians`.
They're on the same disk: copy them off the server too (Hostinger snapshots, or `rclone` to object storage).
**Backups count as reliable only after `verify-restore.sh` has passed on the server.**

**GitHub Actions:**
- `CI` runs typecheck, lint, tests and builds on every push. It never deploys.
- `Deploy` runs only when started by hand, using the `production` environment's secrets: `VPS_HOST`,
  `VPS_SSH_USER=localians`, `VPS_SSH_KEY`, and `VPS_SSH_KNOWN_HOSTS` (from `ssh-keyscan`). Add required reviewers
  to that environment.

## 12. Sizing and load testing

- **Memory and CPU:** 2 vCPU / 4 GB is comfortable. The web app is capped at 1 GB and the gateway at 768 MB
  (systemd `MemoryMax`). Builds need about 2 GB; add `--with-swap` to provisioning if the server has little free memory.
- **Tunnel cost:** each tunnel is one long-lived TLS connection; each visitor request is one HTTP/2 stream inside
  it. Locally this adds about 0.6–0.9 ms per request.
- **Load testing:** keep it gentle on a shared server. For example, `npx autocannon -c 20 -d 30
  https://<label>.preview.localians.com/` against a test app, while watching `top` and the existing site's
  response times.

## 13. Troubleshooting

- **`nginx -t` fails during install:** the previous config is restored automatically. Missing certificate paths
  are the usual cause; use `--bootstrap` until both certificates exist.
- **CLI says "Can't reach Localians":** check DNS for `localians.com` and `tunnel.localians.com` and their
  certificates.
- **Preview shows "This preview is starting":** the gateway can't reach the web app. Check
  `curl 127.0.0.1:4101/readyz` and `journalctl -u localians-web`.
- **Preview hosts show a certificate error:** the wildcard certificate is missing or expired (§3.2).
- **Emails don't arrive:** check the Resend dashboard and `journalctl -u localians-web | grep email`.
