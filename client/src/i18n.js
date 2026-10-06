// Interface language (Vietnamese or English), kept with the account (users.language) and mirrored in localStorage
// so the sign-in screen and the first paint already use it. The Vietnamese text is the key: tr('Đang tải…')
// returns it as is in Vietnamese and looks it up in EN for English (falling back to the Vietnamese). {name}
// placeholders are filled from params. User content (project, task, status names…) is never translated.
import EN from './i18n.en.js';

const LANG_KEY = 'taskflow_language';
export const LANGUAGES = ['vi', 'en'];

function saved() {
  try {
    const value = localStorage.getItem(LANG_KEY);
    return LANGUAGES.includes(value) ? value : 'vi';
  } catch {
    return 'vi';
  }
}

let lang = saved();
document.documentElement.lang = lang;

export const getLang = () => lang;

// Switches the language for this tab; App listens to the event and re-renders everything.
export function setLang(next) {
  if (!LANGUAGES.includes(next) || next === lang) return;
  lang = next;
  document.documentElement.lang = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // Remembering it locally is only a convenience; the account keeps the choice.
  }
  window.dispatchEvent(new Event('taskflow-language'));
}

export function tr(vi, params) {
  const text = lang === 'en' ? EN[vi] ?? vi : vi;
  return params ? text.replace(/\{(\w+)\}/g, (match, key) => (params[key] ?? match)) : text;
}

// A message that arrived as text (the server's errors, always in Vietnamese): an exact key, else a key whose
// {placeholders} match the numbers or names in it, e.g. "File vượt quá {max} MB".
let patterns;
export function trMessage(text) {
  if (lang !== 'en' || !text) return text;
  if (EN[text]) return EN[text];
  patterns ??= Object.keys(EN)
    .filter((key) => key.includes('{'))
    .map((key) => {
      const names = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const source = key
        .split(/\{\w+\}/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('(.+?)');
      return { key, names, re: new RegExp(`^${source}$`) };
    });
  for (const { key, names, re } of patterns) {
    const m = text.match(re);
    if (m) return tr(key, Object.fromEntries(names.map((name, i) => [name, m[i + 1]])));
  }
  return text;
}

// For dates and numbers.
export const locale = () => (lang === 'en' ? 'en-GB' : 'vi-VN');
