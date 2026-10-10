import { tr } from '../../i18n.js';
import { can, canAdminister, roleLabel } from '../../utils.js';
import GuideArt from './GuideArt.jsx';

// The user guide (#/guide, "Hướng dẫn" in the sidebar). Only the parts the reader's role may use are shown,
// read from user.permissions like every other screen. Each item is [illustration kind (GuideArt), title, text].
function sections(user) {
  const taskAdmin = can(user, 'tasks.admin');
  return [
    {
      id: 'start',
      title: tr('Bắt đầu'),
      items: [
        ['sidebar', tr('Thanh bên trái'), tr('Các màn chính nằm ở trên; dưới đó là hoạt động, xếp theo từng team của bạn. Hoạt động của team khác nằm ở "Hoạt động khác", hoạt động chung cả phòng ở "Chung toàn phòng".')],
        ['profile', tr('Hồ sơ của bạn'), tr('Bấm tên mình ở cuối thanh bên để sửa tên hiển thị, ảnh đại diện, ngày sinh, số điện thoại, chức danh. Thông tin cá nhân chỉ bạn, Manager và Leader của team bạn xem được.')],
        ['theme', tr('Giao diện và ngôn ngữ'), tr('Nút Sáng / Tối và VI | EN ở cuối thanh bên (và trong Hồ sơ). Ngôn ngữ được lưu theo tài khoản; tên hoạt động, task… giữ nguyên như người viết gõ.')],
        ['link', tr('Gửi link cho đồng nghiệp'), tr('Màn đang xem (kể cả bộ lọc và task đang mở) nằm trên địa chỉ trang. Tải lại trang vẫn đúng chỗ; sao chép địa chỉ để gửi cho người khác. Với một task, bấm 🔗 ở đầu panel task để sao chép link của nó; dán vào tin nhắn thì hiện thành thẻ tên task.')],
        ...(can(user, 'chat.use')
          ? [['chat', tr('Tin nhắn'), tr('Mục "Tin nhắn" trên thanh bên, bấm "+ Tin nhắn mới": nhắn riêng một người, tạo nhóm (bạn quản lý nhóm: đổi tên, bỏ người; ai trong nhóm cũng thêm được người hoặc rời nhóm), hoặc mở chat của hoạt động (ai mở được hoạt động đều ở trong; có cả nút "Chat" trên đầu hoạt động) và của team bạn. Ai được thêm vào nhóm sẽ thấy dòng "… đã thêm bạn vào nhóm" như một tin chưa đọc; mọi thay đổi của nhóm (thêm, bỏ người, rời nhóm, đổi tên) hiện thành dòng nhỏ giữa cuộc trò chuyện. Chỉ người trong cuộc đọc được, kể cả Manager hay Director. Enter để gửi, Shift+Enter để xuống dòng; gõ @ để nhắc ai đó trong nhóm; dán ảnh hoặc bấm 📎 để gửi file; dán link task thì người xem được task thấy tên task, bấm để mở. "Trả lời" để trích dẫn một tin; bạn sửa / xoá được tin của mình. 🔔 / 🔕 tắt thông báo từng cuộc (vẫn đếm khi có người nhắc tới bạn). Bấm 😀 cạnh 📎 để chèn emoji (tin chỉ có 1–3 emoji thì hiện to), 😊 để thả cảm xúc vào một tin; ảnh hiện ngay trong khung chat, bấm để xem to. Nút ⋯ cạnh mỗi tin để ghim tin lên đầu cuộc trò chuyện, chuyển tiếp sang cuộc khác, hoặc tạo task từ tin đó (ảnh, file đi theo, task có link quay về tin). Gõ @tất cả để nhắc mọi người trong nhóm; bấm "📊 Bình chọn" trên ô nhập để hỏi ý kiến cả nhóm (cho chọn nhiều, cho người khác thêm phương án, hạn chót: tuỳ bạn; ai chọn gì đều hiện tên). 🔔 ở đầu cuộc trò chuyện để tắt thông báo 1 giờ, 8 giờ hoặc cho tới khi bật lại; 📍 để ghim cuộc trò chuyện lên đầu danh sách (tối đa 5, chỉ bạn thấy). Ô "Tìm tin nhắn" tìm cả khi không gõ dấu; "Thông tin" ở đầu cuộc trò chuyện gom ảnh, file và link đã gửi. Số tin chưa đọc hiện trên mục "Tin nhắn" và trên tên tab, không vào chuông; bấm "🔔 Bật thông báo trên máy tính" ở đầu màn Tin nhắn để có thông báo khi đang ở tab khác. Tin nhắn tự xoá sau 6 tháng.')]]
          : []),
        ['feedback', 'Feedback', tr('Gặp lỗi hay muốn app có thêm gì, bấm "Feedback" ở cuối thanh bên: chọn Lỗi / Đề xuất / Khác, ghi tiêu đề, nội dung, dán ảnh chụp màn hình nếu có. Chỉ bạn và quản trị hệ thống thấy feedback của bạn. Bạn sửa / xoá được khi feedback còn "Đã gửi"; quản trị hệ thống chuyển nó qua Đã tiếp nhận, Đang xử lý, Đã xử lý (hoặc Không xử lý, kèm lý do) và hai bên trao đổi ngay dưới feedback. Cập nhật về feedback không vào chuông: mục "Feedback" hiện số cập nhật chưa xem và feedback đó có nhãn "Mới".')],
      ],
    },
    {
      id: 'projects',
      title: tr('Hoạt động, project và task'),
      items: [
        ['model', tr('Cách tổ chức'), tr('Mỗi hoạt động gồm các project (đầu việc lớn), mỗi project gồm các task, mỗi task có thể có subtask. Task nào cũng thuộc một project, nên hoạt động cần có project trước khi thêm task.')],
        ['views', tr('Các cách xem'), tr('Trong hoạt động: Projects (tiến độ từng project và comments), Lịch (task theo hạn chót), Timeline (thanh từ ngày bắt đầu tới hạn chót), List (bảng) và Board (cột theo trạng thái). Bộ lọc theo project, người làm, team, kênh, trạng thái, hạn chót và ô tìm task dùng chung cho List, Board, Lịch và Timeline.')],
        ['views', tr('Bộ lọc đã lưu'), tr('Bấm "☆ Lưu bộ lọc" trên hoạt động, Task của tôi hoặc Theo dõi để lưu bộ lọc và cách xem đang dùng (vd. "Facebook tuần này của Team Content") thành một nút bấm nhanh ngay trên thanh lọc; bấm ✕ trên nút để xoá. Bộ lọc đã lưu chỉ mình bạn thấy, theo tài khoản nên mở máy khác vẫn còn.')],
        ['statuses', tr('4 trạng thái cố định'), tr('Planned, In-Progress, Completed, Pending có ở mọi hoạt động, không đổi tên hay xoá được. Đánh dấu ✓ xong thì task tự sang Completed; kéo task vào Completed cũng là đánh dấu xong.')],
        taskAdmin
          ? ['rights', tr('Quyền của bạn với task'), tr('Ở hoạt động có team của bạn, bạn tạo, sửa, giao và xoá task, thêm trạng thái. Bạn giao task cho mình và người trong team của bạn tham gia hoạt động. Ở hoạt động khác bạn chỉ xem và comment.')]
          : ['rights', tr('Quyền của bạn với task'), tr('Bạn tự tạo task cho mình và sửa task được giao cho mình. Task của người khác bạn xem và comment được. Ở hoạt động không có team của bạn, bạn chỉ xem và comment.')],
        ['members', tr('Vai trò trong hoạt động'), tr('Người quản lý hoạt động có thể gán vai trò cho từng thành viên trong hộp Thành viên: Quản lý (toàn quyền task, sửa hoạt động), Thành viên hoạt động (tự tạo task, được giao task kể cả khi ở team khác) hoặc Chỉ xem. Vai trò gán tay thắng quyền theo team, nên quyền của bạn ở một hoạt động có thể khác bình thường; để "Theo team" là như cũ.')],
      ],
    },
    {
      id: 'tasks',
      title: tr('Làm việc với task'),
      items: [
        ['open', tr('Mở task'), tr('Bấm vào task để mở panel bên phải; bấm ⤢ để mở trang đầy đủ. Ở đó có mô tả, subtask, người làm, ngày bắt đầu, hạn chót, ưu tiên, project, kênh, file đính kèm và comments.')],
        ['timeline', 'Timeline', tr('Tab Timeline của hoạt động vẽ mỗi task một thanh từ ngày bắt đầu tới hạn chót, nhóm theo project, trạng thái hoặc người làm; Ngày / Tuần / Tháng để đổi thang, "Hôm nay" để quay về hôm nay. Task quá hạn có ⚠, task xong màu xám. Ai sửa được task thì kéo cả thanh để dời ngày, kéo một đầu để đổi ngày bắt đầu hoặc hạn chót, kéo dọc dòng của task chưa có ngày để đặt ngày (iPad: giữ rồi kéo). Kéo task trên Lịch thì ngày bắt đầu dời theo.')],
        ['drag', tr('Kéo thả'), tr('Kéo thẻ giữa các cột trên Board để đổi trạng thái, kéo task sang ngày khác trên Lịch để đổi hạn chót. Trên iPad: giữ ngón tay khoảng nửa giây rồi kéo.')],
        ['recurring', tr('Task lặp lại'), tr('Ô "Lặp lại" (hằng ngày, hằng tuần, mỗi 2 tuần, hằng tháng): xong task này thì app tự tạo bản kế tiếp ở Planned với hạn chót mới. Bấm "?" cạnh ô để xem chi tiết.')],
        ['channels', tr('Kênh'), tr('Gắn task với kênh (Facebook, TikTok…) để lọc và xem số liệu theo kênh trên Dashboard.')],
        ['history', tr('Lịch sử thay đổi'), tr('Cuối panel task là mọi thay đổi trong 30 ngày qua: ai đổi gì, lúc nào.')],
      ],
    },
    {
      id: 'comments',
      title: tr('Comments, nhắc tên và file'),
      items: [
        ['comment', 'Comment', tr('Task và project đều có comments. Gõ @ rồi chọn tên để nhắc ai đó: họ nhận thông báo (chỉ nhắc được người xem được nội dung đó). Bạn sửa và xoá comment của mình.')],
        ['file', 'File', tr('Dán ảnh (Ctrl+V), kéo thả hoặc bấm 📎 để gửi file kèm comment; mục "Đính kèm" của task / project nhận file tối đa 25 MB.')],
        ['notify', tr('Thông báo'), can(user, 'notify.task_completed')
          ? tr('Chuông thông báo trên thanh bên báo khi bạn được giao task, được nhắc tên, task của người trong team bạn phụ trách đã xong, hoặc task bạn theo dõi có comment, đổi hạn chót, người làm hay trạng thái. Bạn tự theo dõi task mình làm, mình tạo hoặc đã comment; nút "🔔 Theo dõi" trên task để bật / tắt. 8 giờ sáng thứ Hai đến thứ Sáu, chuông nhắc số task của bạn đã quá hạn, đến hạn hôm nay và ngày làm việc kế tiếp. Thông báo đến ngay, không cần tải lại trang.')
          : tr('Chuông thông báo trên thanh bên báo khi bạn được giao task, được nhắc tên, hoặc task bạn theo dõi có comment, đổi hạn chót, người làm hay trạng thái. Bạn tự theo dõi task mình làm, mình tạo hoặc đã comment; nút "🔔 Theo dõi" trên task để bật / tắt. 8 giờ sáng thứ Hai đến thứ Sáu, chuông nhắc số task của bạn đã quá hạn, đến hạn hôm nay và ngày làm việc kế tiếp. Thông báo đến ngay, không cần tải lại trang.')],
      ],
    },
    {
      id: 'my',
      title: tr('Task của tôi và Dashboard'),
      items: [
        ['mytasks', tr('Task của tôi'), tr('Mọi task được giao cho bạn ở mọi hoạt động, chia theo Quá hạn, Hôm nay, 7 ngày tới…; nút Danh sách / Lịch để đổi cách xem, ô "Mọi kênh" để lọc theo kênh.')],
        ['dashboard', 'Dashboard', can(user, 'people.watch')
          ? tr('"Tổng quan" cho số liệu của các team bạn theo dõi: workload từng người, task hoàn thành 14 ngày, tiến độ hoạt động và kênh. Mỗi hoạt động cũng có dashboard riêng. Nút "Xuất Excel" tải số liệu đang xem về một file Excel, mỗi phần một sheet kèm biểu đồ như trên màn hình.')
          : tr('Mỗi hoạt động bạn tham gia có dashboard riêng: phần trăm hoàn thành, tiến độ từng project, workload thành viên, tiến độ theo trạng thái và kênh. Nút "Xuất Excel" tải số liệu đang xem về một file Excel, mỗi phần một sheet kèm biểu đồ như trên màn hình.')],
      ],
    },
    can(user, 'people.watch') && {
      id: 'watch',
      title: tr('Theo dõi công việc'),
      items: [
        ['watch', tr('Theo team hoặc theo người'), tr('Màn theo dõi liệt kê task của các team bạn phụ trách; chọn một team hoặc một người để xem riêng, đổi sang Lịch để xem theo hạn chót.')],
        ['dashboard', tr('Báo cáo'), tr('Mục Báo cáo trên thanh bên: chọn Tuần, Tháng hoặc Khoảng ngày để xem bất kỳ lúc nào 3 biểu đồ tròn của các task có làm trong kỳ (theo hoạt động hoặc project, theo độ ưu tiên, theo trạng thái), số task xong trong kỳ (so với kỳ trước cùng độ dài; tháng thì so với tháng trước), xong trễ hạn, quá hạn và đến hạn 7 ngày tới (tính tại ngày cuối kỳ, hoặc hôm nay nếu kỳ chưa hết) và ai đang quá tải. Ngoài ra 8:00 sáng thứ Hai app chốt báo cáo của tuần trước và báo trong chuông; các bản chốt xem lại ở "Bản chốt thứ Hai", đúng như lúc chốt.')],
      ],
    },
    can(user, 'projects.create') && {
      id: 'create',
      title: tr('Tạo và quản lý hoạt động'),
      items: [
        ['create', tr('Tạo hoạt động'), tr('Bấm "+" cạnh "Hoạt động theo team" ở thanh bên: đặt tên, chọn team phụ trách (không chọn = chung toàn phòng), có thể thêm cả team vào hoạt động.')],
        ['model', tr('Sau khi tạo'), tr('Tạo project đầu tiên trong tab Projects, rồi thêm task. Đổi tên, đổi team, thêm / bỏ thành viên ở đầu trang hoạt động.')],
        ['template', tr('Mẫu hoạt động'), tr('Bấm ⧉ ở đầu một hoạt động để lưu nó làm mẫu (trạng thái, project, task, subtask, người làm, kênh, lặp lại và khoảng cách giữa các hạn chót; không có comment, file). Khi tạo hoạt động, chọn mẫu ở ô "Bắt đầu từ" rồi chọn ngày bắt đầu hoặc ngày ra mắt: hạn chót của các task tự tính theo ngày đó. Mẫu dùng chung cho mọi người tạo được hoạt động; đổi tên / xoá mẫu ngay ở ô chọn.')],
      ],
    },
    can(user, 'teams.members') && !can(user, 'users.manage') && {
      id: 'myteams',
      title: tr('Quản lý team'),
      items: [
        ['members', tr('Thành viên team'), tr('Màn "Quản lý team": thêm người chưa có team, duyệt người tự đăng ký vào team của bạn, mời email mới (chờ Manager duyệt), bỏ Member khỏi team.')],
      ],
    },
    canAdminister(user) && {
      id: 'admin',
      title: tr('Quản trị'),
      items: [
        can(user, 'users.manage') && ['users', tr('Người dùng'), tr('Duyệt người tự đăng ký, mời người mới, đổi vai trò và team, khoá tài khoản. Người được mời phải đăng nhập lần đầu mới tính là đã tham gia và mới được giao task.')],
        can(user, 'teams.manage') && ['members', 'Team', tr('Bấm ✎ ở một team để đổi tên và quản lý thành viên.')],
        can(user, 'channels.manage') && ['channels', tr('Kênh'), tr('Danh sách kênh dùng chung cả phòng: thêm, đổi tên, bấm chấm màu để đổi màu, xoá.')],
      ].filter(Boolean),
    },
  ].filter(Boolean);
}

export default function GuidePage({ user }) {
  const list = sections(user);
  const jump = (id) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="project">
      <header className="project-header">
        <h1>{tr('Hướng dẫn sử dụng')}</h1>
      </header>
      <div className="list guide">
        <p className="muted guide-role">
          {tr('Bạn đang dùng app với vai trò {role}; hướng dẫn chỉ gồm những việc vai trò này làm được.', { role: roleLabel(user) })}
        </p>
        <nav className="guide-toc" aria-label={tr('Mục lục')}>
          {list.map((s) => (
            <button key={s.id} className="btn" onClick={() => jump(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
        {list.map((s) => (
          <section key={s.id} id={`guide-${s.id}`} className="admin-card guide-section">
            <h2>{s.title}</h2>
            <dl>
              {s.items.map(([kind, title, text]) => (
                <div key={title} className="guide-item">
                  <GuideArt kind={kind} />
                  <dt>{title}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
