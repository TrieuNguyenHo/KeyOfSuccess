import { Fragment, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Login, { Pending } from './features/auth/Login.jsx';
import SystemConfigPage from './features/admin/SystemConfigPage.jsx';
import Workspace from './features/layout/Workspace.jsx';
import { getLang, setLang, tr } from './i18n.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  // Bumped with the language, so every screen renders again in it (the URL keeps where the user was).
  const [lang, setLangState] = useState(getLang());

  // The account's language wins once it is known (users.language).
  const signedIn = (u) => {
    setLang(u.language);
    setUser(u);
  };

  useEffect(() => {
    if (getToken()) {
      api('/me')
        .then(signedIn)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    const onLogout = () => setUser(null);
    const onLanguage = () => setLangState(getLang());
    window.addEventListener('logout', onLogout);
    window.addEventListener('taskflow-language', onLanguage);
    return () => {
      window.removeEventListener('logout', onLogout);
      window.removeEventListener('taskflow-language', onLanguage);
    };
  }, []);

  function logout() {
    setToken(null);
    setUser(null);
  }

  let screen;
  if (loading) screen = <div className="center muted">{tr('Đang tải…')}</div>;
  else if (!user) screen = <Login onAuth={signedIn} />;
  else if (user.status === 'pending') screen = <Pending user={user} onApproved={signedIn} onLogout={logout} />;
  else if (user.role === 'root') screen = <SystemConfigPage user={user} onLogout={logout} />;
  else screen = <Workspace user={user} onLogout={logout} onUserChange={setUser} />;
  return <Fragment key={lang}>{screen}</Fragment>;
}
