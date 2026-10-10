import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { daysBetween, formatDate, isOverdue, shiftDay, todayStr } from '../../utils.js';
import { locale, tr } from '../../i18n.js';

// The project's Timeline (v40): one row per top-level task, its bar from the start date to the due date (a task with
// only one of them is a one-day bar), grouped by requirement, status or assignee. Whoever may edit a task drags its
// bar to move both dates, or an end to change one; on a task without dates, dragging along its row draws them. On
// touch screens a bar is picked up by holding it still (as on the Board and the Calendar); moving at once scrolls.
const ZOOMS = { day: 36, week: 14, month: 4 }; // pixels per day
const HOLD_MS = 350;
const SLOP_PX = 8;
const EDGE_PX = 8; // the grab zone of a bar's ends

export const TIMELINE_GROUPS = ['requirement', 'status', 'assignee'];
const GROUP_LABELS = {
  requirement: () => tr('Project'),
  status: () => tr('Trạng thái'),
  assignee: () => tr('Người làm'),
};
const ZOOM_LABELS = { day: () => tr('Ngày'), week: () => tr('Tuần'), month: () => tr('Tháng') };

// The days a task covers, or null when it has no date.
function spanOf(task) {
  const start = task.start_date ?? task.due_date;
  const end = task.due_date ?? task.start_date;
  return start ? { start, end } : null;
}

const mondayOf = (day) => shiftDay(day, -((new Date(`${day}T00:00`).getDay() + 6) % 7));

// Groups of tasks, in the order of the requirements / statuses / assignee names; dated tasks first, by start date.
function groupTasks(tasks, group, { requirements, sections }) {
  const keyOf = { requirement: (t) => t.requirement_id, status: (t) => t.section_id, assignee: (t) => t.assignee_id ?? 0 }[group];
  let groups;
  if (group === 'requirement') groups = requirements.map((r) => ({ key: r.id, name: r.title }));
  else if (group === 'status') groups = sections.map((s) => ({ key: s.id, name: s.name }));
  else {
    const people = new Map(tasks.filter((t) => t.assignee_id).map((t) => [t.assignee_id, t.assignee_name]));
    groups = [...people]
      .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
      .map(([key, name]) => ({ key, name }))
      .concat({ key: 0, name: tr('Chưa giao') });
  }
  const order = (t) => spanOf(t)?.start ?? '9999';
  return groups
    .map((g) => ({ ...g, tasks: tasks.filter((t) => keyOf(t) === g.key).sort((a, b) => order(a).localeCompare(order(b)) || a.position - b.position) }))
    .filter((g) => g.tasks.length);
}

