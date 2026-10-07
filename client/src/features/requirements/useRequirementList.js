import { useCallback, useEffect, useState } from 'react';
import { api, onLiveChange } from '../../api.js';

// A list that belongs to a requirement (`/requirements/:id/<what>`: its files or its comments), reloaded when
// someone else changes the requirement. act(fn) runs a change, shows its error, then reloads (and calls onChanged).
export function useRequirementList(requirementId, what, onChanged) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api(`/requirements/${requirementId}/${what}`)
        .then(setItems)
        .catch((e) => setError(e.message)),
    [requirementId, what]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => onLiveChange((change) => change.requirement_id === requirementId && load()), [requirementId, load]);

  async function act(fn) {
    try {
      await fn();
      setError('');
    } catch (e) {
      setError(e.message);
    }
    await load();
    onChanged?.();
  }

  return { items, error, setError, act };
}
