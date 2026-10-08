import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIRECTOR_EMAILS, ROOT_EMAILS, envRoleOf } from './config.js';

export const dbPath = process.env.DB_PATH || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'app.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
// Attached files (v11) live next to the database, named by attachments.stored_name.
export const UPLOAD_DIR = join(dirname(dbPath), 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

// A project's statuses ("trạng thái" in the UI): its board columns. kind marks the four built-in ones
// (v26: Planned, In-Progress, Completed, Pending; fixed names, never renamed or deleted); 'done' keeps the
// completed tick in step (lib/statuses.js). Shared by the schema below and the v26 migration, which rebuilds it.
const sectionsTable = (name) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position REAL NOT NULL,
    kind TEXT CHECK (kind IN ('todo', 'doing', 'done', 'pending'))
  );`;

// Shared by the schema below and the v2 migration, which rebuilds the table.
// Shared by the schema below and the v8 and v31 migrations, which rebuild the table.
// A notification points at a task, a requirement (mentions in requirement feedback) or, since v31, a feedback.
const notificationsTable = (name) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    requirement_id INTEGER REFERENCES requirements(id) ON DELETE CASCADE,
    feedback_id INTEGER REFERENCES feedback(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- task_completed | mention | assigned | feedback_new | feedback_status | feedback_message
    excerpt TEXT, -- start of the comment or message; the new status for feedback_status
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (task_id IS NOT NULL OR requirement_id IS NOT NULL OR feedback_id IS NOT NULL)
  );`;

