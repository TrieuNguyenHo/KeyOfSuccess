// The English interface stays complete: every tr() key in the client has an English text, no Vietnamese text in
// the client escapes tr(), and every Vietnamese message the server sends can be translated by trMessage().
// Reads the sources with @babel/parser (installed with the client's Vite React plugin); starts no server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIENT = join(ROOT, 'client', 'src');
const require = createRequire(join(ROOT, 'client', 'package.json'));
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const EN = (await import(pathToFileURL(join(CLIENT, 'i18n.en.js')).href)).default;

const VI = /[À-ỹĐđ]/;
// Each language is named in its own words in the VI / EN switch.
const SELF_NAMES = ['Tiếng Việt'];
const inDir = (dir) => readdirSync(join(CLIENT, dir), { recursive: true }).filter((f) => /\.jsx?$/.test(f)).map((f) => `${dir}/${f}`);
const clientFiles = ['App.jsx', 'api.js', 'utils.js', ...inDir('components'), ...inDir('features')];
const SERVER = join(ROOT, 'server', 'src');
const serverFiles = readdirSync(SERVER, { recursive: true }).filter((f) => f.endsWith('.js'));
const ast = (file, jsx = true) => parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: jsx ? ['jsx'] : [] });
const isTrKey = (p) => {
  const call = p.parentPath;
  return call.isCallExpression() && call.node.callee.name === 'tr' && call.node.arguments[0] === p.node;
};

test('every tr() key in the client has an English text', () => {
  const missing = [];
  for (const f of clientFiles) {
    traverse(ast(join(CLIENT, f)), {
      StringLiteral(p) {
        if (isTrKey(p) && EN[p.node.value] === undefined) missing.push(`${f}: ${p.node.value}`);
      },
    });
  }
  assert.deepEqual(missing, []);
});

test('no Vietnamese text in the client escapes tr()', () => {
  const loose = [];
  for (const f of clientFiles) {
    traverse(ast(join(CLIENT, f)), {
      'StringLiteral|TemplateLiteral|JSXText'(p) {
        const text = p.isTemplateLiteral() ? p.node.quasis.map((x) => x.value.cooked).join('') : p.node.value;
        if (VI.test(text) && !isTrKey(p) && !SELF_NAMES.includes(text)) loose.push(`${f}:${p.node.loc.start.line} ${text.trim().slice(0, 60)}`);
      },
    });
  }
  assert.deepEqual(loose, []);
});

test("every Vietnamese message the server sends has an English text", () => {
  // Patterns as trMessage() builds them: {placeholders} stand for whatever the server put there.
  const patterns = Object.keys(EN).map((key) => new RegExp(`^${key.split(/\{\w+\}/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?')}$`));
  const untranslated = [];
  let checked = 0;
  for (const file of serverFiles) traverse(ast(join(SERVER, file), false), {
    'StringLiteral|TemplateLiteral'(p) {
      // Only what reaches the client: error bodies, badRequest(), forbidden() and the shared message constants.
      const call = p.findParent((x) => x.isCallExpression());
      const callee = call?.node.callee.name;
      const isMessage =
        ['badRequest', 'forbidden'].includes(callee) ||
        (p.parentPath.isObjectProperty() && p.parent.key.name === 'error') ||
        (p.parentPath.isVariableDeclarator() && /^[A-Z_]+$/.test(p.parent.id.name) && callee === undefined);
      if (!isMessage) return;
      const text = p.isTemplateLiteral() ? p.node.quasis.map((x) => x.value.cooked).join('1') : p.node.value;
      if (!VI.test(text)) return;
      checked++;
      if (!patterns.some((re) => re.test(text))) untranslated.push(text);
    },
  });
  assert.deepEqual(untranslated, []);
  assert.ok(checked > 50, `only ${checked} server messages found; the scan no longer matches the code`);
});
