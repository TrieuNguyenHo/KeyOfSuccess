import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PRIORITIES, formatDate, formatDateTime, recurrenceLabel } from '../../utils.js';
import { tr } from '../../i18n.js';

const empty = () => tr('(trống)');
const quote = (s) => (s ? `"${s}"` : empty());
const showDate = (s) => (s ? formatDate(s) : empty());
const showPriority = (s) => (s ? PRIORITIES[s] ?? s : empty());
// Rules are stored as JSON since v19; older events hold the Vietnamese wording itself.
const showRule = (s) => (s?.startsWith('{') ? recurrenceLabel(s) : s ?? empty());

// "set / change / clear" wording for a field shown with `show`.
function changed(label, e, show = (v) => v ?? empty()) {
  if (e.from == null) return tr('đặt {label}: {p1}', { label, p1: show(e.to) });
  if (e.to == null) return tr('bỏ {label} ({p1})', { label, p1: show(e.from) });
  return tr('đổi {label}: {p1} → {p2}', { label, p1: show(e.from), p2: show(e.to) });
}

// One history event as a sentence, plus the before / after texts worth opening (descriptions, edited comments).
function describe(e) {
  const of = e.subtask ? ` subtask "${e.subtask}"` : '';
  switch (e.type) {
    case 'created':
      return { text: e.recurring_from ? tr('đã tạo task (bản kế tiếp của task lặp lại)') : tr('đã tạo task') };
    case 'recurred':
      return { text: tr('đã hoàn thành; tạo bản kế tiếp hạn {p0}', { p0: showDate(e.due) }) };
    case 'subtask_added':
      return { text: tr('đã thêm subtask "{subtask}"', { subtask: e.subtask }) };
    case 'subtask_deleted':
      return { text: tr('đã xoá subtask "{subtask}"', { subtask: e.subtask }) };
    case 'comment_added':
      return { text: tr('đã comment{of}: {p1}', { of, p1: quote(e.excerpt) }) };
    case 'comment_edited':
      return { text: tr('đã sửa comment{of}', { of }), before: e.from, after: e.to };
    case 'comment_deleted': {
      const whose = e.author && e.author !== e.user_name ? tr(' của {author}', { author: e.author }) : '';
      const files = e.files ? tr(' (kèm {files} file)', { files: e.files }) : '';
      return { text: tr('đã xoá comment{whose}{of}: {p2}{files}', { whose, of, p2: quote(e.excerpt), files }) };
    }
    case 'file_added':
      return { text: tr('đã đính kèm file "{name}"{p1}{of}', { name: e.name, p1: e.in_comment ? ' trong comment' : '', of }) };
    case 'file_deleted':
      return { text: tr('đã xoá file "{name}"{of}', { name: e.name, of }) };
    case 'field': {
      const prefix = e.subtask ? `subtask "${e.subtask}": ` : '';
      switch (e.field) {
        case 'completed':
          return { text: prefix + (e.to ? tr('đánh dấu hoàn thành') : tr('bỏ đánh dấu hoàn thành')) };
        case 'description':
          return { text: tr('{prefix}đã sửa mô tả', { prefix }), before: e.from ?? '', after: e.to ?? '' };
        case 'title':
          return { text: tr('{prefix}đổi tên: {p1} → {p2}', { prefix, p1: quote(e.from), p2: quote(e.to) }) };
        case 'assignee_id':
          if (e.from == null) return { text: `${prefix}giao cho ${e.to}` };
          if (e.to == null) return { text: tr('{prefix}bỏ người làm ({from})', { prefix, from: e.from }) };
          return { text: tr('{prefix}đổi người làm: {from} → {to}', { prefix, from: e.from, to: e.to }) };
        case 'due_date':
          return { text: prefix + changed(tr('hạn chót'), e, showDate) };
        case 'start_date':
          return { text: prefix + changed(tr('ngày bắt đầu'), e, showDate) };
        case 'priority':
          return { text: prefix + changed(tr('ưu tiên'), e, showPriority) };
        case 'section_id':
          return { text: tr('{prefix}chuyển trạng thái: {p1} → {p2}', { prefix, p1: e.from ?? empty(), p2: e.to ?? empty() }) };
        case 'requirement_id':
          return { text: tr('{prefix}chuyển project: {p1} → {p2}', { prefix, p1: e.from ?? empty(), p2: e.to ?? empty() }) };
        case 'channels':
          return { text: prefix + changed(tr('kênh'), e) };
        case 'recurrence':
          return { text: prefix + (e.to == null ? tr('tắt lặp lại ({from})', { from: showRule(e.from) }) : changed(tr('lặp lại'), e, showRule)) };
        default:
          return { text: tr('{prefix}đổi {field}', { prefix, field: e.field }) };
      }
    }
    default:
      return { text: e.type };
  }
}

function HistoryItem({ event }) {
  const [open, setOpen] = useState(false);
  const { text, before, after } = describe(event);
  const hasDetail = before !== undefined;
  return (
    <li className="history-item">
      <div>
        <b>{event.user_name ?? tr('Người dùng đã xoá')}</b> {text}
        {hasDetail && (
          <button className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? tr('Ẩn') : tr('Xem trước / sau')}
          </button>
        )}
      </div>
      <span className="muted small">{formatDateTime(event.created_at)}</span>
      {open && (
        <div className="history-diff">
          <div>
            <span className="muted small">{tr('Trước')}</span>
            <p>{before || empty()}</p>
          </div>
          <div>
            <span className="muted small">{tr('Sau')}</span>
            <p>{after || empty()}</p>
          </div>
        </div>
      )}
    </li>
  );
}

// The task's history over the last 30 days (subtasks, comments and files included), loaded when opened.
// reloadKey changes whenever the task panel reloads (own edits, live changes), so an open history follows.
export default function TaskHistory({ taskId, reloadKey }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api(`/tasks/${taskId}/history`)
      .then((list) => {
        setEvents(list);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [open, taskId, reloadKey]);

  return (
    <div className="history">
      <button className="link-btn history-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾' : '▸'} {tr('Lịch sử thay đổi (30 ngày)')}
      </button>
      {open && error && <div className="error">{error}</div>}
      {open && !events && !error && <p className="muted small">{tr('Đang tải…')}</p>}
      {open && events?.length === 0 && <p className="muted small">{tr('Chưa có thay đổi nào trong 30 ngày qua.')}</p>}
      {open && events?.length > 0 && (
        <ul className="history-list">
          {events.map((e) => (
            <HistoryItem key={e.id} event={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
