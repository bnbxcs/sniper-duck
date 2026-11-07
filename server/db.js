import { DatabaseSync } from 'node:sqlite';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  scenario_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  ms INTEGER,
  status TEXT NOT NULL,
  reason TEXT,
  flags TEXT,
  splits TEXT,
  waited INTEGER
);
CREATE INDEX IF NOT EXISTS rounds_board ON rounds(status, finished_at, ms);
CREATE INDEX IF NOT EXISTS rounds_user ON rounds(user_id, started_at);
CREATE TABLE IF NOT EXISTS round_events (
  id INTEGER PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id),
  type TEXT NOT NULL,
  client_t REAL,
  server_t INTEGER NOT NULL,
  input TEXT,
  ok INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_round ON round_events(round_id, id);
CREATE TABLE IF NOT EXISTS round_traces (
  round_id TEXT PRIMARY KEY REFERENCES rounds(id),
  points BLOB NOT NULL
);
`;

export const hashToken = (t) => createHash('sha256').update(t).digest('hex');

const BEIJING = 8 * 3600_000;
const DAY = 86_400_000;
export function windowStart(board, now = Date.now()) {
  const local = now + BEIJING;
  const dayStart = Math.floor(local / DAY) * DAY;
  if (board === 'today') return dayStart - BEIJING;
  if (board === 'week') {
    const weekday = (new Date(dayStart).getUTCDay() + 6) % 7; // Monday = 0
    return dayStart - weekday * DAY - BEIJING;
  }
  return 0;
}

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Rounds live in memory while playing, so a restart cannot finish them.
  db.exec(`UPDATE rounds SET status = 'abandoned' WHERE status = 'playing'`);

  const q = {
    addUser: db.prepare('INSERT INTO users (nickname, token_hash, created_at) VALUES (?, ?, ?)'),
    userByNick: db.prepare('SELECT id FROM users WHERE nickname = ?'),
    userByHash: db.prepare('SELECT id, nickname FROM users WHERE token_hash = ?'),
    addRound: db.prepare(`INSERT INTO rounds (id, user_id, scenario_id, started_at, status) VALUES (?, ?, ?, ?, 'playing')`),
    abandon: db.prepare(`UPDATE rounds SET status = 'abandoned' WHERE user_id = ? AND status = 'playing'`),
    finish: db.prepare('UPDATE rounds SET finished_at = ?, ms = ?, status = ?, reason = ?, flags = ?, splits = ?, waited = ? WHERE id = ?'),
    addEvent: db.prepare('INSERT INTO round_events (round_id, type, client_t, server_t, input, ok) VALUES (?, ?, ?, ?, ?, ?)'),
    addTrace: db.prepare('INSERT OR REPLACE INTO round_traces (round_id, points) VALUES (?, ?)'),
    getRound: db.prepare(`SELECT r.*, u.nickname FROM rounds r JOIN users u ON u.id = r.user_id WHERE r.id = ?`),
    getEvents: db.prepare('SELECT type, client_t, server_t, input, ok FROM round_events WHERE round_id = ? ORDER BY id'),
    getTrace: db.prepare('SELECT points FROM round_traces WHERE round_id = ?'),
    bestOf: db.prepare(`SELECT MIN(ms) AS best FROM rounds WHERE user_id = ? AND status = 'success'`),
    rankOf: db.prepare(`SELECT COUNT(*) + 1 AS rank FROM (SELECT MIN(ms) AS b FROM rounds WHERE status = 'success' GROUP BY user_id) WHERE b < ?`),
    myRounds: db.prepare(`SELECT id, scenario_id, started_at, finished_at, ms, status, reason, splits FROM rounds WHERE user_id = ? AND status != 'playing' ORDER BY started_at DESC LIMIT 100`),
    board: db.prepare(`
      WITH best AS (
        SELECT user_id, id, ms, splits, finished_at,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ms, finished_at) AS rn
        FROM rounds WHERE status = 'success' AND finished_at >= ?
      ), stats AS (
        SELECT user_id, COUNT(*) AS played, SUM(status = 'success') AS wins
        FROM rounds WHERE status IN ('success','wrong_token','timeout','review') GROUP BY user_id
      )
      SELECT u.nickname, b.id AS round_id, b.ms, b.splits, b.finished_at, s.played, s.wins
      FROM best b JOIN users u ON u.id = b.user_id JOIN stats s ON s.user_id = b.user_id
      WHERE b.rn = 1 ORDER BY b.ms, b.finished_at LIMIT ?`),
    stable: db.prepare(`
      WITH recent AS (
        SELECT user_id, ms, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY finished_at DESC) AS rn
        FROM rounds WHERE status = 'success'
      ), avg10 AS (
        SELECT user_id, CAST(ROUND(AVG(ms)) AS INTEGER) AS ms, COUNT(*) AS n
        FROM recent WHERE rn <= 10 GROUP BY user_id HAVING n >= 10
      ), stats AS (
        SELECT user_id, COUNT(*) AS played, SUM(status = 'success') AS wins
        FROM rounds WHERE status IN ('success','wrong_token','timeout','review') GROUP BY user_id
      )
      SELECT u.nickname, NULL AS round_id, a.ms, NULL AS splits, NULL AS finished_at, s.played, s.wins
      FROM avg10 a JOIN users u ON u.id = a.user_id JOIN stats s ON s.user_id = a.user_id
      ORDER BY a.ms LIMIT ?`),
  };

  const parse = (s) => (s ? JSON.parse(s) : null);
  const row = (r, i) => ({
    rank: i + 1,
    nickname: r.nickname,
    roundId: r.round_id,
    ms: r.ms,
    splits: parse(r.splits),
    finishedAt: r.finished_at,
    played: r.played,
    wins: r.wins,
  });

  return {
    close: () => db.close(),
    addUser(nickname, tokenHash, now = Date.now()) {
      if (q.userByNick.get(nickname)) return null;
      return Number(q.addUser.run(nickname, tokenHash, now).lastInsertRowid);
    },
    userByToken: (token) => q.userByHash.get(hashToken(token)) ?? null,
    addRound(id, userId, scenarioId, now) {
      q.abandon.run(userId);
      q.addRound.run(id, userId, scenarioId, now);
    },
    addEvent(roundId, type, clientT, serverT, input, ok) {
      const stored = input && Object.keys(input).length ? JSON.stringify(input).slice(0, 500) : null;
      q.addEvent.run(roundId, type, Number.isFinite(clientT) ? clientT : null, serverT, stored, ok ? 1 : 0);
    },
    finishRound(id, f, now) {
      q.finish.run(now, f.ms, f.status, f.reason ?? null, JSON.stringify(f.flags ?? []),
        f.splits ? JSON.stringify(f.splits) : null, f.waited ?? null, id);
    },
    saveTrace(id, points) {
      q.addTrace.run(id, gzipSync(JSON.stringify(points)));
    },
    bestOf: (userId) => q.bestOf.get(userId)?.best ?? null,
    rankOf: (ms) => q.rankOf.get(ms).rank,
    leaderboard(board, now = Date.now(), limit = 100) {
      const rows = board === 'stable' ? q.stable.all(limit) : q.board.all(windowStart(board, now), limit);
      return rows.map(row);
    },
    myRounds: (userId) => q.myRounds.all(userId).map((r) => ({ ...r, splits: parse(r.splits) })),
    roundDetail(id) {
      const r = q.getRound.get(id);
      if (!r || r.status === 'playing') return null; // Never expose an unfinished round.
      const trace = q.getTrace.get(id);
      return {
        id: r.id,
        nickname: r.nickname,
        scenarioId: r.scenario_id,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        ms: r.ms,
        status: r.status,
        reason: r.reason,
        flags: parse(r.flags),
        splits: parse(r.splits),
        waited: r.waited,
        events: q.getEvents.all(id).map((e) => ({ ...e, input: parse(e.input), ok: !!e.ok })),
        tracePoints: trace ? JSON.parse(gunzipSync(trace.points)).length : 0,
      };
    },
  };
}
