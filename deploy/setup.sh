#!/usr/bin/env bash
# Cài KeyOfSuccess lên một VPS Ubuntu 24.04 mới (DigitalOcean Droplet…), chạy bằng root:
#   sudo bash /opt/keyofsuccess/deploy/setup.sh tasks.kingsport.vn
# Code phải được clone sẵn vào /opt/keyofsuccess. Chạy lại nhiều lần được: bước nào đã xong thì bỏ qua,
# server/.env đã có thì giữ nguyên.
# Kết quả: Node 22, Caddy (HTTPS tự động), dịch vụ systemd "keyofsuccess" chạy bằng user riêng, tường lửa
# chỉ mở SSH / 80 / 443. Code thuộc root (app không tự sửa được code), app chỉ ghi vào server/data.
set -euo pipefail

DOMAIN="${1:?Cách dùng: sudo bash deploy/setup.sh <domain>}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER=keyofsuccess
ENV_FILE="$APP_DIR/server/.env"

[ "$(id -u)" = 0 ] || { echo "Cần chạy bằng root (sudo)."; exit 1; }
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "Gói hệ thống"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -yq git curl ca-certificates gnupg ufw sqlite3 debian-keyring debian-archive-keyring apt-transport-https

# Máy ít RAM: thêm 2 GB swap để `vite build` không bị hết bộ nhớ.
if [ "$(free -m | awk '/^Mem:/ {print $2}')" -lt 3000 ] && ! swapon --show | grep -q .; then
  step "Swap 2 GB"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! node -v 2>/dev/null | grep -qE '^v2[2-9]\.'; then
  step "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi

if ! command -v caddy >/dev/null; then
  step "Caddy"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -yq caddy
fi

step "User chạy app: $APP_USER"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR/server/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/server/data"

step "Cài thư viện và build giao diện"
cd "$APP_DIR"
npm ci --no-audit --no-fund
npm run build

if [ ! -f "$ENV_FILE" ]; then
  step "Cấu hình server/.env"
  read -rp "GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
  read -rp "MANAGER_EMAILS (email Manager đầu tiên, cách nhau bởi dấu phẩy): " MANAGER_EMAILS
  umask 077
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=3001
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
MANAGER_EMAILS=$MANAGER_EMAILS
EOF
  umask 022
else
  echo "server/.env đã có, giữ nguyên."
fi
chown "root:$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

step "Dịch vụ systemd"
sed -e "s|^User=.*|User=$APP_USER|" -e "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" \
  -e "s|^ExecStart=.*|ExecStart=$(command -v npm) start|" \
  "$APP_DIR/deploy/keyofsuccess.service" > /etc/systemd/system/keyofsuccess.service
systemctl daemon-reload
systemctl enable keyofsuccess
systemctl restart keyofsuccess

step "HTTPS (Caddy) cho $DOMAIN"
sed "s|^tasks.example.com {|$DOMAIN {|" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

step "Tường lửa"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

step "Kiểm tra"
for _ in $(seq 1 20); do curl -fs http://127.0.0.1:3001/api/health >/dev/null && break; sleep 1; done
if curl -fs http://127.0.0.1:3001/api/health >/dev/null; then
  echo "App đang chạy. Mở https://$DOMAIN (lần đầu chờ Caddy lấy chứng chỉ, khoảng 1 phút)."
else
  echo "App chưa chạy. Xem lỗi: journalctl -u keyofsuccess -n 50"
  exit 1
fi
