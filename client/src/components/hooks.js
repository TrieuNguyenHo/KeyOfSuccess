import { useEffect, useState } from 'react';
import { api } from '../api.js';

// All teams of the department (any signed-in user may read them), for the team filter and team pickers.
export function useAllTeams() {
  const [teams, setTeams] = useState([]);
  useEffect(() => {
    api('/teams')
      .then(setTeams)
      .catch(() => {});
  }, []);
  return teams;
}

// The department's channels, for the channel filter.
export function useChannels() {
  const [channels, setChannels] = useState([]);
  useEffect(() => {
    api('/channels')
      .then(setChannels)
      .catch(() => {});
  }, []);
  return channels;
}

// The roles that can be given, highest level first ({ key, name, level }), for role pickers and the level rule:
// nobody changes the account of, or gives, a role above their own level (root stands above every role).
export function useRoles() {
  const [roles, setRoles] = useState([]);
  useEffect(() => {
    api('/roles')
      .then(setRoles)
      .catch(() => {});
  }, []);
  return roles;
}
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
