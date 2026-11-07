import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, createReadStream, statSync } from 'node:fs';
import { join, extname, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openDb, hashToken } from './db.js';
import { createRound, applyEvent, applyBuy } from './game.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const CSP = "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const MAX_BODY = 512 * 1024;
const MAX_EVENTS = 500;
const MAX_TRACE = 3_000;

// Fictional accounts only for decoys: no words are ever put in a real person's mouth.
const TARGET_AUTHORS = [
  { author: 'CZ 🔶 BNB', handle: 'cz_binance', initial: 'CZ', color: '#f3ba2f' },
  { author: 'Elon Musk', handle: 'elonmusk', initial: 'E', color: '#c9d4e8' },
  { author: 'Yi He', handle: 'heyibinance', initial: 'Y', color: '#f0a0b8' },
];
const DECOY_AUTHORS = [
  { author: '链上小明', handle: 'chain_xiaoming', initial: '明', color: '#6aa9ff' },
  { author: 'Meme Radar', handle: 'meme_radar_demo', initial: 'M', color: '#a58bff' },
  { author: '土狗观察员', handle: 'tugou_watch', initial: '土', color: '#55c28a' },
];

export function loadScenarios(root = ROOT) {
  const list = JSON.parse(readFileSync(join(root, 'scenarios', 'scenarios.json'), 'utf8'));
  const images = new Map();
  for (const s of list) {
    images.set(s.id, join(root, 'scenarios', 'img', `${s.id}.svg`));
  }
  // Your own images stay out of git: data/local-scenarios/<any>.json + its image.
  const localDir = join(root, 'data', 'local-scenarios');
  if (existsSync(localDir)) {
    readdirSync(localDir).filter((f) => f.endsWith('.json')).sort().forEach((f, i) => {
      const s = JSON.parse(readFileSync(join(localDir, f), 'utf8'));
      s.id = `L${String(i + 1).padStart(2, '0')}`;
      images.set(s.id, join(localDir, s.imageFile));
      list.push(s);
    });
  }
  for (const s of list) s.image = `/scenario-img/${s.id}`;
  return { list, images };
}

function bad(status, error) {
  return { status, body: { error } };
}

