import { useCallback, useEffect, useRef, useState } from 'react';
import { api, onLiveChange, publishChatChange, publishFeedbackChange, publishLiveChange, subscribeEvents } from '../../api.js';
import { loadAvatars } from '../../avatars.js';
import { ding, setTitleCount, showNotification } from '../../chatAlerts.js';
import { chatTitle, previewOf } from '../chat/ChatParts.jsx';
import { formatRoute, parseRoute } from '../../route.js';
import { PROJECT_COLORS, can } from '../../utils.js';
import AdminPage from '../admin/AdminPage.jsx';
import ChatPage from '../chat/ChatPage.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { useCloseDetailsOutside } from '../../components/hooks.js';
import CreateProjectModal from '../projects/CreateProjectModal.jsx';
import DashboardPage from '../dashboard/DashboardPage.jsx';
import ReportPage from '../dashboard/ReportPage.jsx';
import { DialogHost } from '../../components/Dialog.jsx';
import { Brand } from '../../components/Brand.jsx';
import MyTeamsPage from '../admin/MyTeamsPage.jsx';
import ProjectDashboardPage from '../dashboard/ProjectDashboardPage.jsx';
import FeedbackPage from '../feedback/FeedbackPage.jsx';
import GuidePage from '../guide/GuidePage.jsx';
import ProfilePage from '../profile/ProfilePage.jsx';
import ProjectView from '../projects/ProjectView.jsx';
import RequirementPage from '../requirements/RequirementPage.jsx';
import Sidebar from './Sidebar.jsx';
import TaskDetail from '../tasks/TaskDetail.jsx';
import TasksPage from '../tasks/TasksPage.jsx';
import { tr } from '../../i18n.js';

const NOTIFICATION_POLL_MS = 30000;
// Changes often come in bursts (dragging a card, several quick edits); the page reloads once after them.
const LIVE_RELOAD_DELAY_MS = 300;

