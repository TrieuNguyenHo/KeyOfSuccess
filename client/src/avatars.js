// Profile pictures. Who has one (GET /api/avatars: user id → version) loads when the workspace opens and again
// after the user changes theirs. Pictures are fetched with the token, like attachments (no bare URL), and kept as
// object URLs per user and version, so each one downloads once.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, getToken } from './api.js';

let versions = {};
const listeners = new Set();
const urls = new Map(); // "id:version" → Promise<object URL | null>

function publish(next) {
  versions = next;
  listeners.forEach((listener) => listener());
}

export const loadAvatars = () =>
  api('/avatars')
    .then(publish)
    .catch(() => {});

// After the signed-in user uploaded or removed their picture (version null).
export function setAvatarVersion(userId, version) {
  const next = { ...versions };
  if (version) next[userId] = version;
  else delete next[userId];
  publish(next);
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function pictureUrl(userId, version) {
  const key = `${userId}:${version}`;
  if (!urls.has(key)) {
    urls.set(
      key,
      fetch(`/api/avatars/${userId}?v=${encodeURIComponent(version)}`, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => blob && URL.createObjectURL(blob))
        .catch(() => null)
    );
  }
  return urls.get(key);
}

// The object URL of a user's picture, or null while loading or when they have none.
export function useAvatarUrl(userId) {
  const version = useSyncExternalStore(subscribe, () => (userId == null ? null : versions[userId] ?? null));
  const [url, setUrl] = useState(null);
  useEffect(() => {
    setUrl(null);
    if (!version) return undefined;
    let alive = true;
    pictureUrl(userId, version).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [userId, version]);
  return url;
}
