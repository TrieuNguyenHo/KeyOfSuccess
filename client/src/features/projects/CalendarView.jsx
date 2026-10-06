import { useState } from 'react';
import { coarsePointer, useTouchDrag } from '../../touchDrag.js';
import { WEEKDAYS, isOverdue, toDateStr, todayStr } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { tr } from '../../i18n.js';

// The six Monday-first weeks that show the month of `first` (a Date on day 1).
function monthGrid(first) {
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// Month calendar of tasks by due date. Tasks the user may edit can be dragged to another day, which sets
// their due date (onMoveDate). showProject puts the project color on each task, for cross-project lists.
export default function CalendarView({ tasks, canEditTask, onOpen, onMoveDate, showProject = false }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragId, setDragId] = useState(null);
  const [overDay, setOverDay] = useState(null);
  // Finger drag (iPad): the day under the finger becomes the due date.
  const touch = useTouchDrag((taskId, target) => {
    const day = target?.closest('[data-day]')?.dataset.day;
    const task = tasks.find((t) => t.id === taskId);
    if (day && task && task.due_date !== day) onMoveDate(task, day);
  });
  const touchDay = touch.dragId != null ? touch.overElement?.closest('[data-day]')?.dataset.day : null;
  const coarse = coarsePointer();

  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const today = todayStr();
  const byDay = new Map();
  for (const t of tasks) {
    if (!t.due_date) continue;
    if (!byDay.has(t.due_date)) byDay.set(t.due_date, []);
    byDay.get(t.due_date).push(t);
  }
  const undated = tasks.filter((t) => !t.due_date && !t.completed).length;

  const drop = (day) => (e) => {
    e.preventDefault();
    const task = tasks.find((t) => t.id === dragId);
    if (task && task.due_date !== day) onMoveDate(task, day);
    setDragId(null);
    setOverDay(null);
  };

  return (
    <div className="calendar" data-touch-scroll>
      <div className="calendar-head">
        <h2>
          {tr('Tháng {month}, {year}', {
            month: month.getMonth() + 1,
            year: month.getFullYear(),
            name: month.toLocaleDateString('en-GB', { month: 'long' }),
          })}
        </h2>
        <span className="grow" />
        <button className="btn small" onClick={() => shift(-1)} aria-label={tr('Tháng trước')}>
          ‹
        </button>
        <button className="btn small" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
          {tr('Hôm nay')}
        </button>
        <button className="btn small" onClick={() => shift(1)} aria-label={tr('Tháng sau')}>
          ›
        </button>
      </div>

      <div className="calendar-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <div key={d.id} className="calendar-weekday">
            {d.name}
          </div>
        ))}
        {monthGrid(month).map((date) => {
          const day = toDateStr(date);
          const dayTasks = byDay.get(day) ?? [];
          const classes = [
            'calendar-day',
            date.getMonth() !== month.getMonth() && 'other-month',
            day === today && 'today',
            (overDay === day || touchDay === day) && 'drag-over',
          ];
          return (
            <div
              key={day}
              data-day={day}
              className={classes.filter(Boolean).join(' ')}
              onDragOver={(e) => {
                if (dragId == null) return;
                e.preventDefault();
                setOverDay(day);
              }}
              onDragLeave={() => setOverDay((d) => (d === day ? null : d))}
              onDrop={drop(day)}
            >
              <span className="calendar-date">{date.getDate()}</span>
              {dayTasks.map((t) => (
                <button
                  key={t.id}
                  className={`calendar-task ${t.completed ? 'done' : ''} ${isOverdue(t) ? 'overdue' : ''} ${touch.dragId === t.id ? 'dragging' : ''}`}
                  draggable={canEditTask(t) && !coarse}
                  {...touch.bind(t.id, canEditTask(t))}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(t.id));
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(t.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverDay(null);
                  }}
                  onClick={() => onOpen(t.id)}
                  title={[t.title, showProject && t.project_name, t.channels?.length && tr('Kênh: {p0}', { p0: t.channels.map((c) => c.name).join(', ') })]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  {showProject && <span className="dot" style={{ background: t.project_color }} />}
                  {isOverdue(t) && <span aria-label={tr('Quá hạn')}>⚠</span>}
                  {t.completed ? <span aria-label={tr('Đã xong')}>✓</span> : null}
                  <span className="ellipsis grow">{t.title}</span>
                  {t.assignee_name && <Avatar name={t.assignee_name} userId={t.assignee_id} small />}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted small calendar-note">
        {undated > 0 && tr('{undated} task chưa xong không có hạn chót nên không hiện trên lịch. ', { undated })}
        {coarse
          ? tr('Giữ ngón tay trên task rồi kéo sang ngày khác để đổi hạn chót (task bạn được sửa).')
          : tr('Kéo task sang ngày khác để đổi hạn chót (task bạn được sửa).')}
      </p>
    </div>
  );
}
