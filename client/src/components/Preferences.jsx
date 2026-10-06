// The Light / Dark and VI / EN switches (sidebar, Profile, sign-in screens).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getLang, setLang, tr } from '../i18n.js';

const THEME_KEY = 'taskflow_theme'; // also read by the inline script in index.html

// Light / dark choice. index.html applies the saved value (or the OS preference) before React loads.
// Two of them can be on screen (sidebar and Profile): a choice in one updates the other.
export function ThemeSwitch({ className = 'theme-switch' }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    const onTheme = () => setTheme(document.documentElement.dataset.theme || 'light');
    window.addEventListener('taskflow-theme', onTheme);
    return () => window.removeEventListener('taskflow-theme', onTheme);
  }, []);
  function choose(next) {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Remembering the choice is only a convenience.
    }
    window.dispatchEvent(new Event('taskflow-theme'));
  }
  return (
    <div className={className} role="radiogroup" aria-label={tr('Giao diện')}>
      {[
        ['light', tr('☀ Sáng')],
        ['dark', tr('☾ Tối')],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          className={theme === value ? 'active' : ''}
          onClick={() => choose(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// VI / EN. Signed in, the choice is saved with the account (PATCH /api/me), so it follows the user to every device;
// on the sign-in screen it only applies to this browser until the account's own choice loads.
export function LanguageSwitch({ className = 'theme-switch', signedIn = true }) {
  const lang = getLang();
  function choose(next) {
    setLang(next);
    if (signedIn) api('/me', { method: 'PATCH', body: { language: next } }).catch(() => {});
  }
  return (
    <div className={className} role="radiogroup" aria-label={tr('Ngôn ngữ')}>
      {[
        ['vi', 'VI', 'Tiếng Việt'],
        ['en', 'EN', 'English'],
      ].map(([value, label, name]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={lang === value}
          aria-label={name}
          title={name}
          className={lang === value ? 'active' : ''}
          onClick={() => choose(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
