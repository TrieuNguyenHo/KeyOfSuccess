import { useEffect, useState } from 'react';
import { can, canAdminister, myTeamsLabel, roleLabel, watchesAll } from '../../utils.js';
import NotificationBell from './NotificationBell.jsx';
import { Avatar } from '../../components/Avatar.jsx';
import { Brand } from '../../components/Brand.jsx';
import { LanguageSwitch, ThemeSwitch } from '../../components/Preferences.jsx';
import { tr } from '../../i18n.js';

// Layout and fly-out behaviour follow component_styles/side_bar: a 52px icon rail, uppercase labels,
// and a sub-menu that slides in over the sidebar (leaving the rail visible) on hover, click or focus.

const ICON_PATHS = {
  tasks: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  dashboard: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  team: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 19v-1a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75',
  admin: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  guide: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  feedback: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 9h8M8 13h5',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
};

function Icon({ name }) {
  return (
    <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function NavItem({ active, onClick, icon, badge, children }) {
  return (
    <li>
      <button className={`main-button ${active ? 'active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
        <Icon name={icon} />
        <span className="ellipsis grow">{children}</span>
        {badge > 0 && <span className="badge inline">{badge}</span>}
      </button>
    </li>
  );
}

// The same for every role (decided 2026-10-06): one "Team <name>" group per team of the user, shown even
// when empty; a project shared by several of the user's teams shows under each of them. Projects of other
// teams only go to "Project khác", department-wide ones to "Chung toàn phòng", so no project the user can
// open is lost.
function groupByTeam(projects, user) {
  const own = [...user.teams].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const groups = own.map((t) => ({ key: t.id, label: `Team ${t.name}`, projects: [] }));
  const other = { key: 'other', label: tr('Project khác'), projects: [] };
  const wide = { key: 'none', label: tr('Chung toàn phòng'), projects: [] };
  for (const p of projects) {
    const homes = groups.filter((g) => p.teams.some((t) => t.id === g.key));
    if (homes.length) homes.forEach((g) => g.projects.push(p));
    else (p.teams.length ? other : wide).projects.push(p);
  }
  return [...groups, ...[other, wide].filter((g) => g.projects.length)];
}

// A fly-out is as tall as its content and centred on its rail item, kept inside the sidebar (8px margin). It is
// positioned against .sidebar (so the scrolling project list never clips it), hence the measuring here.
const FLYOUT_MARGIN = 8;
function placeFlyout(item) {
  const flyout = item.querySelector(':scope > .flyout');
  const sidebar = item.closest('.sidebar');
  if (!flyout || !sidebar) return;
  const bounds = sidebar.getBoundingClientRect();
  const anchor = item.getBoundingClientRect();
  const height = Math.min(flyout.scrollHeight, bounds.height - 2 * FLYOUT_MARGIN);
  const centred = anchor.top - bounds.top + anchor.height / 2 - height / 2;
  const top = Math.max(FLYOUT_MARGIN, Math.min(centred, bounds.height - height - FLYOUT_MARGIN));
  flyout.style.top = `${top}px`;
}

export default function Sidebar({
  user,
  projects,
  view,
  notifications,
  onNavigate,
  onNewProject,
  onOpenNotification,
  onReadAllNotifications,
  onLogout,
  open = false,
}) {
  // A fly-out pinned open by click or keyboard; hover opens one through CSS alone.
  const [openKey, setOpenKey] = useState(null);
  // A fly-out closed by its ✕ or by picking a link stays shut while the pointer is still over it
  // (hover would reopen it at once; on iPad a tap leaves :hover stuck), until the pointer leaves.
  const [dismissedKey, setDismissedKey] = useState(null);
  const menuGroups = groupByTeam(projects, user);

  useEffect(() => {
    if (openKey == null) return;
    const onKey = (e) => e.key === 'Escape' && setOpenKey(null);
    // A click outside the pinned fly-out (and its rail item) closes it.
    const onPointerDown = (e) => !e.target.closest('.has-flyout.open') && setOpenKey(null);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openKey]);

  const close = (key) => {
    setOpenKey(null);
    setDismissedKey(key);
  };
  const go = (target, key = null) => {
    close(key);
    onNavigate(target);
  };
  const flyoutProps = (key) => ({
    className: `has-flyout ${openKey === key ? 'open' : ''} ${dismissedKey === key ? 'dismissed' : ''}`,
    onMouseLeave: () => dismissedKey === key && setDismissedKey(null),
    // Placed before it shows: by pointer (hover, or a tap on iPad) or by keyboard focus.
    onPointerEnter: (e) => placeFlyout(e.currentTarget),
    onFocus: (e) => placeFlyout(e.currentTarget),
  });
  const toggle = (key) => {
    setDismissedKey(null);
    setOpenKey(openKey === key ? null : key);
  };
  const activeProjectId = view.type === 'project' ? view.id : view.type === 'requirement' ? view.projectId : null;

  return (
    // `open`: shown as a drawer on narrow screens (iPad portrait), see .sidebar in styles.css.
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-top">
        <Brand />
        <NotificationBell data={notifications} onOpen={onOpenNotification} onReadAll={onReadAllNotifications} />
      </div>

      <ul className="main-buttons">
        <NavItem active={view.type === 'my'} onClick={() => go({ type: 'my' })} icon="tasks">
          {tr('Task của tôi')}
        </NavItem>
        {(can(user, 'people.watch') || projects.length > 0) && (
          // Sub-menu: the department / team overview (not for Members), then one dashboard per project.
          <li {...flyoutProps('dashboard')}>
            <button
              className={`main-button ${view.type === 'dashboard' ? 'active' : ''}`}
              aria-expanded={openKey === 'dashboard'}
              onClick={() => toggle('dashboard')}
            >
              <Icon name="dashboard" />
              <span className="ellipsis grow">Dashboard</span>
            </button>
            <div className="flyout" role="group" aria-label="Dashboard">
              <div className="flyout-head">
                <span className="ellipsis grow">Dashboard</span>
                <button className="icon-btn light" onClick={() => close('dashboard')} aria-label={tr('Đóng')}>
                  ✕
                </button>
              </div>
              <ul>
                {can(user, 'people.watch') && (
                  <li>
                    <button
                      className={`flyout-link ${view.type === 'dashboard' && !view.projectId ? 'active' : ''}`}
                      onClick={() => go({ type: 'dashboard' }, 'dashboard')}
                    >
                      <span className="ellipsis grow">{watchesAll(user) ? tr('Tổng quan phòng') : tr('Tổng quan {p0}', { p0: myTeamsLabel(user) })}</span>
                    </button>
                  </li>
                )}
                {projects.map((p) => {
                  const active = view.type === 'dashboard' && view.projectId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        className={`flyout-link ${active ? 'active' : ''}`}
                        onClick={() => go({ type: 'dashboard', projectId: p.id }, 'dashboard')}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="dot" style={{ background: p.color }} />
                        <span className="ellipsis grow">{p.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        )}
        {can(user, 'people.watch') && (
          <NavItem active={view.type === 'team'} onClick={() => go({ type: 'team' })} icon="team">
            {watchesAll(user) ? tr('Theo dõi công việc') : myTeamsLabel(user)}
          </NavItem>
        )}
        {can(user, 'teams.members') && !can(user, 'users.manage') && (
          <NavItem
            active={view.type === 'myteams'}
            onClick={() => go({ type: 'myteams' })}
            icon="admin"
            badge={notifications.pendingUsers}
          >
            {tr('Quản lý team')}
          </NavItem>
        )}
        {canAdminister(user) && (
          <NavItem
            active={view.type === 'admin'}
            onClick={() => go({ type: 'admin' })}
            icon="admin"
            badge={can(user, 'users.manage') ? notifications.pendingUsers : 0}
          >
            {tr('Quản trị')}
          </NavItem>
        )}
      </ul>

      <div className="sidebar-title">
        <span>{tr('Projects theo team')}</span>
        {can(user, 'projects.create') && (
          <button className="icon-btn light" onClick={onNewProject} title={tr('Tạo project')} aria-label={tr('Tạo project')}>
            +
          </button>
        )}
      </div>

      <ul className="main-buttons project-groups">
        {projects.length === 0 && (
          <li className="sidebar-empty">
            {can(user, 'projects.create') ? tr('Chưa có project nào. Bấm + để tạo.') : tr('Bạn chưa tham gia project nào.')}
          </li>
        )}
        {projects.length > 0 &&
          menuGroups.map((group) => {
            const key = String(group.key);
            const open = openKey === key;
            const holdsActive = group.projects.some((p) => p.id === activeProjectId);
            const { label } = group;
            return (
              <li key={key} {...flyoutProps(key)}>
                <button
                  className={`main-button ${holdsActive ? 'active' : ''}`}
                  aria-expanded={open}
                  onClick={() => toggle(key)}
                >
                  <Icon name="folder" />
                  <span className="ellipsis grow">{label}</span>
                  <span className="group-count">{group.projects.length}</span>
                </button>
                <div className="flyout" role="group" aria-label={label}>
                  <div className="flyout-head">
                    <span className="ellipsis grow">{label}</span>
                    <button className="icon-btn light" onClick={() => close(key)} aria-label={tr('Đóng')}>
                      ✕
                    </button>
                  </div>
                  <ul>
                    {group.projects.length === 0 && <li className="sidebar-empty">{tr('Team chưa có project nào.')}</li>}
                    {group.projects.map((p) => (
                      <li key={p.id}>
                        <button
                          className={`flyout-link ${p.id === activeProjectId ? 'active' : ''}`}
                          onClick={() => go({ type: 'project', id: p.id }, key)}
                          aria-current={p.id === activeProjectId ? 'page' : undefined}
                        >
                          <span className="dot" style={{ background: p.color }} />
                          <span className="ellipsis grow">{p.name}</span>
                          {p.teams.length > 1 && (
                            <span className="shared-mark" title={p.teams.map((t) => `Team ${t.name}`).join(', ')}>
                              {tr('{count} team', { count: p.teams.length })}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
      </ul>

      {/* The guide sits at the foot of the sidebar, just above the switches (decided 2026-10-07), with Feedback (v31). */}
      <ul className="main-buttons sidebar-guide">
        <NavItem active={view.type === 'guide'} onClick={() => go({ type: 'guide' })} icon="guide">
          {tr('Hướng dẫn')}
        </NavItem>
        {/* Updates on the user's feedback count here, not in the bell (decided 2026-10-08). */}
        <NavItem
          active={view.type === 'feedback'}
          onClick={() => go({ type: 'feedback' })}
          icon="feedback"
          badge={notifications.unreadFeedback}
        >
          Feedback
        </NavItem>
      </ul>
      <div className="sidebar-switches">
        <ThemeSwitch />
        <LanguageSwitch />
      </div>
      <div className="sidebar-footer">
        {/* The user's own name opens their Profile. */}
        <button
          className={`profile-link ${view.type === 'profile' ? 'active' : ''}`}
          onClick={() => go({ type: 'profile' })}
          title={tr('Hồ sơ của tôi')}
          aria-current={view.type === 'profile' ? 'page' : undefined}
        >
          <Avatar name={user.name} userId={user.id} />
          <span className="grow user-info">
            <span className="ellipsis">{user.name}</span>
            <span className="role-line ellipsis">
              {roleLabel(user)}
              {user.team_name && ` · ${user.team_name}`}
            </span>
          </span>
        </button>
        <button className="link-btn light" onClick={onLogout}>
          {tr('Đăng xuất')}
        </button>
      </div>
    </aside>
  );
}