// Files attached to a task, a requirement or (v31) a feedback, or sent in a chat message (v32); the bytes are
// UPLOAD_DIR/<stored_name>. A file sent with a comment (v13) or a feedback message (v31) also points at it and goes
// with it. Cascades leave the files behind; sweepUploads() removes them. Shared by the schema below and the v31 and
// v32 migrations, which rebuild the table.
const attachmentsTable = (name) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id INTEGER PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    requirement_id INTEGER REFERENCES requirements(id) ON DELETE CASCADE,
    feedback_id INTEGER REFERENCES feedback(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    requirement_comment_id INTEGER REFERENCES requirement_comments(id) ON DELETE CASCADE,
    feedback_message_id INTEGER REFERENCES feedback_messages(id) ON DELETE CASCADE,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ((task_id IS NOT NULL) + (requirement_id IS NOT NULL) + (feedback_id IS NOT NULL) + (message_id IS NOT NULL) = 1)
  );`;

const usersTable = (name) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    google_sub TEXT UNIQUE,
    -- A key of roles, or 'root' (ROOT_EMAILS). No CHECK since v27, when root began adding roles; the API only
    -- gives existing roles and never deletes a role someone holds.
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
    -- Legacy single team (v2). Unused since v9, where user_teams holds a user's teams;
    -- kept because SQLite cannot drop a column that has a foreign key.
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    -- Who created the account by invitation (v10); NULL for people who signed up themselves.
    invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    -- The interface language the user picked (v19).
    language TEXT NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en')),
    -- Profile (v20), edited by the user; only they and Managers read it.
    birthday TEXT, -- YYYY-MM-DD
    phone TEXT,
    job_title TEXT,
    bio TEXT,
    gender TEXT CHECK (gender IN ('male', 'female', 'other', 'undisclosed')),
    -- Profile picture (v21): its file in UPLOAD_DIR, "avatar-<random>.<png|jpg|webp>". A new name on every
    -- upload, so it also serves as the picture's version for caching.
    avatar TEXT,
    -- First sign-in (v25). NULL for an invited account nobody has signed in to yet ("Đã mời, chưa tham gia").
    joined_at TEXT
  );`;

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  ${usersTable('users')}

  -- A user's teams: exactly one for Members, one or more for Leaders (who lead all of them), any for Managers.
  -- The API enforces those counts.
  CREATE TABLE IF NOT EXISTS user_teams (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, team_id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4573d2',
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- Legacy single owning team (v4). Unused since v5, where project_teams holds the owning teams;
    -- kept because SQLite cannot drop a column that has a foreign key.
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- The owner (projects.owner_id) is also stored here as a member.
  CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, user_id)
  );

  -- Teams that own a project together. A project with no rows here is department-wide ("Chung toàn phòng").
  CREATE TABLE IF NOT EXISTS project_teams (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, team_id)
  );

  ${sectionsTable('sections')}

  -- A project's requirements; every top-level task belongs to one.
  CREATE TABLE IF NOT EXISTS requirements (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    position REAL NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Feedback on one requirement (task comments live in comments).
  CREATE TABLE IF NOT EXISTS requirement_comments (
    id INTEGER PRIMARY KEY,
    requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    edited_at TEXT -- set when the author edits it (v11)
  );

  -- Top-level tasks belong to a section and a requirement; subtasks have parent_id set,
  -- section_id and requirement_id NULL, and follow their parent.
  -- requirement_id cascades only so deleting a project goes through; the API refuses to delete
  -- a requirement that still has tasks.
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
    requirement_id INTEGER REFERENCES requirements(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    due_date TEXT,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    position REAL NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    recurrence TEXT, -- v18: repeat rule (JSON) of a recurring top-level task
    next_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL -- v18: the occurrence this one spawned
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    edited_at TEXT -- set when the author edits it (v11)
  );

  -- Feedback on the app (v31, decided 2026-10-08): any company user sends it and sees only their own; root
  -- handles it (status, messages). The sender edits or deletes it only while it is 'sent'. page, app_version and
  -- user_agent are recorded when it is sent, to help reproduce a bug.
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('bug', 'idea', 'other')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'received', 'in_progress', 'done', 'rejected')),
    page TEXT,
    app_version TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- The thread between the sender and root on one feedback.
  CREATE TABLE IF NOT EXISTS feedback_messages (
    id INTEGER PRIMARY KEY,
    feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    edited_at TEXT
  );

  -- Status changes of a feedback: who, when, from which status to which.
  CREATE TABLE IF NOT EXISTS feedback_events (
    id INTEGER PRIMARY KEY,
    feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Chat (v32, decided 2026-10-08). kind: 'direct' (one-to-one; direct_key is "<smaller id>:<larger id>", so a pair
  -- has one conversation), and since v33 'group' (made by hand: title, owner_id runs it), 'project' (project_id: whoever
  -- can open the project) and 'team' (team_id: the people of the team). Private to their members, Managers,
  -- Directors and root included.
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'direct',
    direct_key TEXT UNIQUE,
    title TEXT,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_message_at TEXT
  );

  -- Direct and group conversations: one row per member. Project and team ones: their members come from the rules, so
  -- a row only keeps someone's state there. last_read_id: the last message they have seen; muted (v33): its messages
  -- are not counted on the Messages menu, mentions of them still are. Rows go in joining order (rowid).
  CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    muted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id)
  );

  -- Kept 6 months (purgeMessages() in lib/chat.js). Deleting one by its author keeps the row (deleted_at, body
  -- emptied, files removed), so the thread shows "Tin nhắn đã bị xoá".
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL, -- the message it answers (v33)
    -- v34: 'system' for a line about a group (created, people added or taken out, left, renamed), written by its actor
    -- (user_id); data is JSON with the names as they were then; body holds the @[Name](id) of the people it is about,
    -- for whom it counts as unread. NULL: an ordinary message.
    kind TEXT,
    data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    edited_at TEXT,
    deleted_at TEXT
  );

  ${attachmentsTable('attachments')}

  ${notificationsTable('notifications')}

  -- A task's history (v15), kept 30 days (purgeTaskEvents() in index.js). Subtask changes go to their parent.
  -- type: created, field, subtask_added, subtask_deleted, comment_added, comment_edited, comment_deleted,
  -- file_added, file_deleted. data is JSON with the values as they were then (names, not ids), so the
  -- history still reads right after people, statuses or requirements are renamed or deleted.
  CREATE TABLE IF NOT EXISTS task_events (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Channels (v17): the department-wide list of marketing channels (Facebook, TikTok, SEO, Email…), managed by
  -- Managers. A top-level task carries any number of them; subtasks follow their parent and carry none.
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_channels (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, channel_id)
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
  CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
  CREATE INDEX IF NOT EXISTS idx_requirement_comments ON requirement_comments(requirement_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
  CREATE INDEX IF NOT EXISTS idx_user_teams_team ON user_teams(team_id);
  CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_requirement ON attachments(requirement_id);
`);

const schemaVersion = () => db.prepare('PRAGMA user_version').get().user_version;

// v1: projects became members-only. Anyone who already took part in a project (owner, assignee,
// task creator, commenter) keeps access. Runs once, so later member removals are not undone.
if (schemaVersion() < 1) {
  db.exec(`
    INSERT OR IGNORE INTO project_members (project_id, user_id)
      SELECT id, owner_id FROM projects WHERE owner_id IS NOT NULL
      UNION SELECT project_id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL
      UNION SELECT project_id, created_by FROM tasks WHERE created_by IS NOT NULL
      UNION SELECT t.project_id, c.user_id FROM comments c JOIN tasks t ON t.id = c.task_id WHERE c.user_id IS NOT NULL;
    PRAGMA user_version = 1;
  `);
}

// v2: Google sign-in replaced passwords, and users gained role / status / team.
// SQLite cannot drop a NOT NULL column, so the users table is rebuilt. Existing users stay active members.
if (schemaVersion() < 2) {
  const hasPasswords = db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'password_hash'").get();
  if (hasPasswords) {
    db.exec('PRAGMA foreign_keys = OFF');
    transaction(() =>
      db.exec(`
        ${usersTable('users_v2')}
        INSERT INTO users_v2 (id, name, email, role, status, created_at)
          SELECT id, name, email, 'member', 'active', created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_v2 RENAME TO users;
      `)
    );
    db.exec('PRAGMA foreign_keys = ON');
  }
  db.exec('PRAGMA user_version = 2');
}

// v3: tasks.completed_at feeds the dashboard's completion trend. Tasks completed before
// this version keep a NULL timestamp, since when they were finished is unknown.
if (schemaVersion() < 3) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('tasks') WHERE name = 'completed_at'").get()) {
    db.exec('ALTER TABLE tasks ADD COLUMN completed_at TEXT');
  }
  db.exec('PRAGMA user_version = 3');
}

// v4: projects belong to a team. Existing projects take their owner's team.
if (schemaVersion() < 4) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name = 'team_id'").get()) {
    db.exec('ALTER TABLE projects ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL');
  }
  db.exec(`
    UPDATE projects SET team_id = (SELECT team_id FROM users WHERE users.id = projects.owner_id) WHERE team_id IS NULL;
    PRAGMA user_version = 4;
  `);
}

// v5: a project can belong to several teams. Copies each project's single v4 team into project_teams.
if (schemaVersion() < 5) {
  db.exec(`
    INSERT OR IGNORE INTO project_teams (project_id, team_id)
      SELECT id, team_id FROM projects WHERE team_id IS NOT NULL;
    PRAGMA user_version = 5;
  `);
}

// v6: projects.description holds the requirements shown on the overview tab.
if (schemaVersion() < 6) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name = 'description'").get()) {
    db.exec('ALTER TABLE projects ADD COLUMN description TEXT');
  }
  db.exec('PRAGMA user_version = 6');
}

const hasColumn = (table, column) =>
  Boolean(db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column));
const tableExists = (table) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));

// v7: a project has many requirements and every top-level task belongs to one. Each existing project
// gets a "Requirement chung" that takes over its v6 description, its tasks and its project-wide feedback;
// the v6 projects.description column and project_comments table are then removed.
if (schemaVersion() < 7) {
  transaction(() => {
    if (!hasColumn('tasks', 'requirement_id')) {
      db.exec('ALTER TABLE tasks ADD COLUMN requirement_id INTEGER REFERENCES requirements(id) ON DELETE CASCADE');
    }
    const hasDescription = hasColumn('projects', 'description');
    const hasProjectComments = tableExists('project_comments');
    const projects = db.prepare(`SELECT id, owner_id${hasDescription ? ', description' : ''} FROM projects`).all();
    const insertRequirement = db.prepare(
      'INSERT INTO requirements (project_id, title, description, position, created_by) VALUES (?, ?, ?, 1, ?)'
    );
    const claimTasks = db.prepare('UPDATE tasks SET requirement_id = ? WHERE project_id = ? AND parent_id IS NULL');
    const moveComments =
      hasProjectComments &&
      db.prepare(
        `INSERT INTO requirement_comments (requirement_id, user_id, body, created_at)
         SELECT ?, user_id, body, created_at FROM project_comments WHERE project_id = ? ORDER BY id`
      );
    for (const p of projects) {
      const { lastInsertRowid: requirementId } = insertRequirement.run(
        p.id,
        'Requirement chung',
        p.description ?? null,
        p.owner_id ?? null
      );
      claimTasks.run(requirementId, p.id);
      if (moveComments) moveComments.run(requirementId, p.id);
    }
    if (hasProjectComments) db.exec('DROP TABLE project_comments');
    if (hasDescription) db.exec('ALTER TABLE projects DROP COLUMN description');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_requirement ON tasks(requirement_id)');
    db.exec('PRAGMA user_version = 7');
  });
}

// v8: notifications can point at a requirement (mentions in requirement feedback), so task_id becomes
// nullable and requirement_id / excerpt are added. SQLite cannot relax NOT NULL in place, so the table
// is rebuilt; existing rows keep their ids.
if (schemaVersion() < 8) {
  const taskIdRequired = db.prepare("SELECT \"notnull\" FROM pragma_table_info('notifications') WHERE name = 'task_id'").get()?.notnull;
  if (taskIdRequired) {
    db.exec('PRAGMA foreign_keys = OFF');
    transaction(() =>
      db.exec(`
        ${notificationsTable('notifications_v8')}
        INSERT INTO notifications_v8 (id, user_id, actor_id, task_id, type, read_at, created_at)
          SELECT id, user_id, actor_id, task_id, type, read_at, created_at FROM notifications;
        DROP TABLE notifications;
        ALTER TABLE notifications_v8 RENAME TO notifications;
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
      `)
    );
    db.exec('PRAGMA foreign_keys = ON');
  }
  db.exec('PRAGMA user_version = 8');
}

// v9: Leaders and Managers can belong to several teams. Copies each user's single v2 team into user_teams.
if (schemaVersion() < 9) {
  db.exec(`
    INSERT OR IGNORE INTO user_teams (user_id, team_id) SELECT id, team_id FROM users WHERE team_id IS NOT NULL;
    PRAGMA user_version = 9;
  `);
}

// v10: users.invited_by. A Leader's invitation waits for a Manager; Leaders may only approve people who
// signed up themselves. Existing accounts count as self sign-ups.
if (schemaVersion() < 10) {
  if (!hasColumn('users', 'invited_by')) {
    db.exec('ALTER TABLE users ADD COLUMN invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }
  db.exec('PRAGMA user_version = 10');
}

// v11: comments and requirement feedback can be edited (edited_at); the attachments table is created above.
if (schemaVersion() < 11) {
  for (const table of ['comments', 'requirement_comments']) {
    if (!hasColumn(table, 'edited_at')) db.exec(`ALTER TABLE ${table} ADD COLUMN edited_at TEXT`);
  }
  db.exec('PRAGMA user_version = 11');
}

// v12: statuses get a kind and Vietnamese names; the done tick follows the 'done' status. Each project's
// first "To do" / "Doing" / "Done" column (by name, also already-Vietnamese names) gets its kind and is
// renamed. Then top-level tasks are brought in step: ticked ones outside the done column move to its end,
// unticked ones inside it are ticked (completed_at stays empty: when they were finished is unknown).
if (schemaVersion() < 12) {
  if (!hasColumn('sections', 'kind')) {
    db.exec("ALTER TABLE sections ADD COLUMN kind TEXT CHECK (kind IN ('todo', 'doing', 'done'))");
  }
  const kinds = [
    ['todo', 'Cần làm', ['to do', 'todo', 'cần làm']],
    ['doing', 'Đang làm', ['doing', 'in progress', 'đang làm']],
    ['done', 'Hoàn thành', ['done', 'hoàn thành', 'đã xong']],
  ];
  transaction(() => {
    for (const [kind, name, names] of kinds) {
      const ids = db
        .prepare(
          `SELECT MIN(id) AS id FROM sections WHERE kind IS NULL AND lower(trim(name)) IN (${names.map(() => '?').join(', ')})
           GROUP BY project_id`
        )
        .all(...names)
        .map((r) => r.id);
      const update = db.prepare('UPDATE sections SET kind = ?, name = ? WHERE id = ?');
      ids.forEach((id) => update.run(kind, name, id));
    }
    const doneSections = db.prepare("SELECT id, project_id FROM sections WHERE kind = 'done'").all();
    for (const { id, project_id } of doneSections) {
      const outside = db
        .prepare('SELECT id FROM tasks WHERE project_id = ? AND parent_id IS NULL AND completed = 1 AND section_id != ? ORDER BY position')
        .all(project_id, id);
      let { max } = db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM tasks WHERE section_id = ?').get(id);
      const move = db.prepare('UPDATE tasks SET section_id = ?, position = ? WHERE id = ?');
      outside.forEach((t) => move.run(id, ++max, t.id));
      db.prepare('UPDATE tasks SET completed = 1 WHERE section_id = ? AND parent_id IS NULL AND completed = 0').run(id);
    }
    db.exec('PRAGMA user_version = 12');
  });
}

// v13: files can be sent with a task comment or requirement feedback.
if (schemaVersion() < 13) {
  if (!hasColumn('attachments', 'comment_id')) {
    db.exec('ALTER TABLE attachments ADD COLUMN comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE');
  }
  if (!hasColumn('attachments', 'requirement_comment_id')) {
    db.exec(
      'ALTER TABLE attachments ADD COLUMN requirement_comment_id INTEGER REFERENCES requirement_comments(id) ON DELETE CASCADE'
    );
  }
  db.exec('PRAGMA user_version = 13');
}
// v14 gave requirements team labels (requirement_teams, requirements.all_teams); v16 removed them again.
if (schemaVersion() < 14) db.exec('PRAGMA user_version = 14');

// v15: task history (task_events, created above). It starts empty: changes before this version are not known.
if (schemaVersion() < 15) db.exec('PRAGMA user_version = 15');

// v16: requirement team labels are dropped; a task's team now comes from its assignee (computed, not stored).
if (schemaVersion() < 16) {
  db.exec('DROP TABLE IF EXISTS requirement_teams');
  if (hasColumn('requirements', 'all_teams')) db.exec('ALTER TABLE requirements DROP COLUMN all_teams');
  db.exec('PRAGMA user_version = 16');
}

// v17: channel tags on tasks (channels, task_channels, created above). The list starts empty.
if (schemaVersion() < 17) db.exec('PRAGMA user_version = 17');

// v18: recurring tasks. tasks.recurrence holds the rule as JSON on the open occurrence; completing it creates the
// next one, which takes the rule over, and next_task_id marks that it did, so each occurrence spawns only once.
if (schemaVersion() < 18) {
  if (!hasColumn('tasks', 'recurrence')) db.exec('ALTER TABLE tasks ADD COLUMN recurrence TEXT');
  if (!hasColumn('tasks', 'next_task_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN next_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL');
  }
  db.exec('PRAGMA user_version = 18');
}

// v19: users.language, the interface language each user picked ('vi' or 'en'). Everyone starts in Vietnamese.
if (schemaVersion() < 19) {
  if (!hasColumn('users', 'language')) {
    db.exec("ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en'))");
  }
  db.exec('PRAGMA user_version = 19');
}

// v20: profile fields the user edits on the Profile screen. All start empty.
if (schemaVersion() < 20) {
  const columns = {
    birthday: 'TEXT',
    phone: 'TEXT',
    job_title: 'TEXT',
    bio: 'TEXT',
    gender: "TEXT CHECK (gender IN ('male', 'female', 'other', 'undisclosed'))",
  };
  for (const [name, type] of Object.entries(columns)) {
    if (!hasColumn('users', name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  db.exec('PRAGMA user_version = 20');
}

// v21: users.avatar, the profile picture. Nobody has one yet.
if (schemaVersion() < 21) {
  if (!hasColumn('users', 'avatar')) db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
  db.exec('PRAGMA user_version = 21');
}

// SQLite cannot change a CHECK constraint in place, so the users table is rebuilt with the current schema (ids and
// every column kept). v22 and v23 rebuilt it to add a role to the old CHECK on users.role; v27 to drop that CHECK.
const usersSql = () => db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().sql;
const hasRoleCheck = () => usersSql().includes('CHECK (role IN');
function allowUserRole(role, tempName) {
  if (hasRoleCheck() && !usersSql().includes(`'${role}'`)) rebuildUsers(tempName);
}
function rebuildUsers(tempName) {
  const columns = db.prepare("SELECT name FROM pragma_table_info('users')").all().map((c) => c.name).join(', ');
  db.exec('PRAGMA foreign_keys = OFF');
  transaction(() =>
    db.exec(`
      ${usersTable(tempName)}
      INSERT INTO ${tempName} (${columns}) SELECT ${columns} FROM users;
      DROP TABLE users;
      ALTER TABLE ${tempName} RENAME TO users;
    `)
  );
  db.exec('PRAGMA foreign_keys = ON');
}

// A database that ran this branch's earlier v22 (the four fixed statuses, now v26) before the Director role took
// that number: step back to v21 so v22-v25 run; v26 then finds its statuses already in place.
{
  const tableSql = (name) => db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)?.sql ?? '';
  if (schemaVersion() === 22 && tableSql('sections').includes("'pending'") && !tableSql('users').includes("'director'")) {
    db.exec('PRAGMA user_version = 21');
  }
}

// v22: the Director role; then DIRECTOR_EMAILS become Directors, so a Director already signed in has the role at once.
if (schemaVersion() < 22) {
  allowUserRole('director', 'users_v22');
  const promote = db.prepare("UPDATE users SET role = 'director', status = 'active' WHERE email = ?");
  DIRECTOR_EMAILS.forEach((email) => promote.run(email));
  db.exec('PRAGMA user_version = 22');
}

// v23: the root role, for the accounts in ROOT_EMAILS, which configure the system and are not part of the company.
// An existing account in ROOT_EMAILS becomes root and leaves its teams (sign-in does the same later on).
if (schemaVersion() < 23) {
  allowUserRole('root', 'users_v23');
  transaction(() => ROOT_EMAILS.forEach(makeRoot));
  db.exec('PRAGMA user_version = 23');
}

// v24: roles and what each may do, set by root. `level` ranks roles: nobody changes, gives or reads the profile of a
// role above their own. Each role holds every permission of lib/permissions.js with a scope ('none' / 'team' /
// 'all'); missing rows are filled in with the defaults at startup (seedPermissions()).
db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    level INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL REFERENCES roles(key) ON DELETE CASCADE,
    permission TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('none', 'team', 'all')),
    PRIMARY KEY (role, permission)
  );
`);
const insertRole = db.prepare('INSERT OR IGNORE INTO roles (key, name, level) VALUES (?, ?, ?)');
[
  ['member', 'Member', 1],
  ['leader', 'Leader', 2],
  ['manager', 'Manager', 3],
  ['director', 'Director', 4],
].forEach((role) => insertRole.run(...role));
if (schemaVersion() < 24) db.exec('PRAGMA user_version = 24');

// v25: users.joined_at, set at the first sign-in, which is how an invited person accepts. Everyone already there
// counts as joined.
if (schemaVersion() < 25) {
  if (!hasColumn('users', 'joined_at')) db.exec('ALTER TABLE users ADD COLUMN joined_at TEXT');
  db.exec('UPDATE users SET joined_at = created_at WHERE joined_at IS NULL');
  db.exec('PRAGMA user_version = 25');
}

// Two lines of work both took v26 and were merged on 2026-10-07 (release v1.0 was deployed from the second):
//   - main: v26 Manager scope, v27 editable roles;
//   - v1.0: v26 fixed statuses (now v28 below).
// A database of the v1.0 line is at 26 with a sections table that already allows 'pending'; it skipped the Manager
// scope, which runs for it here. Every step below can run on either line.
const sectionsSql = () => db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sections'").get().sql;
const fromStatusesLine = schemaVersion() === 26 && sectionsSql().includes("'pending'");

// v26: a Manager runs only their own teams (decided 2026-10-06). Manager permissions still on the old department-wide
// default move to 'team'; scopes root set by hand are kept. A new database gets the new defaults from the seeding.
function managerToOwnTeams() {
  const toTeam = db.prepare("UPDATE role_permissions SET scope = 'team' WHERE role = 'manager' AND permission = ? AND scope = 'all'");
  [
    'projects.view',
    'projects.change_teams',
    'requirements.manage',
    'people.watch',
    'people.profiles',
    'users.manage',
    'teams.members',
    'teams.manage',
    'notify.task_completed',
  ].forEach((permission) => toTeam.run(permission));
}
if (schemaVersion() < 26) {
  managerToOwnTeams();
  db.exec('PRAGMA user_version = 26');
} else if (fromStatusesLine) managerToOwnTeams();

// v27: root adds, renames and deletes roles (decided 2026-10-07). users.role loses its CHECK (rebuilt), and each role
// carries how many teams its holders belong to: min_teams 0 or 1, max_teams 1 or NULL (no limit). The four built-in
// roles (builtin = 1) keep the team rules that were hard-coded: a Member in one team at most, a Leader in at least
// one. Built-in roles are renamed but never deleted, nor moved to another level.
for (const [column, type] of [
  ['builtin', 'INTEGER NOT NULL DEFAULT 0'],
  ['min_teams', 'INTEGER NOT NULL DEFAULT 0 CHECK (min_teams IN (0, 1))'],
  ['max_teams', 'INTEGER CHECK (max_teams IS NULL OR max_teams = 1)'],
]) {
  if (!hasColumn('roles', column)) db.exec(`ALTER TABLE roles ADD COLUMN ${column} ${type}`);
}
if (schemaVersion() < 27) {
  if (hasRoleCheck()) rebuildUsers('users_v27');
  transaction(() => {
    db.exec("UPDATE roles SET builtin = 1 WHERE key IN ('member', 'leader', 'manager', 'director')");
    db.exec("UPDATE roles SET max_teams = 1 WHERE key = 'member'");
    db.exec("UPDATE roles SET min_teams = 1 WHERE key = 'leader'");
  });
  db.exec('PRAGMA user_version = 27');
}

// v28 (v26 on the v1.0 line, see above): four built-in statuses with fixed names, the same in Vietnamese and English: Planned (todo),
// In-Progress (doing), Completed (done), Pending (new kind 'pending'). The kind CHECK gains 'pending', so the
// table is rebuilt (ids kept). Built-in statuses take the fixed names; a project missing one gets it at the end.
if (schemaVersion() < 28) {
  if (!sectionsSql().includes("'pending'")) {
    db.exec('PRAGMA foreign_keys = OFF');
    transaction(() =>
      db.exec(`
        ${sectionsTable('sections_v28')}
        INSERT INTO sections_v28 (id, project_id, name, position, kind)
          SELECT id, project_id, name, position, kind FROM sections;
        DROP TABLE sections;
        ALTER TABLE sections_v28 RENAME TO sections;
      `)
    );
    db.exec('PRAGMA foreign_keys = ON');
  }
  transaction(() => {
    const rename = db.prepare('UPDATE sections SET name = ? WHERE kind = ?');
    const has = db.prepare('SELECT 1 FROM sections WHERE project_id = ? AND kind = ?');
    const insert = db.prepare(
      `INSERT INTO sections (project_id, name, position, kind)
       SELECT ?, ?, COALESCE(MAX(position), 0) + 1, ? FROM sections WHERE project_id = ?`
    );
    const projects = db.prepare('SELECT id FROM projects').all();
    for (const [kind, name] of [['todo', 'Planned'], ['doing', 'In-Progress'], ['done', 'Completed'], ['pending', 'Pending']]) {
      rename.run(name, kind);
      for (const { id } of projects) if (!has.get(id, kind)) insert.run(id, name, kind, id);
    }
    db.exec('PRAGMA user_version = 28');
  });
}

// v29: users.env_role, the role ROOT_EMAILS / DIRECTOR_EMAILS / MANAGER_EMAILS last gave the account. Sign-in gives
// that role (and unlocks the account) only when the lists now say something else, e.g. an email was just added, so a
// role changed or an account locked in the app stays so (decided 2026-10-07). Accounts already in the lists count as
// given their role.
if (schemaVersion() < 29) {
  if (!hasColumn('users', 'env_role')) db.exec('ALTER TABLE users ADD COLUMN env_role TEXT');
  transaction(() => {
    const mark = db.prepare('UPDATE users SET env_role = ? WHERE id = ?');
    for (const { id, email } of db.prepare('SELECT id, email FROM users').all()) mark.run(envRoleOf(email), id);
    db.exec('PRAGMA user_version = 29');
  });
}

// v30: project_members.role, a role set by hand for one person in one project (decided 2026-10-07): 'admin' (task
// admin and project manager, but cannot delete the project), 'member' (own tasks, may be assigned even from another
// team) or 'viewer' (view and comment). It wins over the team rules in both directions; NULL = the team rules decide,
// as before, so nobody's rights change with this migration.
if (schemaVersion() < 30) {
  if (!hasColumn('project_members', 'role')) {
    db.exec("ALTER TABLE project_members ADD COLUMN role TEXT CHECK (role IN ('admin', 'member', 'viewer'))");
  }
  db.exec('PRAGMA user_version = 30');
}

// v31: feedback on the app (tables created above). Files and notifications may now point at a feedback instead of a
// task or requirement, so both tables are rebuilt with the wider CHECK (ids kept); no table references them.
if (schemaVersion() < 31) {
  const sqlOf = (table) => db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table).sql;
  transaction(() => {
    if (!sqlOf('attachments').includes('feedback_id')) {
      const columns = 'id, task_id, requirement_id, comment_id, requirement_comment_id, user_id, name, mime, size, stored_name, created_at';
      db.exec(`
        ${attachmentsTable('attachments_v31')}
        INSERT INTO attachments_v31 (${columns}) SELECT ${columns} FROM attachments;
        DROP TABLE attachments;
        ALTER TABLE attachments_v31 RENAME TO attachments;
        CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
        CREATE INDEX IF NOT EXISTS idx_attachments_requirement ON attachments(requirement_id);
      `);
    }
    if (!sqlOf('notifications').includes('feedback_id')) {
      const columns = 'id, user_id, actor_id, task_id, requirement_id, type, excerpt, read_at, created_at';
      db.exec(`
        ${notificationsTable('notifications_v31')}
        INSERT INTO notifications_v31 (${columns}) SELECT ${columns} FROM notifications;
        DROP TABLE notifications;
        ALTER TABLE notifications_v31 RENAME TO notifications;
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
      `);
    }
    db.exec('PRAGMA user_version = 31');
  });
}

