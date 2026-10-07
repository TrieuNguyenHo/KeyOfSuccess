#!/usr/bin/env bash
# Deploy một bản lên VPS, chạy bằng root:
#   sudo bash /opt/keyofsuccess/deploy/update.sh            # bản mới nhất của main
#   sudo bash /opt/keyofsuccess/deploy/update.sh v1.2       # một tag (hoặc commit) cụ thể
# Sao lưu database + file trước, chuyển code, build, khởi động lại (migration tự chạy). App không lên được thì tự
# quay về bản cũ cùng dữ liệu của lúc trước khi deploy. Lịch sử: server/data/deploys.log, hoặc rollback.sh --list.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_root
cd "$APP_DIR"

TARGET="${1:-origin/main}"
git fetch --quiet --tags origin
NEW="$(git rev-parse --verify --quiet "$TARGET^{commit}")" || die "Không thấy bản \"$TARGET\" (xem các tag: git tag)."
OLD="$(git rev-parse HEAD)"
[ "$NEW" != "$OLD" ] || { echo "Đang chạy đúng bản $(version_of "$NEW"), không có gì để làm."; exit 0; }
OLD_V="$(version_of "$OLD")"
NEW_V="$(version_of "$NEW")"

step "Deploy $OLD_V → $NEW_V"
LABEL="before-$(date +%Y%m%d-%H%M%S)-$OLD_V"
BACKUP="$(backup_named "$LABEL")"
echo "Đã sao lưu: $BACKUP"

if switch_to "$NEW" && health_ok; then
  log_deploy deploy "$OLD" "$NEW" "$NEW_V" "$LABEL" ok
  prune_deploy_backups
  echo "Đã deploy $NEW_V, app đang chạy."
  exit 0
fi

step "App không chạy với $NEW_V: quay về $OLD_V"
journalctl -u keyofsuccess -n 30 --no-pager || true
systemctl stop keyofsuccess
restore_backup "$BACKUP"
switch_to "$OLD"
log_deploy deploy "$OLD" "$NEW" "$NEW_V" "$LABEL" failed-rolled-back
if health_ok; then
  die "Deploy $NEW_V thất bại (log ở trên); đã quay về $OLD_V với dữ liệu như trước khi deploy."
fi
die "Deploy thất bại và bản cũ cũng chưa chạy. Xem: journalctl -u keyofsuccess -n 50"
