import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { tr } from '../i18n.js';

// The app's name, "K.S Management" (KeyOfSuccess before 2026-10-10): one size throughout, K and S, KingSport's
// initials, in the brand red (see .brand in styles/base.css). Read as one label.
export function Brand({ className = '' }) {
  return (
    <span className={`brand ${className}`} role="img" aria-label="K.S Management">
      <span className="ks">K</span>.<span className="ks">S</span> Management
    </span>
  );
}

// The deployed version under the app's name: the git tag deploy/update.sh wrote (GET /api/health), "dev" when the app
// was not deployed through the scripts. Read once per page load.
let versionRequest = null;
export function AppVersion() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    versionRequest ??= api('/health').catch(() => null);
    versionRequest.then(setHealth);
  }, []);
  if (!health) return null;
  const title = [health.commit && `commit ${health.commit}`, `schema ${health.schema}`].filter(Boolean).join(' · ');
  return (
    <span className="app-version" title={title}>
      {health.version ?? tr('bản dev')}
    </span>
  );
}
