// Weekly reports (lib/reports.js): the list of weeks and one week, within the reader's people.watch scope; the
// overload thresholds, read by any reader and set with users.manage over the whole department.
import express from 'express';
import { db } from '../db.js';
import { badRequest, notFound, requireAllScope, requirePermission } from '../lib/http.js';
import { getThresholds, reportFor, setThresholds } from '../lib/reports.js';

const router = express.Router();

router.get('/reports', requirePermission('people.watch'), (req, res) => {
  res.json(db.prepare('SELECT week_start FROM weekly_reports ORDER BY week_start DESC').all().map((r) => r.week_start));
});

router.get('/reports/:week', requirePermission('people.watch'), (req, res) => {
  const row = db.prepare('SELECT data FROM weekly_reports WHERE week_start = ?').get(req.params.week);
  if (!row) return notFound(res, 'Chưa có báo cáo của tuần này');
  const report = reportFor(req.user, JSON.parse(row.data));
  // The week before, for the comparison of tasks done.
  const before = db
    .prepare('SELECT data FROM weekly_reports WHERE week_start < ? ORDER BY week_start DESC LIMIT 1')
    .get(req.params.week);
  const previous = before && reportFor(req.user, JSON.parse(before.data));
  res.json({
    ...report,
    previous: previous && {
      week_start: previous.week_start,
      all: previous.all?.totals.done ?? null,
      teams: Object.fromEntries(previous.teams.map((t) => [t.id, t.totals.done])),
    },
  });
});

router.get('/report-settings', requirePermission('people.watch'), (req, res) => res.json(getThresholds()));

// Body { overdue, due_soon }: whole numbers from 1 to 99. They apply from the next report.
router.put('/report-settings', requireAllScope('users.manage'), (req, res) => {
  const values = { overdue: Number(req.body?.overdue), due_soon: Number(req.body?.due_soon) };
  if (!Object.values(values).every((n) => Number.isInteger(n) && n >= 1 && n <= 99)) {
    return badRequest(res, 'Ngưỡng phải là số nguyên từ 1 đến 99');
  }
  setThresholds(values);
  res.json(getThresholds());
});

export default router;
