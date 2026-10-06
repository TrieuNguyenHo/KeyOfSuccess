# KeyOfSuccess — quản lý task cho team Marketing

React + Vite (frontend), Node/Express + SQLite (backend), đăng nhập bằng Google.

## Tính năng

- Đăng nhập bằng Google (Gmail). Người mới phải chờ Manager duyệt
- Vai trò hệ thống **Manager / Leader / Member** và **Team**: Member thuộc đúng 1 team; Leader thuộc 1 hoặc nhiều team và phụ trách tất cả các team đó; Manager thuộc bao nhiêu team cũng được (hoặc không team nào)
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
- Project: tạo, đổi tên, xoá; mỗi project mới có sẵn 3 **trạng thái** (cột Board, trong code là `sections`) Cần làm / Đang làm / Hoàn thành; ô lọc "Mọi trạng thái" liệt kê đúng các trạng thái này. **Trạng thái và dấu hoàn thành đi cùng nhau**: tick hoàn thành thì task sang cuối cột Hoàn thành, bỏ tick thì về Đang làm; kéo vào Hoàn thành thì tự tick (Leader và Manager được báo như khi tick), kéo sang cột khác thì tự bỏ tick; thêm task ngay trong cột Hoàn thành là đã xong. Cột Hoàn thành nhận ra theo `sections.kind = 'done'`, đổi tên vẫn giữ. 3 trạng thái mặc định không xoá được (đổi tên được); trạng thái tự thêm thì xoá được. Subtask chỉ có dấu tick
- **Project theo team**: mỗi project thuộc một hoặc nhiều team cùng phụ trách (hoặc "Chung toàn phòng"), sidebar "Projects theo team" giống nhau cho mọi vai trò: mỗi team của người dùng là một nhóm (kể cả khi chưa có project; project chung nhiều team hiện ở từng team), project ngoài team của mình nằm trong "Project khác", project không thuộc team nào trong "Chung toàn phòng"; khi tạo có thể thêm cả team làm thành viên
- Task: tiêu đề, mô tả, người làm, hạn chót, độ ưu tiên, hoàn thành; subtask; bình luận
- **Project → Requirements → Task → Subtask**: mỗi project có nhiều requirement (tiêu đề, mô tả, tiến độ tự tính); mỗi task bắt buộc thuộc một requirement, đổi được sang requirement khác; subtask theo task như cũ
- **Tab Requirements**: danh sách requirement kèm thanh tiến độ, chi tiết từng requirement với task của nó, nút "Xem trên Board" và bình luận riêng cho từng requirement
- Board/List lọc được theo requirement, mỗi task có nhãn requirement; thêm task thì chọn requirement
- **Nhãn team trên task theo người làm**: task trên Board / List hiện team của người được giao (những team của họ mà project có; project toàn phòng: mọi team của họ); ô lọc "Mọi team" trên thanh lọc project lọc theo đó, lưu trên URL `?team=3`
- **Kênh** (Facebook, TikTok, SEO, Email…): danh sách kênh dùng chung cả phòng, Manager thêm / đổi tên / đổi màu / xoá trong Quản lý người dùng. Ai sửa được task thì gắn kênh (một task gắn được nhiều kênh; subtask không có kênh). Kênh hiện trên Board / List / Task của tôi / Theo dõi (trên Lịch: khi rê chuột vào task); ô lọc "Mọi kênh" có ở project và Task của tôi / Theo dõi, lưu trên URL `?channel=2`. Dashboard tổng và dashboard project có mục **"Theo kênh"**: số task xong / tổng và quá hạn của từng kênh (task gắn nhiều kênh tính ở mỗi kênh), thêm dòng "Chưa gắn kênh". Xoá kênh thì nhãn bị gỡ khỏi các task, mỗi task ghi vào lịch sử
- **Task lặp lại** (báo cáo tuần, đăng bài định kỳ): ô "Lặp lại" trong panel task: hằng ngày (T2–T6), hằng tuần hoặc mỗi 2 tuần (chọn các thứ), hằng tháng (ngày 1–31; tháng ngắn hơn thì ngày cuối tháng). Ai sửa được task thì đặt được. Đánh dấu xong (tick hay kéo vào Hoàn thành) thì app tạo bản kế tiếp ở trạng thái Cần làm, chép tên, mô tả, người làm, requirement, kênh, ưu tiên và subtask (chưa tick); hạn tính từ hạn cũ, không bao giờ rơi vào quá khứ. Quy tắc chuyển sang bản mới; mỗi bản chỉ sinh bản kế tiếp một lần. Task lặp có ↻ cạnh hạn chót. Task hằng ngày xong không báo Leader / Manager; người làm được báo "được giao" nếu người khác tick
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

