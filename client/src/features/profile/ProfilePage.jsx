import { useRef, useState } from 'react';
import { api, uploadFile } from '../../api.js';
import { setAvatarVersion } from '../../avatars.js';
import { tr } from '../../i18n.js';
import { GENDERS, ROLES, STATUSES, formatDate, todayStr } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { LanguageSwitch, ThemeSwitch } from '../../components/Preferences.jsx';

const FIELDS = ['name', 'birthday', 'gender', 'phone', 'job_title', 'bio'];
const BIO_MAX = 500;
const formOf = (user) => Object.fromEntries(FIELDS.map((f) => [f, user[f] ?? '']));
// created_at is a UTC "YYYY-MM-DD HH:MM:SS"; the day is enough.
const joined = (user) => (user.created_at ? formatDate(user.created_at.slice(0, 10)) : '—');

// Account facts nobody edits here (Managers set role, team and status in User management).
function AccountFacts({ user }) {
  return (
    <dl className="profile-grid">
      <dt>Email</dt>
      <dd>{user.email}</dd>
      <dt>{tr('Vai trò')}</dt>
      <dd>{ROLES[user.role]}</dd>
      <dt>Team</dt>
      <dd>{user.team_name ?? tr('Chưa có team')}</dd>
      <dt>{tr('Trạng thái')}</dt>
      <dd>{STATUSES[user.status]}</dd>
      <dt>{tr('Ngày tham gia')}</dt>
      <dd>{joined(user)}</dd>
    </dl>
  );
}

// The key facts of someone's profile, in the card ProfilePopover opens.
function ProfileSummary({ profile }) {
  const none = <span className="muted">{tr('Chưa có')}</span>;
  return (
    <>
      <div className="profile-pop-head">
        <Avatar name={profile.name} userId={profile.id} />
        <span className="user-info">
          <b className="ellipsis">{profile.name}</b>
          {profile.job_title && <span className="ellipsis">{profile.job_title}</span>}
          <span className="muted small ellipsis">
            {ROLES[profile.role]}
            {profile.team_name && ` · ${profile.team_name}`}
          </span>
        </span>
      </div>
      <dl className="profile-pop-facts">
        <dt>Email</dt>
        <dd>
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
        </dd>
        <dt>{tr('Số điện thoại')}</dt>
        <dd>{profile.phone ? <a href={`tel:${profile.phone.replace(/[^\d+]/g, '')}`}>{profile.phone}</a> : none}</dd>
        <dt>{tr('Ngày sinh')}</dt>
        <dd>{profile.birthday ? formatDate(profile.birthday) : none}</dd>
        <dt>{tr('Giới tính')}</dt>
        <dd>{profile.gender ? GENDERS[profile.gender] : none}</dd>
        <dt>{tr('Trạng thái')}</dt>
        <dd>{STATUSES[profile.status]}</dd>
        <dt>{tr('Ngày tham gia')}</dt>
        <dd>{joined(profile)}</dd>
      </dl>
      {profile.bio && <p className="profile-pop-bio">{profile.bio}</p>}
    </>
  );
}

const CARD_ROOM = 340; // px the card needs below the avatar

// Someone's avatar that opens a card with the key facts of their profile, for the people allowed to read it
// (Managers, and the Leaders of the user's teams; the server checks). Loaded on each opening, so it is current.
// A <details>, so it opens by tap on iPad and closes on a click outside or Escape (see Workspace).
export function ProfilePopover({ user }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  // Opens upwards when the avatar sits too low on the screen for the card to fit below it.
  const [up, setUp] = useState(false);
  function load(e) {
    if (!e.currentTarget.open) return;
    const { top, bottom } = e.currentTarget.getBoundingClientRect();
    const below = window.innerHeight - bottom;
    setUp(below < CARD_ROOM && top > below);
    setError('');
    api(`/users/${user.id}/profile`)
      .then(setProfile)
      .catch((err) => setError(err.message));
  }
  return (
    <details className={`profile-pop ${up ? 'up' : ''}`} onToggle={load}>
      <summary title={tr('Xem hồ sơ của {name}', { name: user.name })} aria-label={tr('Xem hồ sơ của {name}', { name: user.name })}>
        <Avatar name={user.name} userId={user.id} small />
      </summary>
      <div className="profile-pop-card" role="dialog" aria-label={tr('Hồ sơ của {name}', { name: user.name })}>
        {error ? <div className="error">{error}</div> : profile ? <ProfileSummary profile={profile} /> : <p className="muted">{tr('Đang tải…')}</p>}
      </div>
    </details>
  );
}

const AVATAR_SIZE = 256;

// Center-crops the chosen picture to a square and shrinks it to 256 px, so every picture is light and fills its
// circle. WebP where the browser can write it, else PNG.
async function squarePicture(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_SIZE;
  canvas
    .getContext('2d')
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88));
  return new File([blob], blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.png', { type: blob.type });
}

