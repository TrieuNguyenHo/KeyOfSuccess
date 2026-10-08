// Project templates (v39, decided 2026-10-08): "Lưu làm mẫu" takes a snapshot of a project, and a new project can start
// from one. The snapshot keeps the statuses (the added ones), requirements, top-level tasks and subtasks with their
// description, priority, channels, assignee and repeat rule; due dates become day offsets from the earliest one, so a
// new project places them from the day its creator picks as the start or as the launch (the last due date). Comments,
// files, history, members and the done ticks are not kept. Shared by everyone who may create projects.
import { db } from '../db.js';
import { canBeAssigned, findProject } from './access.js';
import { logEvent } from './history.js';
import { follow, notifyAssigned } from './notifications.js';
import { DEFAULT_STATUSES } from './statuses.js';

const DAY_MS = 86400000;
const parseDay = (s) => new Date(`${s}T00:00:00Z`);
const daysBetween = (from, to) => Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
export const addDays = (day, n) => new Date(parseDay(day).getTime() + n * DAY_MS).toISOString().slice(0, 10);

// The snapshot of a project: { sections, requirements, tasks, span } where span is the days from the first due date
// to the last (null when no task has one). A task done in the project starts again in the to-do status.
export function snapshotProject(projectId) {
  const sections = db.prepare('SELECT id, name, kind FROM sections WHERE project_id = ? ORDER BY position, id').all(projectId);
  const requirements = db
    .prepare('SELECT id, title, description FROM requirements WHERE project_id = ? ORDER BY position, id')
    .all(projectId);
  const tasks = db
    .prepare(
      `SELECT t.* FROM tasks t JOIN sections s ON s.id = t.section_id
       WHERE t.project_id = ? AND t.parent_id IS NULL ORDER BY s.position, t.position, t.id`
    )
    .all(projectId);
  const subtasksOf = db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY position, id');
  const channelsOf = db.prepare('SELECT channel_id FROM task_channels WHERE task_id = ? ORDER BY channel_id');
  const subtasks = new Map(tasks.map((t) => [t.id, subtasksOf.all(t.id)]));

  const dates = [...tasks, ...[...subtasks.values()].flat()].map((t) => t.due_date).filter(Boolean).sort();
  const first = dates[0] ?? null;
  const offset = (day) => (day && first ? daysBetween(first, day) : null);
  const sectionIndex = new Map(sections.map((s, i) => [s.id, i]));
  const todo = sections.findIndex((s) => s.kind === 'todo');
  const requirementIndex = new Map(requirements.map((r, i) => [r.id, i]));
  const fields = (t) => ({
    title: t.title,
    description: t.description ?? null,
    priority: t.priority ?? null,
    offset: offset(t.due_date),
    assignee_id: t.assignee_id ?? null,
  });

  return {
    sections: sections.map(({ name, kind }) => ({ name, kind: kind ?? null })),
    requirements: requirements.map(({ title, description }) => ({ title, description: description ?? null })),
    tasks: tasks.map((t) => {
      const section = sections[sectionIndex.get(t.section_id)];
      return {
        ...fields(t),
        section: section.kind === 'done' && todo >= 0 ? todo : sectionIndex.get(t.section_id),
        requirement: requirementIndex.get(t.requirement_id),
        recurrence: t.recurrence ?? null,
        channel_ids: channelsOf.all(t.id).map((c) => c.channel_id),
        subtasks: subtasks.get(t.id).map(fields),
      };
    }),
    span: first ? daysBetween(first, dates.at(-1)) : null,
  };
}

// What the template list shows about a snapshot.
export const summaryOf = (data) => ({
  requirements: data.requirements.length,
  tasks: data.tasks.length,
  subtasks: data.tasks.reduce((n, t) => n + t.subtasks.length, 0),
  span: data.span,
});

// Fills a project created with the default statuses (POST /projects, in its transaction) from a template's snapshot.
// `start` is the day of the first due date (from the anchor the creator picked). Assignees are kept while they may be
// given the project's tasks (and join it); everyone else's tasks start unassigned. Returns who to notify.
export function fillFromTemplate(projectId, data, start, actor) {
  const project = findProject(projectId);
  const statusId = new Map(
    db.prepare('SELECT id, kind FROM sections WHERE project_id = ? AND kind IS NOT NULL').all(projectId).map((s) => [s.kind, s.id])
  );
  const insertSection = db.prepare('INSERT INTO sections (project_id, name, position) VALUES (?, ?, ?)');
  const placeSection = db.prepare('UPDATE sections SET position = ? WHERE id = ?');
  const sectionIds = data.sections.map((s, i) => {
    if (s.kind && statusId.has(s.kind)) {
      placeSection.run(i + 1, statusId.get(s.kind));
      return statusId.get(s.kind);
    }
    return Number(insertSection.run(projectId, s.name, i + 1).lastInsertRowid);
  });
  // A built-in status the snapshot lacks (none since v28) goes after the others.
  DEFAULT_STATUSES.forEach(([kind]) => {
    if (!data.sections.some((s) => s.kind === kind)) placeSection.run(data.sections.length + 1, statusId.get(kind));
  });

  const insertRequirement = db.prepare('INSERT INTO requirements (project_id, title, description, position, created_by) VALUES (?, ?, ?, ?, ?)');
  const requirementIds = data.requirements.map(
    (r, i) => Number(insertRequirement.run(projectId, r.title, r.description, i + 1, actor.id).lastInsertRowid)
  );

  const channels = new Set(db.prepare('SELECT id FROM channels').all().map((c) => c.id));
  const assignable = new Map();
  const assigneeOf = (userId) => {
    if (userId == null) return null;
    if (!assignable.has(userId)) {
      const active = db.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'active' AND role != 'root'").get(userId);
      assignable.set(userId, Boolean(active) && canBeAssigned(userId, project));
    }
    if (!assignable.get(userId)) return null;
    db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)').run(projectId, userId);
    return userId;
  };
  const dueOf = (offset) => (offset == null || !start ? null : addDays(start, offset));
  const insertTask = db.prepare(
    `INSERT INTO tasks (project_id, section_id, requirement_id, parent_id, title, description, assignee_id, due_date,
       priority, position, created_by, recurrence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertChannel = db.prepare('INSERT INTO task_channels (task_id, channel_id) VALUES (?, ?)');

  const notified = [];
  data.tasks.forEach((t, i) => {
    const assignee = assigneeOf(t.assignee_id);
    const id = Number(
      insertTask.run(
        projectId,
        sectionIds[t.section],
        requirementIds[t.requirement],
        null,
        t.title,
        t.description,
        assignee,
        dueOf(t.offset),
        t.priority,
        i + 1,
        actor.id,
        t.recurrence
      ).lastInsertRowid
    );
    t.channel_ids.filter((c) => channels.has(c)).forEach((c) => insertChannel.run(id, c));
    t.subtasks.forEach((s, j) => {
      insertTask.run(projectId, null, null, id, s.title, s.description, assigneeOf(s.assignee_id), dueOf(s.offset), s.priority, j + 1, actor.id, null);
    });
    logEvent({ id, parent_id: null }, actor, 'created', { title: t.title });
    follow(id, actor.id);
    follow(id, assignee);
    if (assignee) notified.push(...notifyAssigned({ id }, assignee, actor));
  });
  return notified;
}
