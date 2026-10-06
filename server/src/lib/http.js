// Shared error responses and route guards.

export const badRequest = (res, error) => res.status(400).json({ error });
export const notFound = (res) => res.status(404).json({ error: 'Không tìm thấy' });
export const forbidden = (res, error = 'Bạn không có quyền làm việc này') => res.status(403).json({ error });

export const managerOnly = (req, res, next) =>
  req.user.role === 'manager' ? next() : forbidden(res, 'Chỉ Manager mới làm được việc này');