export default function TimelineView({ tasks, requirements, sections, group, onGroup, canEditTask, onOpen, onSetDates }) {
  const [zoom, setZoom] = useState('week');
  const [drag, setDrag] = useState(null); // { id, start, end } while a bar moves
  const scrollRef = useRef(null);
  const px = ZOOMS[zoom];
  const today = todayStr();

  // The range: every date of the tasks and today, from the Monday before (a week of margin) to three weeks after.
  const days = tasks.flatMap((t) => [t.start_date, t.due_date]).filter(Boolean).concat(today).sort();
  const from = mondayOf(shiftDay(days[0], -7));
  const to = shiftDay(days.at(-1), 21);
  const count = daysBetween(from, to) + 1;
  const indexOf = (day) => daysBetween(from, day);
  const dayAt = (index) => shiftDay(from, index);

  // Opens on today (and back to it when the scale changes).
  const scrollToToday = () => {
    const box = scrollRef.current;
    if (box) box.scrollLeft = Math.max(0, indexOf(today) * px - box.clientWidth / 3);
  };
  useLayoutEffect(scrollToToday, [zoom]);

  // The months along the top, and the days (day scale) or Mondays (week scale) below them.
  const months = [];
  for (let i = 0; i < count; i++) {
    const day = dayAt(i);
    if (i === 0 || day.endsWith('-01')) months.push({ index: i, label: new Date(`${day}T00:00`).toLocaleDateString(locale(), { month: 'short', year: 'numeric' }) });
  }
  const ticks = [];
  if (zoom !== 'month') {
    for (let i = 0; i < count; i += zoom === 'day' ? 1 : 7) ticks.push({ index: i, label: zoom === 'day' ? dayAt(i).slice(8) : formatDate(dayAt(i)).slice(0, 5) });
  }

  const groups = groupTasks(tasks, group, { requirements, sections });

  return (
    <div className="timeline-wrap">
      <div className="timeline-tools">
        <div className="tabs" role="group" aria-label={tr('Nhóm theo')}>
          {TIMELINE_GROUPS.map((g) => (
            <button key={g} className={group === g ? 'active' : ''} onClick={() => onGroup(g)}>
              {GROUP_LABELS[g]()}
            </button>
          ))}
        </div>
        <div className="tabs" role="group" aria-label={tr('Thang thời gian')}>
          {Object.keys(ZOOMS).map((z) => (
            <button key={z} className={zoom === z ? 'active' : ''} onClick={() => setZoom(z)}>
              {ZOOM_LABELS[z]()}
            </button>
          ))}
        </div>
        <button className="btn" onClick={scrollToToday}>
          {tr('Hôm nay')}
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="muted timeline-empty">{tr('Không có task nào khớp bộ lọc.')}</p>
      ) : (
        <div className="timeline" ref={scrollRef} data-touch-scroll style={{ '--px': `${px}px` }}>
          <div className={`timeline-grid zoom-${zoom}`} style={{ '--days': count }}>
            <div className="tl-row tl-head">
              <div className="tl-label">Task</div>
              <div className="tl-track">
                {months.map((m) => (
                  <span key={m.index} className="tl-month" style={{ left: m.index * px }}>
                    {m.label}
                  </span>
                ))}
                {ticks.map((t) => (
                  <span key={t.index} className="tl-tick" style={{ left: t.index * px, width: zoom === 'day' ? px : undefined }}>
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
            <span className="tl-today" style={{ left: `calc(var(--tl-label) + ${indexOf(today) * px + px / 2}px)` }} aria-hidden="true" />
            {groups.map((g) => (
              <div key={g.key} role="rowgroup">
                <div className="tl-row tl-group">
                  <div className="tl-label">
                    <b className="ellipsis">{g.name}</b> <span className="muted small">{g.tasks.length}</span>
                  </div>
                  <div className="tl-track" />
                </div>
                {g.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    px={px}
                    indexOf={indexOf}
                    dayAt={dayAt}
                    editable={canEditTask(task)}
                    preview={drag?.id === task.id ? drag : null}
                    setDrag={setDrag}
                    onOpen={onOpen}
                    onSetDates={onSetDates}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, px, indexOf, dayAt, editable, preview, setDrag, onOpen, onSetDates }) {
  const span = preview ?? spanOf(task);
  const overdue = isOverdue(task);
  const trackRef = useRef(null);
  const cleanupRef = useRef(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  // A drag in `mode` 'move' | 'start' | 'end' (a bar) or 'draw' (an undated task's row), from a pointerdown.
  function begin(e, mode) {
    if (e.button > 0) return;
    e.stopPropagation();
    const touch = e.pointerType === 'touch';
    const box = trackRef.current.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const dayFromX = (x) => Math.max(0, Math.floor((x - box.left) / px));
    const original = spanOf(task);
    const anchor = dayFromX(x0);
    let active = !touch;
    let moved = false;
    let current = null;

    const spanFor = (x) => {
      if (mode === 'draw') {
        const [a, b] = [anchor, dayFromX(x)].sort((p, q) => p - q);
        return { start: dayAt(a), end: dayAt(b) };
      }
      const shift = Math.round((x - x0) / px);
      const start = mode === 'end' ? original.start : shiftDay(original.start, shift);
      const end = mode === 'start' ? original.end : shiftDay(original.end, shift);
      // An end never passes the other one.
      if (start > end) return mode === 'start' ? { start: end, end } : { start, end: start };
      return { start, end };
    };
    const activate = () => {
      active = true;
      navigator.vibrate?.(10);
      current = spanFor(x0);
      setDrag({ id: task.id, ...current });
    };
    const timer = touch && setTimeout(activate, HOLD_MS);
    // While a finger drags, the page must not scroll.
    const stopScroll = (ev) => active && ev.preventDefault();

    const move = (ev) => {
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > SLOP_PX) finish(null);
        return;
      }
      if (Math.abs(ev.clientX - x0) > 3) moved = true;
      current = spanFor(ev.clientX);
      setDrag({ id: task.id, ...current });
    };
    const finish = (ev) => {
      cleanupRef.current?.();
      setDrag(null);
      if (!ev) return;
      // A click, or a quick tap before the hold picked the bar up, opens the task.
      if (!active || !moved) {
        if (mode !== 'draw') onOpen(task.id);
        return;
      }
      const result = current ?? spanFor(ev.clientX);
      if (mode === 'draw') {
        onSetDates(task, result.start === result.end ? { due_date: result.end } : { start_date: result.start, due_date: result.end });
        return;
      }
      if (original.start === result.start && original.end === result.end) return;
      // A task with one date keeps having one when moved; resizing it gives it both.
      const dates =
        task.start_date && task.due_date
          ? { start_date: result.start, due_date: result.end }
          : mode === 'move'
            ? task.due_date
              ? { due_date: result.end }
              : { start_date: result.start }
            : { start_date: result.start, due_date: result.end };
      onSetDates(task, dates);
    };
    const end = (ev) => finish(ev);
    const cancel = () => finish(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    document.addEventListener('touchmove', stopScroll, { passive: false });
    cleanupRef.current = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      document.removeEventListener('touchmove', stopScroll);
      cleanupRef.current = null;
    };
  }

  const dates = span && (span.start === span.end ? formatDate(span.end) : `${formatDate(span.start)} → ${formatDate(span.end)}`);
  const state = task.completed ? 'done' : overdue ? 'overdue' : '';
  return (
    <div className="tl-row">
      <button className={`tl-label tl-task ${task.completed ? 'done' : ''}`} onClick={() => onOpen(task.id)} title={task.title}>
        {overdue && (
          <span className="tl-warn" aria-label={tr('Quá hạn')}>
            ⚠
          </span>
        )}
        <span className="ellipsis">{task.title}</span>
      </button>
      <div
        className={`tl-track ${!span && editable ? 'drawable' : ''}`}
        ref={trackRef}
        onPointerDown={!span && editable ? (e) => begin(e, 'draw') : undefined}
        title={!span && editable ? tr('Kéo trên dòng này để đặt ngày') : undefined}
      >
        {span && (
          <div
            className={`tl-bar ${state} ${editable ? 'editable' : ''} ${preview ? 'dragging' : ''}`}
            style={{ left: indexOf(span.start) * px, width: (indexOf(span.end) - indexOf(span.start) + 1) * px }}
            title={`${task.title} · ${dates}`}
            onPointerDown={
              editable
                ? (e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    const edge = box.width > EDGE_PX * 3 ? EDGE_PX : 0;
                    begin(e, e.clientX < box.left + edge ? 'start' : e.clientX > box.right - edge ? 'end' : 'move');
                  }
                : undefined
            }
            onClick={editable ? undefined : () => onOpen(task.id)}
          >
            {editable && <span className="tl-handle start" aria-hidden="true" />}
            {editable && <span className="tl-handle end" aria-hidden="true" />}
          </div>
        )}
        {preview && (
          <span className="tl-drag-dates" style={{ left: (indexOf(preview.end) + 1) * px + 6 }}>
            {dates}
          </span>
        )}
      </div>
    </div>
  );
}
