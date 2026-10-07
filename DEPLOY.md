# Deploy KeyOfSuccess

Hướng dẫn đưa KeyOfSuccess lên một VPS Ubuntu (đang dùng DigitalOcean), lần đầu và những lần cập nhật sau.
Chi tiết kỹ thuật (biến môi trường, cách sao lưu, lịch sử schema) nằm trong `README.md`, mục "Deploy" và "Database".

Các script nằm trong thư mục `deploy/`:

| Script | Dùng khi |
|---|---|
| `setup.sh <domain>` | Cài lần đầu lên máy chủ mới (chạy lại được, ví dụ khi đổi domain) |
| `update.sh [tag]` | Deploy một bản mới (mặc định: bản mới nhất của `main`) |
| `rollback.sh [--list \| tag]` | Xem lịch sử deploy, quay lại bản cũ |

Mọi lệnh trên máy chủ chạy bằng `root`.

---

## A. Lần đầu (máy chủ mới)

### 1. Chuẩn bị

1. **Google OAuth Client ID**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create credentials → OAuth client ID, loại *Web application*.
2. **Khoá SSH trên máy của bạn** (nếu chưa có):
   ```bash
   ssh-keygen -t ed25519
   cat ~/.ssh/id_ed25519.pub
   ```
3. **Tạo Droplet** (DigitalOcean → Create → Droplets):
   - Region: **Singapore**
   - Image: **Ubuntu 24.04 LTS**
   - Size: Basic → Regular, **2 GB RAM / 50 GB SSD**
   - Authentication: **SSH Key** (dán khoá công khai ở bước 2)
   - Nên bật **Backups** của DigitalOcean (thêm một lớp ngoài bản sao lưu của app)
4. **Domain**: nhờ người quản lý DNS thêm bản ghi `A  tasks → <IP Droplet>`. DNS ở Cloudflare thì để "DNS only" (mây xám).
   Chưa có domain thì dùng tạm `<IP, dấu chấm đổi thành gạch ngang>.sslip.io`, ví dụ `68-183-224-111.sslip.io`.
5. **Google**: thêm `https://<domain>` vào *Authorized JavaScript origins* của OAuth Client.
   Google không nhận địa chỉ IP trần, nên bắt buộc phải có tên miền.

### 2. Lấy code về máy chủ

```bash
ssh root@<IP>

# Khoá để máy chủ đọc được repo (chỉ đọc)
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

Dán dòng vừa hiện vào GitHub → repo KeyOfSuccess → **Settings → Deploy keys → Add deploy key** (không tick *Allow write access*). Sau đó:

```bash
git clone git@github.com:TrieuNguyenHo/KeyOfSuccess.git /opt/keyofsuccess
```

### 3. Cài đặt

```bash
bash /opt/keyofsuccess/deploy/setup.sh <domain>
```

Script hỏi 4 câu:

| Câu hỏi | Điền |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID ở bước 1 (`…apps.googleusercontent.com`) |
| `DIRECTOR_EMAILS` | Email Gmail của Director (cách nhau bởi dấu phẩy) |
| `MANAGER_EMAILS` | Email các Manager, hoặc để trống |
| `ROOT_EMAILS` | Email tài khoản cấu hình hệ thống (không phải email nhân viên), hoặc để trống |

Script cài Node 22, Caddy (HTTPS tự động), swap, user `keyofsuccess`, dịch vụ systemd, tường lửa (chỉ mở SSH / 80 / 443) và tạo `server/.env` với `JWT_SECRET` ngẫu nhiên. Xong sẽ báo "App đang chạy"; lần đầu chờ khoảng 1 phút để Caddy lấy chứng chỉ HTTPS.

### 4. Chuyển dữ liệu có sẵn (tuỳ chọn)

Chỉ làm khi muốn mang dữ liệu từ máy khác sang. Bỏ qua thì app bắt đầu trống.

```bash
# Trên máy chủ
systemctl stop keyofsuccess

# Trên máy cũ (tắt dev server trước)
scp server/data/app.db root@<IP>:/opt/keyofsuccess/server/data/
scp -r server/data/uploads root@<IP>:/opt/keyofsuccess/server/data/

# Trên máy chủ
chown -R keyofsuccess: /opt/keyofsuccess/server/data
systemctl start keyofsuccess
```

Database cũ được tự nâng cấp (migration) khi app khởi động.

### 5. Kiểm tra

- `https://<domain>/api/health` trả `{"ok":true,"schema":…,"version":…}`.
- Đăng nhập Google bằng email Director.
- Đăng nhập bằng tài khoản root → Cấu hình hệ thống → **Quyền theo vai trò**: xem lại quyền từng vai trò (mặc định Manager chỉ quản lý team của mình).

---

## B. Những lần sau: deploy bản mới

### 1. Đánh phiên bản (trên máy của bạn hoặc GitHub)

