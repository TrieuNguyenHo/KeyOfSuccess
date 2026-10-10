import { FREQ_LABELS, WEEKDAYS, todayStr } from '../../utils.js';
import { Hint, TeamPills } from '../../components/Controls.jsx';
import { tr } from '../../i18n.js';

// How recurring tasks work, behind the "?" next to the repeat picker.
export function RecurrenceHint() {
  return (
    <Hint label={tr('Task lặp lại dùng thế nào?')}>
      <b>{tr('Task lặp lại dùng thế nào?')}</b>
      <ul>
        <li>
          {tr('Chọn chu kỳ: hằng ngày (T2–T6), hằng tuần hoặc mỗi 2 tuần (chọn các thứ), hằng tháng (chọn ngày; tháng ngắn hơn thì lấy ngày cuối tháng).')}
        </li>
        <li>
          {tr('Khi task được đánh dấu xong (tick hoặc kéo vào Completed), app tự tạo')} <b>{tr('bản kế tiếp')}</b> {tr('ở trạng thái Planned, hạn chót là lần kế tiếp theo chu kỳ.')}
        </li>
        <li>
          {tr('Bản mới chép tên, mô tả, người làm, dự án, kênh, ưu tiên và subtask (chưa tick). Comments và file không được chép.')}
        </li>
        <li>{tr('Xong trễ thì bản mới lấy lần gần nhất từ hôm nay, không tạo task quá hạn sẵn.')}</li>
        <li>{tr('Task hằng ngày xong không báo cho Leader / Manager.')}</li>
        <li>
          {tr('Muốn dừng: chọn')} <b>{tr('Không lặp')}</b> {tr('trên bản đang mở. Task lặp có dấu ↻ cạnh hạn chót.')}
        </li>
      </ul>
    </Hint>
  );
}

// Repeat rule picker. A new weekly or monthly rule starts from the task's due date (else today); the server
// gives a task without a due date the rule's first day.
export default function RecurrenceField({ task, onChange }) {
  const rule = task.recurrence ? JSON.parse(task.recurrence) : null;
  const base = new Date(`${task.due_date ?? todayStr()}T00:00`);
  const startRule = (freq) => {
    if (!freq) return null;
    if (freq === 'daily') return { freq };
    if (freq === 'monthly') return { freq, day: base.getDate() };
    return { freq, days: rule?.days ?? [((base.getDay() + 6) % 7) + 1] };
  };
  return (
    <span className="recurrence-field">
      <span className="recurrence-row">
        <select value={rule?.freq ?? ''} onChange={(e) => onChange(startRule(e.target.value))} aria-label={tr('Lặp lại')}>
          <option value="">{tr('Không lặp')}</option>
          {Object.entries(FREQ_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <RecurrenceHint />
      </span>
      {(rule?.freq === 'weekly' || rule?.freq === 'biweekly') && (
        <TeamPills
          teams={WEEKDAYS}
          selected={rule.days}
          onChange={(days) => days.length > 0 && onChange({ ...rule, days })}
          label={tr('Các thứ trong tuần')}
          noneLabel={null}
          itemLabel={(d) => d.name}
        />
      )}
      {rule?.freq === 'monthly' && (
        <select value={rule.day} onChange={(e) => onChange({ ...rule, day: Number(e.target.value) })} aria-label={tr('Ngày trong tháng')}>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1 > 28 ? tr('Ngày {day} (tháng ngắn hơn: ngày cuối tháng)', { day: i + 1 }) : tr('Ngày {day}', { day: i + 1 })}
            </option>
          ))}
        </select>
      )}
      {rule && <span className="muted small">{tr('Đánh dấu xong thì app tạo bản kế tiếp.')}</span>}
    </span>
  );
}
