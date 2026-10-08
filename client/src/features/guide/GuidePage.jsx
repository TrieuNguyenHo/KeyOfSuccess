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
        ['sidebar', tr('Thanh bên trái'), tr('Các màn chính nằm ở trên; dưới đó là project, xếp theo từng team của bạn. Project của team khác nằm ở "Project khác", project chung cả phòng ở "Chung toàn phòng".')],
        ['profile', tr('Hồ sơ của bạn'), tr('Bấm tên mình ở cuối thanh bên để sửa tên hiển thị, ảnh đại diện, ngày sinh, số điện thoại, chức danh. Thông tin cá nhân chỉ bạn, Manager và Leader của team bạn xem được.')],
        ['theme', tr('Giao diện và ngôn ngữ'), tr('Nút Sáng / Tối và VI | EN ở cuối thanh bên (và trong Hồ sơ). Ngôn ngữ được lưu theo tài khoản; tên project, task… giữ nguyên như người viết gõ.')],
        ['link', tr('Gửi link cho đồng nghiệp'), tr('Màn đang xem (kể cả bộ lọc và task đang mở) nằm trên địa chỉ trang. Tải lại trang vẫn đúng chỗ; sao chép địa chỉ để gửi cho người khác.')],
        ...(can(user, 'chat.use')
          ? [['chat', tr('Tin nhắn'), tr('Mục "Tin nhắn" trên thanh bên, bấm "+ Tin nhắn mới": nhắn riêng một người, tạo nhóm (bạn quản lý nhóm: đổi tên, bỏ người; ai trong nhóm cũng thêm được người hoặc rời nhóm), hoặc mở chat của project (ai mở được project đều ở trong; có cả nút "Chat" trên đầu project) và của team bạn. Ai được thêm vào nhóm sẽ thấy dòng "… đã thêm bạn vào nhóm" như một tin chưa đọc; mọi thay đổi của nhóm (thêm, bỏ người, rời nhóm, đổi tên) hiện thành dòng nhỏ giữa cuộc trò chuyện. Chỉ người trong cuộc đọc được, kể cả Manager hay Director. Enter để gửi, Shift+Enter để xuống dòng; gõ @ để nhắc ai đó trong nhóm; dán ảnh hoặc bấm 📎 để gửi file; dán link task thì người xem được task thấy tên task, bấm để mở. "Trả lời" để trích dẫn một tin; bạn sửa / xoá được tin của mình. 🔔 / 🔕 tắt thông báo từng cuộc (vẫn đếm khi có người nhắc tới bạn). Bấm 😊 để thả cảm xúc; ảnh hiện ngay trong khung chat, bấm để xem to. Nút ⋯ cạnh mỗi tin để ghim tin lên đầu cuộc trò chuyện, chuyển tiếp sang cuộc khác, hoặc tạo task từ tin đó (ảnh, file đi theo, task có link quay về tin). Gõ @tất cả để nhắc mọi người trong nhóm; bấm "📊 Bình chọn" trên ô nhập để hỏi ý kiến cả nhóm (cho chọn nhiều, cho người khác thêm phương án, hạn chót: tuỳ bạn; ai chọn gì đều hiện tên). 🔔 ở đầu cuộc trò chuyện để tắt thông báo 1 giờ, 8 giờ hoặc cho tới khi bật lại; 📍 để ghim cuộc trò chuyện lên đầu danh sách (tối đa 5, chỉ bạn thấy). Ô "Tìm tin nhắn" tìm cả khi không gõ dấu; "Thông tin" ở đầu cuộc trò chuyện gom ảnh, file và link đã gửi. Số tin chưa đọc hiện trên mục "Tin nhắn" và trên tên tab, không vào chuông; bấm "🔔 Bật thông báo trên máy tính" ở đầu màn Tin nhắn để có thông báo khi đang ở tab khác. Tin nhắn tự xoá sau 6 tháng.')]]
          : []),
        ['feedback', 'Feedback', tr('Gặp lỗi hay muốn app có thêm gì, bấm "Feedback" ở cuối thanh bên: chọn Lỗi / Đề xuất / Khác, ghi tiêu đề, nội dung, dán ảnh chụp màn hình nếu có. Chỉ bạn và quản trị hệ thống thấy feedback của bạn. Bạn sửa / xoá được khi feedback còn "Đã gửi"; quản trị hệ thống chuyển nó qua Đã tiếp nhận, Đang xử lý, Đã xử lý (hoặc Không xử lý, kèm lý do) và hai bên trao đổi ngay dưới feedback. Cập nhật về feedback không vào chuông: mục "Feedback" hiện số cập nhật chưa xem và feedback đó có nhãn "Mới".')],
      ],
    },
    {
      id: 'projects',
      title: tr('Project, requirement và task'),
      items: [
        ['model', tr('Cách tổ chức'), tr('Mỗi project gồm các requirement (đầu việc lớn), mỗi requirement gồm các task, mỗi task có thể có subtask. Task nào cũng thuộc một requirement, nên project cần có requirement trước khi thêm task.')],
        ['views', tr('Các cách xem'), tr('Trong project: Requirements (tiến độ từng requirement và comments), Lịch (task theo hạn chót), List (bảng) và Board (cột theo trạng thái). Bộ lọc theo requirement, người làm, team, kênh, trạng thái, hạn chót và ô tìm task dùng chung cho List, Board và Lịch.')],
        ['statuses', tr('4 trạng thái cố định'), tr('Planned, In-Progress, Completed, Pending có ở mọi project, không đổi tên hay xoá được. Đánh dấu ✓ xong thì task tự sang Completed; kéo task vào Completed cũng là đánh dấu xong.')],
        taskAdmin
          ? ['rights', tr('Quyền của bạn với task'), tr('Ở project có team của bạn, bạn tạo, sửa, giao và xoá task, thêm trạng thái. Bạn giao task cho mình và người trong team của bạn tham gia project. Ở project khác bạn chỉ xem và comment.')]
          : ['rights', tr('Quyền của bạn với task'), tr('Bạn tự tạo task cho mình và sửa task được giao cho mình. Task của người khác bạn xem và comment được. Ở project không có team của bạn, bạn chỉ xem và comment.')],
        ['members', tr('Vai trò trong project'), tr('Người quản lý project có thể gán vai trò cho từng thành viên trong hộp Thành viên: Quản lý (toàn quyền task, sửa project), Thành viên project (tự tạo task, được giao task kể cả khi ở team khác) hoặc Chỉ xem. Vai trò gán tay thắng quyền theo team, nên quyền của bạn ở một project có thể khác bình thường; để "Theo team" là như cũ.')],
      ],
    },
    {
      id: 'tasks',
      title: tr('Làm việc với task'),
      items: [
        ['open', tr('Mở task'), tr('Bấm vào task để mở panel bên phải; bấm ⤢ để mở trang đầy đủ. Ở đó có mô tả, subtask, người làm, hạn chót, ưu tiên, requirement, kênh, file đính kèm và comments.')],
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
        ['comment', 'Comment', tr('Task và requirement đều có comments. Gõ @ rồi chọn tên để nhắc ai đó: họ nhận thông báo (chỉ nhắc được người xem được nội dung đó). Bạn sửa và xoá comment của mình.')],
        ['file', 'File', tr('Dán ảnh (Ctrl+V), kéo thả hoặc bấm 📎 để gửi file kèm comment; mục "Đính kèm" của task / requirement nhận file tối đa 25 MB.')],
        ['notify', tr('Thông báo'), can(user, 'notify.task_completed')
          ? tr('Chuông thông báo trên thanh bên báo khi bạn được giao task, được nhắc tên, hoặc task của người trong team bạn phụ trách đã xong. Thông báo đến ngay, không cần tải lại trang.')
          : tr('Chuông thông báo trên thanh bên báo khi bạn được giao task hoặc được nhắc tên. Thông báo đến ngay, không cần tải lại trang.')],
      ],
    },
    {
      id: 'my',
      title: tr('Task của tôi và Dashboard'),
      items: [
        ['mytasks', tr('Task của tôi'), tr('Mọi task được giao cho bạn ở mọi project, chia theo Quá hạn, Hôm nay, 7 ngày tới…; nút Danh sách / Lịch để đổi cách xem, ô "Mọi kênh" để lọc theo kênh.')],
        ['dashboard', 'Dashboard', can(user, 'people.watch')
          ? tr('"Tổng quan" cho số liệu của các team bạn theo dõi: workload từng người, task hoàn thành 14 ngày, tiến độ project và kênh. Mỗi project cũng có dashboard riêng. Nút "Xuất Excel" tải số liệu đang xem về một file Excel, mỗi phần một sheet kèm biểu đồ như trên màn hình.')
          : tr('Mỗi project bạn tham gia có dashboard riêng: phần trăm hoàn thành, tiến độ từng requirement, workload thành viên, tiến độ theo trạng thái và kênh. Nút "Xuất Excel" tải số liệu đang xem về một file Excel, mỗi phần một sheet kèm biểu đồ như trên màn hình.')],
      ],
    },
    can(user, 'people.watch') && {
      id: 'watch',
      title: tr('Theo dõi công việc'),
      items: [
        ['watch', tr('Theo team hoặc theo người'), tr('Màn theo dõi liệt kê task của các team bạn phụ trách; chọn một team hoặc một người để xem riêng, đổi sang Lịch để xem theo hạn chót.')],
      ],
    },
    can(user, 'projects.create') && {
      id: 'create',
      title: tr('Tạo và quản lý project'),
      items: [
        ['create', tr('Tạo project'), tr('Bấm "+" cạnh "Projects theo team" ở thanh bên: đặt tên, chọn team phụ trách (không chọn = chung toàn phòng), có thể thêm cả team vào project.')],
        ['model', tr('Sau khi tạo'), tr('Tạo requirement đầu tiên trong tab Requirements, rồi thêm task. Đổi tên, đổi team, thêm / bỏ thành viên ở đầu trang project.')],
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