Khi code trên `main` đã ổn, tạo một tag cho nó:

```bash
git fetch origin
git tag beta_v1.3 origin/main
git push origin beta_v1.3
```

Hoặc trên GitHub: **Releases → Draft a new release** → gõ tag mới → *Target*: `main` → **Publish release**.

### 2. Deploy (trên máy chủ)

```bash
ssh root@<IP>
cd /opt/keyofsuccess
bash deploy/update.sh beta_v1.3
```

Script tự:

1. sao lưu database và file vào `server/data/backups/before-<thời gian>-<bản cũ>/`;
2. chuyển code sang bản mới, cài thư viện, build giao diện;
3. khởi động lại app (migration database tự chạy);
4. kiểm tra app chạy đúng bản mới.

**App không lên được thì script tự quay về bản cũ, cùng dữ liệu như lúc trước khi deploy**, và in log lỗi.

Không ghi tag (`bash deploy/update.sh`) thì deploy bản mới nhất của `main`.

### 3. Kiểm tra

`https://<domain>/api/health` phải ghi `"version":"beta_v1.3"`.

---

## C. Quay lại bản cũ

```bash
cd /opt/keyofsuccess
bash deploy/rollback.sh --list       # lịch sử deploy và các tag
bash deploy/rollback.sh              # về bản chạy trước lần deploy gần nhất
bash deploy/rollback.sh beta_v1.2    # về một bản cụ thể
```

Script luôn hỏi xác nhận (gõ `yes`).

- **Bản cũ cùng cấu trúc database**: chỉ đổi code, dữ liệu giữ nguyên.
- **Bản mới đã đổi cấu trúc database** (có migration mới): code cũ không dùng được database mới, nên dữ liệu được khôi phục về lúc trước khi deploy. **Những gì nhập sau thời điểm đó sẽ mất.** Script ghi rõ thời điểm và sao lưu trạng thái hiện tại trước khi khôi phục, để lấy lại được nếu cần.

Vì vậy, khi một bản mới có đổi database, nên kiểm tra kỹ ngay sau khi deploy: quay lại càng sớm thì mất càng ít.

---

## D. Lệnh thường dùng trên máy chủ

| Việc | Lệnh |
|---|---|
| Xem log trực tiếp | `journalctl -u keyofsuccess -f` |
| 50 dòng log gần nhất | `journalctl -u keyofsuccess -n 50` |
| Khởi động lại app | `systemctl restart keyofsuccess` |
| Sao lưu ngay | `cd /opt/keyofsuccess && sudo -u keyofsuccess npm run backup` |
| Sửa cấu hình | `nano /opt/keyofsuccess/server/.env` rồi `systemctl restart keyofsuccess` |
| Đổi domain | `bash /opt/keyofsuccess/deploy/setup.sh <domain-mới>`, rồi thêm domain mới vào Google |
| Bản đang chạy | `curl -s http://127.0.0.1:3001/api/health` |

### Sao lưu

- Thư mục: `/opt/keyofsuccess/server/data/backups/`.
- Bản hằng ngày `<YYYY-MM-DD>/`: tự tạo mỗi ngày, giữ 14 bản.
- Bản trước deploy `before-…/`: tự tạo trước mỗi lần deploy / rollback, giữ 10 bản.
- Mỗi bản gồm `app.db` (database) và `uploads/` (file đính kèm, ảnh đại diện).
- ⚠ **Bản sao lưu nằm cùng ổ đĩa với máy chủ**: hỏng máy chủ là mất cả hai. Nên đồng bộ thư mục `backups/` ra nơi khác (Google Drive, NAS…) mỗi ngày, hoặc đặt `BACKUP_DIR` trong `server/.env` sang một ổ khác.

---

## E. Gặp lỗi

| Hiện tượng | Xử lý |
|---|---|
| `setup.sh` / `update.sh` báo "App chưa chạy" | `journalctl -u keyofsuccess -n 50` xem lỗi |
| "Không khởi động được (NODE_ENV=production)" | Sửa `server/.env` theo dòng lỗi (`JWT_SECRET` ≥ 32 ký tự, có `GOOGLE_CLIENT_ID`, không có `DEV_LOGIN`) |
| Trang mở được nhưng nút Google báo lỗi | Kiểm tra `https://<domain>` đã có trong *Authorized JavaScript origins* |
| Không có HTTPS | Domain đã trỏ đúng IP chưa (`ping <domain>`), cổng 80 / 443 có mở không; xem `journalctl -u caddy -n 50` |
| `git clone` báo "Permission denied (publickey)" | Deploy key chưa được thêm vào repo, hoặc dán sai dòng |
| `git clone` báo thư mục đã tồn tại | `cd /opt/keyofsuccess && git status`: đã có code thì `git pull`; clone dở thì xoá `/opt/keyofsuccess` rồi clone lại (chỉ khi app chưa chạy, chưa có dữ liệu) |
