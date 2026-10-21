#!/usr/bin/env bash
# Localians — one-time VPS preparation (Ubuntu 22.04/24.04). Run as root.
#
#   sudo bash provision.sh            # PLAN ONLY: inspects the server and prints what it would do
#   sudo bash provision.sh --apply    # makes the changes
#
# Designed for a server that already hosts other sites: it never edits other Nginx sites,
# never replaces the system Node.js, never drops databases, and never enables a firewall that
# is currently off (it prints the commands instead, so SSH access can't be lost by accident).
set -euo pipefail

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1
NODE_VERSION="${NODE_VERSION:-24.10.0}"
APP_USER=localians
APP_HOME=/srv/localians
REPO_URL="${REPO_URL:-https://github.com/THINXIFY/Localians.git}"
PORTS=(4000 4100 4101)

say() { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
run() {
  if [[ $APPLY == 1 ]]; then say "+ $*"; eval "$@"; else say "would run: $*"; fi
}

[[ $EUID -eq 0 ]] || { say "Run as root (sudo)."; exit 1; }
. /etc/os-release
step "System: $PRETTY_NAME, $(nproc) CPU, $(free -m | awk '/Mem:/{print $2}') MB RAM, swap $(free -m | awk '/Swap:/{print $2}') MB, disk free $(df -h / | awk 'NR==2{print $4}')"
[[ "$ID" == "ubuntu" ]] || say "warning: tested for Ubuntu; this is $ID."

step "Port check (Localians needs 127.0.0.1:${PORTS[*]})"
for p in "${PORTS[@]}"; do
  if ss -ltnH "sport = :$p" | grep -q .; then
    owner=$(ss -ltnpH "sport = :$p" | sed -n 's/.*users:((\("[^"]*"\).*/\1/p' | head -1)
    if systemctl is-active --quiet localians-web localians-gateway 2>/dev/null; then say "port $p in use (likely Localians itself: $owner)"; else say "CONFLICT: port $p is already used by $owner — pick other ports before continuing."; fi
  else say "port $p free"; fi
done

step "Security updates"
run "apt-get update -q"
run "DEBIAN_FRONTEND=noninteractive apt-get install -y -q unattended-upgrades"
say "Pending upgrades are NOT installed automatically by this script (they could restart services of other sites)."
say "Review and apply them in a maintenance window: apt-get upgrade"

step "Packages: nginx, postgresql, certbot, fail2ban, curl, git"
for pkg in nginx postgresql certbot fail2ban curl git ca-certificates xz-utils; do
  if dpkg -s "$pkg" >/dev/null 2>&1; then say "$pkg: installed"; else run "DEBIAN_FRONTEND=noninteractive apt-get install -y -q $pkg"; fi
done

step "Node.js $NODE_VERSION for Localians only (/opt/localians/node — the system Node.js is left alone)"
if [[ -x /opt/localians/node/bin/node ]] && [[ "$(/opt/localians/node/bin/node -v)" == "v$NODE_VERSION" ]]; then
  say "already installed"
else
  arch=$(uname -m); [[ $arch == x86_64 ]] && arch=x64; [[ $arch == aarch64 ]] && arch=arm64
  tarball="node-v$NODE_VERSION-linux-$arch.tar.xz"
  run "mkdir -p /opt/localians && cd /tmp && curl -fsSLO https://nodejs.org/dist/v$NODE_VERSION/$tarball && curl -fsSL https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt | grep ' $tarball\$' | sha256sum -c - && rm -rf /opt/localians/node && mkdir /opt/localians/node && tar -xJf $tarball -C /opt/localians/node --strip-components=1 && rm $tarball"
fi

step "Swap (production builds need ~2 GB of memory)"
if [[ "$(free -m | awk '/Swap:/{print $2}')" -gt 0 ]]; then say "swap present"; else
  run "fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab"
fi

step "User and directories"
if id "$APP_USER" >/dev/null 2>&1; then say "user $APP_USER exists"; else run "useradd --system --create-home --home-dir $APP_HOME --shell /bin/bash $APP_USER"; fi
run "install -d -o $APP_USER -g $APP_USER -m 750 $APP_HOME $APP_HOME/releases $APP_HOME/bin"
run "install -d -o root -g $APP_USER -m 750 /etc/localians"
run "install -d -o $APP_USER -g $APP_USER -m 700 /var/backups/localians"
run "install -d -m 755 /var/www/localians-acme"
if [[ -d $APP_HOME/repo/.git ]]; then say "repository already cloned"; else run "sudo -u $APP_USER git clone --quiet $REPO_URL $APP_HOME/repo"; fi

step "PostgreSQL: dedicated role and database (other databases untouched)"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='localians'" 2>/dev/null | grep -q 1; then
  say "role localians exists"
else
  say "Creating role 'localians' with a random password; it is written only to /etc/localians/web.env (DATABASE_URL)."
  if [[ $APPLY == 1 ]]; then
    pw=$(openssl rand -hex 24)
    sudo -u postgres psql -q -c "CREATE ROLE localians LOGIN PASSWORD '$pw'"
    sudo -u postgres psql -q -c "CREATE DATABASE localians OWNER localians"
    umask 027
    if [[ ! -f /etc/localians/web.env ]]; then printf 'DATABASE_URL="postgresql://localians:%s@127.0.0.1:5432/localians"\n' "$pw" > /etc/localians/web.env
    else printf '\nDATABASE_URL="postgresql://localians:%s@127.0.0.1:5432/localians"\n' "$pw" >> /etc/localians/web.env; fi
    chown root:$APP_USER /etc/localians/web.env; chmod 640 /etc/localians/web.env
    unset pw
  else say "would create role + database localians"; fi
fi
listen=$(sudo -u postgres psql -tAc "SHOW listen_addresses" 2>/dev/null || echo "?")
say "postgresql listen_addresses = $listen"
[[ "$listen" == "localhost" || "$listen" == "127.0.0.1" ]] || say "WARNING: PostgreSQL listens beyond localhost. Make sure port 5432 is firewalled from the internet."

step "Firewall (ufw)"
if ufw status 2>/dev/null | grep -q "Status: active"; then
  say "ufw is active — adding Localians rules (80, 443 only; 4000/4100/4101/5432 stay closed)"
  run "ufw allow 80/tcp && ufw allow 443/tcp"
else
  say "ufw is NOT active. Not enabling it automatically (risk of locking out SSH). Recommended, in this order:"
  say "  ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw default deny incoming && ufw enable"
fi

step "fail2ban (SSH brute-force protection)"
if systemctl is-enabled --quiet fail2ban 2>/dev/null; then say "fail2ban enabled"; else run "systemctl enable --now fail2ban"; fi

step "journald limits and nginx log rotation"
run "install -d /etc/systemd/journald.conf.d && printf '[Journal]\nSystemMaxUse=500M\nMaxRetentionSec=30day\n' > /etc/systemd/journald.conf.d/localians.conf && systemctl restart systemd-journald"
say "Nginx logs (/var/log/nginx/localians-*.log) are rotated by the stock /etc/logrotate.d/nginx."

step "Deploy permissions: $APP_USER may restart only the Localians services"
run "printf '%s\n' '$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart localians-web, /usr/bin/systemctl restart localians-gateway, /usr/bin/systemctl restart localians-web localians-gateway, /usr/bin/systemctl is-active localians-web, /usr/bin/systemctl is-active localians-gateway' > /etc/sudoers.d/localians && chmod 440 /etc/sudoers.d/localians && visudo -cf /etc/sudoers.d/localians"

step "Next"
say "1. Create /etc/localians/web.env and gateway.env from .env.production.example (deploy/README.md §4)."
say "2. Point DNS at this server and obtain certificates (deploy/README.md §3)."
say "3. Install units + nginx site: bash $APP_HOME/repo/deploy/scripts/install.sh"
say "4. First deploy: sudo -u $APP_USER $APP_HOME/bin/deploy.sh main"
[[ $APPLY == 1 ]] || say $'\nPlan only — nothing was changed. Re-run with --apply to make these changes.'