| | Member | Leader | Manager |
|---|---|---|---|
| Task của tôi, project mình tham gia | ✓ | ✓ | ✓ |
| Task của người khác ở project **không** tham gia | ✗ | Người cùng team: xem + bình luận | Mọi người: xem + bình luận |
| Nhận thông báo khi task xong | | Task của người trong team | Mọi task |
| Quản lý người dùng và team | | | ✓ |
| Quản lý thành viên team của mình (thêm người chưa có team, duyệt người tự đăng ký, mời email mới chờ Manager duyệt, bỏ Member khỏi team) | | ✓ | ✓ (mọi team) |

- "Xem + bình luận": mở được panel chi tiết, đọc và comment, nhưng không sửa, xoá hay tick xong được. Muốn sửa thì phải là thành viên project.
- Leader bắt buộc thuộc ít nhất một team; Member chỉ thuộc một team (đổi Leader/Manager nhiều team thành Member thì giữ team đầu tiên). Manager không thể tự hạ quyền hay tự khoá mình.
- Tài khoản bị khoá bị đăng xuất ngay ở request kế tiếp.
- Email trong `MANAGER_EMAILS` luôn đăng nhập với vai trò Manager. Dùng để tạo Manager đầu tiên.

### Trong từng project

**Chỉ Manager tạo project.** "Quản lý task" là Manager hoặc Leader có team tham gia project (project "Chung toàn phòng": mọi Manager, và Leader nào mở được project).

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
| `MANAGER_EMAILS` | Email Manager đầu tiên, cách nhau bởi dấu phẩy |
| `JWT_SECRET` | Chuỗi ngẫu nhiên dài. **Bắt buộc khi deploy** |
| `DEV_LOGIN=1` | Đăng nhập bằng email bất kỳ, không cần Google. **Chỉ dùng khi dev local**, tự tắt khi `NODE_ENV=production` |
| `API_PORT` | Port API, mặc định `3001` |
| `DB_PATH` | File SQLite, mặc định `server/data/app.db` |

### 3. Chạy

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001 (Vite proxy `/api` sang đây)

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
| `statuses.test.js` | Trạng thái mặc định, tick ↔ cột Hoàn thành, kéo vào / ra, đổi tên cột, project không có cột Hoàn thành |
| `comments-attachments.test.js` | Sửa / xoá bình luận (task và requirement), đính kèm file: quyền, giới hạn 25 MB, cách trả file, xoá file khỏi ổ đĩa |
| `channels.test.js` | Kênh: Manager quản lý danh sách, gắn kênh lên task, lịch sử, xoá kênh, dashboard theo kênh |
| `recurring.test.js` | Task lặp lại: quy tắc, tạo bản kế tiếp, hạn kế tiếp (tháng ngắn, mỗi 2 tuần, trễ hạn), thông báo, lịch sử |
| `language.test.js` | Ngôn ngữ theo tài khoản (`PATCH /api/me`) |
| `avatar.test.js` | Ảnh đại diện: tải lên, thay ảnh xoá file cũ, chặn file không phải ảnh / quá 1 MB, dọn file không xoá ảnh, tài khoản khoá không hiện ảnh |
| `profile.test.js` | Hồ sơ: sửa / xoá trường, kiểm tra dữ liệu, tên mới hiện ở mọi chỗ, chỉ chính mình và Manager thấy thông tin cá nhân |
| `i18n.test.js` | Giao diện tiếng Anh đủ: mọi khoá `tr()` có bản tiếng Anh, không chữ tiếng Việt nào nằm ngoài `tr()`, mọi thông báo lỗi của server dịch được (không bật server) |

