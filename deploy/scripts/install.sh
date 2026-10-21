#!/usr/bin/env bash
# Localians — install/refresh systemd units, helper scripts and the Nginx site. Run as root.
#
#   sudo bash deploy/scripts/install.sh [--bootstrap]
#
# Hostnames default to production: localians.com (app), tunnel.localians.com (CLI),
# *.preview.localians.com (previews), www.localians.com (redirects to the app). Override with
# APP_DOMAIN, TUNNEL_HOST, PREVIEW_DOMAIN, REDIRECT_DOMAINS (e.g. for a staging server).
#
# Certificates: APP_CERT_DIR (default /etc/letsencrypt/live/$APP_DOMAIN — must cover the app,
# www and tunnel hosts) and PREVIEW_CERT_DIR (default /etc/letsencrypt/live/$PREVIEW_DOMAIN — the
# wildcard). --bootstrap installs only the HTTP site used to obtain the first certificates.
#
# The Nginx change is validated with `nginx -t` before reload; on failure the previous file is
# restored, so other sites on the server keep running.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run as root."; exit 1; }
BOOTSTRAP=0; [[ "${1:-}" == "--bootstrap" ]] && BOOTSTRAP=1
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # …/deploy

export APP_DOMAIN="${APP_DOMAIN:-localians.com}"
export TUNNEL_HOST="${TUNNEL_HOST:-tunnel.localians.com}"
export PREVIEW_DOMAIN="${PREVIEW_DOMAIN:-preview.localians.com}"
export REDIRECT_DOMAINS="${REDIRECT_DOMAINS:-www.$APP_DOMAIN}"
export APP_CERT_DIR="${APP_CERT_DIR:-/etc/letsencrypt/live/$APP_DOMAIN}"
export PREVIEW_CERT_DIR="${PREVIEW_CERT_DIR:-/etc/letsencrypt/live/$PREVIEW_DOMAIN}"
export WEB_PORT=4000 GATEWAY_PORT=4100
[[ -n "$REDIRECT_DOMAINS" ]] || { echo "REDIRECT_DOMAINS must not be empty"; exit 1; }
VARS='${APP_DOMAIN} ${TUNNEL_HOST} ${PREVIEW_DOMAIN} ${APP_CERT_DIR} ${PREVIEW_CERT_DIR} ${WEB_PORT} ${GATEWAY_PORT} ${REDIRECT_DOMAINS}'
echo "Hosts: app=$APP_DOMAIN tunnel=$TUNNEL_HOST previews=*.$PREVIEW_DOMAIN redirects=$REDIRECT_DOMAINS"

echo "== helper scripts → /srv/localians/bin"
install -o localians -g localians -m 750 "$HERE"/scripts/{deploy,backup}.sh /srv/localians/bin/
# Scripts that run as root must not be writable by the deploy user.
install -o root -g root -m 750 "$HERE"/scripts/{restore,verify-restore,healthcheck}.sh /srv/localians/bin/

echo "== systemd units"
install -m 644 "$HERE"/systemd/localians-*.service "$HERE"/systemd/localians-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable localians-web.service localians-gateway.service localians-backup.timer localians-healthcheck.timer >/dev/null
systemctl start localians-backup.timer localians-healthcheck.timer

echo "== nginx site"
template="$HERE/nginx/localians.conf.template"; [[ $BOOTSTRAP == 1 ]] && template="$HERE/nginx/localians-acme.conf.template"
if [[ $BOOTSTRAP == 0 ]]; then
  for dir in "$APP_CERT_DIR" "$PREVIEW_CERT_DIR"; do
    [[ -f "$dir/fullchain.pem" ]] || { echo "Missing certificate in $dir — obtain certificates first (deploy/README.md §3) or use --bootstrap."; exit 1; }
  done
fi
target=/etc/nginx/sites-available/localians.conf
backup=""
[[ -f $target ]] && { backup="$target.bak.$(date +%s)"; cp "$target" "$backup"; }
envsubst "$VARS" < "$template" > "$target"
ln -sfn "$target" /etc/nginx/sites-enabled/localians.conf
if nginx -t 2>&1; then
  systemctl reload nginx
  echo "nginx reloaded with the Localians site."
else
  echo "nginx -t failed — restoring the previous configuration."
  if [[ -n $backup ]]; then mv "$backup" "$target"; else rm -f "$target" /etc/nginx/sites-enabled/localians.conf; fi
  nginx -t && systemctl reload nginx
  exit 1
fi
