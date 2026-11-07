import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, loadScenarios } from '../server/app.js';
import { windowStart } from '../server/db.js';
import { NOISE_NAMES } from '../public/noise.js';

let app, base, dir;
let clock = 1_800_000_000_000;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'trainer-'));
  app = createApp({ dbPath: join(dir, 't.db'), now: () => clock });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => {
  await new Promise((r) => app.server.close(r));
  app.db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}
const join_ = async (nickname) => (await call('POST', '/api/users', { body: { nickname } })).body.token;

// Plays a whole round through the API, as the browser does. Returns the buy reply.
async function play(token, totalMs, pickToken = (t) => t[0]) {
  const start = (await call('POST', '/api/rounds', { token })).body;
  clock += start.idleMs;
  const t0 = 5000;
  const send = async (type, input, t) => {
    clock += 0;
    return (await call('POST', `/api/rounds/${start.id}/events`, { token, body: { type, input, clientT: t0 + t } })).body;
  };
  const baseClock = clock;
  const at = (t) => { clock = baseClock + t; };
  at(0); await send('tweet_shown', {}, 0);
  at(1000); const lens = await send('lens_open', { tweetId: start.target.id }, 1000);
  at(2000); await send('copy', { text: lens.doc.name }, 2000);
  at(2500); await send('back', {}, 2500);
  at(3000); const f = await send('filter', { keyword: lens.doc.name }, 3000);
  at(3500); await send('og_search', { query: lens.doc.name }, 3500);
  at(3900); await send('og_close', {}, 3900);
  const chosen = pickToken(f.tokens);
  const t = Math.max(totalMs, chosen.spawnAt + 10);
  at(t);
  const trace = Array.from({ length: 20 }, (_, i) => [i * 100, i, i]);
  return (await call('POST', `/api/rounds/${start.id}/buy`, { token, body: { tokenId: chosen.id, clientT: t0 + t, trace } })).body;
}

test('nicknames are unique, validated and never echo HTML', async () => {
  assert.equal((await call('POST', '/api/users', { body: { nickname: 'a' } })).status, 400);
  assert.equal((await call('POST', '/api/users', { body: { nickname: '<img src=x>' } })).status, 400);
  assert.equal((await call('POST', '/api/users', { body: { nickname: 'Alice' } })).status, 201);
  assert.equal((await call('POST', '/api/users', { body: { nickname: 'alice' } })).status, 409);
});

test('the opening reply reveals no answer', async () => {
  const token = await join_('NoLeak');
  const res = await call('POST', '/api/rounds', { token });
  const names = app.scenarios.map((s) => s.name);
  const text = JSON.stringify(res.body);
  for (const n of names) assert.ok(!text.includes(n), `leaked ${n}`);
  assert.equal(res.body.tokens, undefined);
  // An unfinished round is not readable either.
  assert.equal((await call('GET', `/api/rounds/${res.body.id}`)).status, 404);
});

test("a stranger cannot act on someone else's round", async () => {
  const a = await join_('Owner');
  const b = await join_('Stranger');
  const r = (await call('POST', '/api/rounds', { token: a })).body;
  const res = await call('POST', `/api/rounds/${r.id}/events`, { token: b, body: { type: 'tweet_shown', clientT: 1 } });
  assert.equal(res.status, 404);
  assert.equal((await call('POST', '/api/rounds', {})).status, 401);
});

test('a full round reaches the ladder and keeps its operation log', async () => {
  const token = await join_('Fast');
  const res = await play(token, 9000);
  assert.equal(res.result, 'success');
  assert.equal(res.ms, 9000);
  assert.equal(res.best, 9000);
  const rows = (await call('GET', '/api/leaderboard?board=all')).body.rows;
  const me = rows.find((r) => r.nickname === 'Fast');
  assert.equal(me.ms, 9000);
  assert.equal(me.rank, res.rank);
  const detail = (await call('GET', `/api/rounds/${me.roundId}`)).body;
  assert.deepEqual(detail.events.map((e) => e.type), ['tweet_shown', 'lens_open', 'copy', 'back', 'filter', 'og_search', 'og_close', 'buy']);
  assert.equal(detail.tracePoints, 20);
  assert.equal(detail.status, 'success');
});

