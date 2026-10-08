import { tr, trMessage } from './i18n.js';

const TOKEN_KEY = 'taskflow_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY));

// Identifies this tab to the server, which echoes it in the live `change` events this tab causes, so the
// tab skips its own changes. Not crypto.randomUUID(): that needs HTTPS, and the app also runs over plain LAN http.
const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

// What every request to the API carries: the token (when signed in) and this tab's id.
function headers(extra) {
  const token = getToken();
  return { ...extra, ...(token && { Authorization: `Bearer ${token}` }), 'X-Client-Id': CLIENT_ID };
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: headers({ 'Content-Type': 'application/json' }),
    body: body && JSON.stringify(body),
  });
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('logout'));
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  // The server words its errors in Vietnamese; trMessage() gives the English when that is the language.
  if (!res.ok) throw new Error(data?.error ? trMessage(data.error) : tr('Có lỗi xảy ra'));
  return data;
}

// Sends a file to an attachments endpoint as raw bytes, the name and type in headers (see the server).
export async function uploadFile(path, file) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: headers({
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
      'X-File-Type': file.type || 'application/octet-stream',
    }),
    body: file,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ? trMessage(data.error) : tr('Không tải lên được {name}', { name: file.name }));
  return data;
}

// An attachment's bytes as a Blob. Fetched with the token header, so files never sit behind a bare URL.
export async function fetchAttachment(id) {
  const res = await fetch(`/api/attachments/${id}`, { headers: headers() });
  if (!res.ok) throw new Error(tr('Không tải được file'));
  return res.blob();
}

const RECONNECT_MS = 5000;

// Listens to the server's event stream (GET /api/events) and calls onEvent(name, data) for each event.
// Uses fetch rather than EventSource so the token travels in a header, never in the URL.
// Reconnects after drops; returns a function that stops listening.
export function subscribeEvents(onEvent) {
  let stopped = false;
  let controller;

  async function run() {
    while (!stopped) {
      controller = new AbortController();
      try {
        const res = await fetch('/api/events', {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: controller.signal,
        });
        if (res.status === 401) return; // signed out; api() handles the logout
        if (!res.ok || !res.body) throw new Error(`event stream ${res.status}`);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const name = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (name) onEvent(name, data ? JSON.parse(data) : null);
          }
        }
      } catch {
        if (stopped) return;
      }
      if (!stopped) await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS));
    }
  }

  run();
  return () => {
    stopped = true;
    controller?.abort();
  };
}

// Changes other people (or this user's other tabs) made: { project_id, task_id, requirement_id }.
// Workspace feeds them in from the event stream; any open view subscribes with onLiveChange(handler),
// which returns a function that unsubscribes.
const liveChanges = new EventTarget();

export function publishLiveChange(change) {
  if (change.source !== CLIENT_ID) liveChanges.dispatchEvent(new CustomEvent('change', { detail: change }));
}

export function onLiveChange(handler) {
  const listener = (e) => handler(e.detail);
  liveChanges.addEventListener('change', listener);
  return () => liveChanges.removeEventListener('change', listener);
}

// Changes to a feedback (its sender's and root's tabs only): { feedback_id }. Fed in from the event stream like
// the changes above; the feedback screens subscribe with onFeedbackChange(handler).
export function publishFeedbackChange(change) {
  if (change.source !== CLIENT_ID) liveChanges.dispatchEvent(new CustomEvent('feedback', { detail: change }));
}

export function onFeedbackChange(handler) {
  const listener = (e) => handler(e.detail);
  liveChanges.addEventListener('feedback', listener);
  return () => liveChanges.removeEventListener('feedback', listener);
}

// Changes to a conversation the user is in: { conversation_id }. The chat screen subscribes with onChatChange(handler).
export function publishChatChange(change) {
  if (change.source !== CLIENT_ID) liveChanges.dispatchEvent(new CustomEvent('chat', { detail: change }));
}

export function onChatChange(handler) {
  const listener = (e) => handler(e.detail);
  liveChanges.addEventListener('chat', listener);
  return () => liveChanges.removeEventListener('chat', listener);
}
