import { useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n.js';

// Emoji shown by the device's own font: nothing to download. A hand-picked set for work chat, sports included
// (KingSport). Getters, so the group names read the current language.
const GROUPS = [
  {
    key: 'faces',
    icon: '😀',
    get label() {
      return tr('Mặt cười');
    },
    emoji: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤗 🤭 🤫 🤔 😐 😑 😶 🙄 😏 😬 😌 😴 😪 😷 🤒 🤯 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😢 😭 😱 😖 😣 😞 😓 😩 😫 😤 😡 😠 🤬 💀 🤡 😈 👻 🤖',
  },
  {
    key: 'hands',
    icon: '👍',
    get label() {
      return tr('Cử chỉ');
    },
    emoji: '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 👋 👏 🙌 👐 🤲 🤝 🙏 💪 ✍️ 👀 🧠',
  },
  {
    key: 'hearts',
    icon: '❤️',
    get label() {
      return tr('Trái tim');
    },
    emoji: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝',
  },
  {
    key: 'work',
    icon: '✅',
    get label() {
      return tr('Công việc');
    },
    emoji: '✅ ☑️ ✔️ ❌ ❗ ❓ ⚠️ 🔥 ⭐ 🌟 ✨ 💯 🎯 🚀 📌 📍 📎 📝 📋 📅 📆 ⏰ ⏳ ⌛ 📊 📈 📉 💡 🔔 📣 📢 💬 💭 📷 🎨 🎬 📱 💻 🖥️ 📧 📦 💰 🏆 🎉 🎊 🎁',
  },
  {
    key: 'sport',
    icon: '⚽',
    get label() {
      return tr('Thể thao');
    },
    emoji: '⚽ 🏀 🏐 🏈 ⚾ 🎾 🏸 🏓 🏒 ⛳ 🥅 🏃 🚴 🏊 🏋️ 🤸 🧘 🥇 🥈 🥉 🏅 👟 🎽 🏁',
  },
  {
    key: 'life',
    icon: '☕',
    get label() {
      return tr('Đồ ăn, thời tiết');
    },
    emoji: '☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌈 ❄️ 🌸 🌺 🌻 🍀 ☕ 🍵 🧋 🍜 🍲 🍕 🍔 🍟 🍰 🎂 🍉 🍺 🍻 🥂',
  },
];

const RECENT_KEY = 'taskflow_recent_emoji';
const RECENT_MAX = 24;

// The emoji this person used last, kept in their browser only; storage may be unavailable, then there are none.
function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function saveRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Not remembered this time.
  }
}

// The 😀 button of the chat's message box and its panel. onPick(emoji) inserts it; the panel stays open for more and
// closes on a click outside or Esc.
export default function EmojiPicker({ onPick }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState(readRecent);
  const [group, setGroup] = useState(() => (readRecent().length ? 'recent' : 'faces'));
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => !box.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(emoji) {
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    setRecent(next);
    saveRecent(next);
    onPick(emoji);
  }

  const tabs = [
    { key: 'recent', icon: '🕘', label: tr('Dùng gần đây'), list: recent },
    ...GROUPS.map((g) => ({ key: g.key, icon: g.icon, label: g.label, list: g.emoji.split(' ') })),
  ];
  const shown = tabs.find((t) => t.key === group) ?? tabs[1];

  return (
    <span className="emoji-wrap" ref={box}>
      <button type="button" className="icon-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} title={tr('Chèn emoji')} aria-label={tr('Chèn emoji')}>
        😀
      </button>
      {open && (
        <div className="emoji-panel" role="dialog" aria-label={tr('Chèn emoji')}>
          <div className="emoji-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === shown.key}
                className={t.key === shown.key ? 'active' : ''}
                onClick={() => setGroup(t.key)}
                title={t.label}
                aria-label={t.label}
              >
                {t.icon}
              </button>
            ))}
          </div>
          <div className="emoji-label muted small">{shown.label}</div>
          {shown.list.length ? (
            <div className="emoji-grid">
              {shown.list.map((emoji) => (
                <button key={emoji} type="button" onClick={() => pick(emoji)} aria-label={emoji}>
                  {emoji}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small emoji-empty">{tr('Emoji bạn dùng sẽ hiện ở đây.')}</p>
          )}
        </div>
      )}
    </span>
  );
}
