#!/usr/bin/env bash
# Shared by setup.sh, update.sh and rollback.sh (sourced, not run). Every deploy and rollback is one line of
# server/data/deploys.log (tab-separated): time, action, from commit, to commit, to version, backup, result.
# A backup named before-<time>-<version> is taken before each switch: it holds the database and files as they were
# under the version being left, which is what a rollback to that version restores.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER=keyofsuccess
DATA="$APP_DIR/server/data"
# shellcheck disable=SC2034 # used by rollback.sh
BACKUPS="$DATA/backups"
DEPLOY_LOG="$DATA/deploys.log"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
die() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }
require_root() { [ "$(id -u)" = 0 ] || die "Cần chạy bằng root (sudo)."; }

version_of() { git -C "$APP_DIR" describe --tags --always "$1"; }
# The schema version a commit's code migrates to (the highest `user_version = N` in its db.js).
schema_of_ref() { git -C "$APP_DIR" show "$1:server/src/db.js" | grep -o 'user_version = [0-9]*' | awk '{print $3}' | sort -n | tail -1; }
# sqlite3 runs as the app user, so the -wal / -shm files it may create stay readable by the app.
schema_of_db() { sudo -u "$APP_USER" sqlite3 -readonly "$DATA/app.db" 'PRAGMA user_version'; }

# The app answers, running the checked-out commit (so a previous process still holding the port does not count).
# Versions from before /api/health reported its commit only answer {"ok":true}, which is accepted for them.
health_ok() {
  local want reply
  want="$(git -C "$APP_DIR" rev-parse --short HEAD)"
  for _ in $(seq 1 30); do
    reply="$(curl -fs http://127.0.0.1:3001/api/health || true)"
    case "$reply" in
      *"\"commit\":\"$want\""*) return 0 ;;
      *'"commit"'*) ;;
      *'"ok":true'*) git -C "$APP_DIR" grep -q '"commit"' HEAD -- server/src/routes/health.js || return 0 ;;
    esac
    sleep 1
  done
  return 1
}

log_deploy() { printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -Is)" "$@" >> "$DEPLOY_LOG"; }

# Snapshot of the database and uploads, named $1, in the same layout as the app's daily backups; prints its path.
# Done here rather than through the app's backup script, since the version being left may not have the same script.
# The database is copied with VACUUM INTO (consistent while the app runs); uploaded files never change once written,
# so they are hard-linked.
backup_named() {
  local target="$BACKUPS/$1"
  rm -rf "$target.partial"
  mkdir -p "$target.partial"
  chown "$APP_USER:$APP_USER" "$BACKUPS" "$target.partial"
  sudo -u "$APP_USER" sqlite3 "$DATA/app.db" "VACUUM INTO '$target.partial/app.db'" || return 1
  if [ -d "$DATA/uploads" ]; then
    cp -al "$DATA/uploads" "$target.partial/uploads" 2>/dev/null || cp -a "$DATA/uploads" "$target.partial/uploads" || return 1
  else
    mkdir "$target.partial/uploads"
  fi
  chown -R "$APP_USER:$APP_USER" "$target.partial"
  rm -rf "$target"
  mv "$target.partial" "$target"
  echo "$target"
}

# Installs and builds the checked-out code, and records its version for /api/health.
build_current() {
  cd "$APP_DIR" || return 1
  npm ci --no-audit --no-fund
  npm run build
  printf '{"version":"%s","commit":"%s"}\n' "$(version_of HEAD)" "$(git rev-parse --short HEAD)" > client/dist/version.json
}

# Checks out commit $1 (detached, dropping any local edit of tracked files), builds it and restarts the app.
# A version from before these scripts keeps the current deploy/, so update.sh and rollback.sh still work there.
switch_to() {
  local from
  from="$(git -C "$APP_DIR" rev-parse HEAD)"
  git -C "$APP_DIR" checkout --quiet --force --detach "$1"
  git -C "$APP_DIR" cat-file -e "$1:deploy/lib.sh" 2>/dev/null || git -C "$APP_DIR" checkout --quiet "$from" -- deploy
  build_current
  systemctl restart keyofsuccess
}

# Keeps the 10 newest pre-deploy backups (names sort by time). Older versions can then only be rolled back to
# without restoring data, i.e. when they share the current schema.
prune_deploy_backups() {
  find "$BACKUPS" -maxdepth 1 -name 'before-*' -type d | sort | head -n -10 | xargs -r rm -rf
}

# Puts back the database and uploads of the snapshot at $1. The app must be stopped.
restore_backup() {
  [ -f "$1/app.db" ] || die "Không tìm thấy bản sao lưu $1"
  cp "$1/app.db" "$DATA/app.db.restoring"
  rm -f "$DATA/app.db-wal" "$DATA/app.db-shm"
  mv "$DATA/app.db.restoring" "$DATA/app.db"
  rm -rf "$DATA/uploads.restoring"
  cp -a "$1/uploads" "$DATA/uploads.restoring"
  rm -rf "$DATA/uploads"
  mv "$DATA/uploads.restoring" "$DATA/uploads"
  chown -R "$APP_USER:$APP_USER" "$DATA/app.db" "$DATA/uploads"
}
