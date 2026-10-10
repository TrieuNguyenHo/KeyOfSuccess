import { useState } from 'react';
import { tr } from '../../i18n.js';

// The three pie charts at the top of a report (2026-10-10): the tasks worked on in the range (created by its last
// day, not done before its first) by activity or by project (the switch), by priority and by status on the last day.
// Built from `breakdown` (breakdownFor() on the server). Six slices at most, the rest folded into "Khác"; the legend
// beside each chart gives every slice's count and share, so nothing is read from color alone.

const MAX_SLICES = 6;
const CATEGORY = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'];
const OTHER = 'var(--neutral-mark)';
// A status keeps its color whatever else is shown: the four fixed ones take the first four hues.
const STATUS_COLOR = { todo: 0, doing: 1, done: 2, pending: 3 };

// The largest MAX_SLICES items, then one "Khác" slice listing what it holds.
function fold(items, colorOf) {
  const shown = items.slice(0, items.length > MAX_SLICES ? MAX_SLICES - 1 : MAX_SLICES);
  const rest = items.slice(shown.length);
  const slices = shown.map((item, i) => ({ ...item, color: colorOf(item, i) }));
  if (rest.length) {
    slices.push({
      key: 'other',
      name: tr('Khác ({n})', { n: rest.length }),
      count: rest.reduce((n, x) => n + x.count, 0),
      color: OTHER,
      held: rest.map((x) => x.name),
    });
  }
  return slices;
}

const point = (r, angle) => [80 + r * Math.sin(angle), 80 - r * Math.cos(angle)];
// A ring segment from angle a to b (radians, clockwise from 12 o'clock).
function arc(a, b, outer = 76, inner = 48) {
  const large = b - a > Math.PI ? 1 : 0;
  const [x1, y1] = point(outer, a);
  const [x2, y2] = point(outer, b);
  const [x3, y3] = point(inner, b);
  const [x4, y4] = point(inner, a);
  return `M${x1} ${y1}A${outer} ${outer} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${inner} ${inner} 0 ${large} 0 ${x4} ${y4}Z`;
}

const percent = (count, total) => `${Math.round((count / total) * 100)}%`;

function Pie({ title, slices }) {
  const [active, setActive] = useState(null);
  const [tip, setTip] = useState(null);
  const total = slices.reduce((n, s) => n + s.count, 0);
  const shown = slices.filter((s) => s.count > 0);
  let angle = 0;
  const segments = shown.map((s) => {
    const start = angle;
    angle += (s.count / total) * 2 * Math.PI;
    return { ...s, start, end: angle };
  });
  const hover = (s, e) => {
    setActive(s?.key ?? null);
    if (!s || !e) return setTip(null);
    const box = e.currentTarget.closest('.report-pie').getBoundingClientRect();
    const x = e.clientX - box.left;
    // Past the middle of the chart the tip opens to the left, so it stays inside the card.
    setTip({ slice: s, x, y: e.clientY - box.top, left: x > box.width / 2 });
  };

  return (
    <div className="report-pie">
      <h3>{title}</h3>
      {total === 0 ? (
        <p className="muted small">{tr('Không có task nào trong kỳ.')}</p>
      ) : (
        <div className="report-pie-body">
          <svg viewBox="0 0 160 160" role="img" aria-label={title} onMouseLeave={() => hover(null)}>
            {segments.length === 1 ? (
              <circle cx="80" cy="80" r="62" fill="none" stroke={segments[0].color} strokeWidth="28"
                onMouseMove={(e) => hover(segments[0], e)} />
            ) : (
              segments.map((s) => (
                <path key={s.key} d={arc(s.start, s.end)} fill={s.color}
                  className={active && active !== s.key ? 'dim' : ''} onMouseMove={(e) => hover(s, e)} />
              ))
            )}
            <text x="80" y="78" textAnchor="middle" className="report-pie-total">{total}</text>
            <text x="80" y="96" textAnchor="middle" className="report-pie-unit">task</text>
          </svg>
          <ul className="report-pie-legend">
            {slices.map((s) => (
              <li key={s.key} className={active === s.key ? 'active' : ''} onMouseEnter={() => setActive(s.key)} onMouseLeave={() => setActive(null)}
                title={s.held ? s.held.join(', ') : s.sub ? `${s.name} · ${s.sub}` : s.name}>
                <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
                <span className="ellipsis grow">
                  {s.name}
                  {s.sub && <span className="muted"> · {s.sub}</span>}
                </span>
                <span className="num">{s.count}</span>
                <span className="num muted">{percent(s.count, total)}</span>
              </li>
            ))}
          </ul>
          {tip && (
            <div className="report-pie-tip" style={{ top: tip.y + 12, ...(tip.left ? { right: `calc(100% - ${tip.x - 12}px)` } : { left: tip.x + 12 }) }} role="status">
              <b>{tip.slice.name}</b>
              {tip.slice.sub && <span className="muted"> · {tip.slice.sub}</span>}
              <div>
                {tr('{count} task · {share}', { count: tip.slice.count, share: percent(tip.slice.count, total) })}
              </div>
              {tip.slice.held && <div className="muted small">{tip.slice.held.slice(0, 8).join(', ')}{tip.slice.held.length > 8 ? '…' : ''}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportCharts({ breakdown }) {
  const [by, setBy] = useState('activities');
  const groups =
    by === 'activities'
      ? breakdown.activities.map((a) => ({ key: `a${a.id}`, name: a.name, count: a.count }))
      : breakdown.projects.map((p) => ({ key: `p${p.id}`, name: p.name, sub: p.activity, count: p.count }));
  const priorities = [
    { key: 'high', name: tr('Cao'), count: breakdown.priorities.high, color: 'var(--prio-high)' },
    { key: 'medium', name: tr('Trung bình'), count: breakdown.priorities.medium, color: 'var(--prio-medium)' },
    { key: 'low', name: tr('Thấp'), count: breakdown.priorities.low, color: 'var(--prio-low)' },
    { key: 'none', name: tr('Chưa đặt'), count: breakdown.priorities.none, color: OTHER },
  ].filter((p) => p.count > 0);
  // Added statuses take the hues after the fixed four, in order of size.
  let added = 4;
  const statuses = fold(breakdown.statuses, (s) => CATEGORY[STATUS_COLOR[s.key] ?? added++] ?? OTHER);

  return (
    <section className="admin-card report-charts">
      <div className="section-header">
        <h2>{tr('Task trong kỳ')}</h2>
        <div className="tabs" role="group" aria-label={tr('Chia task theo')}>
          <button className={by === 'activities' ? 'active' : ''} onClick={() => setBy('activities')}>
            {tr('Hoạt động')}
          </button>
          <button className={by === 'projects' ? 'active' : ''} onClick={() => setBy('projects')}>
            {tr('Dự án')}
          </button>
        </div>
      </div>
      <p className="muted small">{tr('Task có làm trong kỳ: tạo trước ngày cuối kỳ và chưa xong trước ngày đầu kỳ. Trạng thái tính tại ngày cuối kỳ.')}</p>
      <div className="report-pies">
        <Pie title={by === 'activities' ? tr('Theo hoạt động') : tr('Theo dự án')} slices={fold(groups, (x, i) => CATEGORY[i])} />
        <Pie title={tr('Theo độ ưu tiên')} slices={priorities} />
        <Pie title={tr('Theo trạng thái')} slices={statuses} />
      </div>
    </section>
  );
}