// v32: chat (tables created above). Files may now belong to a chat message, so attachments is rebuilt again with the
// wider CHECK (ids kept). The word boundary tells message_id from feedback_message_id.
if (schemaVersion() < 32) {
  transaction(() => {
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'attachments'").get().sql;
    if (!/\bmessage_id\b/.test(sql)) {
      const columns =
        'id, task_id, requirement_id, feedback_id, comment_id, requirement_comment_id, feedback_message_id, user_id, name, mime, size, stored_name, created_at';
      db.exec(`
        ${attachmentsTable('attachments_v32')}
        INSERT INTO attachments_v32 (${columns}) SELECT ${columns} FROM attachments;
        DROP TABLE attachments;
        ALTER TABLE attachments_v32 RENAME TO attachments;
        CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
        CREATE INDEX IF NOT EXISTS idx_attachments_requirement ON attachments(requirement_id);
      `);
    }
    db.exec('PRAGMA user_version = 32');
  });
}

// v33: group, project and team chats, muting a conversation, answering a message (columns created above for new
// databases). Columns only: nothing is rebuilt.
if (schemaVersion() < 33) {
  transaction(() => {
    for (const [table, column, definition] of [
      ['conversations', 'title', 'TEXT'],
      ['conversations', 'owner_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL'],
      ['conversations', 'project_id', 'INTEGER REFERENCES projects(id) ON DELETE CASCADE'],
      ['conversations', 'team_id', 'INTEGER REFERENCES teams(id) ON DELETE CASCADE'],
      ['conversation_members', 'muted', 'INTEGER NOT NULL DEFAULT 0'],
      ['messages', 'reply_to_id', 'INTEGER REFERENCES messages(id) ON DELETE SET NULL'],
    ]) {
      if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    db.exec('PRAGMA user_version = 33');
  });
}

// v34: system lines in group chats (columns created above for new databases).
if (schemaVersion() < 34) {
  transaction(() => {
    if (!hasColumn('messages', 'kind')) db.exec('ALTER TABLE messages ADD COLUMN kind TEXT');
    if (!hasColumn('messages', 'data')) db.exec('ALTER TABLE messages ADD COLUMN data TEXT');
    db.exec('PRAGMA user_version = 34');
  });
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id) WHERE project_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_team ON conversations(team_id) WHERE team_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_messages ON feedback_messages(feedback_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_events ON feedback_events(feedback_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_feedback ON attachments(feedback_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_feedback_message ON attachments(feedback_message_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_comment ON attachments(comment_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_requirement_comment ON attachments(requirement_comment_id);
  CREATE INDEX IF NOT EXISTS idx_task_channels_channel ON task_channels(channel_id);
`);

// Turns the account with this email (if any) into an active root account outside every team.
export function makeRoot(email) {
  db.prepare("UPDATE users SET role = 'root', status = 'active' WHERE email = ?").run(email);
  db.prepare('DELETE FROM user_teams WHERE user_id IN (SELECT id FROM users WHERE email = ?)').run(email);
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
