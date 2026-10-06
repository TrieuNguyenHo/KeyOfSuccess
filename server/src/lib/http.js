// Shared error responses and route guards.
import { can } from './permissions.js';

export const badRequest = (res, error) => res.status(400).json({ error });
export const notFound = (res) => res.status(404).json({ error: 'Không tìm thấy' });
export const forbidden = (res, error = 'Bạn không có quyền làm việc này') => res.status(403).json({ error });

// Lets the request through when the user's role holds this permission (any scope).
export const requirePermission = (key) => (req, res, next) => (can(req.user, key) ? next() : forbidden(res));