export function createApp({ dbPath = join(ROOT, 'data', 'trainer.db'), now = Date.now, rng = Math.random } = {}) {
  const db = openDb(dbPath);
  const { list: scenarios, images } = loadScenarios();
  const active = new Map(); // roundId -> { state, userId, events }
  const hits = new Map();

  const limited = (key, max, windowMs) => {
    const t = now();
    const h = hits.get(key);
    if (!h || t - h.start > windowMs) {
      hits.set(key, { start: t, n: 1 });
      return false;
    }
    h.n += 1;
    return h.n > max;
  };

  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  function publicTweet(id, scenario, who) {
    return { id, image: scenario.image, ...who };
  }

  const routes = {
    'POST /api/users': ({ body, ip }) => {
      if (limited(`reg:${ip}`, 20, 3600_000)) return bad(429, '注册太频繁，请稍后再试');
      const nickname = String(body.nickname ?? '').trim();
      if ([...nickname].length < 2 || [...nickname].length > 16) return bad(400, '昵称需要 2 到 16 个字符');
      if (/[<>&"'\u0000-\u001f]/.test(nickname)) return bad(400, '昵称不能包含特殊符号');
      const token = randomBytes(24).toString('hex');
      const id = db.addUser(nickname, hashToken(token), now());
      if (id === null) return bad(409, '这个昵称已被使用');
      return { status: 201, body: { nickname, token } };
    },

    'GET /api/me': ({ user }) => {
      if (!user) return bad(401, '请先取一个昵称');
      return { status: 200, body: { nickname: user.nickname, best: db.bestOf(user.id) } };
    },

    'GET /api/me/rounds': ({ user }) => {
      if (!user) return bad(401, '请先取一个昵称');
      return { status: 200, body: { rounds: db.myRounds(user.id) } };
    },

    'POST /api/rounds': ({ user }) => {
      if (!user) return bad(401, '请先取一个昵称');
      if (limited(`round:${user.id}`, 60, 60_000)) return bad(429, '开局太频繁');
      for (const [id, a] of active) if (a.userId === user.id) active.delete(id);
      const scenario = pick(scenarios);
      const others = scenarios.filter((s) => s.id !== scenario.id);
      const decoys = [pick(others), pick(others)];
      const t = now();
      const state = createRound({ scenario, decoys, rng, now: t });
      db.addRound(state.id, user.id, scenario.id, t);
      active.set(state.id, { state, userId: user.id, events: 0 });
      return {
        status: 201,
        body: {
          id: state.id,
          idleMs: state.idleMs,
          target: publicTweet(state.targetTweetId, scenario, pick(TARGET_AUTHORS)),
          decoys: state.decoyTweets.map((d, i) => publicTweet(d.id, d.scenario, DECOY_AUTHORS[i % DECOY_AUTHORS.length])),
        },
      };
    },

    'GET /api/leaderboard': ({ url }) => {
      const board = url.searchParams.get('board') ?? 'all';
      if (!['all', 'today', 'week', 'stable'].includes(board)) return bad(400, '没有这个榜单');
      return { status: 200, body: { board, rows: db.leaderboard(board, now()) } };
    },
  };

  function ownedRound(user, id) {
    if (!user) return { err: bad(401, '请先取一个昵称') };
    const a = active.get(id);
    if (!a || a.userId !== user.id) return { err: bad(404, '这一局已结束或不存在') };
    return { a };
  }

  function handleEvent({ user, body, params }) {
    const { a, err } = ownedRound(user, params.id);
    if (err) return err;
    a.events += 1;
    if (a.events > MAX_EVENTS) return bad(429, '操作过多');
    const t = now();
    const res = applyEvent(a.state, String(body.type), body.input ?? {}, body.clientT, t);
    db.addEvent(params.id, String(body.type).slice(0, 32), body.clientT, t, body.input, res.ok);
    return { status: 200, body: res };
  }

  function handleBuy({ user, body, params }) {
    const { a, err } = ownedRound(user, params.id);
    if (err) return err;
    const t = now();
    const trace = Array.isArray(body.trace) ? body.trace.slice(0, MAX_TRACE) : [];
    const res = applyBuy(a.state, String(body.tokenId), body.clientT, t, trace.length);
    db.addEvent(params.id, 'buy', body.clientT, t, { tokenId: String(body.tokenId).slice(0, 40), result: res.result }, res.result === 'success');
    if (res.result === 'blocked') return { status: 200, body: res };

    db.finishRound(params.id, a.state.finished, t);
    db.saveTrace(params.id, trace);
    active.delete(params.id);
    const best = db.bestOf(user.id);
    const out = { ...res, best, scenario: a.state.scenario.name };
    if (res.result === 'success') out.rank = db.rankOf(best);
    return { status: 200, body: out };
  }

  function dispatch(ctx) {
    const { method, pathname } = ctx;
    const direct = routes[`${method} ${pathname}`];
    if (direct) return direct(ctx);
    let m = pathname.match(/^\/api\/rounds\/(r_[0-9a-f]+)\/(events|buy)$/);
    if (m && method === 'POST') {
      ctx.params = { id: m[1] };
      return m[2] === 'events' ? handleEvent(ctx) : handleBuy(ctx);
    }
    m = pathname.match(/^\/api\/rounds\/(r_[0-9a-f]+)$/);
    if (m && method === 'GET') {
      const detail = db.roundDetail(m[1]);
      return detail ? { status: 200, body: detail } : bad(404, '没有这一局的记录');
    }
    return bad(404, 'not found');
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new Error('too_large'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(v && typeof v === 'object' ? v : {});
        } catch {
          reject(new Error('bad_json'));
        }
      });
      req.on('error', reject);
    });
  }

  function sendFile(res, file) {
    const type = MIME[extname(file).toLowerCase()];
    if (!type || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  }

  function serveStatic(res, pathname) {
    const m = pathname.match(/^\/scenario-img\/([A-Za-z0-9]+)$/);
    if (m) return sendFile(res, images.get(m[1]) ?? '');
    const rel = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    const file = join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    return sendFile(res, file);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    try {
      if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname);
      const body = req.method === 'POST' ? await readBody(req) : {};
      const auth = req.headers.authorization ?? '';
      const user = auth.startsWith('Bearer ') ? db.userByToken(auth.slice(7)) : null;
      const out = dispatch({ method: req.method, pathname: url.pathname, url, body, user, ip: req.socket.remoteAddress });
      res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out.body));
    } catch (e) {
      const known = e.message === 'bad_json' || e.message === 'too_large';
      if (!known && !(e instanceof URIError)) console.error(e);
      if (!res.headersSent) res.writeHead(known || e instanceof URIError ? 400 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: known ? '请求无效' : '服务器出错' }));
    }
  });

  return { server, db, scenarios, active };
}
