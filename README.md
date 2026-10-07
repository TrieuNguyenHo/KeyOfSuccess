# KeyOfSuccess — quản lý task cho team Marketing

React + Vite (frontend), Node/Express + SQLite (backend), đăng nhập bằng Google.

## Tính năng

- Đăng nhập bằng Google (Gmail). Người mới phải chờ Manager duyệt
- Vai trò hệ thống **Director / Manager / Leader / Member** và **Team**: Member thuộc đúng 1 team; Leader thuộc 1 hoặc nhiều team và phụ trách tất cả các team đó; Manager và Director thuộc bao nhiêu team cũng được (hoặc không team nào). Director toàn quyền trên hệ thống và quản lý các Manager
- **Task của tôi**: mọi task được giao cho mình, xuyên các project, nhóm theo Quá hạn / Hôm nay / 7 ngày tới / Sau đó / Không có hạn
- **Theo dõi team** (Leader) và **Theo dõi công việc** (Manager): xem task theo cả team, từng người, hoặc tất cả
- **Dashboard** (Member: chỉ dashboard của các project mình tham gia; Leader: gộp các team của mình hoặc từng team; Manager: cả phòng hoặc từng team): số task đang mở / quá hạn / đến hạn 7 ngày / hoàn thành 7 ngày qua / chưa giao, **Workload** theo từng người (kể cả người đang trống việc; bấm vào để xem task của họ), biểu đồ hoàn thành mỗi ngày trong 14 ngày, tiến độ theo project
- **Thông báo** (chuông trong app): khi một task được đánh dấu xong, báo cho Leader của team người làm và các Manager
- **Thông báo real-time**: server đẩy thông báo xuống trình duyệt ngay khi có (Server-Sent Events), chuông cập nhật không cần tải lại trang; vẫn hỏi lại 30 giây/lần làm dự phòng
- **Giữ màn hình khi tải lại**: màn đang xem và bộ lọc nằm trên URL (`#/project/3/list?status=open&assignee=5`, `#/task/12`…), F5 không mất chỗ và gửi link cho đồng nghiệp được
- **Nội dung real-time**: khi người khác sửa task, section, requirement hay gửi bình luận (task hoặc requirement), Board, List, Requirements, Task của tôi, panel task đang mở và bình luận của requirement tự tải lại (tiêu đề / mô tả đang gõ dở được giữ nguyên)
- **Giao task** cho ai thì người đó nhận thông báo (tự giao cho mình thì không)
- **Tag người (@)** trong bình luận của task và requirement: gõ @ để chọn người (chỉ những ai xem được task/requirement đó); người được tag nhận thông báo kèm trích đoạn, bấm vào mở đúng task hoặc requirement
- **Quản lý người dùng** (Manager): duyệt / từ chối / khoá tài khoản, gán vai trò, xếp team, tạo / đổi tên / xoá team
- Project: tạo, đổi tên, xoá; mỗi project có sẵn 4 **trạng thái** mặc định (cột Board, trong code là `sections`) Planned / In-Progress / Completed / Pending, cùng tên ở cả tiếng Việt lẫn tiếng Anh; ô lọc "Mọi trạng thái" liệt kê đúng các trạng thái này. **Trạng thái và dấu hoàn thành đi cùng nhau**: tick hoàn thành thì task sang cuối cột Completed, bỏ tick thì về In-Progress; kéo vào Completed thì tự tick (Leader và Manager được báo như khi tick), kéo sang cột khác thì tự bỏ tick; thêm task ngay trong cột Completed là đã xong; Pending là trạng thái mở bình thường (chờ). Trạng thái mặc định nhận ra theo `sections.kind` (`todo` / `doing` / `done` / `pending`). 4 trạng thái mặc định không đổi tên, không xoá được; trạng thái tự thêm thì đổi tên và xoá được. Subtask chỉ có dấu tick
- **Project theo team**: mỗi project thuộc một hoặc nhiều team cùng phụ trách (hoặc "Chung toàn phòng"), sidebar "Projects theo team" giống nhau cho mọi vai trò: mỗi team của người dùng là một nhóm (kể cả khi chưa có project; project chung nhiều team hiện ở từng team), project ngoài team của mình nằm trong "Project khác", project không thuộc team nào trong "Chung toàn phòng"; khi tạo có thể thêm cả team làm thành viên
- Task: tiêu đề, mô tả, người làm, hạn chót, độ ưu tiên, hoàn thành; subtask; bình luận
- **Project → Requirements → Task → Subtask**: mỗi project có nhiều requirement (tiêu đề, mô tả, tiến độ tự tính); mỗi task bắt buộc thuộc một requirement, đổi được sang requirement khác; subtask theo task như cũ
- **Tab Requirements**: danh sách requirement kèm thanh tiến độ, chi tiết từng requirement với task của nó, nút "Xem trên Board" và bình luận riêng cho từng requirement
- Board/List lọc được theo requirement, mỗi task có nhãn requirement; thêm task thì chọn requirement
- **Nhãn team trên task theo người làm**: task trên Board / List hiện team của người được giao (những team của họ mà project có; project toàn phòng: mọi team của họ); ô lọc "Mọi team" trên thanh lọc project lọc theo đó, lưu trên URL `?team=3`
- **Kênh** (Facebook, TikTok, SEO, Email…): danh sách kênh dùng chung cả phòng, Manager thêm / đổi tên / đổi màu / xoá trong Quản lý người dùng. Ai sửa được task thì gắn kênh (một task gắn được nhiều kênh; subtask không có kênh). Kênh hiện trên Board / List / Task của tôi / Theo dõi (trên Lịch: khi rê chuột vào task); ô lọc "Mọi kênh" có ở project và Task của tôi / Theo dõi, lưu trên URL `?channel=2`. Dashboard tổng và dashboard project có mục **"Theo kênh"**: số task xong / tổng và quá hạn của từng kênh (task gắn nhiều kênh tính ở mỗi kênh), thêm dòng "Chưa gắn kênh". Xoá kênh thì nhãn bị gỡ khỏi các task, mỗi task ghi vào lịch sử
- **Task lặp lại** (báo cáo tuần, đăng bài định kỳ): ô "Lặp lại" trong panel task: hằng ngày (T2–T6), hằng tuần hoặc mỗi 2 tuần (chọn các thứ), hằng tháng (ngày 1–31; tháng ngắn hơn thì ngày cuối tháng). Ai sửa được task thì đặt được. Đánh dấu xong (tick hay kéo vào Completed) thì app tạo bản kế tiếp ở trạng thái Planned, chép tên, mô tả, người làm, requirement, kênh, ưu tiên và subtask (chưa tick); hạn tính từ hạn cũ, không bao giờ rơi vào quá khứ. Quy tắc chuyển sang bản mới; mỗi bản chỉ sinh bản kế tiếp một lần. Task lặp có ↻ cạnh hạn chót. Task hằng ngày xong không báo Leader / Manager; người làm được báo "được giao" nếu người khác tick
- **Chỉ giao task cho người thuộc team của project** (project toàn phòng: người của bất kỳ team nào). Thành viên project từ team khác vẫn xem và bình luận nhưng không được giao và không tự thêm task; task giao từ trước vẫn giữ người làm
- **Board view** kéo-thả, **List view**, tìm kiếm và lọc trong project
- **Lịch**: tab "Lịch" trong project (dùng chung bộ lọc) và chế độ Lịch ở Task của tôi / Theo dõi công việc: lịch tháng theo hạn chót, kéo task sang ngày khác để đổi hạn (task mình sửa được)
- **Lịch sử thay đổi của task (30 ngày)**: mục "Lịch sử thay đổi" cuối panel task ghi ai làm gì, lúc nào: tạo task; đổi tên, mô tả (xem được bản trước / sau), người làm, hạn chót, ưu tiên, trạng thái, hoàn thành, requirement, kênh; thêm / sửa / xoá bình luận; thêm / xoá file; thêm / tick / xoá subtask (ghi vào task cha). Ai xem được task thì xem được lịch sử. Dữ liệu quá 30 ngày tự xoá
- **Sửa / xoá bình luận** (task và requirement): người viết sửa và xoá bình luận của mình (hiện "đã sửa"); Manager xoá được mọi bình luận nhưng không sửa lời người khác; tag mới thêm khi sửa thì người đó được báo
- **File trong bình luận** (task và requirement): nút 📎, kéo thả hoặc dán ảnh (Ctrl+V) vào ô bình luận; gửi chỉ file không cần chữ; file hiện dưới bình luận, xoá bình luận thì file đi theo; chỉ người viết đính kèm vào bình luận của mình
- **Đính kèm file** vào task và requirement (tối đa 25 MB/file, chọn file hoặc kéo thả): ai bình luận được thì đính kèm được; người tải lên hoặc người có toàn quyền task / sửa requirement thì xoá được; ảnh PNG, JPG, GIF, WebP có xem trước, file khác bấm để tải về
- **Sidebar** theo mẫu `component_styles/side_bar`: nền tối, cột icon, menu con trượt ra khi rê chuột / bấm / dùng bàn phím (Escape để đóng)
- **iPad**: màn dưới 1024px dùng sidebar dạng ngăn kéo (nút ☰), panel task toàn màn, bảng cột hẹp; trên màn cảm ứng giữ ngón tay 0,35 giây để kéo thẻ trên Board và task trên Lịch, ô nhập chữ 16px để Safari không tự phóng to
- **Giao diện Sáng / Tối**: chọn ở sidebar, trình duyệt nhớ lựa chọn; lần đầu theo cài đặt của máy
- **Hồ sơ của tôi** (`#/profile`, bấm tên mình ở chân sidebar): xem thông tin tài khoản (email, vai trò, team, trạng thái, ngày tham gia), sửa tên hiển thị, ngày sinh, giới tính, số điện thoại, chức danh, giới thiệu ngắn; chọn Sáng / Tối và VI / EN (như ở sidebar). **Ảnh đại diện**: tải ảnh PNG / JPG / WebP, app tự cắt vuông ở giữa và thu về 256 px trước khi gửi (tối đa 1 MB); ảnh hiện ở mọi chỗ có avatar (thẻ task, danh sách, comment, workload, sidebar…) cho mọi người trong app, tải kèm token như file đính kèm; xoá ảnh thì về chữ cái đầu. Thông tin cá nhân chỉ người đó, Manager và Leader của team có người đó xem được (hồ sơ của Manager thì chỉ Manager xem được): bấm vào avatar trong Quản lý người dùng › Người dùng (Manager) hoặc trong danh sách thành viên ở Quản lý team / Sửa team, một thẻ nhỏ hiện email, số điện thoại, ngày sinh, giới tính, trạng thái, ngày tham gia, giới thiệu (chỉ xem); đồng nghiệp khác chỉ thấy tên và ảnh
- **Tiếng Việt / Tiếng Anh**: nút VI | EN ở sidebar (và trên màn đăng nhập / chờ duyệt), lưu theo tài khoản nên đi theo người dùng trên mọi máy; mặc định Tiếng Việt. Chỉ dịch giao diện của app (cả thông báo lỗi của server và ngày tháng); tên project, task, trạng thái, requirement… giữ nguyên như người dùng gõ. Thêm chữ mới vào giao diện: bọc bằng `tr('chữ tiếng Việt')` (`client/src/i18n.js`) và thêm bản tiếng Anh vào `client/src/i18n.en.js`; `npm test` báo nếu thiếu

