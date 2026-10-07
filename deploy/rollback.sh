#!/usr/bin/env bash
# Quay về bản cũ trên VPS, chạy bằng root:
#   sudo bash /opt/keyofsuccess/deploy/rollback.sh --list   # lịch sử deploy và các tag
#   sudo bash /opt/keyofsuccess/deploy/rollback.sh          # bản chạy trước lần deploy gần nhất
#   sudo bash /opt/keyofsuccess/deploy/rollback.sh v1.0     # một tag (hoặc commit) cụ thể
# Bản cũ cùng schema database: chỉ đổi code, giữ nguyên dữ liệu. Bản cũ có schema thấp hơn (bản mới đã đổi cấu trúc
# database): khôi phục cả database và file từ bản sao lưu lúc rời bản cũ đó, nên mọi thay đổi sau thời điểm ấy bị
# mất (vẫn được sao lưu lại trước khi khôi phục, để lấy lại được nếu cần). Luôn hỏi xác nhận trước.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_root
cd "$APP_DIR"

if [ "${1:-}" = "--list" ]; then
  echo "Đang chạy: $(version_of HEAD) (schema v$(schema_of_db))"
  echo
  echo "Lịch sử deploy (mới nhất ở dưới):"
  if [ -f "$DEPLOY_LOG" ]; then
    awk -F'\t' '{ printf "  %s  %-9s %s -> %s  [%s]  sao lưu: %s\n", substr($1,1,16), $2, substr($3,1,7), $5, $7, $6 }' "$DEPLOY_LOG"
  else
    echo "  (chưa có)"
  fi
  echo
  echo "Các tag: $(git tag --sort=-creatordate | head -15 | tr '\n' ' ')"
  exit 0
fi

git fetch --quiet --tags origin
if [ -n "${1:-}" ]; then
  TARGET="$(git rev-parse --verify --quiet "$1^{commit}")" || die "Không thấy bản \"$1\" (xem: rollback.sh --list)."
else
  [ -f "$DEPLOY_LOG" ] || die "Chưa có lịch sử deploy; ghi rõ bản cần quay về: rollback.sh <tag>"
  TARGET="$(awk -F'\t' '$2 == "deploy" && $7 == "ok" { from = $3 } END { print from }' "$DEPLOY_LOG")"
  [ -n "$TARGET" ] || die "Không tìm thấy lần deploy nào thành công; ghi rõ bản: rollback.sh <tag>"
fi
CUR="$(git rev-parse HEAD)"
[ "$TARGET" != "$CUR" ] || { echo "Đang chạy đúng bản $(version_of "$CUR")."; exit 0; }
CUR_V="$(version_of "$CUR")"
TARGET_V="$(version_of "$TARGET")"
DB_SCHEMA="$(schema_of_db)"
TARGET_SCHEMA="$(schema_of_ref "$TARGET")"

RESTORE=""
if [ "$TARGET_SCHEMA" -lt "$DB_SCHEMA" ]; then
  # The data must come back from when that version was left: the backup of the last deploy away from it.
  LABEL="$(awk -F'\t' -v t="$TARGET" '$2 == "deploy" && $3 == t { label = $6 } END { print label }' "$DEPLOY_LOG" 2>/dev/null || true)"
  [ -n "$LABEL" ] && [ -f "$BACKUPS/$LABEL/app.db" ] || die "Bản $TARGET_V dùng schema v$TARGET_SCHEMA nhưng database đang ở v$DB_SCHEMA, và không có bản sao lưu lúc rời $TARGET_V. Không quay về an toàn được."
  RESTORE="$BACKUPS/$LABEL"
  SINCE="$(echo "$LABEL" | sed -E 's/^before-([0-9]{4})([0-9]{2})([0-9]{2})-([0-9]{2})([0-9]{2}).*/\3\/\2\/\1 \4:\5/')"
  step "Quay về $TARGET_V (schema v$TARGET_SCHEMA, database hiện tại v$DB_SCHEMA)"
  echo "Database và file sẽ được khôi phục về lúc $SINCE: mọi thay đổi sau thời điểm đó sẽ MẤT"
  echo "(trạng thái hiện tại vẫn được sao lưu trước, để lấy lại nếu cần)."
else
  step "Quay về $TARGET_V: chỉ đổi code, giữ nguyên dữ liệu (schema v$DB_SCHEMA)"
fi
read -rp "Gõ yes để tiếp tục: " OK
[ "$OK" = yes ] || die "Đã huỷ."

NOW_LABEL="before-$(date +%Y%m%d-%H%M%S)-$CUR_V"
echo "Đã sao lưu trạng thái hiện tại: $(backup_named "$NOW_LABEL")"
if [ -n "$RESTORE" ]; then
  systemctl stop keyofsuccess
  restore_backup "$RESTORE"
fi
switch_to "$TARGET"
if health_ok; then
  log_deploy rollback "$CUR" "$TARGET" "$TARGET_V" "$NOW_LABEL" ok
  echo "Đã quay về $TARGET_V, app đang chạy. Muốn lên lại bản mới: update.sh"
else
  log_deploy rollback "$CUR" "$TARGET" "$TARGET_V" "$NOW_LABEL" failed
  die "App chưa chạy với $TARGET_V. Xem: journalctl -u keyofsuccess -n 50 (trạng thái trước đó: $BACKUPS/$NOW_LABEL)"
fi
