#!/usr/bin/env bash
# Localians — one-time VPS preparation for a SHARED server (Ubuntu 22.04/24.04). Run as root.
#
#   sudo bash provision.sh [options]            # PLAN ONLY (default): inspects the server, prints what it would do
#   sudo bash provision.sh --apply [options]    # makes the changes (only after preflight passes)
#
# What it does by default (Localians-only): a `localians` system user, /srv/localians, /etc/localians,
# /var/backups/localians, a `localians` PostgreSQL role + database, an isolated Node.js under
# /opt/localians, and a sudoers rule limited to restarting the Localians services.
#
# What it never does: edit other Nginx sites, certificates, databases, Docker containers or services;
# touch the system Node.js; upgrade OS packages; delete or replace directories it did not create.
#
# Server-wide changes are OFF unless you ask for them:
#   --with-swap       create a 2 GB /swapfile if the server has no swap
#   --with-journald   write /etc/systemd/journald.conf.d/localians.conf and restart journald
#   --with-firewall   add ufw allow rules for 80/443 (only if ufw is already active; never enables ufw)
#   --with-fail2ban   install and enable fail2ban
set -euo pipefail

APPLY=0; WITH_SWAP=0; WITH_JOURNALD=0; WITH_FIREWALL=0; WITH_FAIL2BAN=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --with-swap) WITH_SWAP=1 ;;
    --with-journald) WITH_JOURNALD=1 ;;
    --with-firewall) WITH_FIREWALL=1 ;;
    --with-fail2ban) WITH_FAIL2BAN=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)"; exit 64 ;;
  esac
done

# Current Node.js 24 LTS ("Krypton"), checked against https://nodejs.org/dist/index.json.
# The tarball is verified against the SHASUMS256.txt published for that exact version.
NODE_VERSION="${NODE_VERSION:-24.22.1}"
[[ "$NODE_VERSION" =~ ^24\.[0-9]+\.[0-9]+$ ]] || { echo "NODE_VERSION must be a 24.x.y release (got '$NODE_VERSION')."; exit 64; }
APP_USER=localians
APP_HOME=/srv/localians
NODE_ROOT=/opt/localians
NODE_DIR="$NODE_ROOT/node-v$NODE_VERSION"   # versioned install; $NODE_ROOT/node is a symlink to it
REPO_URL="${REPO_URL:-https://github.com/THINXIFY/Localians.git}"
PORTS=(4000 4100 4101)
SUDOERS_FILE=/etc/sudoers.d/localians

say() { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
run() {
  if [[ $APPLY == 1 ]]; then say "+ $*"; eval "$@"; else say "would run: $*"; fi
}
pg() { (cd /tmp && sudo -u postgres psql "$@"); }
owner_of() { stat -c '%U' "$1" 2>/dev/null || echo "?"; }

FAILS=0
fail() { say "FAIL: $*"; FAILS=$((FAILS + 1)); }
ok() { say "ok: $*"; }

[[ $EUID -eq 0 ]] || { say "Run as root (sudo)."; exit 1; }
. /etc/os-release
say "Mode: $([[ $APPLY == 1 ]] && echo APPLY || echo 'PLAN ONLY (nothing is changed)')"
say "Optional server-wide changes: swap=$WITH_SWAP journald=$WITH_JOURNALD firewall=$WITH_FIREWALL fail2ban=$WITH_FAIL2BAN (0 = skipped)"
step "System: $PRETTY_NAME, $(nproc) CPU, $(free -m | awk '/Mem:/{print $2}') MB RAM, swap $(free -m | awk '/Swap:/{print $2}') MB, disk free $(df -h / | awk 'NR==2{print $4}')"
[[ "$ID" == "ubuntu" ]] || say "warning: tested for Ubuntu; this is $ID."
if command -v docker >/dev/null 2>&1; then say "Docker present: $(docker ps -q 2>/dev/null | wc -l) running container(s) — left untouched."; fi

# ---------------------------------------------------------------------------------------------
step "Preflight (read-only; any FAIL stops before anything is changed)"

MISSING=()
for cmd in nginx psql certbot curl git sha256sum tar xz openssl ss systemctl visudo sudo; do
  command -v "$cmd" >/dev/null 2>&1 || MISSING+=("$cmd")
done
if ((${#MISSING[@]})); then say "missing commands: ${MISSING[*]} — they would be installed with apt (see Packages below)"; else ok "required commands present"; fi

for svc in nginx postgresql; do
  if systemctl is-active --quiet "$svc" 2>/dev/null || systemctl is-active --quiet "$svc@*" 2>/dev/null; then ok "service $svc is running"
  elif ((${#MISSING[@]})) && ! command -v "$svc" >/dev/null 2>&1; then say "service $svc not installed yet"
  else fail "service $svc is not running; refusing to continue on an unhealthy server"; fi
done
if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then ok "nginx -t passes on the existing configuration"; else fail "nginx -t fails BEFORE any Localians change; fix the existing config first"; fi
fi

LOCALIANS_UP=0
systemctl is-active --quiet localians-web 2>/dev/null && LOCALIANS_UP=1
for p in "${PORTS[@]}"; do
  if ss -ltnH "sport = :$p" | grep -q .; then
    owner=$(ss -ltnpH "sport = :$p" | sed -n 's/.*users:((\("[^"]*"\).*/\1/p' | head -1)
    if [[ $LOCALIANS_UP == 1 ]]; then say "port $p in use by $owner (Localians services are already running)"; else fail "port $p is already used by ${owner:-another process}; choose other ports before continuing"; fi
  else ok "port $p free"; fi
done

# The service account: reuse only if it is ours (right home directory).
if id "$APP_USER" >/dev/null 2>&1; then
  home=$(getent passwd "$APP_USER" | cut -d: -f6)
  [[ "$home" == "$APP_HOME" ]] && ok "user $APP_USER exists with home $APP_HOME" || fail "user $APP_USER exists with a different home ($home); not touching it"
fi
if getent group "$APP_USER" >/dev/null 2>&1 && ! id "$APP_USER" >/dev/null 2>&1; then fail "group $APP_USER exists without a matching user"; fi

# Directories Localians owns: if they already exist they must already belong to it.
for dir in "$APP_HOME" /etc/localians /var/backups/localians /var/www/localians-acme; do
  if [[ -e $dir && ! -d $dir ]]; then fail "$dir exists and is not a directory"
  elif [[ -d $dir ]]; then
    own=$(owner_of "$dir")
    case "$dir" in
      /etc/localians|/var/www/localians-acme) [[ $own == root || $own == "$APP_USER" ]] && ok "$dir exists (owner $own)" || fail "$dir exists and is owned by $own" ;;
      *) [[ $own == "$APP_USER" ]] && ok "$dir exists (owner $own)" || { [[ -z "$(ls -A "$dir" 2>/dev/null)" ]] && say "$dir exists, empty (owner $own) — ownership would be set" || fail "$dir exists, is not empty and is owned by $own; refusing to take it over"; } ;;
    esac
  fi
done

# Isolated Node.js: never delete or replace anything we did not create.
if [[ -L $NODE_ROOT/node ]]; then
  target=$(readlink -f "$NODE_ROOT/node")
  if [[ "$target" == "$NODE_ROOT"/node-v24.* && "$(owner_of "$NODE_ROOT")" == root ]]; then ok "$NODE_ROOT/node -> $target (managed symlink)"; else fail "$NODE_ROOT/node is a symlink to $target, which this script did not create"; fi
elif [[ -e $NODE_ROOT/node ]]; then
  fail "$NODE_ROOT/node already exists as a real directory/file (owner $(owner_of "$NODE_ROOT/node")). It will NOT be deleted or replaced. Rename or remove it yourself if it is safe, or tell me to use a different path."
fi
if [[ -e $NODE_ROOT && ! -d $NODE_ROOT ]]; then fail "$NODE_ROOT exists and is not a directory"; fi
if [[ -d $NODE_DIR ]]; then
  [[ -x $NODE_DIR/bin/node && "$("$NODE_DIR/bin/node" -v 2>/dev/null)" == "v$NODE_VERSION" ]] && ok "$NODE_DIR already installed" || fail "$NODE_DIR exists but is not a complete Node v$NODE_VERSION install"
fi

# Files this script would write.
if [[ -e $SUDOERS_FILE ]]; then ok "$SUDOERS_FILE exists (left as is; delete it first to regenerate)"; fi
for f in /etc/nginx/sites-available/localians.conf /etc/nginx/sites-enabled/localians.conf; do
  [[ -e $f ]] && say "note: $f exists (install.sh will manage it; no other Nginx site is edited)"
done
for u in localians-web localians-gateway; do
  [[ -e /etc/systemd/system/$u.service ]] && say "note: /etc/systemd/system/$u.service exists (install.sh will refresh it)"
done

# PostgreSQL: both role and database must be consistent, or we stop rather than guess.
have_role=0; have_db=0
if command -v psql >/dev/null 2>&1 && systemctl is-active --quiet postgresql 2>/dev/null; then
  pg -tAc "SELECT 1 FROM pg_roles WHERE rolname='localians'" 2>/dev/null | grep -q 1 && have_role=1
  pg -tAc "SELECT 1 FROM pg_database WHERE datname='localians'" 2>/dev/null | grep -q 1 && have_db=1
  if [[ $have_role == 1 && $have_db == 1 ]]; then ok "PostgreSQL role and database 'localians' already exist (reused; nothing dropped)"
  elif [[ $have_role == 0 && $have_db == 0 ]]; then ok "PostgreSQL: no 'localians' role or database yet (will be created)"
  else fail "PostgreSQL has only one of role/database 'localians' (role=$have_role db=$have_db); resolve manually"; fi
  say "other databases (untouched): $(pg -tAc "SELECT string_agg(datname, ', ' ORDER BY datname) FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres','localians')" 2>/dev/null)"
  listen=$(pg -tAc "SHOW listen_addresses" 2>/dev/null || echo "?")
  say "postgresql listen_addresses = $listen"
  [[ "$listen" == "localhost" || "$listen" == "127.0.0.1" ]] || say "WARNING: PostgreSQL listens beyond localhost. Make sure port 5432 is firewalled from the internet."
fi

if ((FAILS > 0)); then
  say $'\nPreflight FAILED ('"$FAILS"$' problem(s)). Nothing was changed. Resolve the items above and re-run.'
  exit 2
fi
say $'\nPreflight passed.'

# ---------------------------------------------------------------------------------------------
step "Packages (only what is missing; no apt upgrade, no unattended-upgrades, no fail2ban unless asked)"
need=()
for pkg in nginx postgresql certbot curl git ca-certificates xz-utils; do dpkg -s "$pkg" >/dev/null 2>&1 || need+=("$pkg"); done
if ((${#need[@]})); then
  run "apt-get update -q"
  run "DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends ${need[*]}"
else say "all required packages already installed — no package changes"; fi
say "Pending OS upgrades are never installed by this script (they could restart other sites' services)."

step "Node.js $NODE_VERSION for Localians only ($NODE_DIR, symlinked at $NODE_ROOT/node; system Node.js untouched)"
if [[ -d $NODE_DIR && -L $NODE_ROOT/node && "$(readlink -f "$NODE_ROOT/node")" == "$NODE_DIR" ]]; then
  say "already installed"
else
  arch=$(uname -m); [[ $arch == x86_64 ]] && arch=x64; [[ $arch == aarch64 ]] && arch=arm64
  tarball="node-v$NODE_VERSION-linux-$arch.tar.xz"
  say "download is verified with the SHA-256 listed for v$NODE_VERSION on nodejs.org; nothing existing is deleted or overwritten"
  run "install -d -o root -g root -m 755 $NODE_ROOT && tmp=\$(mktemp -d) && cd \"\$tmp\" && curl -fsSLO https://nodejs.org/dist/v$NODE_VERSION/$tarball && curl -fsSL https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt | grep ' $tarball\$' | sha256sum -c - && mkdir $NODE_DIR && tar -xJf $tarball -C $NODE_DIR --strip-components=1 && chown -R root:root $NODE_DIR && ln -sfn $NODE_DIR $NODE_ROOT/node && cd / && rm -rf \"\$tmp\" && $NODE_ROOT/node/bin/node -v"
fi

step "Swap (optional: --with-swap; production builds work best with ~2 GB of memory)"
if [[ $WITH_SWAP == 1 ]]; then
  if [[ "$(free -m | awk '/Swap:/{print $2}')" -gt 0 ]]; then say "swap present — nothing to do"
  elif [[ -e /swapfile ]]; then say "/swapfile already exists but is not active — not touching it"
  else run "fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab"; fi
else say "skipped (default). Current swap: $(free -m | awk '/Swap:/{print $2}') MB. Production builds need ~2 GB free memory; add --with-swap if the build is OOM-killed."; fi

step "User and directories"
if id "$APP_USER" >/dev/null 2>&1; then say "user $APP_USER exists"; else run "useradd --system --create-home --home-dir $APP_HOME --shell /bin/bash $APP_USER"; fi
run "install -d -o $APP_USER -g $APP_USER -m 750 $APP_HOME $APP_HOME/releases $APP_HOME/bin $APP_HOME/uploads"
run "install -d -o root -g $APP_USER -m 750 /etc/localians"
run "install -d -o $APP_USER -g $APP_USER -m 700 /var/backups/localians"
run "install -d -m 755 /var/www/localians-acme"
if [[ -d $APP_HOME/repo/.git ]]; then say "repository already cloned"; else run "sudo -u $APP_USER git clone --quiet $REPO_URL $APP_HOME/repo"; fi

step "PostgreSQL: dedicated role and database (other databases untouched)"
if [[ $have_role == 1 && $have_db == 1 ]]; then
  say "role and database localians exist — nothing to create"
  grep -qs '^DATABASE_URL=' /etc/localians/web.env || say "NOTE: /etc/localians/web.env has no DATABASE_URL; set it yourself with the existing role's password."
else
  say "Creating role 'localians' with a random password; it is written only to /etc/localians/web.env (DATABASE_URL), never printed."
  if [[ $APPLY == 1 ]]; then
    if grep -qs '^DATABASE_URL=' /etc/localians/web.env; then echo "FAIL: /etc/localians/web.env already has a DATABASE_URL; refusing to overwrite."; exit 2; fi
    pw=$(openssl rand -hex 24)
    printf "CREATE ROLE localians LOGIN PASSWORD '%s';\n" "$pw" | pg -q
    pg -q -c "CREATE DATABASE localians OWNER localians"
    umask 027
    printf '\nDATABASE_URL="postgresql://localians:%s@127.0.0.1:5432/localians"\n' "$pw" >> /etc/localians/web.env
    chown root:$APP_USER /etc/localians/web.env; chmod 640 /etc/localians/web.env
    unset pw
  else say "would create role + database localians"; fi
fi

step "Firewall (optional: --with-firewall)"
if [[ $WITH_FIREWALL == 1 ]]; then
  if ufw status 2>/dev/null | grep -q "Status: active"; then
    say "ufw is active — adding rules for 80 and 443 only (4000/4100/4101/5432 stay closed)"
    run "ufw allow 80/tcp && ufw allow 443/tcp"
  else say "ufw is not active; this script never enables it (SSH lock-out risk). No changes."; fi
else say "skipped (default); no firewall rules are modified. ufw: $(ufw status 2>/dev/null | head -1 || echo 'not installed')"; fi

step "fail2ban (optional: --with-fail2ban)"
if [[ $WITH_FAIL2BAN == 1 ]]; then
  dpkg -s fail2ban >/dev/null 2>&1 || run "DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends fail2ban"
  systemctl is-enabled --quiet fail2ban 2>/dev/null && say "fail2ban enabled" || run "systemctl enable --now fail2ban"
else say "skipped (default). fail2ban: $(systemctl is-active fail2ban 2>/dev/null || echo 'not installed')"; fi

step "journald limits (optional: --with-journald)"
if [[ $WITH_JOURNALD == 1 ]]; then
  run "install -d /etc/systemd/journald.conf.d && printf '[Journal]\nSystemMaxUse=500M\nMaxRetentionSec=30day\n' > /etc/systemd/journald.conf.d/localians.conf && systemctl restart systemd-journald"
else say "skipped (default); global journald settings are not changed. Localians logs go to the journal under its own units."; fi
say "Nginx logs (/var/log/nginx/localians-*.log) are rotated by the stock /etc/logrotate.d/nginx."

step "Deploy permissions: $APP_USER may restart only the Localians services"
if [[ -e $SUDOERS_FILE ]]; then say "$SUDOERS_FILE exists — left as is"
else
  run "printf '%s\n' '$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart localians-web, /usr/bin/systemctl restart localians-gateway, /usr/bin/systemctl restart localians-web localians-gateway, /usr/bin/systemctl is-active localians-web, /usr/bin/systemctl is-active localians-gateway' > $SUDOERS_FILE && chmod 440 $SUDOERS_FILE && visudo -cf $SUDOERS_FILE"
fi

step "Next"
say "1. Create /etc/localians/web.env and gateway.env from .env.production.example (deploy/README.md §4)."
say "2. Point DNS at this server and obtain certificates (deploy/README.md §3)."
say "3. Install units + nginx site: bash $APP_HOME/repo/deploy/scripts/install.sh"
say "4. First deploy: sudo -u $APP_USER $APP_HOME/bin/deploy.sh main"
[[ $APPLY == 1 ]] || say $'\nPlan only — nothing was changed. Re-run with --apply to make these changes.'