## Phân quyền

### Vai trò hệ thống

**Quyền của từng vai trò do root đặt** (màn Cấu hình hệ thống › "Quyền theo vai trò", bảng `role_permissions`, từ v24). Mỗi quyền có phạm vi **Không / Team của mình / Toàn phòng** (quyền không có dạng theo team thì chỉ Không / Có). Bảng dưới là **mặc định**; root đổi được từng ô và "Khôi phục mặc định" cho từng vai trò. Thay đổi có hiệu lực ngay ở server; màn hình người dùng theo sau khi họ tải lại app.

| Quyền (`lib/permissions.js`) | Member | Leader | Manager | Director |
|---|---|---|---|---|
| `projects.view`: mở project mình không tham gia (xem + comment) | – | Team | Team | Toàn phòng |
| `projects.manage`: đổi tên, xoá, thành viên của project không do mình tạo | – | Team | – | Toàn phòng |
| `projects.create` | – | – | Có | Có |
| `projects.change_teams`: chọn team của project (Team: chỉ team mình, ít nhất một; team khác của project giữ nguyên) | – | – | Team | Toàn phòng |
| `tasks.admin`: toàn quyền task (tạo, sửa, giao, xoá, trạng thái) | – | Team | Team | Toàn phòng |
| `requirements.manage` | – | – | Team | Toàn phòng |
| `people.watch`: task của người khác, Theo dõi, Dashboard tổng | – | Team | Team | Toàn phòng |
| `people.profiles`: hồ sơ cá nhân của người khác | – | Team | Team | Toàn phòng |
| `users.manage`: Quản lý người dùng, lời mời hoạt động ngay (Team: người trong team mình và người chưa có team, chỉ xếp vào team mình) | – | – | Team | Toàn phòng |
| `teams.members`: thêm / duyệt / mời / bỏ thành viên team | – | Team | Team | Toàn phòng |
| `teams.manage` (Team: chỉ đổi tên team mình; tạo / xoá team cần Toàn phòng) | – | – | Team | Toàn phòng |
| `channels.manage`, `comments.delete_any` | – | – | Có | Có |
| `notify.task_completed`: nhận thông báo task xong | – | Team | Team | – |

Từ v26 (người dùng chốt 2026-10-06), **Manager chỉ quản lý các team của mình** ở mọi mặt; chỉ Director nhìn toàn phòng.

**Cấp bậc vai trò** (`roles.level`: Member 1, Leader 2, Manager 3, Director 4; root cao hơn tất cả): không ai sửa tài khoản, cấp vai trò hay đọc hồ sơ của người có cấp cao hơn mình, dù có quyền gì. Vì vậy Manager không đụng được Director, Leader không đọc được hồ sơ Manager.

