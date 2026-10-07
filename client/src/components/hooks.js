import { useEffect, useState } from 'react';
import { api } from '../api.js';

// A list read once from the API (again when `path` changes): [] until it arrives, or if it fails. A null path
// reads nothing, for lists only some users need.
export function useFetched(path) {
  const [data, setData] = useState([]);
  useEffect(() => {
    if (!path) return;
    api(path)
      .then(setData)
      .catch(() => {});
  }, [path]);
  return data;
}

// All teams of the department (any signed-in user may read them), for the team filter and team pickers.
export const useAllTeams = (enabled = true) => useFetched(enabled ? '/teams' : null);
// The department's channels, for the channel filter.
export const useChannels = () => useFetched('/channels');
// The roles that can be given, highest level first ({ key, name, level }), for role pickers and the level rule:
// nobody changes the account of, or gives, a role above their own level (root stands above every role).
export const useRoles = () => useFetched('/roles');
// A role's team rule (v27): min_teams 0 or 1, max_teams 1 or null (no limit). Unknown roles (root) have none.
export const roleIn = (roles, key) => roles.find((r) => r.key === key) ?? { min_teams: 0, max_teams: null };
export const levelIn = (roles, role) => (role === 'root' ? Infinity : (roles.find((r) => r.key === role)?.level ?? 0));

// Pop-ups built on <details> (team pickers, profile cards, hints) close on a click outside them or on Escape.
// Mounted once per app screen: the Workspace and the System configuration screen of root.
export function useCloseDetailsOutside() {
  useEffect(() => {
    const closeOthers = (keep) =>
      document.querySelectorAll('details[open]').forEach((d) => !d.contains(keep) && d.removeAttribute('open'));
    const onPointerDown = (e) => closeOthers(e.target);
    const onKey = (e) => e.key === 'Escape' && closeOthers(null);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
}
