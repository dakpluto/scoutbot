#!/usr/bin/env bash
# Ships new systemd journal entries to the private backup repo, encrypted
# with age, so a Pi lockup/reboot doesn't erase the evidence (journald here
# only keeps volatile/in-RAM logs - see README's Backups section). Run
# frequently via cron. New entries are captured to a local plain-text file
# first and only cleared once a push to the backup repo succeeds, so a
# network/push failure never loses logs - it just retries next run with
# everything accumulated so far.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

set -a
source .env
set +a

: "${BACKUP_REPO_URL:?BACKUP_REPO_URL not set in .env}"
: "${AGE_PUBLIC_KEY:?AGE_PUBLIC_KEY not set in .env}"
RETENTION_DAYS=14

mkdir -p logs
cursor_file="$project_root/logs/.journal-cursor"
pending_file="$project_root/logs/pending.log"

# Pull whatever's new since the last successful capture. If the cursor is
# stale (e.g. the Pi rebooted and volatile journald lost its history), fall
# back to exporting everything currently in the journal.
if [[ -f "$cursor_file" ]]; then
  cursor=$(cat "$cursor_file")
  new_entries=$(journalctl --after-cursor="$cursor" --show-cursor -o short-iso --no-pager 2>/dev/null) || \
    new_entries=$(journalctl --show-cursor -o short-iso --no-pager)
else
  new_entries=$(journalctl --show-cursor -o short-iso --no-pager)
fi

new_cursor=$(printf '%s\n' "$new_entries" | tail -1 | sed -n 's/^-- cursor: //p')
log_lines=$(printf '%s\n' "$new_entries" | sed '$d')

if [[ -z "$log_lines" ]]; then
  echo "backup-logs.sh: nothing new since last run"
  exit 0
fi

printf '%s\n' "$log_lines" >> "$pending_file"
[[ -n "$new_cursor" ]] && echo "$new_cursor" > "$cursor_file"

# pending_file only clears on a successful push, so a prolonged outage would
# otherwise grow it unbounded. Surface it loudly rather than losing data.
pending_bytes=$(wc -c < "$pending_file")
if (( pending_bytes > 20 * 1024 * 1024 )); then
  echo "backup-logs.sh: WARNING pending.log is $((pending_bytes / 1024 / 1024))MB and hasn't pushed successfully in a while - check network/backup repo access" >&2
fi

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

timestamp=$(date +%Y-%m-%dT%H%M)
encrypted_file="$timestamp.log.age"
age -r "$AGE_PUBLIC_KEY" -o "$workdir/$encrypted_file" "$pending_file"

git clone --quiet --depth 1 "$BACKUP_REPO_URL" "$workdir/repo"
mkdir -p "$workdir/repo/logs"
cp "$workdir/$encrypted_file" "$workdir/repo/logs/"

(
  cd "$workdir/repo"
  find logs -name '*.log.age' -mtime "+$RETENTION_DAYS" -delete
  git add -A logs
  if git diff --cached --quiet; then
    echo "backup-logs.sh: no changes to commit"
    exit 0
  fi
  git -c user.email="scoutbot-backup@localhost" -c user.name="ScoutBot Backup" \
    commit --quiet -m "Log backup $timestamp"
  git push --quiet
  echo "backup-logs.sh: pushed logs/$encrypted_file"
)

# Only clear the local safety-net copy once it's confirmed pushed.
> "$pending_file"
