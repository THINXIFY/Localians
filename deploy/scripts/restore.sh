#!/usr/bin/env bash
# Localians — restore a backup into the live database. DESTRUCTIVE: replaces current data.
# Run as root:  sudo /srv/localians/bin/restore.sh /var/backups/localians/<file>.dump
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run as root."; exit 1; }
FILE="${1:?usage: restore.sh <backup.dump>}"
[[ -f "$FILE" ]] || { echo "No such file: $FILE"; exit 1; }
set -a; . /etc/localians/web.env; set +a
pg_restore --list "$FILE" >/dev/null
read -r -p "Replace the live Localians database with $(basename "$FILE")? Type RESTORE to continue: " answer
[[ "$answer" == "RESTORE" ]] || { echo "Cancelled."; exit 1; }
echo "Stopping Localians (other sites are unaffected)…"
systemctl stop localians-gateway localians-web
# Safety net: back up what is there now before replacing it.
sudo -u localians --preserve-env=DATABASE_URL /srv/localians/bin/backup.sh "before-restore"
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$DATABASE_URL" "$FILE"
systemctl start localians-web localians-gateway
echo "Restored $FILE. Check: curl -s http://127.0.0.1:4000/api/health"
