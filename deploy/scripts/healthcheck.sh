#!/usr/bin/env bash
# Localians — health check (every minute via localians-healthcheck.timer, as root).
# Checks the web app, the gateway's readiness and disk space. After 3 consecutive failures of
# a service it restarts that service. Optional /etc/localians/monitor.env:
#   ALERT_WEBHOOK_URL=https://…   (JSON POST on problems, e.g. a Slack/Discord/uptime webhook)
#   DISK_WARN_PERCENT=85
set -uo pipefail
STATE=/run/localians-health; mkdir -p "$STATE"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"
alert() {
  logger -t localians-health -p user.warning "$1"
  [[ -n "${ALERT_WEBHOOK_URL:-}" ]] && curl -fsS --max-time 5 -H 'content-type: application/json' -d "{\"text\":\"[localians $(hostname)] $1\"}" "$ALERT_WEBHOOK_URL" >/dev/null || true
}
check() { # name url unit
  if curl -fsS --max-time 5 "$2" >/dev/null; then
    [[ -f "$STATE/$1" ]] && { rm -f "$STATE/$1"; alert "$1 recovered"; }
    return
  fi
  n=$(( $(cat "$STATE/$1" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STATE/$1"
  alert "$1 health check failed ($n in a row)"
  if (( n == 3 )); then alert "restarting $3"; systemctl restart "$3"; fi
}
check web     http://127.0.0.1:4000/api/health localians-web
# Restart decisions use the gateway's own liveness; readiness (control plane reachable) only alerts,
# since restarting the gateway would drop live tunnels without fixing the web app.
check gateway http://127.0.0.1:4101/healthz    localians-gateway
curl -fsS --max-time 5 http://127.0.0.1:4101/readyz >/dev/null || alert "gateway cannot reach the web app (readyz failing)"
used=$(df --output=pcent / | tail -1 | tr -dc 0-9)
(( used >= DISK_WARN_PERCENT )) && alert "disk ${used}% used on /"
exit 0
