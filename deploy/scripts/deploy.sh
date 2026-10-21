#!/usr/bin/env bash
# Localians — deploy a Git ref to this server. Run as the `localians` user.
#
#   /srv/localians/bin/deploy.sh [ref]        # default: main
#
# GitHub → checkout → install → build → checks → backup → migrate → switch → restart → health check.
# On a failed health check it switches back to the previous release and restarts it.
# (Database migrations are forward-only: if one must be undone, restore the pre-deploy backup.)
set -euo pipefail
REF="${1:-main}"
ROOT=/srv/localians
export PATH="/opt/localians/node/bin:$PATH"
LOG="$ROOT/deploy.log"
exec > >(tee -a "$LOG") 2>&1
echo "==== deploy $(date -Is) ref=$REF"

[[ -r /etc/localians/web.env && -r /etc/localians/gateway.env ]] || { echo "Missing /etc/localians/{web,gateway}.env"; exit 1; }

# 1. Source: an exact commit, exported without .git (no credentials in the release directory).
cd "$ROOT/repo"
git fetch --quiet --prune origin
SHA=$(git rev-parse --verify "origin/$REF^{commit}" 2>/dev/null || git rev-parse --verify "$REF^{commit}")
REL="$ROOT/releases/$(date +%Y%m%d%H%M%S)-${SHA:0:8}"
mkdir -p "$REL"
git archive "$SHA" | tar -x -C "$REL"
echo "release $REL ($SHA)"

# 2. Configuration checks (fail before touching anything live).
cd "$REL"
node --env-file=/etc/localians/web.env scripts/check-production-env.mjs web
node --env-file=/etc/localians/gateway.env scripts/check-production-env.mjs gateway

# 3. Install + build. NEXT_PUBLIC_* values and the CLI's default server are baked in at build time.
set -a; . /etc/localians/web.env; set +a
# web.env sets NODE_ENV=production for the runtime, and npm treats that as "omit devDependencies". The build and
# migrations need them (prisma, tailwindcss, typescript, esbuild, ...), so install with a clean npm environment and
# --include=dev, then fail early if a build tool is missing.
(
  unset NODE_ENV NPM_CONFIG_PRODUCTION NPM_CONFIG_OMIT NPM_CONFIG_INCLUDE npm_config_production npm_config_omit npm_config_include
  npm ci --include=dev --no-audit --no-fund --loglevel=error
)
for tool in node_modules/.bin/prisma node_modules/.bin/next node_modules/.bin/tsc node_modules/tailwindcss/package.json node_modules/esbuild/package.json; do
  [[ -e $tool ]] || { echo "Install is incomplete: $tool is missing (devDependencies were not installed)."; exit 1; }
done
npm run build
LOCALIANS_DEFAULT_API_URL="$BETTER_AUTH_URL" npm run tunnel:build   # the CLI served by this deployment points at it

# 4. Backup, then migrate.
"$ROOT/bin/backup.sh" "pre-deploy-${SHA:0:8}"
npx prisma migrate deploy

# 5. Switch atomically; restart the gateway only if its code changed (restarts drop live tunnels briefly).
PREV=$(readlink -f "$ROOT/current" 2>/dev/null || true)
ln -sfn "$REL" "$ROOT/current.next" && mv -T "$ROOT/current.next" "$ROOT/current"
sudo /usr/bin/systemctl restart localians-web
if [[ -z "$PREV" ]] || ! cmp -s "$PREV/tunnel/gateway/dist/gateway.js" "$REL/tunnel/gateway/dist/gateway.js"; then
  echo "gateway changed — restarting it (CLIs reconnect automatically)"
  sudo /usr/bin/systemctl restart localians-gateway
fi

# 6. Health check, with rollback.
healthy() {
  curl -fsS --max-time 5 http://127.0.0.1:4000/api/health >/dev/null && curl -fsS --max-time 5 http://127.0.0.1:4101/readyz >/dev/null
}
for _ in $(seq 1 30); do healthy && break; sleep 2; done
if healthy; then
  echo "healthy — deployed $SHA"
  # Keep the five newest releases.
  ls -1dt "$ROOT"/releases/*/ | tail -n +6 | xargs -r rm -rf
else
  echo "HEALTH CHECK FAILED"
  if [[ -n "$PREV" && -d "$PREV" ]]; then
    echo "rolling back to $PREV"
    ln -sfn "$PREV" "$ROOT/current.next" && mv -T "$ROOT/current.next" "$ROOT/current"
    sudo /usr/bin/systemctl restart localians-web localians-gateway
  fi
  echo "Check: journalctl -u localians-web -u localians-gateway -n 100. If a migration caused it, restore the pre-deploy backup (restore.sh)."
  exit 1
fi
