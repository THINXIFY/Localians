#!/usr/bin/env bash
# Localians — prove the newest backup can be restored, without touching the live database.
# Restores it into a temporary database, compares row counts of key tables, then drops it.
# Run as root:  sudo /srv/localians/bin/verify-restore.sh [backup.dump]
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run as root."; exit 1; }
FILE="${1:-$(ls -1t /var/backups/localians/localians-*.dump | head -1)}"
CHECK_DB=localians_restore_check
echo "verifying $FILE"
sudo -u postgres dropdb --if-exists "$CHECK_DB"
sudo -u postgres createdb "$CHECK_DB"
trap 'sudo -u postgres dropdb --if-exists "$CHECK_DB"' EXIT
sudo -u postgres pg_restore --no-owner --no-privileges --dbname="$CHECK_DB" "$FILE"
fail=0
for t in users workspaces projects tunnel_sessions tunnel_events _prisma_migrations; do
  restored=$(sudo -u postgres psql -tAd "$CHECK_DB" -c "SELECT count(*) FROM \"$t\"")
  live=$(sudo -u postgres psql -tAd localians -c "SELECT count(*) FROM \"$t\"")
  printf '%-22s backup=%-8s live=%s\n' "$t" "$restored" "$live"
  [[ "$restored" =~ ^[0-9]+$ ]] || fail=1
done
[[ $fail == 0 ]] && echo "restore verified (counts can be lower than live if data was added after the backup)" || { echo "RESTORE CHECK FAILED"; exit 1; }
