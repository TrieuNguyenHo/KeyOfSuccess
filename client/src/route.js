// The current screen lives in the URL hash, so a reload (F5) stays on it and a link can be sent to a colleague:
//   #/my  #/dashboard  #/dashboard/3  #/team  #/team/user:5  #/admin  #/myteams  #/profile  #/guide
//   #/report (this week)  #/report/week/2026-10-05  #/report/month/2026-10  #/report/range/2026-09-01/2026-09-20
//   #/report/2026-10-05 (the weekly report kept for the week starting that Monday)
//   #/feedback  #/feedback/12 (the user's feedback 12)  #/chat  #/chat/4 (conversation 4)  #/chat/4?message=9 (at message 9)
//   #/activity/3/board  #/activity/3/list  #/activity/3/calendar  #/activity/3/projects/7 (requirement 7 selected)
//   #/activity/3/timeline?group=status (Timeline rows grouped by status or assignee; by requirement without it)
//   #/task/12  #/activity/3/project/7 (project 3, requirement 7)
// On screen a project is called "Hoạt động" (activity) and a requirement "Project" since 2026-10-10, and the URLs say
// so; the code keeps project / requirement. Older links (#/project/3/requirements/7?requirement=7, #/requirement/3/7)
// still open: upgradeHash() rewrites them first.
// ?layout=calendar on #/my and #/team shows the calendar instead of the list; ?channel=2 keeps the tasks on channel 2.
// Project filters go in the query, only when set: ?project=7 (requirement 7)&assignee=5&status=s8&due=week&q=banner
// (assignee=none: unassigned; status=s8: status / board column 8; team=3: the assignee's team; channel=2: tasks on that channel), and ?task=12 when the task side panel is open.
import { EMPTY_FILTERS, can, canAdminister } from './utils.js';

const id = (s) => (/^\d+$/.test(s ?? '') ? Number(s) : null);
const TABS = ['board', 'list', 'requirements', 'calendar', 'timeline'];
const GROUPS = ['status', 'assignee']; // the Timeline's other groupings (requirement is the default)
const DUE_VALUES = ['all', 'overdue', 'week', 'none'];
const urlTab = (tab) => (tab === 'requirements' ? 'projects' : tab);