// onUserChange(user): the signed-in user edited their profile.
export default function Workspace({ user, onLogout, onUserChange }) {
  const [projects, setProjects] = useState([]);
  // { type: 'my' | 'admin' | 'myteams' }, { type: 'dashboard', projectId? }, { type: 'team', scope? }, { type: 'project', id, tab?, requirementId? },
  // or the detail pages { type: 'task', id } and { type: 'requirement', projectId, id }.
  // The screen starts from the URL, so a reload stays where the user was (see route.js).
  const [initialRoute] = useState(() => parseRoute(window.location.hash, user));
  const [view, setView] = useState(initialRoute.view);
  // What the current project or task page shows (tab and filters, scope), kept only for the URL.
  const [shown, setShown] = useState({});
  // Bumped by the sidebar, so picking the screen already shown starts it afresh (and its URL with it).
  const [navCount, setNavCount] = useState(0);
  // Views the detail pages were opened from, so "Quay lại" returns there. The sidebar clears it.
  const [history, setHistory] = useState([]);
  const [openTaskId, setOpenTaskId] = useState(initialRoute.panelTaskId);
  // Bumped whenever the task panel changes something, so the page behind it reloads.
  const [refreshKey, setRefreshKey] = useState(0);
  const [notifications, setNotifications] = useState({ items: [], unread: 0, unreadFeedback: 0, unreadChat: 0, pendingUsers: 0 });
  const [creatingProject, setCreatingProject] = useState(false);
  // On narrow screens the sidebar is a drawer behind the ☰ button; any navigation closes it.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => setNavOpen(false), [view, openTaskId]);

  useCloseDetailsOutside();

  const loadProjects = useCallback(async () => {
    const list = await api('/projects');
    setProjects(list);
    return list;
  }, []);

  // Resolves with the counts (null on failure), so a chat event can compare them with the previous ones.
  const loadNotifications = useCallback(
    () =>
      api('/notifications')
        .then((data) => {
          setNotifications(data);
          return data;
        })
        .catch(() => null),
    []
  );

  // For chat alerts from the event stream: the screen shown now, and the Messages count last seen.
  const viewRef = useRef(view);
  viewRef.current = view;
  const unreadChatRef = useRef(null);
  // The count of things waiting (bell + messages) in the tab title, so it shows from another tab.
  useEffect(() => {
    setTitleCount(notifications.unread + notifications.unreadChat);
  }, [notifications.unread, notifications.unreadChat]);
  useEffect(() => () => setTitleCount(0), []);

  useEffect(() => {
    loadProjects();
    loadNotifications().then((data) => (unreadChatRef.current = data?.unreadChat ?? 0));
    loadAvatars();

    // A new message counted on the Messages menu (muted conversations count only mentions): a sound, unless it is the
    // conversation on screen; a desktop notification while the tab is in the background.
    async function alertChat(data, change) {
      const before = unreadChatRef.current;
      unreadChatRef.current = data.unreadChat;
      if (before === null || data.unreadChat <= before) return;
      const shown = viewRef.current;
      if (!document.hidden && shown.type === 'chat' && shown.id === change.conversation_id) return;
      const chat = await api(`/chats/${change.conversation_id}`).catch(() => null);
      if (!chat?.last_message || chat.last_message.user_id === user.id) return;
      ding();
      if (document.hidden) {
        showNotification({
          title: chatTitle(chat),
          body: previewOf(chat, user),
          tag: `chat-${chat.id}`,
          onClick: () => navigate({ type: 'chat', id: chat.id }),
        });
      }
    }
    // The server pushes an event the moment a notification is created; polling is only a fallback
    // for when the stream is down.
    const unsubscribe = subscribeEvents((name, data) => {
      if (name === 'notification') loadNotifications();
      if (name === 'change') publishLiveChange(data);
      if (name === 'feedback') publishFeedbackChange(data);
      if (name === 'chat') {
        // The Messages count, also after this user read a conversation in another tab.
        loadNotifications().then((counts) => counts && alertChat(counts, data));
        publishChatChange(data);
      }
    });
    const timer = setInterval(loadNotifications, NOTIFICATION_POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [loadProjects, loadNotifications]);

  // Someone else changed tasks, sections, requirements or comments: reload the page behind the panel
  // (Board, List, Requirements, Task của tôi…). The task panel and requirement feedback reload themselves.
  useEffect(() => {
    let timer;
    const unsubscribe = onLiveChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setRefreshKey((k) => k + 1), LIVE_RELOAD_DELAY_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // The last screen shown outside Feedback, recorded with a new feedback (where the user was when something went wrong).
  const lastPage = useRef(null);
  // Mirrors the screen into the URL (replacing, not adding, browser history entries).
  useEffect(() => {
    const hash = formatRoute(view, shown, openTaskId);
    if (view.type !== 'feedback') lastPage.current = hash;
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [view, shown, openTaskId]);

  // A link pasted into the address bar of an open tab.
  useEffect(() => {
    const onHashChange = () => {
      const route = parseRoute(window.location.hash, user);
      setHistory([]);
      setShown({});
      setNavCount((n) => n + 1); // the same project with another tab or filters must start afresh
      setView(route.view);
      setOpenTaskId(route.panelTaskId);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [user]);

  // body: { name, team_ids?, add_team } from CreateProjectModal.
  async function createProject(body) {
    const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    const project = await api('/projects', { method: 'POST', body: { ...body, color } });
    await loadProjects();
    setView({ type: 'project', id: project.id });
  }

  function navigate(v) {
    setOpenTaskId(null);
    setHistory([]);
    setShown({});
    setNavCount((n) => n + 1);
    setView(v);
  }

  // The current view with what its page shows now (tab, filters, scope), so coming back restores it.
  const currentView = () => ({
    ...view,
    ...(shown.tab && { tab: shown.tab, filters: shown.filters, group: shown.group }),
    ...(shown.scope && { scope: shown.scope }),
    ...(shown.layout && { layout: shown.layout }),
    ...(shown.channel !== undefined && { channel: shown.channel }),
  });

  // Opens a detail page; `from` replaces the current view in the history when it should come back differently.
  function openPage(v, from = currentView()) {
    setOpenTaskId(null);
    setHistory((h) => [...h, from]);
    setShown({});
    setView(v);
  }

  function goBack() {
    setOpenTaskId(null);
    setShown({});
    setView(history.at(-1) ?? { type: 'my' });
    setHistory((h) => h.slice(0, -1));
  }

  const openTaskPage = (id) => openPage({ type: 'task', id });
  const openRequirementPage = (projectId, id) => openPage({ type: 'requirement', projectId, id });
  const openProject = (id) => navigate({ type: 'project', id });
  // The chat of a project or team (kind 'project' | 'team'), created on first use.
  const openRoomChat = (kind, id) =>
    api(`/chats/${kind}/${id}`, { method: 'POST' })
      .then((chat) => navigate({ type: 'chat', id: chat.id }))
      .catch(() => {});
  const showOnBoard = (projectId, requirementId) => navigate({ type: 'project', id: projectId, tab: 'board', requirementId });

  async function openNotification(n) {
    if (!n.read_at) {
      await api('/notifications/read', { method: 'POST', body: { id: n.id } }).catch(() => {});
      loadNotifications();
    }
    if (n.type === 'due_digest') {
      navigate({ type: 'my' });
    } else if (n.type === 'weekly_report') {
      navigate({ type: 'report', week: n.excerpt });
    } else if (n.task_id) {
      setOpenTaskId(n.task_id);
    } else {
      // Mention in requirement feedback: open that requirement's page, where its comments are.
      navigate({ type: 'requirement', projectId: n.project_id, id: n.requirement_id });
    }
  }

  async function readAllNotifications() {
    await api('/notifications/read', { method: 'POST', body: {} }).catch(() => {});
    loadNotifications();
  }

  let content;
  if (view.type === 'task') {
    content = (
      <TaskDetail
        key={view.id}
        page
        taskId={view.id}
        onClose={goBack}
        onChanged={() => setRefreshKey((k) => k + 1)}
        onOpenTask={openTaskPage}
        onOpenProject={openProject}
        onOpenRequirement={openRequirementPage}
      />
    );
  } else if (view.type === 'requirement') {
    content = (
      <RequirementPage
        key={`${view.projectId}:${view.id}`}
        projectId={view.projectId}
        requirementId={view.id}
        refreshKey={refreshKey}
        onBack={goBack}
        onOpenTask={setOpenTaskId}
        onOpenProject={openProject}
        onShowOnBoard={(requirementId) => showOnBoard(view.projectId, requirementId)}
      />
    );
  } else if (view.type === 'project') {
    content = (
      <ProjectView
        // A new requirement target remounts the view so its initial tab and selection apply.
        key={`${navCount}:${view.id}:${view.requirementId ?? ''}`}
        projectId={view.id}
        initialTab={view.tab}
        initialRequirementId={view.requirementId}
        initialFilters={view.filters}
        initialGroup={view.group}
        user={user}
        refreshKey={refreshKey}
        onOpenTask={setOpenTaskId}
        onShownChange={setShown}
        // Back from the requirement page lands where the user was (the cards, or a Board filtered to it).
        onOpenRequirementPage={(id) => openPage({ type: 'requirement', projectId: view.id, id }, currentView())}
        onProjectChanged={loadProjects}
        onProjectDeleted={async () => {
          await loadProjects();
          navigate({ type: 'my' });
        }}
        onOpenChat={can(user, 'chat.use') ? () => openRoomChat('project', view.id) : undefined}
      />
    );
  } else if (view.type === 'profile') {
    content = <ProfilePage user={user} onUserChange={onUserChange} />;
  } else if (view.type === 'guide') {
    content = <GuidePage user={user} />;
  } else if (view.type === 'feedback') {
    content = (
      <FeedbackPage
        key={navCount}
        feedbackId={view.id}
        fromPage={lastPage.current}
        onOpen={(id) => setView({ type: 'feedback', ...(id && { id }) })}
      />
    );
  } else if (view.type === 'chat') {
    content = (
      <ChatPage
        key={navCount}
        conversationId={view.id}
        focusMessageId={view.messageId}
        onOpen={(id, messageId) => setView({ type: 'chat', ...(id && { id }), ...(messageId && { messageId }) })}
        onRead={loadNotifications}
        onOpenTask={setOpenTaskId}
      />
    );
  } else if (view.type === 'admin') {
    content = <AdminPage user={user} onChanged={loadNotifications} onUserChange={onUserChange} />;
  } else if (view.type === 'myteams') {
    content = <MyTeamsPage user={user} onChanged={loadNotifications} />;
  } else if (view.type === 'dashboard' && view.projectId) {
    content = (
      <ProjectDashboardPage
        key={view.projectId}
        projectId={view.projectId}
        onOpenProject={openProject}
        onOpenRequirement={openRequirementPage}
      />
    );
  } else if (view.type === 'report') {
    content = (
      <ReportPage
        view={view}
        onChange={(report) => navigate({ type: 'report', ...report })}
        onOpenPerson={(id) => navigate({ type: 'team', scope: `user:${id}` })}
      />
    );
  } else if (view.type === 'dashboard') {
    content = <DashboardPage user={user} onOpenPerson={(id) => navigate({ type: 'team', scope: `user:${id}` })} />;
  } else {
    content = (
      <TasksPage
        key={`${navCount}:${view.type}:${view.scope ?? ''}`}
        user={user}
        mode={view.type}
        initialScope={view.scope}
        initialLayout={view.layout}
        onScopeChange={(scope) => setShown((s) => ({ ...s, scope }))}
        onLayoutChange={(layout) => setShown((s) => ({ ...s, layout }))}
        initialChannel={view.channel}
        onChannelChange={(channel) => setShown((s) => ({ ...s, channel }))}
        refreshKey={refreshKey}
        onOpenTask={setOpenTaskId}
      />
    );
  }

  return (
    <CurrentUser.Provider value={user}>
    <div className="app">
      <Sidebar
        user={user}
        projects={projects}
        view={view}
        notifications={notifications}
        onNavigate={navigate}
        onNewProject={() => setCreatingProject(true)}
        onOpenNotification={openNotification}
        onReadAllNotifications={readAllNotifications}
        onLogout={onLogout}
        open={navOpen}
      />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <main className="main">
        <div className="mobile-bar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label={tr('Mở menu')} aria-expanded={navOpen}>
            ☰{notifications.unread + notifications.unreadFeedback + notifications.unreadChat + notifications.pendingUsers > 0 && <span className="menu-dot" aria-label={tr('Có thông báo mới')} />}
          </button>
          <Brand />
        </div>
        <div className="main-content">{content}</div>
        {openTaskId && (
          <TaskDetail
            key={openTaskId}
            taskId={openTaskId}
            onClose={() => setOpenTaskId(null)}
            onChanged={() => setRefreshKey((k) => k + 1)}
            onOpenPage={openTaskPage}
            onOpenTask={setOpenTaskId}
            onOpenProject={openProject}
            onOpenRequirement={openRequirementPage}
          />
        )}
      </main>
      {creatingProject && (
        <CreateProjectModal onCreate={createProject} onClose={() => setCreatingProject(false)} />
      )}
      <DialogHost />
    </div>
    </CurrentUser.Provider>
  );
}
