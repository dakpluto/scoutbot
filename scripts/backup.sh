#!/usr/bin/env bash
# Dumps the SQLite DB, encrypts it with age, and pushes it to the private
# backup repo. Run daily via cron on the deploy target. See README.md's
# Backups section for setup (BACKUP_REPO_URL / AGE_PUBLIC_KEY in .env).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

set -a
source .env
set +a

: "${BACKUP_REPO_URL:?BACKUP_REPO_URL not set in .env}"
: "${AGE_PUBLIC_KEY:?AGE_PUBLIC_KEY not set in .env}"
DATABASE_PATH="${DATABASE_PATH:-./scoutbot.db}"
RETENTION_DAYS=14

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

date_stamp=$(date +%F)
dump_file="$workdir/backup.sql"
encrypted_file="$date_stamp.sql.age"

sqlite3 "$DATABASE_PATH" ".dump" > "$dump_file"
age -r "$AGE_PUBLIC_KEY" -o "$workdir/$encrypted_file" "$dump_file"
rm -f "$dump_file"

git clone --quiet --depth 1 "$BACKUP_REPO_URL" "$workdir/repo"
mkdir -p "$workdir/repo/backups"
cp "$workdir/$encrypted_file" "$workdir/repo/backups/"

cd "$workdir/repo"
find backups -name '*.sql.age' -mtime "+$RETENTION_DAYS" -delete

git add -A backups
if git diff --cached --quiet; then
  echo "backup.sh: no changes to commit"
  exit 0
fi

git -c user.email="scoutbot-backup@localhost" -c user.name="ScoutBot Backup" \
  commit --quiet -m "Backup $date_stamp"
git push --quiet
echo "backup.sh: pushed backups/$encrypted_file"
