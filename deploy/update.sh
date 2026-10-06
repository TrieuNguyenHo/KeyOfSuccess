#!/usr/bin/env bash
# Cập nhật bản mới trên VPS, chạy bằng root: sudo bash /opt/keyofsuccess/deploy/update.sh
# Sao lưu trước (database + uploads), kéo code, cài thư viện, build, khởi động lại (migration tự chạy).
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
[ "$(id -u)" = 0 ] || { echo "Cần chạy bằng root (sudo)."; exit 1; }

sudo -u keyofsuccess npm run backup
git pull --ff-only
npm ci --no-audit --no-fund
npm run build
systemctl restart keyofsuccess
for _ in $(seq 1 20); do curl -fs http://127.0.0.1:3001/api/health >/dev/null && break; sleep 1; done
if curl -fs http://127.0.0.1:3001/api/health >/dev/null; then
  echo "Đã cập nhật, app đang chạy."
else
  echo "App chưa chạy. Xem lỗi: journalctl -u keyofsuccess -n 50"
  exit 1
fi
