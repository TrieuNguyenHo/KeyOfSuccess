import { useState } from 'react';
import { api } from '../../api.js';
import { askConfirm, askText } from '../../components/Dialog.jsx';
import { useFetched } from '../../components/hooks.js';
import { tr } from '../../i18n.js';

// Roles root adds, renames and deletes (v27), with each role's level and team rule. A new role starts as a copy of
// another (its permissions and team rule). Built-in roles are renamed and get another team rule, but keep their level
// and stay. onChanged lets the other cards (permissions, users, invitations) read the roles again.
export default function RolesCard({ onChanged }) {
  const initial = useFetched('/roles');
  const [roles, setRoles] = useState(null);
  const [name, setName] = useState('');
  const [level, setLevel] = useState('1');
  const [copyFrom, setCopyFrom] = useState('member');
  const [error, setError] = useState('');
  const shown = roles ?? initial;

  // Every role route answers with the full list of roles.
  async function save(request) {
    try {
      setRoles(await request());
      setError('');
      onChanged();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }
  const update = (role, body) => save(() => api(`/admin/roles/${role.key}`, { method: 'PATCH', body }));

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const body = { name: name.trim(), level: Number(level), copy_from: copyFrom };
    if (await save(() => api('/admin/roles', { method: 'POST', body }))) setName('');
  }

  async function rename(role) {
    const next = await askText({ title: tr('Đổi tên vai trò'), label: tr('Tên vai trò'), initial: role.name });
    if (next) update(role, { name: next });
  }

  async function remove(role) {
    const ok = await askConfirm({
      title: tr('Xoá vai trò "{name}"?', { name: role.name }),
      message: tr('Quyền của vai trò này cũng bị xoá.'),
      confirmLabel: tr('Xoá vai trò'),
      danger: true,
    });
    if (ok) save(() => api(`/admin/roles/${role.key}`, { method: 'DELETE' }));
  }

  return (
    <section className="admin-card">
      <div className="section-header">
        <h2>{tr('Vai trò')}</h2>
      </div>
      <p className="muted card-sub">
        {tr(
          'Cấp bậc: không ai đổi tài khoản, cấp vai trò hay xem hồ sơ của vai trò cao hơn mình. Vai trò mới sao chép quyền và số team của vai trò được chọn; sửa quyền ở bảng bên dưới. 4 vai trò có sẵn chỉ đổi tên và số team.'
        )}
      </p>
      {error && <div className="error">{error}</div>}

      <div className="role-row admin-head">
        <span>{tr('Vai trò')}</span>
        <span>{tr('Cấp bậc')}</span>
        <span>{tr('Ít nhất')}</span>
        <span>{tr('Nhiều nhất')}</span>
        <span>{tr('Người giữ')}</span>
        <span />
      </div>
      {shown.map((r) => (
        <div key={r.key} className="role-row">
          <span className="cell">
            <span className="ellipsis">{r.name}</span>
            {r.builtin ? <span className="tag">{tr('Có sẵn')}</span> : null}
            <button className="icon-btn" onClick={() => rename(r)} title={tr('Đổi tên vai trò')}>
              ✎
            </button>
          </span>
          {r.builtin ? (
            <span>{r.level}</span>
          ) : (
            <LevelInput key={r.level} value={r.level} label={tr('Cấp bậc của {name}', { name: r.name })} onSave={(v) => update(r, { level: v })} />
          )}
          <select
            value={r.min_teams}
            aria-label={tr('Số team ít nhất của {name}', { name: r.name })}
            onChange={(e) => update(r, { min_teams: Number(e.target.value) })}
          >
            <option value={0}>{tr('Không bắt buộc')}</option>
            <option value={1}>{tr('1 team')}</option>
          </select>
          <select
            value={r.max_teams ?? ''}
            aria-label={tr('Số team nhiều nhất của {name}', { name: r.name })}
            onChange={(e) => update(r, { max_teams: e.target.value ? 1 : null })}
          >
            <option value="">{tr('Không giới hạn')}</option>
            <option value={1}>{tr('1 team')}</option>
          </select>
          <span className="muted">{r.user_count}</span>
          <span className="admin-actions">
            {!r.builtin && (
              <button
                className="link-btn danger"
                onClick={() => remove(r)}
                disabled={r.user_count > 0}
                title={r.user_count > 0 ? tr('Đổi vai trò của những người đang giữ trước khi xoá') : tr('Xoá vai trò')}
              >
                {tr('Xoá')}
              </button>
            )}
          </span>
        </div>
      ))}

      <h3 className="role-add-title">{tr('Thêm vai trò')}</h3>
      <form className="invite-form" onSubmit={add} noValidate>
        <input placeholder={tr('Tên vai trò')} aria-label={tr('Tên vai trò')} value={name} onChange={(e) => setName(e.target.value)} />
        <label className="role-level">
          {tr('Cấp bậc')}
          <input type="number" min={1} max={99} value={level} onChange={(e) => setLevel(e.target.value)} />
        </label>
        <select aria-label={tr('Sao chép quyền từ')} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
          {shown.map((r) => (
            <option key={r.key} value={r.key}>
              {tr('Sao chép quyền từ {name}', { name: r.name })}
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={!name.trim()}>
          {tr('Thêm')}
        </button>
      </form>
    </section>
  );
}

// A custom role's level, saved when the field is left (or on Enter) if it changed.
function LevelInput({ value, label, onSave }) {
  const [draft, setDraft] = useState(String(value));
  // A refused level (out of range) goes back to the saved one; the card shows why.
  const commit = async () => Number(draft) !== value && !(await onSave(Number(draft))) && setDraft(String(value));
  return (
    <input
      className="role-level-input"
      type="number"
      min={1}
      max={99}
      value={draft}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
