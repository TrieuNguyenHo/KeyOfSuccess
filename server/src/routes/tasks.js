// Tasks and subtasks: lists, create / edit / delete, history, comments and files.
import express from 'express';
import { db, transaction } from '../db.js';
import {
  assignableBy,
  canBeAssigned,
  canEdit,
  findProject,
  findSection,
  findTask,
  isTaskAdmin,
  loadTask,
  projectAccess,
  taskAccess,
  taskScope,
} from '../lib/access.js';
import { channelNames, channelsByTask, withChannels } from '../lib/channels.js';
import { COMMENT_SELECT } from '../lib/comments.js';
import { HISTORY_DAYS, logEvent, logTaskChanges } from '../lib/history.js';
import { badRequest, forbidden } from '../lib/http.js';
import { pushChange, pushNotifications } from '../lib/live.js';
import { mentionList, plainExcerpt, resolveMentions, taskViewers } from '../lib/mentions.js';
import { notifyAssigned, notifyCompleted, notifyMentions } from '../lib/notifications.js';
import { nextOccurrence, parseRecurrence, spawnNextOccurrence } from '../lib/recurrence.js';
import { findRequirement } from '../lib/requirements.js';
import { statusSync } from '../lib/statuses.js';
import { attachmentsOf, rawUpload, saveAttachment, sweepUploads, withCommentFiles } from '../lib/uploads.js';
import { localDate, nowStamp, placeholders } from '../lib/util.js';

const router = express.Router();

const PRIORITIES = ['low', 'medium', 'high'];
const TASK_FIELDS = [
  'title',
  'description',
  'assignee_id',
  'due_date',
  'priority',
  'completed',
  'section_id',
  'requirement_id',
  'position',
];

