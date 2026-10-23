#!/usr/bin/env bash
# Localians — PostgreSQL backup (custom format), plus the uploaded images (LOCALIANS_UPLOAD_DIR) as a tarball next to
# it. Runs daily from localians-backup.timer and before every deploy. Needs DATABASE_URL (from /etc/localians/web.env).
#
#   backup.sh [label]     # label: "scheduled" (kept 14 days) or anything else (kept: newest 10)
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is not set}"
LABEL="${1:-manual}"
DIR=/var/backups/localians
umask 077
FILE="$DIR/localians-$(date +%Y%m%d-%H%M%S)-$LABEL.dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$FILE.partial"
# A dump that can't be listed is not a backup.
pg_restore --list "$FILE.partial" >/dev/null
mv "$FILE.partial" "$FILE"
echo "backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
# Uploaded images: the database only stores references to them.
if [[ -n "${LOCALIANS_UPLOAD_DIR:-}" && -d "$LOCALIANS_UPLOAD_DIR" ]]; then
  UPLOADS="${FILE%.dump}-uploads.tar.gz"
  tar -czf "$UPLOADS.partial" -C "$LOCALIANS_UPLOAD_DIR" .
  mv "$UPLOADS.partial" "$UPLOADS"
  echo "uploads ok: $UPLOADS ($(du -h "$UPLOADS" | cut -f1))"
fi
find "$DIR" -name 'localians-*-scheduled.dump' -mtime +14 -delete
find "$DIR" -name 'localians-*-scheduled-uploads.tar.gz' -mtime +14 -delete
ls -1t "$DIR"/localians-*.dump 2>/dev/null | grep -v -- '-scheduled.dump$' | tail -n +11 | xargs -r rm -f
ls -1t "$DIR"/localians-*-uploads.tar.gz 2>/dev/null | grep -v -- '-scheduled-uploads.tar.gz$' | tail -n +11 | xargs -r rm -f
