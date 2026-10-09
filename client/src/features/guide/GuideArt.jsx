// Small animated illustrations for the user guide, one per kind. Drawn in SVG with the theme tokens (classes in
// styles/guide.css), with no words, so they read the same in Vietnamese and English, light and dark. Purely
// decorative (aria-hidden): the guide's text says everything. With reduced motion they stand still in their
// final state, so every element's own position and colors are the "after" picture and the keyframes the "before".

const Line = ({ x, y, w, c = 'ga-line', h = 6 }) => <rect className={c} x={x} y={y} width={w} height={h} rx={h / 2} />;
const Win = () => <rect className="ga-win" x="8" y="8" width="224" height="134" rx="10" />;
const Cursor = ({ className }) => (
  <path className={`ga-cursor ${className}`} d="M0 0 L0 15 L4 11 L7 17 L9.5 16 L6.5 10 L11.5 10 Z" />
);
const Check = ({ cx, cy, r = 6, className = '' }) => (
  <g className={className}>
    <circle className="ga-ok" cx={cx} cy={cy} r={r} />
    <path className="ga-tick" d={`M${cx - r / 2.2} ${cy} l${r / 3} ${r / 3} l${r / 1.7} -${r / 1.6}`} />
  </g>
);
const Card = ({ x, y, w = 40, h = 18, className = '' }) => (
  <g className={className}>
    <rect className="ga-card" x={x} y={y} width={w} height={h} rx="4" />
    <Line x={x + 5} y={y + 6} w={w - 14} h={4} />
  </g>
);

