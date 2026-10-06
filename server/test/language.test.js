// Interface language (v19): kept with the account, Vietnamese by default, changed by the user themselves.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api, boss;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
});
after(() => server.stop());

test('everyone starts in Vietnamese and may switch to English and back', async () => {
  assert.equal((await api.get('/me', boss)).body.language, 'vi');
  assert.equal((await api.patch('/me', boss, { language: 'en' })).body.language, 'en');
  assert.equal((await api.get('/me', boss)).body.language, 'en', 'kept with the account');
  assert.equal((await api.patch('/me', boss, { language: 'vi' })).body.language, 'vi');
});

test('only vi and en are accepted', async () => {
  for (const language of ['fr', '', null, undefined]) {
    assert.equal((await api.patch('/me', boss, { language })).status, 400);
  }
});

test('a pending account may pick its language too (the waiting screen is translated)', async () => {
  const pending = await api.user('newcomer');
  assert.equal(pending.status, 'pending');
  assert.equal((await api.patch('/me', pending, { language: 'en' })).body.language, 'en');
  assert.equal((await api.get('/teams', pending)).status, 403, 'nothing else opens up');
});
