import { tr } from '../../i18n.js';

// A requirement's progress: its top-level tasks done out of all.
export default function RequirementProgress({ done, total }) {
  return (
    <span className="req-progress" title={tr('{done}/{total} task đã xong', { done, total })}>
      <span className="meter">
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </span>
      <span className="muted small">
        {tr('{done}/{total} task', { done, total })}
      </span>
    </span>
  );
}
