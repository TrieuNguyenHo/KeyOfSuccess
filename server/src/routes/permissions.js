// Roles (v24, edited by root since v27) and what each may do. Everyone reads the roles (names, levels and team rules,
// for role and team pickers); only root changes them and reads or changes the permissions.
import express from 'express';
import { randomBytes } from 'node:crypto';
import { db, transaction } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { PERMISSIONS, copyPermissions, findPermission, findRole, resetPermissions, roleExists } from '../lib/permissions.js';
import { isRoot } from '../lib/roles.js';

const router = express.Router();

const rootOnly = (req, res, next) => (isRoot(req.user) ? next() : forbidden(res));
// Highest level first. user_count (accounts holding the role, any status) is for root, who deletes roles.
const allRoles = (withCount = false) =>
  db
    .prepare(
      `SELECT r.key, r.name, r.level, r.builtin, r.min_teams, r.max_teams
         ${withCount ? ', (SELECT COUNT(*) FROM users u WHERE u.role = r.key) AS user_count' : ''}
       FROM roles r ORDER BY r.level DESC, r.name`
    )
    .all();

router.get('/roles', (req, res) => res.json(allRoles(isRoot(req.user))));

// ---------- Roles (root) ----------
// A role root adds starts as a copy of another (its permissions and team rules), at a level root picks. Built-in roles
// (Member, Leader, Manager, Director) are renamed and get other team rules, but keep their level and are never
// deleted: sign-up, invitations by Leaders and MANAGER_EMAILS / DIRECTOR_EMAILS rely on them.
const MAX_LEVEL = 99;
const nameTaken = (name, exceptKey = '') =>
  Boolean(db.prepare('SELECT 1 FROM roles WHERE lower(name) = lower(?) AND key != ?').get(name, exceptKey));

// Reads any of { name, level, min_teams, max_teams } from a body: { values } with those it holds, or { error }.
function readRole(body, current) {
  const values = {};
  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) return { error: 'Cần nhập tên vai trò' };
    if (name.length > 40) return { error: 'Tên vai trò tối đa 40 ký tự' };
    values.name = name;
  }
  if (body.level !== undefined) {
    const level = Number(body.level);
    if (current?.builtin && level !== current.level) return { error: 'Không đổi được cấp bậc của vai trò có sẵn' };
    if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) return { error: `Cấp bậc phải từ 1 đến ${MAX_LEVEL}` };
    values.level = level;
  }
  if (body.min_teams !== undefined) {
    if (![0, 1].includes(body.min_teams)) return { error: 'Số team không hợp lệ' };
    values.min_teams = body.min_teams;
  }
  if (body.max_teams !== undefined) {
    if (![1, null].includes(body.max_teams)) return { error: 'Số team không hợp lệ' };
    values.max_teams = body.max_teams;
  }
  return { values };
}

// How many holders of the role have teams that break these rules (they must be moved first).
const breakingRules = (key, { min_teams, max_teams }) =>
  db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT (SELECT COUNT(*) FROM user_teams ut WHERE ut.user_id = u.id) AS teams FROM users u WHERE u.role = ?
       ) WHERE teams < ? OR (? IS NOT NULL AND teams > ?)`
    )
    .get(key, min_teams, max_teams, max_teams).n;

// Body { name, level, copy_from }: the new role holds copy_from's permissions and team rules.
router.post('/admin/roles', rootOnly, (req, res) => {
  const body = req.body ?? {};
  const source = findRole(body.copy_from);
  if (!source) return badRequest(res, 'Chọn vai trò để sao chép quyền');
  const { values, error } = readRole({ name: body.name ?? '', level: body.level ?? source.level });
  if (error) return badRequest(res, error);
  if (nameTaken(values.name)) return conflict(res, 'Tên vai trò đã tồn tại');
  const key = `role-${randomBytes(4).toString('hex')}`;
  transaction(() => {
    db.prepare('INSERT INTO roles (key, name, level, builtin, min_teams, max_teams) VALUES (?, ?, ?, 0, ?, ?)').run(
      key,
      values.name,
      values.level,
      source.min_teams,
      source.max_teams
    );
    copyPermissions(source.key, key);
  });
  res.status(201).json(allRoles(true));
});

// Body: any of { name, level (not for built-in roles), min_teams, max_teams }.
router.patch('/admin/roles/:key', rootOnly, (req, res) => {
  const role = findRole(req.params.key);
  if (!role) return notFound(res);
  const { values, error } = readRole(req.body ?? {}, role);
  if (error) return badRequest(res, error);
  if (values.name && nameTaken(values.name, role.key)) return conflict(res, 'Tên vai trò đã tồn tại');
  const next = { ...role, ...values };
  const n = next.min_teams !== role.min_teams || next.max_teams !== role.max_teams ? breakingRules(role.key, next) : 0;
  if (n > 0) return badRequest(res, `Có ${n} người giữ vai trò này không đúng số team mới; hãy đổi team của họ trước`);
  db.prepare('UPDATE roles SET name = ?, level = ?, min_teams = ?, max_teams = ? WHERE key = ?').run(
    next.name,
    next.level,
    next.min_teams,
    next.max_teams,
    role.key
  );
  res.json(allRoles(true));
});

// Only a role root added, and only once nobody holds it (pending and locked accounts included).
router.delete('/admin/roles/:key', rootOnly, (req, res) => {
  const role = findRole(req.params.key);
  if (!role) return notFound(res);
  if (role.builtin) return badRequest(res, 'Không xoá được vai trò có sẵn');
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?').get(role.key);
  if (n > 0) return badRequest(res, `Vai trò còn ${n} người giữ; hãy đổi vai trò của họ trước`);
  db.prepare('DELETE FROM roles WHERE key = ?').run(role.key); // its permissions go with it (ON DELETE CASCADE)
  res.json(allRoles(true));
});

// ---------- Permissions (root) ----------

// { roles, permissions: [{ key, scopes }], grants: { role: { permission: scope } } }
function matrix() {
  const grants = {};
  for (const row of db.prepare('SELECT role, permission, scope FROM role_permissions').all()) {
    (grants[row.role] ??= {})[row.permission] = row.scope;
  }
  return { roles: allRoles(), permissions: PERMISSIONS.map(({ key, scopes }) => ({ key, scopes })), grants };
}

router.get('/admin/permissions', rootOnly, (req, res) => res.json(matrix()));

// Body { role, permission, scope }. Takes effect on the next request of everyone holding the role.
router.patch('/admin/permissions', rootOnly, (req, res) => {
  const { role, permission, scope } = req.body ?? {};
  const known = findPermission(permission);
  if (!roleExists(role) || !known) return badRequest(res, 'Vai trò hoặc quyền không tồn tại');
  if (!known.scopes.includes(scope)) return badRequest(res, 'Phạm vi không hợp lệ cho quyền này');
  db.prepare('UPDATE role_permissions SET scope = ? WHERE role = ? AND permission = ?').run(scope, role, permission);
  res.json(matrix());
});

// Body { role }: puts a built-in role back on the default permissions (a role root added has none).
router.post('/admin/permissions/reset', rootOnly, (req, res) => {
  const role = findRole(req.body?.role);
  if (!role) return badRequest(res, 'Vai trò hoặc quyền không tồn tại');
  if (!role.builtin) return badRequest(res, 'Vai trò tự tạo không có quyền mặc định');
  resetPermissions(role.key);
  res.json(matrix());
});

export default router;
