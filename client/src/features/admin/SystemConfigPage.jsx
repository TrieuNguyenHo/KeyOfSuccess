import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { loadAvatars } from '../../avatars.js';
import { Brand } from '../../components/Brand.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { DialogHost } from '../../components/Dialog.jsx';
import { useCloseDetailsOutside } from '../../components/hooks.js';
import { LanguageSwitch, ThemeSwitch } from '../../components/Preferences.jsx';
import InviteUserCard from './InviteUserCard.jsx';
import PermissionsCard from './PermissionsCard.jsx';
import RolesCard from './RolesCard.jsx';
import UsersCard from './UsersCard.jsx';
import { ErrorBanner } from '../../components/Controls.jsx';
import { tr } from '../../i18n.js';

// The whole app for root accounts (ROOT_EMAILS): they are not part of the company and only configure the system:
// what each role may do, who holds which role (the Director role included), account status and teams. No projects,
// tasks or dashboards.
export default function SystemConfigPage({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');
  // Bumped when root changes a role: the cards that read the roles (permissions, invitations, users) read them again.
  const [rolesVersion, setRolesVersion] = useState(0);
  useCloseDetailsOutside();

  const load = useCallback(async () => {
    const [u, t] = await Promise.all([api('/admin/users'), api('/teams')]);
    setUsers(u);
    setTeams(t);
  }, []);

  useEffect(() => {
    loadAvatars();
    load().catch((e) => setError(e.message));
  }, [load]);

  const updateUser = (u, patch) => change(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: patch }));
  const revokeInvite = (u) => change(() => api(`/admin/users/${u.id}`, { method: 'DELETE' }));
  async function change(request) {
    try {
      await request();
      setError('');
    } catch (e) {
      setError(e.message);
    }
    await load().catch(() => {});
  }

  return (
    <CurrentUser.Provider value={user}>
      <div className="app">
        <main className="main">
          <div className="main-content">
            <div className="project">
              <header className="project-header">
                <Brand />
                <h1>{tr('Cấu hình hệ thống')}</h1>
                <div className="project-header-actions">
                  <ThemeSwitch className="tabs" />
                  <LanguageSwitch className="tabs" />
                  <span className="muted small">{user.email} · Root</span>
                  <button className="link-btn" onClick={onLogout}>
                    {tr('Đăng xuất')}
                  </button>
                </div>
              </header>

              <ErrorBanner error={error} onClose={() => setError('')} />

              <div className="list admin">
                <section className="admin-card">
                  <p className="muted card-sub">
                    {tr(
                      'Tài khoản root không thuộc công ty: chỉ cấu hình hệ thống, không xem được project, task hay thông tin cá nhân của ai. Ở đây bạn thêm / sửa vai trò, đặt quyền cho từng vai trò, mời người dùng mới, gán vai trò (kể cả Director), duyệt / khoá tài khoản và xếp team.'
                    )}
                  </p>
                </section>
                <RolesCard
                  onChanged={() => {
                    setRolesVersion((v) => v + 1);
                    load().catch(() => {});
                  }}
                />
                <PermissionsCard key={`p${rolesVersion}`} />
                <InviteUserCard key={`i${rolesVersion}`} user={user} teams={teams} onInvited={() => load().catch(() => {})} />
                <UsersCard
                  key={`u${rolesVersion}`}
                  user={user}
                  users={users}
                  teams={teams}
                  updateUser={updateUser}
                  revokeInvite={revokeInvite}
                  onReload={() => load().catch((e) => setError(e.message))}
                />
              </div>
            </div>
          </div>
        </main>
        <DialogHost />
      </div>
    </CurrentUser.Provider>
  );
}