// The picture with its upload / remove buttons, at the top of the Profile.
function AvatarEditor({ user, onUserChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function done(request) {
    setBusy(true);
    setError('');
    try {
      const updated = await request();
      setAvatarVersion(updated.id, updated.avatar);
      onUserChange(updated);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function choose(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let picture;
    try {
      picture = await squarePicture(file);
    } catch {
      setError(tr('Không đọc được ảnh này. Hãy chọn ảnh PNG, JPG hoặc WebP.'));
      return;
    }
    done(() => uploadFile('/me/avatar', picture));
  }

  return (
    <span className="avatar-actions">
      <button type="button" className="btn small" disabled={busy} onClick={() => input.current.click()}>
        {busy ? tr('Đang lưu…') : user.avatar ? tr('Đổi ảnh đại diện') : tr('Tải ảnh đại diện lên')}
      </button>
      {user.avatar && (
        <button type="button" className="link-btn danger" disabled={busy} onClick={() => done(() => api('/me/avatar', { method: 'DELETE' }))}>
          {tr('Xoá ảnh')}
        </button>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choose} />
      {error && <span className="error">{error}</span>}
    </span>
  );
}

// The signed-in user's own profile: account facts (read only), the personal details they edit, and the
// appearance and language choices (the same switches as at the foot of the sidebar).
export default function ProfilePage({ user, onUserChange }) {
  const [form, setForm] = useState(() => formOf(user));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dirty = FIELDS.some((f) => form[f] !== (user[f] ?? ''));
  const set = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    setMessage('');
  };

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await api('/me', { method: 'PATCH', body: form });
      onUserChange(updated);
      setForm(formOf(updated));
      setMessage(tr('Đã lưu hồ sơ.'));
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  return (
    <div className="project">
      <header className="project-header">
        <h1>{tr('Hồ sơ của tôi')}</h1>
      </header>

      <div className="list profile">
        <section className="admin-card profile-head">
          <Avatar name={user.name} userId={user.id} />
          <span className="user-info">
            <b className="ellipsis">{user.name}</b>
            <span className="muted ellipsis">{[user.job_title, user.email].filter(Boolean).join(' · ')}</span>
            <AvatarEditor user={user} onUserChange={onUserChange} />
          </span>
        </section>

        <section className="admin-card">
          <h2>{tr('Tài khoản')}</h2>
          <p className="muted card-sub">{tr('Vai trò, team và trạng thái do Manager quản lý.')}</p>
          <AccountFacts user={user} />
        </section>

        <form className="admin-card" onSubmit={save}>
          <h2>{tr('Thông tin cá nhân')}</h2>
          <p className="muted card-sub">{tr('Chỉ bạn và Manager xem được thông tin cá nhân. Đồng nghiệp chỉ thấy tên hiển thị.')}</p>
          <div className="profile-grid profile-form">
            <label htmlFor="profile-name">{tr('Tên hiển thị')}</label>
            <input id="profile-name" value={form.name} onChange={set('name')} required maxLength={80} />

            <label htmlFor="profile-birthday">{tr('Ngày sinh')}</label>
            <input id="profile-birthday" type="date" value={form.birthday} max={todayStr()} min="1900-01-01" onChange={set('birthday')} />

            <label htmlFor="profile-gender">{tr('Giới tính')}</label>
            <select id="profile-gender" value={form.gender} onChange={set('gender')}>
              <option value="">{tr('Chưa chọn')}</option>
              {Object.keys(GENDERS).map((value) => (
                <option key={value} value={value}>
                  {GENDERS[value]}
                </option>
              ))}
            </select>

            <label htmlFor="profile-phone">{tr('Số điện thoại')}</label>
            <input id="profile-phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="0912 345 678" maxLength={20} />

            <label htmlFor="profile-title">{tr('Chức danh')}</label>
            <input
              id="profile-title"
              value={form.job_title}
              onChange={set('job_title')}
              placeholder={tr('Ví dụ: Content Executive')}
              maxLength={80}
            />

            <label htmlFor="profile-bio">{tr('Giới thiệu')}</label>
            <span className="profile-bio-field">
              <textarea
                id="profile-bio"
                value={form.bio}
                onChange={set('bio')}
                placeholder={tr('Vài dòng về bạn và việc bạn phụ trách…')}
                maxLength={BIO_MAX}
                rows={4}
              />
              <span className="muted small">
                {form.bio.length}/{BIO_MAX}
              </span>
            </span>
          </div>

          {error && <div className="error">{error}</div>}
          <div className="profile-actions">
            {message && <span className="muted">{message}</span>}
            <span className="grow" />
            <button type="button" className="btn" disabled={!dirty || saving} onClick={() => setForm(formOf(user))}>
              {tr('Huỷ thay đổi')}
            </button>
            <button className="btn primary" disabled={!dirty || saving || !form.name.trim()}>
              {saving ? tr('Đang lưu…') : tr('Lưu')}
            </button>
          </div>
        </form>

        <section className="admin-card">
          <h2>{tr('Giao diện và ngôn ngữ')}</h2>
          <div className="profile-grid">
            <span className="profile-label">{tr('Giao diện')}</span>
            <ThemeSwitch className="tabs" />
            <span className="profile-label">{tr('Ngôn ngữ')}</span>
            <LanguageSwitch className="tabs" />
          </div>
          <p className="muted small">
            {tr('Ngôn ngữ được lưu theo tài khoản, áp dụng trên mọi máy. Giao diện Sáng / Tối được nhớ trên từng máy.')}
          </p>
        </section>
      </div>
    </div>
  );
}