- Mỗi file tự bật một server riêng trên port trống với **database tạm**, nên test **không bao giờ đụng tới `server/data/app.db`** và các file chạy song song. Dev server đang chạy không bị ảnh hưởng.
- Đăng nhập trong test dùng `DEV_LOGIN`; `boss@t.test` là Manager. `server/.env` không được đọc.
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
server/src/config.js   biến môi trường (cổng, JWT_SECRET, Google, MANAGER_EMAILS, DEV_LOGIN)
server/src/index.js    dựng app Express: đăng nhập bắt buộc, gắn các router, xử lý lỗi, dọn dẹp định kỳ
server/src/routes/     REST API, mỗi tính năng một file (express.Router, gắn dưới /api)
  auth               đăng nhập Google / dev, middleware kiểm tra token (requireUser)
  me                 /me, hồ sơ, ảnh đại diện
  teams, admin       team, thành viên team, /people; quản lý người dùng (Manager)
  channels           danh sách kênh
  projects, sections project, thành viên project; trạng thái (cột board)
  requirements       requirement, comments và file của requirement
  tasks              task, subtask, lịch sử, comments và file của task
  comments           sửa / xoá comment (task và requirement), file trong comment
  attachments        tải về / xoá file đính kèm
  dashboard          Dashboard tổng và Dashboard project
  notifications      chuông thông báo, luồng sự kiện /events
server/src/lib/        luật và helper dùng chung giữa các route
  access             quyền project / task (projectAccess, taskAccess, isTaskAdmin, canBeAssigned, taskScope…)
  users, requirements, statuses, history, channels, recurrence, mentions, notifications
  live               Server-Sent Events (pushChange, pushNotifications)
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
  projects           ProjectView, BoardView, ListView, CalendarView, MembersPanel, CreateProjectModal
  tasks              TaskDetail, TaskHistory, TasksPage (Task của tôi / Theo dõi)
  comments           CommentList, Attachments (dùng chung cho task và requirement)
  requirements       RequirementsPanel, RequirementPage
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
| GET | `/api/me` (thêm) | trả cả hồ sơ: `birthday`, `phone`, `job_title`, `bio`, `gender`, `created_at` (chỉ của chính mình; Manager thấy của mọi người ở `/api/admin/users`) |
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
| GET | `/api/admin/users` | Manager |
| PATCH | `/api/admin/users/:id` | Manager: `{ role, status, team_ids }` (hoặc `team_id` cho một team). Member tối đa 1 team, Leader ít nhất 1 |
| GET | `/api/teams/:id/members` | Manager (mọi team) / Leader (team mình): `{ team, members, candidates }`. `candidates` là người được phép thêm |
| POST | `/api/teams/:id/members` | `{ user_id }`: thêm vào team; tài khoản đang chờ thì được duyệt luôn (người do Leader mời chỉ Manager duyệt). Leader chỉ thêm Member chưa có team |
| DELETE | `/api/teams/:id/members/:userId` | bỏ khỏi team. Leader chỉ bỏ Member; Leader luôn giữ ít nhất 1 team |
| POST | `/api/teams/:id/invite` | `{ email, name? }`: tạo tài khoản Member trong team. Manager mời: hoạt động ngay; Leader mời: chờ Manager duyệt. Không gửi email |
| POST | `/api/admin/users` | Manager mời người chưa có tài khoản: `{ email, name?, team_id }`. Tạo tài khoản Member đang hoạt động trong team đó; lần đầu đăng nhập Google bằng email này là vào thẳng. Không gửi email. 409 nếu email đã có tài khoản |
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
