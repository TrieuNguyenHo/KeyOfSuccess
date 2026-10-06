// Roles and what each may do (v24). Everyone reads the roles (names and levels, for role pickers); only root reads
// and changes the permissions.
import express from 'express';
import { db } from '../db.js';
import { badRequest, forbidden } from '../lib/http.js';
import { PERMISSIONS, findPermission, resetPermissions, roleExists } from '../lib/permissions.js';
import { isRoot } from '../lib/roles.js';

const router = express.Router();

const rootOnly = (req, res, next) => (isRoot(req.user) ? next() : forbidden(res));
const allRoles = () => db.prepare('SELECT key, name, level FROM roles ORDER BY level DESC').all();

router.get('/roles', (req, res) => res.json(allRoles()));

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

// Body { role }: puts the role back on the default permissions.
router.post('/admin/permissions/reset', rootOnly, (req, res) => {
  if (!roleExists(req.body?.role)) return badRequest(res, 'Vai trò hoặc quyền không tồn tại');
  resetPermissions(req.body.role);
  res.json(matrix());
});

export default router;