const ARTS = {
  // The sidebar: menus on top, projects grouped by team below; the highlight walks down them.
  sidebar: () => (
    <>
      <Win />
      <rect className="ga-sb" x="8" y="8" width="72" height="134" rx="10" />
      <rect className="ga-sb" x="66" y="8" width="14" height="134" />
      <rect className="ga-sbhi ga-a-sidebar" x="12" y="19" width="64" height="15" rx="4" />
      {[24, 38, 52].map((y) => <Line key={y} x={20} y={y} w={44} c="ga-sbline" h={5} />)}
      <Line x={20} y={74} w={30} c="ga-sbdim" h={4} />
      {[
        [88, 'ga-brand'],
        [102, 'ga-ok'],
        [116, 'ga-warn'],
      ].map(([y, c]) => (
        <g key={y}>
          <circle className={c} cx="22" cy={y + 2.5} r="3" />
          <Line x={30} y={y} w={34} c="ga-sbline" h={5} />
        </g>
      ))}
      <Line x={96} y={24} w={80} c="ga-head" h={8} />
      <Card x={96} y={44} w={56} h={36} />
      <Card x={160} y={44} w={56} h={36} />
      <Card x={96} y={88} w={56} h={36} />
    </>
  ),
  // The profile: a picture and the fields being filled in.
  profile: () => (
    <>
      <Win />
      <circle className="ga-brand ga-a-pop" cx="56" cy="56" r="24" />
      <circle className="ga-white" cx="56" cy="50" r="8" />
      <path className="ga-white" d="M40 72 a16 12 0 0 1 32 0 z" />
      <Line x={34} y={94} w={44} />
      <Line x={40} y={106} w={32} />
      {[38, 70].map((y, i) => (
        <g key={y}>
          <Line x={100} y={y - 12} w={40} h={5} />
          <rect className="ga-field" x="100" y={y} width="116" height="16" rx="5" />
          <rect className={`ga-head ga-a-type ga-d${i * 4}`} x="106" y={y + 6} width="74" height="4" rx="2" />
        </g>
      ))}
      <rect className="ga-primary" x="100" y="104" width="52" height="18" rx="9" />
    </>
  ),
  // Light / Dark: the switch moves and the page turns dark.
  theme: () => (
    <>
      <rect className="ga-a-theme-bg" x="8" y="8" width="224" height="134" rx="10" />
      <Line x={24} y={24} w={90} c="ga-a-theme-line" h={8} />
      {[46, 60, 74].map((y) => <Line key={y} x={24} y={y} w={y === 60 ? 110 : 140} c="ga-a-theme-line" />)}
      <rect className="ga-field" x="152" y="106" width="60" height="24" rx="12" />
      <circle className="ga-brand ga-a-knob" cx="196" cy="118" r="9" />
      <rect className="ga-field" x="92" y="106" width="48" height="24" rx="12" />
      <rect className="ga-primary ga-a-lang" x="118" y="109" width="19" height="18" rx="9" />
    </>
  ),
  // A link: the address is copied and opens the same screen for a colleague.
  link: () => (
    <>
      <Win />
      <rect className="ga-field" x="20" y="18" width="200" height="16" rx="8" />
      <rect className="ga-tintfill ga-a-select" x="26" y="21" width="128" height="10" rx="5" />
      <Line x={30} y={23} w={120} h={6} />
      {[50, 62, 74].map((y, i) => <Line key={y} x={20} y={y} w={[96, 70, 84][i]} />)}
      <rect className="ga-col" x="140" y="70" width="84" height="64" rx="8" />
      <g className="ga-a-later">
        <Line x={150} y={82} w={56} c="ga-head" h={6} />
        <Line x={150} y={96} w={64} />
        <Line x={150} y={108} w={48} />
      </g>
      <rect className="ga-brand ga-a-fly" x="30" y="21" width="40" height="10" rx="5" />
    </>
  ),
  // Project → requirements → tasks → subtasks, appearing level by level.
  model: () => (
    <>
      <Win />
      <rect className="ga-brand ga-a-seq" x="90" y="16" width="60" height="20" rx="6" />
      <path className="ga-conn ga-a-seq ga-d1" d="M120 36 V44 M60 44 H180 M60 44 V52 M180 44 V52" />
      <rect className="ga-tint ga-a-seq ga-d1" x="30" y="52" width="60" height="18" rx="5" />
      <rect className="ga-tint ga-a-seq ga-d1" x="150" y="52" width="60" height="18" rx="5" />
      <path className="ga-conn ga-a-seq ga-d2" d="M60 70 V78 M41 78 H79 M41 78 V84 M79 78 V84 M180 70 V78 M161 78 H199 M161 78 V84 M199 78 V84" />
      {[24, 62, 144, 182].map((x) => <Card key={x} x={x} y={84} w={34} h={16} className="ga-a-seq ga-d2" />)}
      <path className="ga-conn ga-a-seq ga-d3" d="M33 100 V124 M33 112 H40 M33 124 H40" />
      <Line x={42} y={109} w={26} h={5} c="ga-line ga-a-seq ga-d3" />
      <Line x={42} y={121} w={20} h={5} c="ga-line ga-a-seq ga-d3" />
    </>
  ),
  // The four views of a project: the tab moves and the content changes with it.
  views: () => (
    <>
      <Win />
      {[20, 72, 124, 176].map((x) => (
        <rect key={x} className="ga-field" x={x} y="18" width="46" height="16" rx="8" />
      ))}
      <rect className="ga-primary ga-a-tabs ga-slow" x="20" y="18" width="46" height="16" rx="8" />
      <g className="ga-view ga-v1 ga-a-quarter ga-slow">
        {[48, 70, 92, 114].map((y, i) => (
          <g key={y}>
            <Line x={22} y={y} w={70} />
            <rect className="ga-col" x="110" y={y} width="104" height="6" rx="3" />
            <rect className="ga-brand" x="110" y={y} width={[80, 50, 96, 30][i]} height="6" rx="3" />
          </g>
        ))}
      </g>
      <g className="ga-view ga-v2 ga-a-quarter ga-slow ga-q2">
        {[44, 76, 108].map((y) =>
          [0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={`${y}-${i}`} className="ga-col" x={20 + i * 29} y={y} width="26" height="28" rx="3" />)
        )}
        <rect className="ga-brand" x="52" y="58" width="22" height="6" rx="3" />
        <rect className="ga-ok" x="136" y="90" width="22" height="6" rx="3" />
        <rect className="ga-warn" x="78" y="122" width="22" height="6" rx="3" />
      </g>
      <g className="ga-view ga-v3 ga-a-quarter ga-slow ga-q3">
        {[48, 66, 84, 102, 120].map((y, i) => (
          <g key={y}>
            {i === 1 ? <Check cx={27} cy={y + 3} r={5} /> : <circle className="ga-ring-muted" cx="27" cy={y + 3} r="5" />}
            <Line x={40} y={y} w={[110, 90, 120, 70, 100][i]} />
            <Line x={170} y={y} w={44} />
          </g>
        ))}
      </g>
      <g className="ga-view ga-v4 ga-a-quarter ga-slow ga-q4">
        {[20, 92, 164].map((x, c) => (
          <g key={x}>
            <rect className="ga-col" x={x} y="42" width="58" height="92" rx="5" />
            {[0, 1, 2].slice(0, 3 - c).map((i) => <Card key={i} x={x + 5} y={56 + i * 24} w={48} h={18} />)}
          </g>
        ))}
      </g>
    </>
  ),
  // The four fixed statuses: a card moves into Completed and gets its tick.
  statuses: () => (
    <>
      <Win />
      {[16, 70, 124, 178].map((x, i) => (
        <g key={x}>
          <rect className="ga-col" x={x} y="16" width="48" height="118" rx="5" />
          <Line x={x + 6} y={24} w={30} c={['ga-neutral', 'ga-warn', 'ga-ok', 'ga-chipdark'][i]} h={5} />
        </g>
      ))}
      <Card x={20} y={40} w={40} />
      <Card x={20} y={62} w={40} />
      <Card x={74} y={40} w={40} />
      <Card x={182} y={40} w={40} />
      <Card x={128} y={40} w={40} />
      <g className="ga-a-status">
        <Card x={128} y={64} w={40} />
        <Check cx={160} cy={73} r={5} className="ga-a-checkpop" />
      </g>
    </>
  ),
  // Your own task is yours to edit; the others you view and comment.
  rights: () => (
    <>
      <Win />
      {[18, 60, 102].map((y, i) => (
        <g key={y}>
          <rect className={i === 0 ? 'ga-card ga-own ga-a-pulse' : 'ga-card'} x="28" y={y} width="184" height="32" rx="6" />
          <circle className={i === 0 ? 'ga-brand' : 'ga-chipfill'} cx="46" cy={y + 16} r="8" />
          <Line x={62} y={y + 9} w={i === 0 ? 92 : 80} c={i === 0 ? 'ga-head' : 'ga-line'} />
          <Line x={62} y={y + 19} w={56} h={4} />
          {i === 0 ? (
            <path className="ga-pen" d={`M188 ${y + 22} l2 -6 l10 -10 l4 4 l-10 10 z`} />
          ) : (
            <g className="ga-eye">
              <path d={`M184 ${y + 16} q10 -9 20 0 q-10 9 -20 0 z`} />
              <circle cx="194" cy={y + 16} r="2.5" />
            </g>
          )}
        </g>
      ))}
    </>
  ),
  // Opening a task: click a row and the panel slides in.
  open: () => (
    <>
      <defs>
        <clipPath id="ga-clip-open">
          <rect x="8" y="8" width="224" height="134" rx="10" />
        </clipPath>
      </defs>
      <Win />
      <rect className="ga-tintfill ga-a-hl" x="14" y="44" width="212" height="18" rx="4" />
      {[26, 50, 74, 98, 122].map((y) => (
        <g key={y}>
          <circle className="ga-ring-muted" cx="26" cy={y + 3} r="4.5" />
          <Line x={38} y={y} w={y === 50 ? 96 : 80} c={y === 50 ? 'ga-head' : 'ga-line'} />
          <Line x={180} y={y} w={36} />
        </g>
      ))}
      <g clipPath="url(#ga-clip-open)">
        <g className="ga-a-panel">
          <rect className="ga-card" x="128" y="8" width="104" height="134" />
          <Line x={140} y={22} w={70} c="ga-head" h={8} />
          {[42, 54, 66].map((y) => <Line key={y} x={140} y={y} w={y === 54 ? 60 : 80} />)}
          <rect className="ga-col" x="140" y="82" width="80" height="44" rx="5" />
        </g>
      </g>
      <Cursor className="ga-a-opencursor" />
    </>
  ),
  // Board drag and drop.
  drag: () => (
    <>
      <Win />
      {[20, 92, 164].map((x) => (
        <rect key={x} className="ga-col" x={x} y="18" width="58" height="116" rx="5" />
      ))}
      {[20, 92, 164].map((x) => <Line key={x} x={x + 6} y={26} w={30} c="ga-head" h={5} />)}
      <Card x={25} y={64} w={48} h={20} />
      <Card x={97} y={64} w={48} h={20} />
      <Card x={169} y={40} w={48} h={20} />
      <Card x={169} y={64} w={48} h={20} />
      <g className="ga-a-drag">
        <Card x={25} y={40} w={48} h={20} className="ga-lift" />
        <g transform="translate(58 52)">
          <Cursor />
        </g>
      </g>
    </>
  ),
  // A recurring task: done today, the next one appears on its next day.
  recurring: () => (
    <>
      <Win />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect className="ga-col" x={18 + i * 42} y="40" width="38" height="88" rx="5" />
          <Line x={24 + i * 42} y={48} w={16} h={4} />
        </g>
      ))}
      <rect className="ga-brand" x="22" y="62" width="30" height="14" rx="4" />
      <Check cx={46} cy={69} r={5} className="ga-a-checkpop" />
      <rect className="ga-brand ga-a-newchip" x="106" y="62" width="30" height="14" rx="4" />
      <g className="ga-a-spin">
        <path className="ga-arc" d="M196 14 a10 10 0 1 1 -9 6" />
        <path className="ga-primary" d="M183 15 l5 7 l4 -7 z" />
      </g>
    </>
  ),
  // Channels: colored tags pop onto a task.
  channels: () => (
    <>
      <Win />
      <rect className="ga-card" x="30" y="24" width="180" height="102" rx="8" />
      <Line x={44} y={38} w={110} c="ga-head" h={8} />
      <Line x={44} y={56} w={140} />
      <Line x={44} y={68} w={100} />
      {[
        [44, 'ga-brand'],
        [96, 'ga-ok'],
        [148, 'ga-warn'],
      ].map(([x, c], i) => (
        <g key={x} className={`ga-a-seq ga-d${i + 1}`}>
          <rect className="ga-field" x={x} y="92" width="46" height="18" rx="9" />
          <circle className={c} cx={x + 11} cy="101" r="4" />
          <Line x={x + 19} y={98} w={20} h={5} />
        </g>
      ))}
    </>
  ),
  // History: change lines arrive one after the other.
  history: () => (
    <>
      <Win />
      <path className="ga-conn" d="M40 24 V128" />
      {[24, 52, 80, 108].map((y, i) => (
        <g key={y} className={`ga-a-seq ga-d${i}`}>
          <circle className={i === 3 ? 'ga-brand' : 'ga-chipfill'} cx="40" cy={y + 6} r="6" />
          <Line x={56} y={y} w={[110, 90, 130, 100][i]} c={i === 3 ? 'ga-head' : 'ga-line'} />
          <Line x={56} y={y + 11} w={50} h={4} />
        </g>
      ))}
    </>
  ),
  // Comments with an @mention.
  comment: () => (
    <>
      <Win />
      <g className="ga-a-seq">
        <circle className="ga-chipfill" cx="28" cy="30" r="9" />
        <rect className="ga-col" x="44" y="18" width="120" height="26" rx="8" />
        <Line x={52} y={28} w={90} />
      </g>
      <g className="ga-a-seq ga-d2">
        <circle className="ga-brand" cx="28" cy="68" r="9" />
        <rect className="ga-col" x="44" y="56" width="160" height="26" rx="8" />
        <rect className="ga-tintfill" x="52" y="63" width="40" height="12" rx="6" />
        <Line x={58} y={66} w={28} c="ga-primaryline" />
        <Line x={98} y={66} w={90} />
      </g>
      <rect className="ga-field" x="20" y="100" width="200" height="28" rx="14" />
      <rect className="ga-head ga-a-type ga-d4" x="34" y="112" width="110" height="4" rx="2" />
    </>
  ),
  // Files: a file drops into the comment box and shows as an attachment.
  file: () => (
    <>
      <Win />
      <g className="ga-a-appearmid">
        <rect className="ga-col" x="24" y="22" width="56" height="46" rx="5" />
        <path className="ga-chipfill" d="M30 62 l14 -16 l10 10 l6 -6 l14 12 z" />
        <circle className="ga-warn" cx="66" cy="32" r="4" />
        <rect className="ga-col" x="90" y="22" width="56" height="46" rx="5" />
        <path className="ga-docfold" d="M108 30 h14 l8 8 v22 h-22 z" />
      </g>
      <rect className="ga-field" x="20" y="96" width="200" height="34" rx="17" />
      <path className="ga-clip" d="M196 106 v12 a5 5 0 0 1 -10 0 v-14 a3 3 0 0 1 6 0 v13" />
      <path className="ga-docfold ga-a-drop" d="M112 84 h16 l8 8 v26 h-24 z" />
    </>
  ),
  // Feedback: the user's feedback moves from sent to done, and root's answer arrives in the thread.
  feedback: () => (
    <>
      <Win />
      <rect className="ga-card" x="20" y="20" width="200" height="58" rx="8" />
      <Line x={32} y={32} w={96} c="ga-head" />
      <Line x={32} y={48} w={140} h={4} />
      <Line x={32} y={58} w={104} h={4} />
      <rect className="ga-fb-status ga-a-fbstatus" x="166" y="27" width="42" height="14" rx="7" />
      <g className="ga-a-later">
        <circle className="ga-brand" cx="38" cy="108" r="9" />
        <rect className="ga-col" x="54" y="95" width="150" height="26" rx="8" />
        <Line x={62} y={105} w={104} />
      </g>
    </>
  ),
  // Chat: a colleague's message on the left, the answer typed and sent on the right, a picture after it.
  chat: () => (
    <>
      <Win />
      <g className="ga-a-seq">
        <circle className="ga-chipfill" cx="28" cy="28" r="9" />
        <rect className="ga-col" x="42" y="18" width="110" height="22" rx="11" />
        <Line x={52} y={26} w={84} />
      </g>
      <g className="ga-a-seq ga-d2">
        <rect className="ga-brand" x="104" y="48" width="116" height="22" rx="11" />
        <Line x={114} y={56} w={90} c="ga-white" />
      </g>
      <g className="ga-a-seq ga-d4">
        <rect className="ga-col" x="160" y="76" width="60" height="22" rx="6" />
        <path className="ga-chipfill" d="M166 94 l12 -12 l8 8 l5 -5 l11 9 z" />
      </g>
      <rect className="ga-field" x="20" y="108" width="200" height="26" rx="13" />
      <rect className="ga-head ga-a-type ga-d1" x="34" y="119" width="96" height="4" rx="2" />
    </>
  ),
  // Notifications: the bell rings and a notice arrives.
  notify: () => (
    <>
      <Win />
      <path className="ga-head ga-a-bell" d="M120 22 c-12 0 -18 9 -18 20 v12 l-6 8 h48 l-6 -8 v-12 c0 -11 -6 -20 -18 -20 z M113 66 a7 7 0 0 0 14 0 z" />
      <circle className="ga-danger ga-a-badge" cx="137" cy="28" r="8" />
      <g className="ga-a-appearmid">
        <rect className="ga-card" x="40" y="88" width="160" height="40" rx="8" />
        <circle className="ga-brand" cx="58" cy="108" r="8" />
        <Line x={74} y={100} w={100} c="ga-head" />
        <Line x={74} y={112} w={70} h={4} />
      </g>
    </>
  ),
  // My tasks, grouped: overdue, today, the next 7 days.
  mytasks: () => (
    <>
      <Win />
      {[
        [18, 'ga-danger'],
        [60, 'ga-brand'],
        [102, 'ga-neutral'],
      ].map(([y, c], g) => (
        <g key={y}>
          <Line x={20} y={y} w={44} c={c} h={5} />
          {[0, 1].map((r) => (
            <g key={r} className={`ga-a-seq ga-d${g * 2 + r}`}>
              <circle className="ga-ring-muted" cx="26" cy={y + 15 + r * 14} r="4" />
              <Line x={36} y={y + 12 + r * 14} w={r ? 90 : 120} />
              <Line x={178} y={y + 12 + r * 14} w={40} c={g === 0 ? 'ga-danger' : 'ga-line'} />
            </g>
          ))}
        </g>
      ))}
    </>
  ),
  // Dashboard: bars grow and the completion ring fills.
  dashboard: () => (
    <>
      <Win />
      <path className="ga-conn" d="M20 128 H150" />
      {[40, 64, 52, 88, 72, 96].map((h, i) => (
        <rect key={i} className={`ga-brand ga-a-grow ga-d${i}`} x={24 + i * 21} y={128 - h} width="13" height={h} rx="2" />
      ))}
      <circle className="ga-donut-track" cx="190" cy="70" r="26" />
      <circle className="ga-donut ga-a-donut" cx="190" cy="70" r="26" />
      <Line x={170} y={112} w={40} />
    </>
  ),
  // Watching: pick a person, see their tasks.
  watch: () => (
    <>
      <Win />
      {[40, 70, 100, 130].map((cx, i) => (
        <circle key={cx} className={['ga-brand', 'ga-chipfill', 'ga-ok', 'ga-warn'][i]} cx={cx} cy="30" r="10" />
      ))}
      <circle className="ga-ring ga-a-watch" cx="40" cy="30" r="14" />
      <Line x={160} y={27} w={56} />
      {[58, 76, 94, 112].map((y, i) => (
        <g key={y} className={`ga-a-seq ga-d${i}`}>
          <circle className="ga-ring-muted" cx="26" cy={y + 3} r="4" />
          <Line x={38} y={y} w={[120, 90, 110, 80][i]} />
          <Line x={180} y={y} w={36} />
        </g>
      ))}
    </>
  ),
  // Creating a project: "+" in the sidebar opens the form.
  create: () => (
    <>
      <Win />
      <rect className="ga-sb" x="8" y="8" width="64" height="134" rx="10" />
      <rect className="ga-sb" x="58" y="8" width="14" height="134" />
      <Line x={18} y={21} w={26} c="ga-sbdim" h={4} />
      <circle className="ga-brand ga-a-press" cx="58" cy="23" r="7" />
      <path className="ga-plus" d="M58 19 v8 M54 23 h8" />
      {[40, 54, 68].map((y) => <Line key={y} x={18} y={y} w={40} c="ga-sbline" h={5} />)}
      <g className="ga-a-modal">
        <rect className="ga-win" x="86" y="22" width="134" height="108" rx="10" />
        <Line x={98} y={34} w={60} c="ga-head" h={7} />
        <rect className="ga-field" x="98" y="50" width="110" height="14" rx="5" />
        {[98, 130, 162].map((x, i) => (
          <rect key={x} className={i < 2 ? 'ga-tint' : 'ga-field'} x={x} y="74" width="28" height="12" rx="6" />
        ))}
        <rect className="ga-primary" x="160" y="106" width="48" height="16" rx="8" />
      </g>
    </>
  ),
  // The Timeline: task names on the left, bars from start to due date; one bar is dragged two days later.
  timeline: () => (
    <>
      <Win />
      <rect className="ga-field" x="16" y="16" width="208" height="118" rx="8" />
      <line className="ga-divider" x1="74" y1="16" x2="74" y2="134" />
      {[34, 58, 82, 106].map((y, i) => (
        <g key={y}>
          <Line x={24} y={y + 4} w={[38, 30, 42, 26][i]} h={5} />
          {i !== 2 && <rect className={i === 3 ? 'ga-mute' : 'ga-brand'} x={[84, 112, 0, 150][i]} y={y} width={[52, 60, 0, 48][i]} height="12" rx="6" />}
        </g>
      ))}
      <line className="ga-today" x1="140" y1="22" x2="140" y2="128" />
      <g className="ga-a-slide">
        <rect className="ga-brand" x="122" y="82" width="56" height="12" rx="6" />
        <g transform="translate(150 88)">
          <Cursor />
        </g>
      </g>
    </>
  ),
  // A project template: the board on the left is copied into a new project, which gets its start date.
  template: () => (
    <>
      <Win />
      {[16, 128].map((x) => (
        <rect key={x} className="ga-field" x={x} y="40" width="96" height="94" rx="8" />
      ))}
      <Line x={22} y={28} w={50} c="ga-head" h={7} />
      {[0, 1, 2].map((col) => [0, 1].map((row) => <Card key={`s${col}${row}`} x={20 + col * 31} y={50 + row * 24} w={27} h={18} />))}
      <g className="ga-a-copy">
        {[0, 1, 2].map((col) => [0, 1].map((row) => <Card key={`c${col}${row}`} x={132 + col * 31} y={50 + row * 24} w={27} h={18} />))}
      </g>
      <g className="ga-a-date">
        <rect className="ga-brand" x="134" y="22" width="44" height="12" rx="6" />
      </g>
    </>
  ),
  // A person joins a team.
  members: () => (
    <>
      <Win />
      <rect className="ga-col" x="104" y="20" width="116" height="110" rx="10" />
      <Line x={116} y={32} w={50} c="ga-head" h={7} />
      <circle className="ga-chipfill" cx="132" cy="68" r="12" />
      <circle className="ga-ok" cx="160" cy="68" r="12" />
      <circle className="ga-brand ga-a-join" cx="188" cy="68" r="12" />
      <Line x={120} y={100} w={84} />
      <Line x={20} y={40} w={60} />
      <Line x={20} y={52} w={44} />
    </>
  ),
  // Users: a pending account is approved.
  users: () => (
    <>
      <Win />
      {[22, 58, 94].map((y, i) => (
        <g key={y}>
          <circle className={['ga-chipfill', 'ga-brand', 'ga-ok'][i]} cx="34" cy={y + 12} r="10" />
          <Line x={52} y={y + 4} w={80} c="ga-head" />
          <Line x={52} y={y + 15} w={60} h={4} />
          <rect className={i === 1 ? 'ga-a-approve' : 'ga-okbg'} x="160" y={y + 4} width="54" height="16" rx="8" />
          <Line x={170} y={y + 9} w={34} c={i === 1 ? 'ga-a-approve-text' : 'ga-ok'} h={5} />
        </g>
      ))}
    </>
  ),
};

export default function GuideArt({ kind }) {
  const Art = ARTS[kind];
  return (
    <svg className="guide-art" viewBox="0 0 240 150" aria-hidden="true" focusable="false">
      <Art />
    </svg>
  );
}
