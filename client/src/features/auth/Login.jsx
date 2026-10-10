import { useEffect, useRef, useState } from 'react';
import { api, setToken } from '../../api.js';
import { getLang, tr } from '../../i18n.js';
import { Brand } from '../../components/Brand.jsx';
import { LanguageSwitch } from '../../components/Preferences.jsx';

let googleScript;
function loadGoogleScript() {
  googleScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      googleScript = null;
      reject(new Error(tr('Không tải được Google Sign-In')));
    };
    document.head.appendChild(s);
  });
  return googleScript;
}

export default function Login({ onAuth }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [dev, setDev] = useState({ name: '', email: '' });
  const buttonRef = useRef(null);

  async function finish(path, body) {
    try {
      const { token, user } = await api(path, { method: 'POST', body });
      setToken(token);
      onAuth(user);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    api('/auth/config')
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!config?.googleClientId) return;
    loadGoogleScript()
      .then(() => {
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: (response) => finish('/auth/google', { credential: response.credential }),
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          locale: getLang(),
          width: 296,
        });
      })
      .catch((e) => setError(e.message));
  }, [config]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <LanguageSwitch className="lang-switch" signedIn={false} />
        <Brand className="dark" />
        <h2>{tr('Đăng nhập')}</h2>
        <p className="muted">
          {tr('Dùng tài khoản Google (Gmail). Chưa có tài khoản? Lần đầu đăng nhập cũng là đăng ký: Manager hoặc Leader duyệt xong là bạn dùng được ngay.')}
        </p>

        {config?.googleClientId && <div ref={buttonRef} className="google-btn" />}
        {config && !config.googleClientId && !config.devLogin && (
          <div className="error">{tr('Server chưa cấu hình GOOGLE_CLIENT_ID.')}</div>
        )}

        {config?.devLogin && (
          <form
            className="dev-login"
            onSubmit={(e) => {
              e.preventDefault();
              finish('/auth/dev', dev);
            }}
          >
            <div className="dev-label">{tr('Đăng nhập dev (DEV_LOGIN=1, không dùng khi deploy)')}</div>
            <input placeholder={tr('Họ tên')} value={dev.name} onChange={(e) => setDev({ ...dev, name: e.target.value })} />
            <input
              type="email"
              placeholder="Email"
              required
              value={dev.email}
              onChange={(e) => setDev({ ...dev, email: e.target.value })}
            />
            <button className="btn primary">{tr('Đăng nhập dev')}</button>
          </form>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}

const PENDING_CHECK_MS = 20000;

export function Pending({ user, onApproved, onLogout }) {
  const [message, setMessage] = useState('');

  // Quiet checks (every 20 seconds and when the tab comes back) open the app as soon as someone approves;
  // the button reports the result.
  async function check(quiet = false) {
    const me = await api('/me').catch(() => null);
    if (me?.status === 'active') onApproved(me);
    else if (!quiet) setMessage(me ? tr('Tài khoản vẫn đang chờ duyệt.') : tr('Chưa kiểm tra được, thử lại sau.'));
  }

  useEffect(() => {
    const timer = setInterval(() => check(true), PENDING_CHECK_MS);
    const onFocus = () => check(true);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
    // check only calls stable props; set up once.
  }, []);

  // A Leader's invitation waits for a Manager; a self sign-up can also be approved by a Leader.
  const approver = user.invited_by ? 'Manager' : tr('Manager hoặc Leader');

  return (
    <div className="auth-page">
      <div className="auth-card">
        <LanguageSwitch className="lang-switch" />
        <Brand className="dark" />
        <h2>{tr('Đang chờ duyệt')}</h2>
        <p>
          {tr('Chào {name}, tài khoản', { name: user.name })} <b>{user.email}</b>{' '}
          {tr('đã được tạo. {approver} cần duyệt và xếp bạn vào team trước khi bạn dùng được K.S Management. Trang này tự mở app khi tài khoản được duyệt.', { approver })}
        </p>
        {message && <p className="muted">{message}</p>}
        <button className="btn primary" onClick={() => check()}>
          {tr('Kiểm tra lại')}
        </button>
        <button className="link-btn" onClick={onLogout}>
          {tr('Đăng xuất')}
        </button>
      </div>
    </div>
  );
}
