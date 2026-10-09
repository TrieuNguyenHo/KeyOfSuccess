import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { askConfirm, askText } from './Dialog.jsx';
import { tr } from '../i18n.js';

// Saved filters (v41): the person's own quick views of this screen (a project, My tasks or Work tracking), as chips
// above its filters. Each keeps the screen's URL hash, so picking one opens the screen as it was saved; "☆ Lưu bộ lọc"
// saves what is shown now. The open task panel (?task=) is not part of a view.
const currentHash = () => {
  const [path, search = ''] = window.location.hash.split('?');
  const query = new URLSearchParams(search);
  query.delete('task');
  const rest = query.toString();
  return rest ? `${path}?${rest}` : path;
};

let cache = null; // the person's saved filters, shared by every screen until the page reloads
const load = () => (cache ??= api('/saved-filters').catch(() => []));

export default function SavedFilters({ screen, projectId = null }) {
  const [all, setAll] = useState([]);
  const [hash, setHash] = useState(currentHash);
  const [error, setError] = useState('');
  useEffect(() => {
    load().then(setAll);
    // The Workspace writes the URL after each render (replaceState fires no event), so it is read again shortly.
    const timer = setInterval(() => setHash(currentHash()), 400);
    return () => clearInterval(timer);
  }, []);
  const mine = all.filter((f) => f.screen === screen && (f.project_id ?? null) === projectId);

  const update = (list) => {
    cache = Promise.resolve(list);
    setAll(list);
  };

  async function save() {
    const name = await askText({ title: tr('Lưu bộ lọc'), label: tr('Tên bộ lọc'), placeholder: tr('Ví dụ: Facebook tuần này') });
    if (!name) return;
    try {
      const saved = await api('/saved-filters', { method: 'POST', body: { name, hash: currentHash() } });
      update([...all, saved]);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(filter) {
    const ok = await askConfirm({ title: tr('Xoá bộ lọc "{name}"?', { name: filter.name }), confirmLabel: tr('Xoá'), danger: true });
    if (!ok) return;
    try {
      await api(`/saved-filters/${filter.id}`, { method: 'DELETE' });
      update(all.filter((f) => f.id !== filter.id));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="saved-filters" role="group" aria-label={tr('Bộ lọc đã lưu')}>
      {mine.map((f) => (
        <span key={f.id} className={`saved-filter ${f.hash === hash ? 'active' : ''}`}>
          <button className="saved-filter-name" onClick={() => (window.location.hash = f.hash)} aria-pressed={f.hash === hash}>
            {f.name}
          </button>
          <button className="saved-filter-remove" onClick={() => remove(f)} aria-label={tr('Xoá bộ lọc "{name}"', { name: f.name })}>
            ✕
          </button>
        </span>
      ))}
      <button className="link-btn" onClick={save} title={tr('Lưu bộ lọc và cách xem đang dùng thành một nút bấm nhanh')}>
        {tr('☆ Lưu bộ lọc')}
      </button>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
