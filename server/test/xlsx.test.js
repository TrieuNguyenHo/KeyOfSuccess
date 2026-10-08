// The client's .xlsx writer (dashboard export): a valid zip with the workbook parts, typed cells, safe sheet names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { buildXlsx } from '../../client/src/xlsx.js';

// Reads a stored zip through its central directory, checking each entry's CRC and its local header.
function unzip(bytes) {
  const buf = Buffer.from(bytes);
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50);
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    assert.equal(buf.readUInt32LE(offset), 0x04034b50);
    const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const data = buf.subarray(start, start + size);
    assert.equal(crc32(data), crc, name);
    files[name] = data.toString('utf8');
    at += 46 + nameLength;
  }
  return files;
}

test('builds a workbook with one sheet per entry', () => {
  const files = unzip(
    buildXlsx([
      { name: 'Workload', rows: [['Người', 'Mở'], ['Lan Anh <Content> & "Design"', 3], ['Trống', 0]] },
      { name: 'Hoàn thành mỗi ngày', rows: [['Ngày', 'Task'], ['2026-10-08', 2]] },
    ])
  );
  assert.deepEqual(Object.keys(files).sort(), [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet2.xml',
  ]);
  assert.match(files['xl/workbook.xml'], /<sheet name="Hoàn thành mỗi ngày" sheetId="2" r:id="rId2"\/>/);
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Người<\/t>/);
  assert.match(sheet, /Lan Anh &lt;Content&gt; &amp; &quot;Design&quot;/);
  assert.match(sheet, /<c r="B2"><v>3<\/v><\/c>/);
  assert.match(sheet, /<c r="B3"><v>0<\/v><\/c>/);
});

test('sheet names are cut to 31 characters, cleaned and made unique', () => {
  const files = unzip(
    buildXlsx([
      { name: 'A/B: c?', rows: [['x']] },
      { name: 'x'.repeat(40), rows: [['x']] },
      { name: 'X'.repeat(40), rows: [['x']] },
    ])
  );
  const names = [...files['xl/workbook.xml'].matchAll(/name="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ['A B  c', 'x'.repeat(31), `${'X'.repeat(28)} 2`]);
});