Bảng dưới mô tả hành vi với quyền mặc định:

| | Member | Leader | Manager | Director |
|---|---|---|---|---|
| Task của tôi, project mình tham gia | ✓ | ✓ | ✓ | ✓ |
| Task của người khác ở project **không** tham gia | ✗ | Người cùng team: xem + bình luận | Mọi người: xem + bình luận | Toàn quyền mọi project |
| Nhận thông báo khi task xong | | Task của người trong team | Mọi task | ✗ (chỉ khi được giao / được tag) |
| Quản lý người dùng và team | | | ✓ (trừ tài khoản Director) | ✓ |
| Cấp / bỏ vai trò Director, sửa tài khoản Director | | | ✗ | ✓ |
| Quản lý thành viên team của mình (thêm người chưa có team, duyệt người tự đăng ký, mời email mới chờ Manager duyệt, bỏ Member khỏi team) | | ✓ | ✓ (mọi team) | ✓ (mọi team) |

- "Xem + bình luận": mở được panel chi tiết, đọc và comment, nhưng không sửa, xoá hay tick xong được. Muốn sửa thì phải là thành viên project.
- Leader bắt buộc thuộc ít nhất một team; Member chỉ thuộc một team (đổi Leader/Manager nhiều team thành Member thì giữ team đầu tiên). Manager và Director không thể tự đổi vai trò hay tự khoá mình.
- Tài khoản bị khoá bị đăng xuất ngay ở request kế tiếp.
- **Root** (email trong `ROOT_EMAILS`): tài khoản kỹ thuật, không thuộc công ty. Chỉ thấy màn **Cấu hình hệ thống**: gán vai trò (kể cả Director), duyệt / khoá tài khoản, xếp team. Không mở được project, task, dashboard, thông báo hay thông tin cá nhân của ai (server trả 403). Root không có team, không hiện trong bất kỳ danh sách người nào, và không ai sửa / khoá được root trong app; xoá email khỏi `ROOT_EMAILS` là thu hồi ngay. Chỉ root và Director cấp được vai trò Director.
- **Lời mời** (Quản lý team, Sửa team, hoặc thẻ "Mời người dùng mới" của root): tạo sẵn tài khoản cho email, app không gửi email. Tài khoản ở trạng thái **"Đã mời, chưa tham gia"** tới lần đầu người đó đăng nhập Google bằng email ấy (đó là lúc họ chấp nhận). Trong lúc đó họ chưa được giao task, thêm vào project, theo dõi hay tính vào workload; người mời (hoặc người có `users.manage`, root) **huỷ lời mời** được, tức xoá hẳn tài khoản chưa dùng. Người đã tham gia thì chỉ khoá được.
- Email trong `DIRECTOR_EMAILS` luôn đăng nhập với vai trò Director (dùng để tạo Director đầu tiên); email trong `MANAGER_EMAILS` luôn đăng nhập với vai trò Manager, trừ người đã là Director.
- Director làm được mọi việc của Manager, cộng thêm: là "Quản lý task" và có quyền như owner trên mọi project (đổi tên, xoá, thành viên, đổi team), giao task cho bất kỳ ai thuộc team của project; xem hồ sơ của mọi người. Hồ sơ của Director chỉ Director xem được.

### Trong từng project

**Chỉ Manager (và Director) tạo project.** "Quản lý task" là Director, Manager hoặc Leader có team tham gia project (project "Chung toàn phòng": mọi Manager, và Leader nào mở được project).

| | Quản lý task | Owner (không quản lý task) | Thành viên | Manager khác | Người khác |
|---|---|---|---|---|---|
| Thấy trong sidebar, mở board | ✓ | ✓ | ✓ | ✓ | ✗ (404) |
| Tạo task | ✓ | Chỉ cho mình | Chỉ cho mình | ✗ | ✗ |
| Sửa task, subtask, kéo thả, tick xong | Mọi task | Task giao cho mình | Task giao cho mình | ✗ | ✗ |
| Giao task | ✓ (cho mình và người thuộc team của mình trong project) | ✗ | ✗ | ✗ | ✗ |
| Xoá task / subtask | ✓ | ✗ | ✗ | ✗ | ✗ |
| Thêm / đổi tên / xoá section | ✓ | ✗ | ✗ | ✗ | ✗ |
| Bình luận | ✓ | ✓ | ✓ | ✓ | ✗ |
| Đổi tên, xoá project, thêm/xoá thành viên | Leader của team | ✓ | ✗ (403) | ✗ | ✗ |
| Tạo / sửa / xoá requirement | ✓ | ✓ | ✗ | ✓ | ✗ |
| Đổi các team của project | Manager | Manager | ✗ | ✓ | ✗ |
| Rời project | — | — | ✓ | — | — |

- Thành viên tạo task thì task tự giao cho chính họ. Với task của người khác, họ chỉ xem và bình luận.
- Project nhiều team hiện trong nhóm sidebar của team mình nếu có; nếu không (ví dụ Manager), hiện trong nhóm của từng team, kèm nhãn "N team".

- Người quản lý task giao được cho chính mình và người đang hoạt động thuộc team của mình mà team đó tham gia project (project "Chung toàn phòng": mọi team của mình); giao cho người chưa là thành viên thì họ được tự thêm vào project. Ví dụ project của Content + Design: Leader Content chỉ giao cho người Content. Khi một người rời hoặc bị xoá khỏi project, task của họ trong project chuyển về "chưa giao".
- Người không có quyền nhận 404 (không phải 403) để không dò được id nào tồn tại.

## Cài đặt

Yêu cầu Node.js >= 22.13 (dùng module có sẵn `node:sqlite`).

### 1. Tạo Google OAuth Client ID

