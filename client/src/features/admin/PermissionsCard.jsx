import { Fragment, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { askConfirm } from '../../components/Dialog.jsx';
import { tr } from '../../i18n.js';

// What each permission means, in the reader's language (the keys come from the server, lib/permissions.js).
const PERMISSION_TEXT = {
  get 'projects.view'() {
    return [tr('Xem hoạt động'), tr('Mở hoạt động mình không tham gia (xem và comment).')];
  },
  get 'projects.manage'() {
    return [tr('Quản lý hoạt động'), tr('Đổi tên, xoá, thêm / bỏ thành viên của hoạt động không do mình tạo.')];
  },
  get 'projects.create'() {
    return [tr('Tạo hoạt động'), ''];
  },
  get 'projects.change_teams'() {
    return [tr('Đổi team của hoạt động'), tr('"Team của mình": chỉ chọn trong team mình, ít nhất một team; các team khác của hoạt động giữ nguyên.')];
  },
  get 'tasks.admin'() {
    return [tr('Toàn quyền task'), tr('Tạo, sửa, giao, xoá task và quản lý trạng thái. Không có quyền này: chỉ tạo task cho mình và sửa task giao cho mình.')];
  },
  get 'requirements.manage'() {
    return [tr('Quản lý project'), tr('Tạo, sửa, xoá project (người quản lý hoạt động luôn làm được).')];
  },
  get 'people.watch'() {
    return [tr('Theo dõi công việc'), tr('Xem task của người khác, màn Theo dõi và Dashboard tổng.')];
  },
  get 'people.profiles'() {
    return [tr('Xem hồ sơ cá nhân'), tr('Ngày sinh, số điện thoại… của người khác (không bao giờ của vai trò cao hơn mình).')];
  },
  get 'users.manage'() {
    return [
      tr('Quản lý người dùng'),
      tr('Duyệt, khoá, đổi vai trò và team của người có vai trò không cao hơn mình; lời mời hoạt động ngay. "Team của mình": người trong team mình và người chưa có team, chỉ xếp vào team mình.'),
    ];
  },
  get 'teams.members'() {
    return [tr('Quản lý thành viên team'), tr('Thêm người chưa có team, duyệt người tự đăng ký, mời email (chờ duyệt), bỏ Member khỏi team.')];
  },
  get 'teams.manage'() {
    return [tr('Tạo / đổi tên / xoá team'), tr('"Team của mình": chỉ đổi tên team mình; tạo và xoá team cần "Toàn phòng".')];
  },
  get 'channels.manage'() {
    return [tr('Quản lý kênh'), tr('Thêm, đổi tên, đổi màu, xoá kênh; xem số task của mỗi kênh.')];
  },
  get 'comments.delete_any'() {
    return [tr('Xoá comment của người khác'), ''];
  },
  get 'notify.task_completed'() {
    return [tr('Nhận thông báo task hoàn thành'), tr('Khi một task được đánh dấu xong.')];
  },
  get 'chat.use'() {
    return [tr('Tin nhắn'), tr('Nhắn tin riêng với người khác cũng có quyền này.')];
  },
};
const scopeLabel = (scope, scopes) => {
  if (scope === 'none') return tr('Không');
  if (scope === 'team') return tr('Team của mình');
  return scopes.includes('team') ? tr('Toàn phòng') : tr('Có');
};

// The role × permission table root edits on the System configuration screen. A change applies to everyone holding
// the role at their next request (screens follow after they reload the app).
export default function PermissionsCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/permissions')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  async function save(request) {
    try {
      setData(await request());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  const setScope = (role, permission, scope) =>
    save(() => api('/admin/permissions', { method: 'PATCH', body: { role, permission, scope } }));
  async function reset(role) {
    const ok = await askConfirm({
      title: tr('Khôi phục quyền mặc định của {name}?', { name: role.name }),
      message: tr('Mọi thay đổi trên vai trò này sẽ bị bỏ.'),
      confirmLabel: tr('Khôi phục'),
    });
    if (ok) save(() => api('/admin/permissions/reset', { method: 'POST', body: { role: role.key } }));
  }

  return (
    <section className="admin-card">
      <div className="section-header">
        <h2>{tr('Quyền theo vai trò')}</h2>
      </div>
      <p className="muted card-sub">
        {tr('"Team của mình": chỉ với những gì thuộc team của người đó. Thay đổi có hiệu lực ngay ở server; màn hình của người dùng cập nhật khi họ tải lại app.')}
      </p>
      {error && <div className="error">{error}</div>}
      {data && (
        <div className="perm-table">
          <div className="perm-grid" style={{ '--roles': data.roles.length }}>
            <span className="perm-head">{tr('Quyền')}</span>
            {data.roles.map((r) => (
              <span key={r.key} className="perm-head">
                {r.name}
              </span>
            ))}
            {data.permissions.map((p) => {
              const [label, hint] = PERMISSION_TEXT[p.key] ?? [p.key, ''];
              return (
                <Fragment key={p.key}>
                  <span className="perm-label">
                    {label}
                    {hint && <span className="muted small">{hint}</span>}
                  </span>
                  {data.roles.map((r) => {
                    const scope = data.grants[r.key]?.[p.key] ?? 'none';
                    return (
                      <select
                        key={r.key}
                        className={scope === 'none' ? 'perm-none' : ''}
                        value={scope}
                        aria-label={`${label} · ${r.name}`}
                        onChange={(e) => setScope(r.key, p.key, e.target.value)}
                      >
                        {p.scopes.map((s) => (
                          <option key={s} value={s}>
                            {scopeLabel(s, p.scopes)}
                          </option>
                        ))}
                      </select>
                    );
                  })}
                </Fragment>
              );
            })}
            <span />
            {/* Only the built-in roles have defaults; a role root added started as a copy of another. */}
            {data.roles.map((r) =>
              r.builtin ? (
                <button key={r.key} className="link-btn" onClick={() => reset(r)}>
                  {tr('Khôi phục mặc định')}
                </button>
              ) : (
                <span key={r.key} />
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
