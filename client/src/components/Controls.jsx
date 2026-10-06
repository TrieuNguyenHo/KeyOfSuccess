// Form controls shared by several screens.
import { tr } from '../i18n.js';

// "?" button that opens a short help note. A <details>, so it works by tap on iPad and closes on a click outside
// or Escape (see Workspace).
export function Hint({ label, children }) {
  return (
    <details className="hint">
      <summary className="hint-btn" aria-label={label} title={label}>
        ?
      </summary>
      <div className="hint-panel" role="note">
        {children}
      </div>
    </details>
  );
}

// Search field from component_styles/search_box: a magnifier that opens on focus and stays open
// while it holds text (required + non-blank pattern makes it :valid). A surrounding form needs noValidate.
export function SearchBox({ value, onChange, placeholder, label, wide = false }) {
  return (
    <span className={`search-box${wide ? ' wide' : ''}`}>
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        pattern=".*\S.*"
        required
        value={value}
        onChange={onChange}
      />
      <span className="search-caret" aria-hidden="true" />
    </span>
  );
}

export const teamsLabel = (teams) =>
  teams.length ? teams.map((t) => `Team ${t.name}`).join(', ') : tr('Chung toàn phòng');

// Selection pills for a project's owning teams (multi-select; style adapted from the Selection Pills
// demo in component_styles/select_box). Real checkboxes stay underneath for keyboard and screen readers.
// The first pill (noneLabel, "Chung toàn phòng" by default) stands for "no team" and clears the selection;
// noneLabel={null} hides it when at least one team is required. allLabel adds a first pill that selects every team.
// itemLabel names each pill (also used for the task's channels).
export function TeamPills({
  teams,
  selected,
  onChange,
  label = tr('Team phụ trách'),
  noneLabel = tr('Chung toàn phòng'),
  allLabel,
  itemLabel = (t) => `Team ${t.name}`,
}) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const pill = (key, text, checked, onToggle) => (
    <label key={key} className={`select-pill ${checked ? 'checked' : ''}`}>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onToggle} />
      <span className="pill-check" aria-hidden="true">
        ✓
      </span>
      {text}
    </label>
  );
  return (
    <fieldset className="pill-group">
      <legend className="sr-only">{label}</legend>
      {allLabel &&
        pill('all', allLabel, teams.length > 0 && teams.every((t) => selected.includes(t.id)), () => {
          if (selected.length < teams.length) onChange(teams.map((t) => t.id));
        })}
      {noneLabel &&
        pill('none', noneLabel, selected.length === 0, () => {
          if (selected.length) onChange([]);
        })}
      {teams.map((t) => pill(t.id, itemLabel(t), selected.includes(t.id), () => toggle(t.id)))}
    </fieldset>
  );
}
