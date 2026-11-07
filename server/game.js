// Pure round rules: no I/O, so every judgement can be tested directly.
import { randomBytes } from 'node:crypto';

export const REQUIRED_STEPS = ['lens', 'copy', 'back', 'filter', 'og'];
export const ROUND_TIMEOUT_MS = 120_000;
export const MAX_DRIFT_MS = 2_000;
export const MIN_READ_MS = 100; // Opening the page and copying from it faster than this is not a person.
export const MIN_TRACE_POINTS = 5;

const rid = (n = 6) => randomBytes(n).toString('hex');
const between = (rng, lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
const fakeAddr = (rng, tail = '7777') =>
  `0x${Math.floor(rng() * 0xff).toString(16).padStart(2, '0')}...${tail}`;

function makeTokens(scenario, rng) {
  const first = between(rng, 4_000, 6_000);
  const extra = between(rng, 3, 5);
  const titles = [scenario.en, ...scenario.altEn];
  const tokens = [];
  let at = first;
  for (let i = 0; i <= extra; i++) {
    tokens.push({
      id: `tk_${rid()}`,
      name: scenario.name,
      en: titles[i % titles.length],
      spawnAt: at,
      addr: fakeAddr(rng),
      mc: between(rng, 30, 58) / 10,
      tint: between(rng, 0, 3),
    });
    at += between(rng, 600, 2_500);
  }
  return tokens;
}

function makeOgTokens(scenario, rng) {
  const n = between(rng, 6, 10);
  return Array.from({ length: n }, (_, i) => ({
    id: `og_${rid(4)}`,
    name: scenario.name,
    en: scenario.en,
    ageMonths: between(rng, 3, 20),
    mc: between(rng, 30, 80) / 10,
    addr: fakeAddr(rng, i % 2 ? 'ffff' : '7777'),
  })).sort((a, b) => b.ageMonths - a.ageMonths);
}

export function lensDoc(s) {
  return {
    name: s.name,
    pinyin: s.pinyin,
    en: s.en,
    meaning: s.meaning,
    visual: s.visual,
    image: s.image,
    near: s.nearNames, // Look-alike coins join the trench once the name is on screen.
  };
}

export function createRound({ scenario, decoys = [], rng = Math.random, now = Date.now() }) {
  return {
    id: `r_${rid(8)}`,
    scenario,
    createdAt: now,
    idleMs: between(rng, 3_000, 20_000),
    targetTweetId: `t_${rid()}`,
    decoyTweets: decoys.map((d) => ({ id: `t_${rid()}`, scenario: d })),
    tokens: makeTokens(scenario, rng),
    ogTokens: makeOgTokens(scenario, rng),
    done: {},
    lensView: null,
    ogShown: false,
    t0Client: null,
    t0Server: null,
    lastClient: null,
    flags: new Set(),
    finished: null,
  };
}

const elapsedOf = (st, clientT) => Math.round(clientT - st.t0Client);

function track(st, clientT, serverT) {
  if (typeof clientT !== 'number' || !Number.isFinite(clientT)) {
    st.flags.add('bad_clock');
    return;
  }
  if (st.lastClient !== null && clientT < st.lastClient) st.flags.add('non_monotonic');
  st.lastClient = clientT;
  if (st.t0Client !== null) {
    const drift = Math.abs(clientT - st.t0Client - (serverT - st.t0Server));
    if (drift > MAX_DRIFT_MS) st.flags.add('clock_drift');
  }
}

const mark = (st, step, t) => {
  if (st.done[step] === undefined) st.done[step] = t;
};
const reply = (st, ok, extra = {}) => ({ ok, done: { ...st.done }, ...extra });

// Returns the client-visible response. Answers are only released by the step that earns them.
export function applyEvent(st, type, input = {}, clientT, serverT) {
  if (st.finished) return reply(st, false, { reason: 'finished' });
  track(st, clientT, serverT);

  if (type === 'tweet_shown') {
    if (st.t0Client !== null) return reply(st, false, { reason: 'already_shown' });
    st.t0Client = clientT;
    st.t0Server = serverT;
    if (serverT - st.createdAt < st.idleMs - 500) st.flags.add('early_tweet');
    return reply(st, true);
  }
  if (st.t0Client === null) return reply(st, false, { reason: 'not_started' });

  const t = elapsedOf(st, clientT);
  const answer = st.scenario.name;
  const clean = (v) => String(v ?? '').trim();

  switch (type) {
    case 'lens_open': {
      if (input.tweetId === st.targetTweetId) {
        st.lensView = 'target';
        mark(st, 'lens', t);
        return reply(st, true, { doc: lensDoc(st.scenario) });
      }
      const decoy = st.decoyTweets.find((d) => d.id === input.tweetId);
      if (!decoy) return reply(st, false, { reason: 'unknown_tweet' });
      st.lensView = 'decoy';
      return reply(st, false, { reason: 'wrong_tweet', doc: lensDoc(decoy.scenario) });
    }
    case 'copy': {
      const ok = st.lensView === 'target' && clean(input.text) === answer;
      if (ok) {
        mark(st, 'copy', t);
        if (st.done.copy - st.done.lens < MIN_READ_MS) st.flags.add('too_fast_copy');
      }
      return reply(st, ok, ok ? {} : { reason: 'wrong_copy' });
    }
    case 'back': {
      st.lensView = null;
      if (st.done.copy === undefined) return reply(st, false, { reason: 'copy_first' });
      mark(st, 'back', t);
      return reply(st, true);
    }
    case 'filter': {
      const ready = st.done.back !== undefined;
      const ok = ready && clean(input.keyword) === answer;
      if (!ok) return reply(st, false, { reason: ready ? 'wrong_keyword' : 'copy_first' });
      mark(st, 'filter', t);
      return reply(st, true, { tokens: st.tokens, image: st.scenario.image });
    }
    case 'og_search': {
      const ready = st.done.back !== undefined;
      const ok = ready && clean(input.query) === answer;
      if (!ok) return reply(st, false, { reason: ready ? 'wrong_query' : 'copy_first', results: [] });
      st.ogShown = true;
      return reply(st, true, { results: st.ogTokens, image: st.scenario.image });
    }
    case 'og_close': {
      if (!st.ogShown) return reply(st, false, { reason: 'search_first' });
      mark(st, 'og', t);
      return reply(st, true);
    }
    default:
      return reply(st, false, { reason: 'unknown_event' });
  }
}

export function computeSplits(done, totalMs) {
  const late = [
    ['filter', done.filter],
    ['og', done.og],
  ].sort((a, b) => a[1] - b[1]);
  const splits = {
    lens: done.lens,
    copy: done.copy - done.lens,
    back: done.back - done.copy,
    [late[0][0]]: late[0][1] - done.back,
    [late[1][0]]: late[1][1] - late[0][1],
    buy: totalMs - late[1][1],
  };
  return splits;
}

// A buy either bounces (steps missing, clock keeps running) or ends the round.
export function applyBuy(st, tokenId, clientT, serverT, traceLen = 0) {
  if (st.finished) return { result: 'finished', ...st.finished };
  track(st, clientT, serverT);
  if (st.t0Client === null) return { result: 'blocked', missing: REQUIRED_STEPS, done: {} };

  const ms = elapsedOf(st, clientT);
  const missing = REQUIRED_STEPS.filter((s) => st.done[s] === undefined);
  if (missing.length) return { result: 'blocked', missing, done: { ...st.done } };

  const finish = (status, extra = {}) => {
    st.finished = { status, ms, flags: [...st.flags], ...extra };
    return { result: status, ...st.finished, done: { ...st.done } };
  };

  if (serverT - st.t0Server > ROUND_TIMEOUT_MS) return finish('timeout');

  const first = st.tokens[0];
  if (tokenId !== first.id) {
    const later = st.tokens.some((k) => k.id === tokenId);
    return finish('wrong_token', { reason: later ? 'not_first' : 'not_listed' });
  }

  if (ms < first.spawnAt - 50) st.flags.add('pre_spawn');
  if (traceLen < MIN_TRACE_POINTS) st.flags.add('no_trace');

  const splits = computeSplits(st.done, ms);
  const waited = Math.max(0, first.spawnAt - Math.max(st.done.filter, st.done.og));
  const status = st.flags.size ? 'review' : 'success';
  return finish(status, { splits, waited });
}