router.get('/tasks', (req, res) => {
  const scope = taskScope(req, res);
  if (!scope) return;
  const { where, params } = scope;
  const me = req.user;
  const tasks = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name, p.name AS project_name, p.color AS project_color,
         r.title AS requirement_title,
         (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id) AS subtask_count,
         (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id AND s.completed = 1) AS subtask_done,
         (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
       FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN requirements r ON r.id = t.requirement_id
       WHERE t.parent_id IS NULL AND ${where}
       ORDER BY t.completed, t.due_date IS NULL, t.due_date, t.id`
    )
    .all(...params);
  // can_edit: the same rule as taskAccess() (task admins, or the assignee as a project member).
  const channels = channelsByTask(tasks.map((t) => t.id));
  res.json(tasks.map((t) => ({ ...t, can_edit: taskAccess(me, t) !== 'view', channels: channels.get(t.id) ?? [] })));
});

// Top-level tasks need a section and a requirement of the same project; subtasks need only parent_id.
// Task admins create any task; other project members create tasks assigned to themselves, and subtasks of
// their own tasks.
router.post('/tasks', (req, res) => {
  const { title, parent_id, section_id, requirement_id } = req.body ?? {};
  if (!title?.trim()) return badRequest(res, 'Cần nhập tên task');

  let projectId, sectionId, requirementId, assigneeId = null, completed = 0;
  if (parent_id) {
    const parent = findTask(parent_id);
    if (!parent || parent.parent_id || !['admin', 'edit'].includes(taskAccess(req.user, parent))) {
      return badRequest(res, 'Task cha không hợp lệ');
    }
    projectId = parent.project_id;
    sectionId = null;
    requirementId = null;
  } else {
    const section = findSection(section_id);
    const project = section && findProject(section.project_id);
    const admin = project && isTaskAdmin(req.user, project);
    if (!project || (!admin && !canEdit(projectAccess(req.user, project)))) {
      return badRequest(res, 'Trạng thái không hợp lệ');
    }
    if (!admin) {
      if (!canBeAssigned(req.user.id, project)) {
        return forbidden(res, 'Bạn không thuộc team phụ trách project nên không tự thêm task được; nhờ Manager hoặc Leader giao việc');
      }
      assigneeId = req.user.id;
    }
    const requirement = findRequirement(requirement_id);
    if (!requirement || requirement.project_id !== section.project_id) {
      return badRequest(res, 'Task phải thuộc một requirement của project');
    }
    projectId = section.project_id;
    sectionId = section.id;
    requirementId = requirement.id;
    if (section.kind === 'done') completed = 1;
  }

  const { max } = parent_id
    ? db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM tasks WHERE parent_id = ?').get(parent_id)
    : db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM tasks WHERE section_id = ?').get(sectionId);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO tasks (project_id, section_id, requirement_id, parent_id, title, position, created_by, assignee_id,
         completed, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      projectId,
      sectionId,
      requirementId,
      parent_id ?? null,
      title.trim(),
      max + 1,
      req.user.id,
      assigneeId,
      completed,
      completed ? nowStamp() : null
    );
  const created = findTask(lastInsertRowid);
  logEvent(created, req.user, created.parent_id ? 'subtask_added' : 'created', { title: created.title });
  pushChange(req, { project_id: projectId, task_id: created.id }, created);
  res.status(201).json(created);
});

router.get('/tasks/:id', (req, res) => {
  const task = loadTask(req, res, req.params.id, 'view');
  if (!task) return;
  const subtasks = db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY position').all(task.id);
  const comments = db.prepare(`${COMMENT_SELECT} WHERE c.task_id = ? ORDER BY c.created_at, c.id`).all(task.id);
  // Assignee choices are for task admins; requirement choices for anyone who can edit the task.
  const editable = task.access !== 'view';
  const assignees = task.access === 'admin' ? assignableBy(req.user, findProject(task.project_id)) : [];
  const requirements =
    editable && !task.parent_id
      ? db.prepare('SELECT id, title FROM requirements WHERE project_id = ? ORDER BY position, id').all(task.project_id)
      : [];
  // The channels to pick from, for the same people; subtasks carry none.
  const channels = editable && !task.parent_id ? db.prepare('SELECT id, name, color FROM channels ORDER BY name').all() : [];
  // The occurrence a completed recurring task created, for the link to it.
  const nextTask = task.next_task_id ? db.prepare('SELECT id, title, due_date FROM tasks WHERE id = ?').get(task.next_task_id) : null;
  res.json({
    task: withChannels(task),
    next_task: nextTask ?? null,
    subtasks,
    comments: withCommentFiles(comments, 'comment_id'),
    assignees,
    requirements,
    channels,
    attachments: attachmentsOf('task_id', task.id),
  });
});

// The last 30 days of a task's history, newest first, for anyone who can see the task. A subtask's
// history lives on its parent, so it returns the parent's.
router.get('/tasks/:id/history', (req, res) => {
  const task = loadTask(req, res, req.params.id, 'view');
  if (!task) return;
  const events = db
    .prepare(
      `SELECT e.id, e.type, e.data, e.created_at, e.user_id, u.name AS user_name
       FROM task_events e LEFT JOIN users u ON u.id = e.user_id
       WHERE e.task_id = ? AND e.created_at >= datetime('now', '-${HISTORY_DAYS} days') ORDER BY e.id DESC`
    )
    .all(task.parent_id ?? task.id);
  res.json(events.map(({ data, ...e }) => ({ ...e, ...JSON.parse(data) })));
});

router.patch('/tasks/:id', (req, res) => {
  const task = loadTask(req, res, req.params.id, 'edit');
  if (!task) return;
  const body = req.body ?? {};

  if (body.title !== undefined && !String(body.title).trim()) return badRequest(res, 'Tên task không được để trống');
  if (body.priority != null && body.priority !== '' && !PRIORITIES.includes(body.priority)) {
    return badRequest(res, 'Độ ưu tiên không hợp lệ');
  }
  if (body.section_id != null) {
    const section = findSection(body.section_id);
    if (task.parent_id || !section || section.project_id !== task.project_id) return badRequest(res, 'Trạng thái không hợp lệ');
  }
  // A top-level task can move to another requirement of its project, but never lose one.
  if (body.requirement_id !== undefined) {
    const requirement = findRequirement(body.requirement_id);
    if (task.parent_id || !requirement || requirement.project_id !== task.project_id) {
      return badRequest(res, 'Requirement không hợp lệ');
    }
  }
  const newAssignee = body.assignee_id === '' ? null : body.assignee_id;
  if (body.assignee_id !== undefined && (newAssignee == null ? null : Number(newAssignee)) !== task.assignee_id) {
    if (task.access !== 'admin') return forbidden(res, 'Chỉ Manager hoặc Leader của team tham gia project mới giao được task');
  }
  const assignee =
    newAssignee != null ? assignableBy(req.user, findProject(task.project_id)).find((u) => u.id === Number(newAssignee)) : null;
  if (newAssignee != null && !assignee && Number(newAssignee) !== task.assignee_id) {
    return badRequest(res, 'Chỉ giao task được cho bạn hoặc người trong team của bạn tham gia project này');
  }
  // channel_ids replaces a top-level task's channels (an empty list clears them).
  let channelIds = null;
  if (body.channel_ids !== undefined) {
    if (task.parent_id) return badRequest(res, 'Subtask không gắn kênh, kênh đi theo task cha');
    const ids = Array.isArray(body.channel_ids) ? [...new Set(body.channel_ids.map(Number))] : null;
    const valid =
      ids?.every(Number.isInteger) &&
      db.prepare(`SELECT COUNT(*) AS n FROM channels WHERE id IN (${placeholders(ids)})`).get(...ids).n === ids.length;
    if (!valid) return badRequest(res, 'Kênh không hợp lệ');
    channelIds = ids;
  }
  // recurrence: a rule (see parseRecurrence) or null to stop repeating. Undefined leaves it as it is.
  let recurrence;
  if (body.recurrence !== undefined) {
    if (task.parent_id) return badRequest(res, 'Subtask không lặp lại riêng, nó đi theo task cha');
    const rule = body.recurrence === null ? null : parseRecurrence(body.recurrence);
    if (rule === undefined) return badRequest(res, 'Quy tắc lặp lại không hợp lệ');
    recurrence = rule && JSON.stringify(rule);
  }

  const changes = { ...body, ...statusSync(task, body) };
  const updates = Object.entries(changes)
    .filter(([key]) => TASK_FIELDS.includes(key))
    .map(([key, value]) => {
      if (key === 'completed') return [key, value ? 1 : 0];
      if (key === 'title') return [key, String(value).trim()];
      return [key, value === '' ? null : value];
    });
  // Stamp only real transitions, so re-sending completed: true keeps the original time.
  if (changes.completed !== undefined && Boolean(changes.completed) !== Boolean(task.completed)) {
    updates.push(['completed_at', changes.completed ? nowStamp() : null]);
  }
  if (recurrence !== undefined && recurrence !== (task.recurrence ?? null)) {
    updates.push(['recurrence', recurrence]);
    // A rule repeats from the due date; a task without one gets the rule's first day from today.
    if (recurrence && !task.due_date && changes.due_date === undefined) {
      updates.push(['due_date', nextOccurrence(JSON.parse(recurrence), localDate(new Date()), { inclusive: true })]);
    }
  }
  const channelsBefore = withChannels(task).channels;
  const channelsChanged =
    channelIds !== null &&
    (channelIds.length !== channelsBefore.length || channelsBefore.some((c) => !channelIds.includes(c.id)));
  if (updates.length || channelsChanged) {
    const notified = transaction(() => {
      if (assignee && !assignee.is_member) {
        db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').run(task.project_id, assignee.id);
      }
      if (updates.length) {
        db.prepare(`UPDATE tasks SET ${updates.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`).run(
          ...updates.map(([, value]) => value),
          task.id
        );
      }
      const updated = findTask(task.id);
      logTaskChanges(task, updated, req.user);
      if (channelsChanged) {
        db.prepare('DELETE FROM task_channels WHERE task_id = ?').run(task.id);
        const insert = db.prepare('INSERT INTO task_channels (task_id, channel_id) VALUES (?, ?)');
        channelIds.forEach((id) => insert.run(task.id, id));
        const to = channelNames(withChannels(task).channels);
        logEvent(updated, req.user, 'field', { field: 'channels', from: channelNames(channelsBefore), to });
      }
      const ids = [];
      if (assignee && assignee.id !== task.assignee_id) ids.push(...notifyAssigned(updated, assignee.id, req.user));
      if (!task.parent_id && !task.completed && updated.completed) {
        const rule = updated.recurrence && JSON.parse(updated.recurrence);
        // A daily task would notify every day, so its completion stays quiet.
        if (rule?.freq !== 'daily') ids.push(...notifyCompleted(updated, req.user));
        if (rule && !updated.next_task_id) ids.push(...spawnNextOccurrence(updated, req.user));
      }
      return ids;
    });
    pushNotifications(notified);
    pushChange(req, { project_id: task.project_id, task_id: task.id }, findTask(task.id));
  }
  res.json(withChannels(findTask(task.id)));
});

router.delete('/tasks/:id', (req, res) => {
  const task = loadTask(req, res, req.params.id, 'admin');
  if (!task) return;
  if (task.parent_id) logEvent(task, req.user, 'subtask_deleted');
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  sweepUploads();
  pushChange(req, { project_id: task.project_id, task_id: task.id }, task);
  res.status(204).end();
});

// ---------- Comments ----------
// Editing and deleting them is in routes/comments.js.

router.get('/tasks/:id/mentionable', (req, res) => {
  const task = loadTask(req, res, req.params.id, 'view');
  if (!task) return;
  res.json(mentionList(taskViewers(task), req.user));
});

// Anyone who can see a task may comment on it. Mentioned people who can see the task are notified.
router.post('/tasks/:id/comments', (req, res) => {
  const task = loadTask(req, res, req.params.id, 'view');
  if (!task) return;
  // Text may be left out when files follow (with_files), uploaded to /api/comments/:id/attachments.
  const raw = req.body?.body?.trim() ?? '';
  if (!raw && !req.body?.with_files) return badRequest(res, 'Comment không được để trống');
  const { body, mentioned, excerpt } = resolveMentions(raw, taskViewers(task), req.user);
  const id = transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO comments (task_id, user_id, body) VALUES (?, ?, ?)')
      .run(task.id, req.user.id, body);
    notifyMentions(mentioned, req.user, { taskId: task.id, excerpt });
    logEvent(task, req.user, 'comment_added', { excerpt: plainExcerpt(body) });
    return lastInsertRowid;
  });
  pushNotifications(mentioned);
  pushChange(req, { project_id: task.project_id, task_id: task.id }, task);
  res.status(201).json(withCommentFiles([db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(id)], 'comment_id')[0]);
});

// ---------- Files ----------

// Anyone who can comment on a task can attach files to it.
router.post('/tasks/:id/attachments', rawUpload, (req, res) => {
  const task = loadTask(req, res, req.params.id, 'view');
  if (!task) return;
  saveAttachment(req, res, { taskId: task.id }, [{ project_id: task.project_id, task_id: task.id }, task]);
});

export default router;