test('the ladder keeps each player once, at their fastest, fastest first', async () => {
  const slow = await join_('SlowPoke');
  await play(slow, 30000);
  await play(slow, 12000);
  await play(slow, 20000);
  const fast = await join_('Quick');
  await play(fast, 8000);
  const rows = (await call('GET', '/api/leaderboard?board=all')).body.rows;
  const mine = rows.filter((r) => r.nickname === 'SlowPoke');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].ms, 12000);
  assert.equal(mine[0].played, 3);
  const ms = rows.map((r) => r.ms);
  assert.deepEqual(ms, [...ms].sort((a, b) => a - b));
  assert.ok(rows.findIndex((r) => r.nickname === 'Quick') < rows.findIndex((r) => r.nickname === 'SlowPoke'));
});

test('a wrong coin is logged but never ranked', async () => {
  const token = await join_('Wrongy');
  const res = await play(token, 9000, (t) => t[1]);
  assert.equal(res.result, 'wrong_token');
  const rows = (await call('GET', '/api/leaderboard?board=all')).body.rows;
  assert.ok(!rows.some((r) => r.nickname === 'Wrongy'));
  const mine = (await call('GET', '/api/me/rounds', { token })).body.rounds;
  assert.equal(mine[0].status, 'wrong_token');
});

test('the stable board needs ten wins', async () => {
  const token = await join_('Steady');
  for (let i = 0; i < 9; i++) await play(token, 10000);
  let rows = (await call('GET', '/api/leaderboard?board=stable')).body.rows;
  assert.ok(!rows.some((r) => r.nickname === 'Steady'));
  await play(token, 20000);
  rows = (await call('GET', '/api/leaderboard?board=stable')).body.rows;
  assert.equal(rows.find((r) => r.nickname === 'Steady').ms, 11000);
});

test('today and week boards start at Beijing midnight and Monday', () => {
  // 2026-11-07 is a Saturday; 05:50 UTC is 13:50 in Beijing.
  const t = Date.UTC(2026, 10, 7, 5, 50);
  assert.equal(windowStart('today', t), Date.UTC(2026, 10, 6, 16));
  assert.equal(windowStart('week', t), Date.UTC(2026, 11 - 1, 1, 16));
  assert.equal(windowStart('all', t), 0);
});

test('static files cannot escape public/ and carry a script policy', async () => {
  const page = await fetch(`${base}/`);
  assert.ok(page.headers.get('content-security-policy').includes("script-src 'self'"));
  const raw = await new Promise(async (resolve) => {
    const { request } = await import('node:http');
    const req = request(`${base}/..%2f..%2fserver%2fapp.js`, (r) => { r.resume(); resolve(r.statusCode); });
    req.end();
  });
  assert.notEqual(raw, 200);
  assert.equal((await fetch(`${base}/scenario-img/../../package.json`)).status, 404);
});

test('broken request bodies are refused', async () => {
  const res = await fetch(`${base}/api/users`, { method: 'POST', body: '{nope' });
  assert.equal(res.status, 400);
});

test('built-in scenarios are complete and cannot collide with trench noise', () => {
  const { list } = loadScenarios();
  const builtin = list.filter((s) => s.id.startsWith('s'));
  assert.equal(builtin.length, 20);
  assert.equal(new Set(builtin.map((s) => s.name)).size, 20);
  for (const s of list) {
    for (const k of ['name', 'pinyin', 'en', 'meaning', 'visual']) assert.ok(s[k], `${s.id} ${k}`);
    assert.ok(s.altEn.length >= 2, s.id);
    assert.equal(s.nearNames.length, 3, s.id);
    for (const n of s.nearNames) assert.ok(!n.includes(s.name), `${s.id} near ${n} would pass the filter`);
    for (const noise of NOISE_NAMES) assert.ok(!noise[0].includes(s.name), `${noise[0]} contains ${s.name}`);
  }
  for (const s of builtin) {
    const file = new URL(`../scenarios/img/${s.id}.svg`, import.meta.url);
    assert.ok(existsSync(file), s.id);
    const svg = readFileSync(file, 'utf8');
    assert.ok(!svg.includes(s.name), `${s.id} image shows its name`);
  }
});