// The same screen in today's words (see above); a hash already in them comes back unchanged.
export function upgradeHash(hash) {
  const [path, search] = hash.replace(/^#\/?/, '').split('?');
  const [type, a, b, ...rest] = path.split('/');
  let next = path;
  if (type === 'project') next = ['activity', a, b === 'requirements' ? 'projects' : b, ...rest].filter((x) => x !== undefined).join('/');
  else if (type === 'requirement' && a && b) next = `activity/${a}/project/${b}`;
  if (search === undefined) return `#/${next}`;
  const query = new URLSearchParams([...new URLSearchParams(search)].map(([k, v]) => [k === 'requirement' ? 'project' : k, v]));
  return `#/${next}?${query}`;
}

// view as in Workspace; tab + filters / scope are what the project or task page currently shows.
export function formatRoute(view, { tab, filters, scope, layout, channel, group } = {}, panelTaskId = null) {
  let path;
  const query = new URLSearchParams();
  switch (view.type) {
    case 'dashboard':
      path = view.projectId ? `dashboard/${view.projectId}` : 'dashboard';
      break;
    case 'team':
    case 'my':
      path = view.type === 'my' ? 'my' : scope ?? view.scope ? `team/${scope ?? view.scope}` : 'team';
      if ((layout ?? view.layout) === 'calendar') query.set('layout', 'calendar');
      if (channel ?? view.channel) query.set('channel', channel ?? view.channel);
      break;
    case 'project': {
      const shownTab = tab ?? view.tab ?? 'board';
      // The requirement selected on arrival (a notification, "Quay lại" from its page) until the tab changes.
      const selected = shownTab === 'requirements' && shownTab === (view.tab ?? 'board') && view.requirementId;
      path = `activity/${view.id}/${urlTab(shownTab)}${selected ? `/${selected}` : ''}`;
      for (const [key, value] of Object.entries(filters ?? {})) {
        if (value.trim() && value !== EMPTY_FILTERS[key]) query.set(key === 'requirement' ? 'project' : key, value);
      }
      const shownGroup = group ?? view.group;
      if (shownTab === 'timeline' && GROUPS.includes(shownGroup)) query.set('group', shownGroup);
      break;
    }
    case 'report':
      if (view.week) path = `report/${view.week}`;
      else if (view.period === 'week' && view.from) path = `report/week/${view.from}`;
      else if (view.period === 'month') path = view.month ? `report/month/${view.month}` : 'report/month';
      else if (view.period === 'range' && view.from && view.to) path = `report/range/${view.from}/${view.to}`;
      else path = 'report';
      break;
    case 'task':
      path = `task/${view.id}`;
      break;
    case 'requirement':
      path = `activity/${view.projectId}/project/${view.id}`;
      break;
    case 'feedback':
    case 'chat':
      path = view.id ? `${view.type}/${view.id}` : view.type;
      if (view.messageId) query.set('message', view.messageId);
      break;
    default:
      path = view.type;
  }
  if (panelTaskId) query.set('task', panelTaskId);
  const search = query.toString();
  return `#/${path}${search ? `?${search}` : ''}`;
}

// Returns { view, panelTaskId }. Anything unknown, or a screen the user's role has no menu for, falls back
// to "Task của tôi"; ids the user cannot open get the usual "not found" from the server.
export function parseRoute(hash, user) {
  const [path, search = ''] = upgradeHash(hash).replace(/^#\/?/, '').split('?');
  const [type, a, b, c] = path.split('/');
  const query = new URLSearchParams(search);
  const panelTaskId = id(query.get('task'));
  const watcher = can(user, 'people.watch');
  let view = null;
  // Members have project dashboards only, not the team / department overview.
  if (type === 'dashboard' && id(a)) view = { type, projectId: id(a) };
  else if (type === 'dashboard' && !a && watcher) view = { type };
  else if (type === 'team' && watcher) view = { type, ...(a && { scope: decodeURIComponent(a) }) };
  else if (type === 'report' && watcher) view = { type, ...reportOf(a, b, c) };
  else if (type === 'admin' && canAdminister(user)) view = { type };
  else if (type === 'profile' || type === 'guide') view = { type };
  else if (type === 'feedback') view = { type, ...(id(a) && { id: id(a) }) };
  else if (type === 'chat' && can(user, 'chat.use')) {
    view = { type, ...(id(a) && { id: id(a) }), ...(id(a) && id(query.get('message')) && { messageId: id(query.get('message')) }) };
  }
  else if (type === 'myteams' && can(user, 'teams.members') && !can(user, 'users.manage')) view = { type };
  else if (type === 'activity' && id(a) && b === 'project' && id(c)) view = { type: 'requirement', projectId: id(a), id: id(c) };
  else if (type === 'activity' && id(a)) {
    const tab = b === 'projects' ? 'requirements' : TABS.includes(b) ? b : 'board';
    view = { type: 'project', id: id(a), tab, filters: parseFilters(query) };
    if (GROUPS.includes(query.get('group'))) view.group = query.get('group');
    if (tab === 'requirements' && id(c)) view.requirementId = id(c);
  } else if (type === 'task' && id(a)) view = { type, id: id(a) };
  view ||= { type: 'my' };
  if (['my', 'team'].includes(view.type) && query.get('layout') === 'calendar') view.layout = 'calendar';
  if (['my', 'team'].includes(view.type) && id(query.get('channel'))) view.channel = query.get('channel');
  return { view, panelTaskId };
}

// #/report/2026-10-05 (a weekly report kept), #/report/week/2026-10-05, #/report/month/2026-10,
// #/report/range/2026-09-01/2026-09-20; #/report alone is the current week.
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');
function reportOf(a, b, c) {
  if (isDay(a)) return { week: a };
  if (a === 'week' && isDay(b)) return { period: 'week', from: b };
  if (a === 'month') return { period: 'month', ...(/^\d{4}-\d{2}$/.test(b ?? '') && { month: b }) };
  if (a === 'range' && isDay(b) && isDay(c) && b <= c) return { period: 'range', from: b, to: c };
  return {};
}

// Unknown values are dropped; a requirement or assignee the project does not have simply matches no task.
function parseFilters(query) {
  const filters = { ...EMPTY_FILTERS };
  if (id(query.get('project'))) filters.requirement = query.get('project');
  const team = query.get('team');
  if (id(team)) filters.team = team;
  if (id(query.get('channel'))) filters.channel = query.get('channel');
  const assignee = query.get('assignee');
  if (assignee === 'none' || id(assignee)) filters.assignee = assignee;
  if (DUE_VALUES.includes(query.get('due'))) filters.due = query.get('due');
  if (/^s\d+$/.test(query.get('status') ?? '')) filters.status = query.get('status');
  filters.q = query.get('q') ?? '';
  return filters;
}