1. Vào [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Create credentials** → **OAuth client ID**.
2. Nếu được hỏi, cấu hình **OAuth consent screen** (loại *External*, điền tên app và email).
3. Application type: **Web application**.
4. **Authorized JavaScript origins**: thêm **cả** `http://localhost` và `http://localhost:5173` (Google yêu cầu cả hai khi chạy local), sau này thêm domain thật khi deploy. Không cần Redirect URI.
5. Copy **Client ID**.

### 2. Cấu hình server

Copy `server/.env.example` thành `server/.env`:

| Biến | Ý nghĩa |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID ở bước 1 |
| `ROOT_EMAILS` | Tài khoản root (cấu hình hệ thống, không thuộc công ty), cách nhau bởi dấu phẩy. Dùng email riêng: email của tài khoản có sẵn sẽ thành root và rời mọi team |
| `DIRECTOR_EMAILS` | Email Director đầu tiên, cách nhau bởi dấu phẩy |
| `MANAGER_EMAILS` | Email Manager đầu tiên, cách nhau bởi dấu phẩy |
| `JWT_SECRET` | Chuỗi ngẫu nhiên ≥ 32 ký tự. **Bắt buộc khi deploy** |
| `DEV_LOGIN=1` | Đăng nhập bằng email bất kỳ, không cần Google. **Chỉ dùng khi dev local**; production từ chối khởi động nếu bật |
| `NODE_ENV=production` | Chế độ deploy: kiểm tra cấu hình khi khởi động, bật sao lưu hằng ngày |
| `API_PORT` / `API_HOST` | Port API, mặc định `3001`; `API_HOST=127.0.0.1` khi chạy sau reverse proxy |
| `DB_PATH` | File SQLite, mặc định `server/data/app.db` |
| `BACKUP_DIR` / `BACKUP_KEEP_DAYS` | Thư mục sao lưu (mặc định `server/data/backups` khi production, tắt khi dev) và số bản giữ lại (14) |
| `CLIENT_DIST` | Frontend đã build, mặc định `client/dist` |

### 3. Chạy

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001 (Vite proxy `/api` sang đây)

## Deploy

Một process Node phục vụ cả API lẫn frontend đã build; HTTPS do reverse proxy lo (mẫu Caddy trong `deploy/`).

Cách nhanh trên VPS Ubuntu 24.04 mới (vd. DigitalOcean Droplet), bằng root:

1. **DNS**: bản ghi `A` của domain (vd. `tasks.kingsport.vn`) trỏ về IP của VPS. Nếu DNS nằm ở Cloudflare thì để "DNS only" (mây xám).
2. **Code**: repo private thì tạo deploy key trên VPS (`ssh-keygen -t ed25519`, dán `~/.ssh/id_ed25519.pub` vào GitHub › repo › Settings › Deploy keys, chỉ đọc), rồi `git clone git@github.com:TrieuNguyenHo/KeyOfSuccess.git /opt/keyofsuccess`.
3. **Cài**: `bash /opt/keyofsuccess/deploy/setup.sh tasks.kingsport.vn`, nhập `GOOGLE_CLIENT_ID`, `DIRECTOR_EMAILS`, `MANAGER_EMAILS`, `ROOT_EMAILS` khi được hỏi. Script cài Node 22, Caddy (HTTPS), swap nếu ít RAM, user `keyofsuccess`, dịch vụ systemd, tường lửa (SSH / 80 / 443), tạo `server/.env` với `JWT_SECRET` ngẫu nhiên. Chạy lại được.
4. **Google**: thêm `https://<domain>` vào *Authorized JavaScript origins* của OAuth Client.
5. **Chuyển dữ liệu cũ** (nếu muốn): trên VPS `systemctl stop keyofsuccess`; trên máy cũ tắt dev server rồi `scp server/data/app.db` và `scp -r server/data/uploads` vào `/opt/keyofsuccess/server/data/`; trên VPS `chown -R keyofsuccess: /opt/keyofsuccess/server/data && systemctl start keyofsuccess`.
6. Kiểm tra: `https://<domain>/api/health` trả `{"ok":true,"schema":…,"version":…}`. Log: `journalctl -u keyofsuccess -f`.

### Phiên bản, cập nhật và quay lại bản cũ

- **Đánh phiên bản** bằng tag git trên `main` khi một bản đã ổn: `git tag v1.2 && git push origin v1.2` (hoặc tạo Release trên GitHub). `/api/health` cho biết bản đang chạy (`version`, `commit`) và schema database.
- **Deploy**: `bash deploy/update.sh` (bản mới nhất của `main`) hoặc `bash deploy/update.sh v1.2` (đúng một tag / commit). Trước mỗi lần chuyển, database và file được sao lưu vào `server/data/backups/before-<thời gian>-<bản cũ>/` (giữ 10 bản gần nhất). App không lên được với bản mới thì script **tự quay về bản cũ cùng dữ liệu lúc trước khi deploy**.
- **Quay lại bản cũ**: `bash deploy/rollback.sh --list` (lịch sử deploy, các tag), `bash deploy/rollback.sh` (bản chạy trước lần deploy gần nhất) hoặc `bash deploy/rollback.sh v1.1`. Luôn hỏi xác nhận.
  - Bản cũ **cùng schema** database: chỉ đổi code, dữ liệu giữ nguyên.
  - Bản cũ **schema thấp hơn** (bản mới đã đổi cấu trúc database, migration chỉ chạy một chiều): khôi phục database và file từ bản sao lưu lúc rời bản cũ đó, nên **mọi thay đổi sau thời điểm ấy bị mất** (script ghi rõ thời điểm; trạng thái hiện tại vẫn được sao lưu trước). Không còn bản sao lưu đó thì script từ chối.
  - Chỉ quay về được các bản đã có `deploy/` (từ PR #1); tag `v1.0` cũ hơn, chưa tự phục vụ giao diện production.
- **VPS cài trước khi có các script này** (`update.sh` cũ chỉ `git pull`): lấy script mới rồi deploy, một lần duy nhất: `cd /opt/keyofsuccess && git fetch --tags origin && git checkout v1.1 -- deploy && bash deploy/update.sh v1.1`.
- Lịch sử: `server/data/deploys.log` (mỗi dòng: thời gian, deploy / rollback, từ commit, tới commit, bản, bản sao lưu, kết quả).

Cài tay trên máy khác: `server/.env` theo `server/.env.example` (`NODE_ENV=production`, `API_HOST=127.0.0.1`, `JWT_SECRET` thật, `GOOGLE_CLIENT_ID`, `DIRECTOR_EMAILS` / `MANAGER_EMAILS` / `ROOT_EMAILS`, không có `DEV_LOGIN`; thiếu hoặc sai thì server báo lỗi và không chạy), `npm ci && npm run build && npm start` sau reverse proxy HTTPS (`deploy/Caddyfile`, `deploy/keyofsuccess.service`).

### Sao lưu

- Tự động mỗi ngày (lúc khởi động và khi sang ngày mới): `server/data/backups/<YYYY-MM-DD>/` gồm `app.db` (chụp bằng `VACUUM INTO`, an toàn khi app đang chạy) và `uploads/` (đầy đủ file đính kèm, ảnh đại diện; file không đổi so với hôm trước là hard link nên không tốn thêm chỗ). Giữ 14 bản gần nhất.
- Sao lưu tay: `npm run backup` (hoặc `npm run backup -- /đường/dẫn`). Trước mỗi lần deploy / rollback có thêm bản `before-…` (xem trên).
- **Bản sao lưu nằm cùng ổ đĩa thì không cứu được khi hỏng máy**: đặt `BACKUP_DIR` sang ổ khác, hoặc đồng bộ thư mục này lên nơi khác (rclone lên Google Drive, NAS…) hằng ngày.
- Khôi phục: tắt dịch vụ, chép `app.db` của bản cần dùng thành `server/data/app.db` (xoá `app.db-wal`, `app.db-shm` cũ) và `uploads/` thành `server/data/uploads/`, rồi bật lại.

## Test

```bash
npm test
```

Test API viết bằng `node:test` (có sẵn trong Node, không cần cài thêm), nằm ở `server/test/*.test.js`:

| File | Kiểm tra |
|---|---|
| `roles.test.js` | Vai trò, duyệt tài khoản, team, ai theo dõi được task của ai, thông báo hoàn thành |
| `project-permissions.test.js` | Owner / thành viên / người ngoài trong một project |
| `team-projects.test.js` | Project theo team: quyền của Leader, Manager chỉ xem, đổi team |
| `multi-team.test.js` | Project nhiều team, xoá team |
| `team-members.test.js` | Quản lý thành viên team: Leader / Manager thêm, duyệt, mời, bỏ thành viên |
| `user-teams.test.js` | Leader / Manager thuộc nhiều team: quyền theo dõi, quản lý project, thông báo, tạo project, `?mine=1` |
| `assignees.test.js` | Ai giao task được, tự thêm vào project |
| `requirements.test.js` | Requirement, task theo requirement, tiến độ, chặn xoá, bình luận |
| `mentions.test.js` | Tag @, chỉ tag được người xem được nội dung |
| `live.test.js` | Thông báo giao task và luồng sự kiện `/api/events` |
| `live-changes.test.js` | Sự kiện `change` khi task, bình luận, section, requirement thay đổi; ai nhận được |
| `dashboard.test.js` | Dashboard tổng và theo project, workload, biểu đồ hoàn thành |
| `task-history.test.js` | Lịch sử task: các loại thay đổi, subtask / bình luận / file ghi vào task cha, ai xem được, ẩn quá 30 ngày, xoá theo task |
| `statuses.test.js` | 4 trạng thái mặc định (không đổi tên / xoá), tick ↔ cột Completed, kéo vào / ra, Pending, project không có cột Hoàn thành |
| `comments-attachments.test.js` | Sửa / xoá bình luận (task và requirement), đính kèm file: quyền, giới hạn 25 MB, cách trả file, xoá file khỏi ổ đĩa |
| `channels.test.js` | Kênh: Manager quản lý danh sách, gắn kênh lên task, lịch sử, xoá kênh, dashboard theo kênh |
| `recurring.test.js` | Task lặp lại: quy tắc, tạo bản kế tiếp, hạn kế tiếp (tháng ngắn, mỗi 2 tuần, trễ hạn), thông báo, lịch sử |
| `language.test.js` | Ngôn ngữ theo tài khoản (`PATCH /api/me`) |
| `avatar.test.js` | Ảnh đại diện: tải lên, thay ảnh xoá file cũ, chặn file không phải ảnh / quá 1 MB, dọn file không xoá ảnh, tài khoản khoá không hiện ảnh |
| `profile.test.js` | Hồ sơ: sửa / xoá trường, kiểm tra dữ liệu, tên mới hiện ở mọi chỗ, chỉ chính mình và Manager thấy thông tin cá nhân |
| `deploy.test.js` | Production: từ chối khởi động khi thiếu `JWT_SECRET` / `GOOGLE_CLIENT_ID` hoặc bật `DEV_LOGIN`, phục vụ frontend đã build (cache, header), `/api/health`, sao lưu hằng ngày và `npm run backup` |
| `director.test.js` | Director: toàn quyền mọi project, quyền Manager, chỉ Director cấp vai trò Director / sửa tài khoản Director, hồ sơ, không nhận thông báo task xong, migration v22 |
| `root.test.js` | Root: chỉ dùng API cấu hình, ẩn khỏi mọi danh sách, cấp Director, không ai sửa được root, thu hồi khi bỏ khỏi `ROOT_EMAILS`, migration v23 |
| `custom-roles.test.js` | Vai trò tự tạo (v27): chỉ root, sao chép quyền, đổi tên vai trò có sẵn, không đổi cấp / xoá vai trò có sẵn, số team theo vai trò, không xoá vai trò còn người giữ |
| `permissions.test.js` | Bảng quyền: `/me` trả quyền, chỉ root đọc / sửa, kiểm tra phạm vi, đổi quyền có hiệu lực ngay, khôi phục mặc định, quyền theo team, thông báo, cấp bậc vai trò |
| `invitations.test.js` | Lời mời: "Đã mời, chưa tham gia" tới lần đăng nhập đầu, chưa giao task / thêm vào project / theo dõi / tính workload được, huỷ lời mời |
| `manager-scope.test.js` | Manager theo team (mặc định v26): danh sách người dùng, sửa / mời / số chờ duyệt theo team, đổi tên team mình, project chỉ thuộc team mình, theo dõi / hồ sơ / thông báo theo team |
| `i18n.test.js` | Giao diện tiếng Anh đủ: mọi khoá `tr()` có bản tiếng Anh, không chữ tiếng Việt nào nằm ngoài `tr()`, mọi thông báo lỗi của server dịch được (không bật server) |

- Mỗi file tự bật một server riêng trên port trống với **database tạm**, nên test **không bao giờ đụng tới `server/data/app.db`** và các file chạy song song. Dev server đang chạy không bị ảnh hưởng.
- Đăng nhập trong test dùng `DEV_LOGIN`; `boss@t.test` là Manager, `chief@t.test` là Director, `root@t.test` là root. Các file test viết từ trước v26 chạy với Manager toàn phòng (`startServer()` đặt lại các quyền đó thành "Toàn phòng"); `startServer({ managerScope: 'team' })` dùng mặc định mới. `server/.env` không được đọc.
- File test fail nếu server ghi ra lỗi (ví dụ một lỗi 500 không có test nào bắt).
- Hàm hỗ trợ dùng chung (bật server, gọi API, tạo user/team/project/task, nghe luồng sự kiện) ở `server/test/helpers.js`.

## Database

SQLite, schema ở `server/src/db.js`. Phiên bản lưu trong `PRAGMA user_version`, mỗi bước chuyển dữ liệu chỉ chạy một lần:

- **v1**: project chuyển sang chỉ thành viên mới thấy. Owner, người được giao task, người tạo task và người đã bình luận được giữ làm thành viên.
- **v2**: bỏ mật khẩu, thêm `google_sub`, `role`, `status`, `team_id`. User cũ thành Member đang hoạt động; tài khoản trùng email sẽ được gắn với Google ở lần đăng nhập đầu.
- **v3**: thêm `tasks.completed_at` cho biểu đồ hoàn thành. Task đã xong trước phiên bản này không có thời điểm hoàn thành nên không xuất hiện trong biểu đồ.
- **v4**: thêm `projects.team_id`. Project cũ lấy team của owner; owner không có team thì project thành "Chung toàn phòng".
- **v5**: một project có thể thuộc nhiều team (bảng `project_teams`). Team ở v4 được chép sang; cột `projects.team_id` giữ lại nhưng không còn dùng.
- **v6**: thêm `projects.description` (requirement) và bảng `project_comments` (góp ý về project).
- **v8**: bảng `notifications` được dựng lại để `task_id` có thể trống, thêm `requirement_id` và `excerpt` (thông báo khi được tag trong bình luận requirement).
- **v10**: thêm `users.invited_by` (ai đã mời). Người do Leader mời chờ Manager duyệt; Leader chỉ duyệt được người tự đăng ký. Tài khoản cũ coi như tự đăng ký.
- **v9**: Leader và Manager có thể thuộc nhiều team (bảng `user_teams`). Team ở v2 được chép sang; cột `users.team_id` giữ lại nhưng không còn dùng.
- **v7**: bảng `requirements` và `requirement_comments`, cột `tasks.requirement_id`. Mỗi project cũ có một "Requirement chung" nhận mô tả v6, toàn bộ task và góp ý chung của project; sau đó cột `projects.description` và bảng `project_comments` bị bỏ. Xoá requirement còn task bị chặn.
- **v28** (là v26 trên bản `v1.0` đã deploy; database đi theo nhánh đó được chạy bù bước Manager theo team): 4 trạng thái mặc định tên cố định Planned / In-Progress / Completed / Pending (`sections.kind` thêm `pending`, dựng lại bảng `sections`, giữ id). Trạng thái mặc định cũ (Cần làm / Đang làm / Hoàn thành, kể cả đã đổi tên) lấy tên mới; project thiếu trạng thái nào thì được thêm vào cuối.
- **v27**: root thêm / sửa / xoá vai trò: `roles` thêm `builtin`, `min_teams` (0/1), `max_teams` (1/NULL; Member 1, Leader tối thiểu 1); dựng lại `users` để bỏ CHECK trên `role`.
- **v26**: Manager theo team: các quyền của Manager còn ở mặc định cũ "Toàn phòng" (xem project, đổi team project, requirement, theo dõi, hồ sơ, quản lý người dùng, thành viên team, team, thông báo task xong) chuyển sang "Team của mình"; ô root đã tự đổi được giữ.
- **v25**: cột `users.joined_at`, ghi ở lần đăng nhập đầu (đăng nhập = chấp nhận lời mời). Tài khoản đã có trước v25 được coi là đã tham gia.
- **v24**: bảng `roles` (key, tên, `level`) và `role_permissions` (vai trò, quyền, phạm vi `none` / `team` / `all`). Quyền nào thiếu được điền giá trị mặc định mỗi khi server khởi động, nên quyền thêm ở bản sau tự có mặc định; ô root đã đặt được giữ nguyên.
- **v23**: vai trò `root` (bảng `users` dựng lại như v22). Tài khoản có sẵn với email trong `ROOT_EMAILS` thành root và rời mọi team.
- **v22**: vai trò `director` (bảng `users` được dựng lại vì SQLite không sửa được ràng buộc CHECK; giữ nguyên id và mọi cột). Email trong `DIRECTOR_EMAILS` thành Director ngay khi chuyển.
- **v21**: cột `users.avatar` (tên file ảnh đại diện trong `server/data/uploads/`, đổi mỗi lần tải lên).
- **v20**: cột hồ sơ của `users`: `birthday`, `phone`, `job_title`, `bio`, `gender` (`male` / `female` / `other` / `undisclosed`), đều trống lúc đầu.
- **v19**: cột `users.language` (`vi` / `en`, mặc định `vi`).
- **v18**: cột `tasks.recurrence` (quy tắc lặp, JSON) và `tasks.next_task_id` (bản kế tiếp đã tạo).
- **v17**: bảng `channels` (tên, màu) và `task_channels` (kênh gắn trên task). Danh sách bắt đầu trống.
- **v16**: bỏ nhãn team của requirement (bảng `requirement_teams`, cột `requirements.all_teams`); team của task giờ tính theo người được giao, không lưu.
- **v15**: bảng `task_events` (lịch sử task). Bắt đầu trống: thay đổi trước phiên bản này không có lịch sử. Dòng quá 30 ngày bị xoá khi server khởi động và mỗi ngày một lần.
- **v14**: thêm nhãn team cho requirement (`requirements.all_teams`, bảng `requirement_teams`); bỏ lại ở v16.
- **v13**: thêm `attachments.comment_id` và `attachments.requirement_comment_id`: file gửi kèm bình luận task / requirement, xoá theo bình luận.
- **v12**: thêm `sections.kind` (`todo` / `doing` / `done`). Cột "To do" / "Doing" / "Done" đầu tiên của mỗi project (theo tên) nhận loại tương ứng và đổi tên thành Cần làm / Đang làm / Hoàn thành. Sau đó dữ liệu được đồng bộ: task đã tick mà nằm ngoài cột Hoàn thành được chuyển vào cuối cột đó; task trong cột Hoàn thành mà chưa tick thì được tick (`completed_at` để trống vì không biết lúc xong).
- **v11**: thêm `edited_at` cho `comments` và `requirement_comments` (sửa bình luận), bảng `attachments` (file đính kèm của task hoặc requirement). Nội dung file nằm trong thư mục `uploads/` cạnh file database (`server/data/uploads/`), tên file ngẫu nhiên; **sao lưu database thì sao lưu cả thư mục này**. File của task / requirement / project bị xoá được dọn khỏi ổ đĩa ngay sau khi xoá và mỗi lần server khởi động.

## Cấu trúc

```
server/src/db.js       schema SQLite + migration + helper transaction
server/src/config.js   biến môi trường (cổng, JWT_SECRET, Google, ROOT_EMAILS, DIRECTOR_EMAILS, MANAGER_EMAILS, DEV_LOGIN, sao lưu); kiểm tra khi production
server/src/index.js    dựng app Express: đăng nhập bắt buộc, gắn các router, phục vụ client/dist, xử lý lỗi, dọn dẹp và sao lưu định kỳ
server/scripts/backup.js  npm run backup (sao lưu tay)
deploy/                setup.sh (cài lên VPS Ubuntu), update.sh (deploy một bản), rollback.sh (quay lại bản cũ), lib.sh (dùng chung),
                       Caddyfile (HTTPS), keyofsuccess.service (systemd)
server/src/routes/     REST API, mỗi tính năng một file (express.Router, gắn dưới /api)
  auth               đăng nhập Google / dev, middleware kiểm tra token (requireUser)
  me                 /me, hồ sơ, ảnh đại diện
  teams, admin       team, thành viên team, /people; quản lý người dùng (Manager, Director)
  channels           danh sách kênh
  projects, sections project, thành viên project; trạng thái (cột board)
  requirements       requirement, comments và file của requirement
  tasks              task, subtask, lịch sử, comments và file của task
  comments           sửa / xoá comment (task và requirement), file trong comment
  attachments        tải về / xoá file đính kèm
  health             /health (không cần đăng nhập), cho reverse proxy / theo dõi uptime
  dashboard          Dashboard tổng và Dashboard project
  notifications      chuông thông báo, luồng sự kiện /events
  permissions        /roles (mọi người), thêm / sửa / xoá vai trò /admin/roles và bảng quyền /admin/permissions (root)
server/src/lib/        luật và helper dùng chung giữa các route
  access             quyền project / task (projectAccess, taskAccess, isTaskAdmin, canBeAssigned, taskScope…)
  permissions        danh mục quyền + mặc định, scopeOf / can / coversTeams, cấp bậc (levelOf, outranks), seedPermissions
  roles              isRoot
  users, requirements, statuses, history, channels, recurrence, mentions, notifications
  live               Server-Sent Events (pushChange, pushNotifications)
  backup             sao lưu hằng ngày database + uploads
  uploads            lưu file, sweepUploads; comments: COMMENT_KINDS dùng chung cho comment task / requirement
  http, util         lỗi 400/403/404, managerOnly; helper SQL và ngày
client/src/api.js      fetch wrapper (gắn token, tự logout khi 401), luồng sự kiện live
client/src/            i18n.js + i18n.en.js (VI / EN), route.js (URL ↔ màn), utils.js, avatars.js, touchDrag.js
client/src/styles/     CSS, nạp theo thứ tự trong index.css
  tokens             màu, font, bo góc (sáng / tối)
  base, project, pages, pills, sidebar, features
  responsive         iPad / màn cảm ứng (luôn nạp cuối)
client/src/components/ component dùng chung giữa các màn
  Avatar, CurrentUser (context người dùng), Dialog (askText / askConfirm)
  TaskParts          CheckButton, DueDate, PriorityTag, TaskMeta, TaskTags, ChannelTag, AddTaskInline, SectionHeader
  Mentions           ô viết có @mention, hiển thị mention
  Controls           SearchBox, TeamPills, Hint; Preferences: nút Sáng / Tối, VI / EN; hooks: useAllTeams, useChannels
client/src/features/   các màn, mỗi tính năng một thư mục
  auth               Login (đăng nhập Google / dev, màn chờ duyệt)
  layout             Workspace (khung chính, panel task, thông báo), Sidebar, NotificationBell
  projects           ProjectView (+ ProjectHeader, TaskFilterBar), BoardView, ListView, CalendarView, MembersPanel, CreateProjectModal
  tasks              TaskDetail (+ TaskFields, Subtasks, RecurrenceField), TaskHistory, TasksPage (Task của tôi / Theo dõi)
  comments           CommentList, Attachments (dùng chung cho task và requirement)
  requirements       RequirementsPanel, RequirementDetail (+ RequirementFiles, RequirementComments, RequirementProgress,
                     useRequirementList), RequirementPage
  dashboard          DashboardPage, ProjectDashboardPage
  admin              AdminPage (quản lý người dùng, team, kênh), TeamModal, TeamMembers, MyTeamsPage
  profile            ProfilePage, ProfilePopover
```

## API

| Method | Path | Quyền |
|---|---|---|
| GET | `/api/auth/config` | công khai: `{ googleClientId, devLogin }` |
| POST | `/api/auth/google` | công khai: `{ credential }` (ID token của Google) |
| POST | `/api/auth/dev` | chỉ khi `DEV_LOGIN=1`: `{ email, name }` |
| GET | `/api/me` | kể cả tài khoản chờ duyệt; có `language` (`vi` / `en`) |
| GET | `/api/me` (thêm) | trả cả `permissions` (`{ quyền: phạm vi }` của vai trò mình) và hồ sơ: `birthday`, `phone`, `job_title`, `bio`, `gender`, `created_at` (chỉ của chính mình; Manager thấy của mọi người ở `/api/admin/users`) |
| POST, DELETE | `/api/me/avatar` | tải lên (nội dung ảnh, `Content-Type: application/octet-stream`; chỉ PNG / JPG / WebP theo nội dung file, tối đa 1 MB) / xoá ảnh đại diện của mình; trả về tài khoản |
| GET | `/api/users/:id/profile` | hồ sơ đầy đủ của một người, cho chính họ, Manager và Leader của team có người đó (hồ sơ Manager: chỉ Manager); người khác nhận 404 |
| GET | `/api/avatars` | `{ userId: phiên bản }` của những người có ảnh (mọi người đã đăng nhập) |
| GET | `/api/avatars/:userId` | ảnh đại diện (`?v=` phiên bản để cache lâu dài) |
| PATCH | `/api/me` | người đang đăng nhập sửa tài khoản của mình, gửi trường nào sửa trường đó: `language` (`vi` / `en`), `name` (bắt buộc, ≤ 80 ký tự), `birthday` (YYYY-MM-DD, 1900 → hôm nay), `phone`, `job_title` (≤ 80), `bio` (≤ 500), `gender`; `''` / `null` xoá trường không bắt buộc |
| GET | `/api/people` | người mình được theo dõi (Leader: người trong các team của mình, Manager: tất cả) |
| GET | `/api/teams` | |
| POST, PATCH, DELETE | `/api/teams`, `/api/teams/:id` | Manager. Không xoá được team còn người |
| GET | `/api/channels` | mọi người; Manager thấy thêm `task_count` |
| POST, PATCH, DELETE | `/api/channels`, `/api/channels/:id` | Manager. `{ name, color? }` (màu `#rrggbb`, bỏ trống thì lấy màu kế tiếp trong bảng màu); tên không trùng (không phân biệt hoa thường) |
| DELETE | `/api/admin/users/:id` | huỷ lời mời chưa ai nhận (tài khoản chưa đăng nhập lần nào bị xoá): người mời, hoặc `users.manage` / root với tài khoản không cao cấp hơn mình. 400 nếu người đó đã tham gia (chỉ khoá được) |
| GET | `/api/roles` | mọi người đã đăng nhập: `[{ key, name, level, builtin, min_teams, max_teams }]`, cấp cao trước; root có thêm `user_count` |
| POST | `/api/admin/roles` | chỉ root: `{ name, level, copy_from }`, vai trò mới chép quyền và số team của `copy_from`; trả lại danh sách vai trò |
| PATCH, DELETE | `/api/admin/roles/:key` | chỉ root. PATCH: bất kỳ `{ name, level, min_teams (0/1), max_teams (1/null) }`; vai trò có sẵn không đổi cấp bậc; 400 nếu có người giữ không đúng số team mới. DELETE: chỉ vai trò tự tạo, không còn ai giữ |
| GET, PATCH | `/api/admin/permissions` | chỉ root. GET: `{ roles, permissions: [{ key, scopes }], grants: { role: { quyền: phạm vi } } }`; PATCH `{ role, permission, scope }` (400 nếu phạm vi không hợp lệ cho quyền đó) |
| POST | `/api/admin/permissions/reset` | chỉ root: `{ role }`, vai trò có sẵn về quyền mặc định (vai trò tự tạo: 400) |
| GET | `/api/admin/users` | Manager |
| PATCH | `/api/admin/users/:id` | Manager / Director / root (root: 404 với tài khoản root; không trả thông tin cá nhân): `{ role, status, team_ids }` (hoặc `team_id` cho một team). Member tối đa 1 team, Leader ít nhất 1. `role: 'director'` và mọi thay đổi trên tài khoản Director: chỉ Director hoặc root (403) |
| GET | `/api/teams/:id/members` | Manager (mọi team) / Leader (team mình): `{ team, members, candidates }`. `candidates` là người được phép thêm |
| POST | `/api/teams/:id/members` | `{ user_id }`: thêm vào team; tài khoản đang chờ thì được duyệt luôn (người do Leader mời chỉ Manager duyệt). Leader chỉ thêm Member chưa có team |
| DELETE | `/api/teams/:id/members/:userId` | bỏ khỏi team. Leader chỉ bỏ Member; Leader luôn giữ ít nhất 1 team |
| POST | `/api/teams/:id/invite` | `{ email, name? }`: tạo tài khoản Member trong team. Manager mời: hoạt động ngay; Leader mời: chờ Manager duyệt. Không gửi email |
| POST | `/api/admin/users` | `users.manage` hoặc root (thẻ "Mời người dùng mới" trên màn Cấu hình hệ thống) mời người chưa có tài khoản: `{ email, name?, role? (mặc định member, không cao hơn cấp của người mời), team_id? (bắt buộc với Member / Leader) }`. Tạo tài khoản đang hoạt động; lần đầu đăng nhập Google bằng email này là vào thẳng. Không gửi email. 409 nếu email đã có tài khoản |
| GET | `/api/tasks?assignee=me\|<id>` `&team=<id>` `&mine=1` `&all=1` | task xuyên project, kèm `can_edit`. `mine=1`: mọi team của Leader |
| GET | `/api/dashboard?team=<id>`, `?mine=1` hoặc `?all=1` | Leader (các team của mình) / Manager: `{ summary, people, trend, projects, channels, no_channel }`; `people[].team_name` là tên các team nối bằng dấu phẩy |
| GET | `/api/projects/:id/dashboard[?team=<id>]` | Ai mở được project: `{ project, teams, summary, requirements, sections, people, trend, channels, no_channel }` (`channels`: kênh có task trong phạm vi, mỗi dòng có `total`, `done`, `open`, `overdue`…; `no_channel`: task chưa gắn kênh). `team` chỉ tính task giao cho người của team đó |
| GET | `/api/projects` | project mình mở được, kèm `team_name` và `access` (`manage` / `edit` / `view`) |
| POST | `/api/projects` | Chỉ Manager: `{ name, color, team_ids?, add_team? }` (mảng rỗng = Chung toàn phòng) |
| GET, PATCH, DELETE | `/api/projects/:id` | trả về project (kèm `teams`, `can_add_tasks`: được thêm task không), members, sections, tasks (kèm `assignee_teams`: team của người làm trong project) và `requirements` (kèm `task_count`, `done_count`, `comment_count`); PATCH tên/màu và DELETE cần `manage`; PATCH `team_ids` chỉ Manager |
| POST | `/api/projects/:id/requirements` | `{ title, description }`; owner, Leader của team phụ trách hoặc Manager |
| PATCH, DELETE | `/api/requirements/:id` | cùng quyền như trên; DELETE trả 400 nếu requirement còn task |
| GET, POST | `/api/requirements/:id/comments` | bình luận của requirement; ai mở được project đều đọc và gửi được |
| PATCH, DELETE | `/api/comments/:id`, `/api/requirement-comments/:id` | PATCH `{ body }` chỉ người viết (đặt `edited_at`, báo người mới được tag; chữ trống được nếu bình luận có file); DELETE người viết hoặc Manager, file kèm theo bị xoá |
| POST | `/api/comments/:id/attachments`, `/api/requirement-comments/:id/attachments` | chỉ người viết; gửi file như các endpoint đính kèm khác. Tạo bình luận chỉ có file: POST bình luận với `{ body: '', with_files: true }` rồi gửi file. Bình luận trả về kèm `attachments` |
| POST | `/api/tasks/:id/attachments`, `/api/requirements/:id/attachments` | ai xem / bình luận được; body là nội dung file với `Content-Type: application/octet-stream`, tên file (URI-encoded) trong header `X-File-Name`, loại file trong `X-File-Type`; tối đa 25 MB (413 nếu quá) |
| GET | `/api/requirements/:id/attachments` | danh sách file của requirement (file của task nằm trong `GET /api/tasks/:id`, mục `attachments`) |
| GET, DELETE | `/api/attachments/:id` | GET trả nội dung file (ảnh PNG/JPG/GIF/WebP trả đúng loại để xem trước, còn lại `application/octet-stream` + tải về, kèm `nosniff`); DELETE người tải lên, người có toàn quyền task, hoặc người sửa được requirement |
| POST, DELETE | `/api/projects/:id/members`, `/api/projects/:id/members/:userId` | `manage`; thành viên tự rời được |
| POST, PATCH, DELETE | `/api/projects/:id/sections`, `/api/sections/:id` | thành viên project |
| POST | `/api/tasks` | quyền sửa project; task cần `section_id` + `requirement_id` cùng project, subtask chỉ cần `parent_id` |
| GET | `/api/tasks/:id` | có quyền xem; trả về `task.access` = `edit` hoặc `view`, `task.channels`, `assignees` (người giao được, kèm `is_member`) và `channels` (kênh chọn được, cho người sửa được task cha), `next_task` (`{ id, title, due_date }` của bản kế tiếp nếu là task lặp đã xong) |
| PATCH, DELETE | `/api/tasks/:id` | thành viên project. PATCH nhận thêm `channel_ids: [id…]` (thay toàn bộ kênh của task; `[]` = bỏ hết; subtask: 400) và `recurrence`: `{ freq: "daily" }`, `{ freq: "weekly" | "biweekly", days: [1..7] }` (1 = thứ Hai), `{ freq: "monthly", day: 1..31 }` hoặc `null` để tắt; task chưa có hạn thì được đặt hạn là ngày đầu tiên của quy tắc từ hôm nay |
| POST | `/api/tasks/:id/comments` | có quyền xem |
| GET | `/api/tasks/:id/history` | có quyền xem task; 30 ngày gần nhất, mới nhất trước. Mỗi dòng `{ id, type, user_id, user_name, created_at, ... }`; `type` = `created`, `field` (`field`, `from`, `to`: giá trị đã đổi thành tên dễ đọc), `subtask_added`, `subtask_deleted`, `comment_added` / `comment_edited` / `comment_deleted` (`excerpt`, `from` / `to`, `author`, `files`), `file_added` / `file_deleted` (`name`, `in_comment`); thay đổi của subtask có thêm `subtask` (tên) và nằm trong lịch sử của task cha |
| GET | `/api/notifications` | `{ items, unread, pendingUsers }`; `pendingUsers`: Manager đếm mọi tài khoản chờ duyệt, Leader đếm người tự đăng ký chưa có team (người mình duyệt được); mỗi item có `type` = `task_completed`, `mention` hoặc `assigned` |
| GET | `/api/events` | luồng Server-Sent Events; gửi `event: notification` khi user có thông báo mới, và `event: change` (data `{ project_id, task_id, requirement_id, source }`, chỉ id) khi task, bình luận, section, requirement của một project thay đổi, tới người mở được project đó hoặc xem được task đó. `source` là header `X-Client-Id` của tab gây ra thay đổi để tab đó bỏ qua. Đọc bằng fetch với header Authorization |
| GET | `/api/tasks/:id/mentionable`, `/api/requirements/:id/mentionable` | người tag được (xem được task / mở được project) |
| POST | `/api/notifications/read` | `{ id }` đánh dấu một cái, body rỗng đánh dấu tất cả |
