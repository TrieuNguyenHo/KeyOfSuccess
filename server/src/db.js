import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dbPath = process.env.DB_PATH || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'app.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
// Attached files (v11) live next to the database, named by attachments.stored_name.
export const UPLOAD_DIR = join(dirname(dbPath), 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

// Shared by the schema below and the v2 migration, which rebuilds the table.
// Shared by the schema below and the v8 migration, which rebuilds the table.
// A notification points at a task or, for mentions in requirement feedback, a requirement.
const notificationsTable = (name) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    requirement_id INTEGER REFERENCES requirements(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'task_completed' | 'mention'
    excerpt TEXT, -- start of the comment, for mentions
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (task_id IS NOT NULL OR requirement_id IS NOT NULL)
  );`;

const usersTable = (name) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    google_sub TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('manager', 'leader', 'member')),
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
    avatar TEXT
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

  -- A project's statuses ("trạng thái" in the UI): its board columns. kind (v12) marks the three built-in
  -- ones, whatever they are renamed to; 'done' keeps the completed tick in step (see index.js).
  CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position REAL NOT NULL,
    kind TEXT CHECK (kind IN ('todo', 'doing', 'done'))
  );

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

  -- Files attached to a task or a requirement (v11); the bytes are UPLOAD_DIR/<stored_name>.
  -- A file sent with a comment (v13) also points at that comment and goes with it.
  -- Cascades leave the files behind; sweepUploads() in index.js removes them.
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    requirement_id INTEGER REFERENCES requirements(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    requirement_comment_id INTEGER REFERENCES requirement_comments(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ((task_id IS NULL) != (requirement_id IS NULL))
  );

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

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_attachments_comment ON attachments(comment_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_requirement_comment ON attachments(requirement_comment_id);
  CREATE INDEX IF NOT EXISTS idx_task_channels_channel ON task_channels(channel_id);
`);

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
