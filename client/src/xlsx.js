// A minimal .xlsx writer (no dependency): one sheet per { name, rows, chart? }, first row bold and frozen,
// numbers as numbers, Dates as dates, everything else as text, column widths from the longest value, and
// an optional native Excel chart beside the table. The zip is stored uncompressed: dashboard exports are
// a few dozen kilobytes.
//
// chart: { type: 'bar' (horizontal) | 'column', grouping: 'clustered' | 'stacked' | 'percentStacked', title,
//          cat: column index of the labels, series: [{ col, color: 'RRGGBB', label?: 'RRGGBB' }] } over the rows
//          below the header; each series is named by its header cell. `label` writes each value on its bar in that
//          color (centred in stacked bars, above columns), zeros left out.

const NS = 'http://schemas.openxmlformats.org';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const xml = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const column = (i) => (i >= 26 ? column(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

// Excel's day number of a local calendar date.
const serial = (d) => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;

// Excel refuses sheet names over 31 characters, with []:*?/\ or repeated (case-insensitive).
function sheetNames(sheets) {
  const used = new Set();
  return sheets.map((s, i) => {
    const base = String(s.name).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

// Cell styles (cellXfs in styles.xml): 0 plain, 1 bold header, 2 date.
function cellXml(v, ref, header) {
  const style = header ? ' s="1"' : '';
  if (v instanceof Date) return `<c r="${ref}" s="2"><v>${serial(v)}</v></c>`;
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}

function sheetXml(rows, withChart) {
  const widths = [];
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          if (v == null || v === '') return '';
          widths[c] = Math.max(widths[c] ?? 0, v instanceof Date ? 10 : String(v).length);
          return cellXml(v, `${column(c)}${r + 1}`, r === 0);
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const cols = widths
    .map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, Math.max(8, (w ?? 0) + 2))}" customWidth="1"/>`)
    .join('');
  return (
    `${HEAD}<worksheet xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${body}</sheetData>` +
    (withChart ? '<drawing r:id="rId1"/>' : '') +
    '</worksheet>'
  );
}

const sheetRef = (sheet) => `'${sheet.replace(/'/g, "''")}'`;

// A data range of the chart, with the cached values that Excel shows before recalculating and that
// other readers show as they are.
function rangeXml(sheet, rows, col) {
  const values = rows.slice(1).map((r) => r[col]);
  const dates = values[0] instanceof Date;
  const numeric = dates || values.every((v) => typeof v === 'number');
  const pts = values.map((v, i) => `<c:pt idx="${i}"><c:v>${xml(v instanceof Date ? serial(v) : v ?? '')}</c:v></c:pt>`).join('');
  const f = `<c:f>${sheetRef(sheet)}!$${column(col)}$2:$${column(col)}$${rows.length}</c:f>`;
  return numeric
    ? `<c:numRef>${f}<c:numCache><c:formatCode>${dates ? 'dd/mm' : 'General'}</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache></c:numRef>`
    : `<c:strRef>${f}<c:strCache><c:ptCount val="${values.length}"/>${pts}</c:strCache></c:strRef>`;
}

const fill = (color) => `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;
const line = (color) => `<a:ln>${color ? fill(color) : '<a:noFill/>'}</a:ln>`;
// Light-theme tokens (client/src/styles/tokens.css): --ink, --hairline, --divider-soft.
const INK = '2C2C2A';
const HAIRLINE = 'E0E0E0';
const GRID = 'F0F0F0';

// Values written on the bars; the format 0;;; shows positive numbers and hides zeros (empty segments).
const dataLabels = (color, position) =>
  '<c:dLbls><c:numFmt formatCode="0;;;" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' +
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1">${fill(color)}</a:defRPr></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr>` +
  `<c:dLblPos val="${position}"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/>` +
  '<c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>';

function chartXml(sheet, rows, { type, grouping = 'clustered', title, cat, series }) {
  const horizontal = type === 'bar';
  const labelPos = grouping === 'clustered' ? 'outEnd' : 'ctr';
  const ser = series
    .map(
      (s, i) =>
        `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` +
        `<c:tx><c:strRef><c:f>${sheetRef(sheet)}!$${column(s.col)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xml(rows[0][s.col])}</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
        `<c:spPr>${fill(s.color)}</c:spPr><c:invertIfNegative val="0"/>${s.label ? dataLabels(s.label, labelPos) : ''}` +
        `<c:cat>${rangeXml(sheet, rows, cat)}</c:cat><c:val>${rangeXml(sheet, rows, s.col)}</c:val></c:ser>`
    )
    .join('');
  const ticks = '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>';
  // Horizontal bars list the first row on top, like the dashboard; the value axis then sits at the bottom.
  const catAx =
    `<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/>` +
    `<c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="${rows[1]?.[cat] instanceof Date ? 'dd/mm' : 'General'}" sourceLinked="0"/>${ticks}` +
    `<c:spPr>${line(HAIRLINE)}</c:spPr><c:crossAx val="2"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const valAx =
    `<c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'b' : 'l'}"/>` +
    `<c:majorGridlines><c:spPr>${line(GRID)}</c:spPr></c:majorGridlines>` +
    `<c:numFmt formatCode="${grouping === 'percentStacked' ? '0%' : 'General'}" sourceLinked="0"/>${ticks}` +
    `<c:spPr>${line()}</c:spPr><c:crossAx val="1"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
  return (
    `${HEAD}<c:chartSpace xmlns:c="${NS}/drawingml/2006/chart" xmlns:a="${NS}/drawingml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships">` +
    '<c:roundedCorners val="0"/><c:chart>' +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="1200" b="1"/><a:t>${xml(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
    '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>' +
    `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${ser}` +
    `<c:gapWidth val="${horizontal ? 60 : 40}"/>${grouping === 'clustered' ? '' : '<c:overlap val="100"/>'}<c:axId val="1"/><c:axId val="2"/></c:barChart>` +
    `${catAx}${valAx}</c:plotArea>` +
    (series.length > 1 ? '<c:legend><c:legendPos val="t"/><c:overlay val="0"/></c:legend>' : '') +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
    `<c:spPr>${fill('FFFFFF')}${line()}</c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900">${fill(INK)}</a:defRPr></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr>` +
    '</c:chartSpace>'
  );
}

// Places the chart one empty column right of the table, tall enough for every bar.
function drawingXml(rows, { type }) {
  const left = Math.max(...rows.map((r) => r.length)) + 1;
  const height = type === 'bar' ? Math.max(16, Math.ceil((rows.length - 1) * 1.6) + 6) : 18;
  const at = (col, row) => `<xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
  return (
    `${HEAD}<xdr:wsDr xmlns:xdr="${NS}/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS}/drawingml/2006/main">` +
    `<xdr:twoCellAnchor editAs="oneCell"><xdr:from>${at(left, 1)}</xdr:from><xdr:to>${at(left + 10, 1 + height)}</xdr:to>` +
    '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
    '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
    `<a:graphic><a:graphicData uri="${NS}/drawingml/2006/chart"><c:chart xmlns:c="${NS}/drawingml/2006/chart" xmlns:r="${NS}/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic>` +
    '</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>'
  );
}

const rels = (items) =>
  `${HEAD}<Relationships xmlns="${NS}/package/2006/relationships">` +
  items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${NS}/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('') +
  '</Relationships>';

const override = (part, type) => `<Override PartName="/xl/${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}"/>`;

function workbookFiles(sheets) {
  const names = sheetNames(sheets);
  // Drawing N and chart N belong to the Nth sheet that has a chart and data under its header.
  const charted = sheets.map((s, i) => (s.chart && s.rows.length > 1 ? i : -1)).filter((i) => i >= 0);
  const files = {
    '[Content_Types].xml':
      `${HEAD}<Types xmlns="${NS}/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      override('workbook.xml', 'spreadsheetml.sheet.main+xml') +
      override('styles.xml', 'spreadsheetml.styles+xml') +
      names.map((_, i) => override(`worksheets/sheet${i + 1}.xml`, 'spreadsheetml.worksheet+xml')).join('') +
      charted.map((_, n) => override(`drawings/drawing${n + 1}.xml`, 'drawing+xml') + override(`charts/chart${n + 1}.xml`, 'drawingml.chart+xml')).join('') +
      '</Types>',
    '_rels/.rels': rels([['rId1', 'officeDocument', 'xl/workbook.xml']]),
    'xl/workbook.xml':
      `${HEAD}<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets>` +
      names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': rels([
      ...names.map((_, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]),
      [`rId${names.length + 1}`, 'styles', 'styles.xml'],
    ]),
    'xl/styles.xml':
      `${HEAD}<styleSheet xmlns="${NS}/spreadsheetml/2006/main">` +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>',
  };
  sheets.forEach((s, i) => {
    const n = charted.indexOf(i) + 1;
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.rows, n > 0);
    if (!n) return;
    files[`xl/worksheets/_rels/sheet${i + 1}.xml.rels`] = rels([['rId1', 'drawing', `../drawings/drawing${n}.xml`]]);
    files[`xl/drawings/drawing${n}.xml`] = drawingXml(s.rows, s.chart);
    files[`xl/drawings/_rels/drawing${n}.xml.rels`] = rels([['rId1', 'chart', `../charts/chart${n}.xml`]]);
    files[`xl/charts/chart${n}.xml`] = chartXml(names[i], s.rows, s.chart);
  });
  return files;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Stored (uncompressed) zip of { path: text }.
function zip(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = enc.encode(path);
    const data = enc.encode(text);
    const crc = crc32(data);
    // Fields shared by the local and central headers: version, flags, method, time, date, crc, sizes, name length.
    const common = (v) => {
      v.setUint16(0, 20, true);
      v.setUint16(2, 0x0800, true); // UTF-8 names
      v.setUint16(4, 0, true);
      v.setUint16(6, time, true);
      v.setUint16(8, date, true);
      v.setUint32(10, crc, true);
      v.setUint32(14, data.length, true);
      v.setUint32(18, data.length, true);
      v.setUint16(22, name.length, true);
    };
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    common(new DataView(local.buffer, 4));
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    common(new DataView(central.buffer, 6));
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function buildXlsx(sheets) {
  return zip(workbookFiles(sheets));
}

export function downloadXlsx(filename, sheets) {
  const blob = new Blob([buildXlsx(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
