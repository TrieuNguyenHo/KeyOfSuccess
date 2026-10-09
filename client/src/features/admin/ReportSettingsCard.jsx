import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { tr } from '../../i18n.js';

// The weekly report's overload thresholds (v41), for users.manage over the whole department: someone is overloaded
// with at least `overdue` overdue tasks or at least `due_soon` open tasks due in the next 7 days. They apply from the
// next report (8:00 on Monday); past reports keep theirs.
export default function ReportSettingsCard() {
  const [saved, setSaved] = useState(null);
  const [values, setValues] = useState({ overdue: '', due_soon: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/report-settings').then((t) => {
      setSaved(t);
      setValues({ overdue: String(t.overdue), due_soon: String(t.due_soon) });
    });
  }, []);
  if (!saved) return null;
  const changed = Number(values.overdue) !== saved.overdue || Number(values.due_soon) !== saved.due_soon;

  async function save(e) {
    e.preventDefault();
    try {
      const t = await api('/report-settings', { method: 'PUT', body: { overdue: Number(values.overdue), due_soon: Number(values.due_soon) } });
      setSaved(t);
      setMessage(tr('Đã lưu. Áp dụng từ báo cáo tuần tới.'));
    } catch (err) {
      setMessage(err.message);
    }
  }

  const field = (key, label) => (
    <label className="form-field report-threshold">
      <span>{label}</span>
      <input
        type="number"
        min="1"
        max="99"
        value={values[key]}
        onChange={(e) => {
          setValues((v) => ({ ...v, [key]: e.target.value }));
          setMessage('');
        }}
      />
    </label>
  );

  return (
    <section className="admin-card">
      <div className="section-header">
        <h2>{tr('Báo cáo tuần')}</h2>
      </div>
      <p className="muted card-sub">
        {tr('Báo cáo được chốt lúc 8:00 sáng thứ Hai cho tuần trước và gửi tới Leader, Manager, Director. Một người bị tính là quá tải khi đạt một trong hai ngưỡng dưới đây (áp dụng từ báo cáo kế tiếp).')}
      </p>
      <form className="report-thresholds" onSubmit={save}>
        {field('overdue', tr('Task quá hạn'))}
        {field('due_soon', tr('Task đến hạn trong 7 ngày tới'))}
        <button className="btn primary" disabled={!changed}>
          {tr('Lưu')}
        </button>
      </form>
      {message && <p className="muted small">{message}</p>}
    </section>
  );
}
