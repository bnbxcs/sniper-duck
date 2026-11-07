import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound, applyEvent, applyBuy, REQUIRED_STEPS } from '../server/game.js';

const scenario = { id: 's', name: '躺枪', pinyin: 'x', en: 'Caught', altEn: ['A', 'B'], meaning: 'm', visual: 'v', image: '/i', nearNames: ['躺抢'] };
const decoy = { ...scenario, id: 'd', name: '吃瓜' };

function fresh() {
  const st = createRound({ scenario, decoys: [decoy], rng: () => 0.5, now: 0 });
  st.idleMs = 3000;
  return st;
}
// The client and server clocks run in step; t is ms since the tweet appeared.
const ev = (st, type, input, t) => applyEvent(st, type, input, 1000 + t, 3000 + t);
function completeAll(st, order = ['filter', 'og']) {
  ev(st, 'tweet_shown', {}, 0);
  ev(st, 'lens_open', { tweetId: st.targetTweetId }, 1500);
  ev(st, 'copy', { text: '躺枪' }, 3000);
  ev(st, 'back', {}, 3500);
  let t = 4000;
  for (const o of order) {
    if (o === 'filter') ev(st, 'filter', { keyword: '躺枪' }, t);
    else {
      ev(st, 'og_search', { query: '躺枪' }, t);
      ev(st, 'og_close', {}, t + 500);
    }
    t += 1000;
  }
}

test('a tweet cannot be timed before it was due', () => {
  const st = fresh();
  applyEvent(st, 'tweet_shown', {}, 10, 100);
  assert.ok(st.flags.has('early_tweet'));
});

test('the name is only released by opening the target tweet', () => {
  const st = fresh();
  ev(st, 'tweet_shown', {}, 0);
  const wrong = ev(st, 'lens_open', { tweetId: st.decoyTweets[0].id }, 500);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.doc.name, '吃瓜');
  assert.equal(wrong.done.lens, undefined);
  const right = ev(st, 'lens_open', { tweetId: st.targetTweetId }, 1000);
  assert.equal(right.doc.name, '躺枪');
  assert.equal(right.done.lens, 1000);
});

test('copying the pinyin or the wrong page does not count', () => {
  const st = fresh();
  ev(st, 'tweet_shown', {}, 0);
  ev(st, 'lens_open', { tweetId: st.decoyTweets[0].id }, 500);
  assert.equal(ev(st, 'copy', { text: '躺枪' }, 800).ok, false);
  ev(st, 'lens_open', { tweetId: st.targetTweetId }, 1000);
  assert.equal(ev(st, 'copy', { text: 'tǎng qiāng' }, 1500).ok, false);
  assert.equal(ev(st, 'copy', { text: ' 躺枪\n' }, 2000).ok, true);
});

test('coins and old coins stay hidden until the keyword is earned', () => {
  const st = fresh();
  ev(st, 'tweet_shown', {}, 0);
  const early = ev(st, 'filter', { keyword: '躺枪' }, 300);
  assert.equal(early.ok, false);
  assert.equal(early.tokens, undefined);
  assert.deepEqual(ev(st, 'og_search', { query: '躺枪' }, 350).results, []);
  ev(st, 'lens_open', { tweetId: st.targetTweetId }, 1000);
  ev(st, 'copy', { text: '躺枪' }, 1500);
  ev(st, 'back', {}, 1800);
  assert.equal(ev(st, 'filter', { keyword: '躺抢' }, 2000).ok, false);
  assert.ok(ev(st, 'filter', { keyword: '躺枪' }, 2500).tokens.length >= 4);
});

test('buying with a step missing bounces and the round keeps running', () => {
  const st = fresh();
  ev(st, 'tweet_shown', {}, 0);
  ev(st, 'lens_open', { tweetId: st.targetTweetId }, 1000);
  ev(st, 'copy', { text: '躺枪' }, 2000);
  ev(st, 'back', {}, 2500);
  ev(st, 'filter', { keyword: '躺枪' }, 3000);
  const res = applyBuy(st, st.tokens[0].id, 1000 + 6500, 3000 + 6500, 50);
  assert.equal(res.result, 'blocked');
  assert.deepEqual(res.missing, ['og']);
  assert.equal(st.finished, null);
});

test('closing an OG search with no results does not complete the step', () => {
  const st = fresh();
  ev(st, 'tweet_shown', {}, 0);
  assert.equal(ev(st, 'og_close', {}, 500).ok, false);
  assert.equal(st.done.og, undefined);
});

for (const order of [['filter', 'og'], ['og', 'filter']]) {
  test(`buying the first coin wins, ${order.join(' then ')}`, () => {
    const st = fresh();
    completeAll(st, order);
    assert.deepEqual(REQUIRED_STEPS.filter((s) => st.done[s] === undefined), []);
    const t = Math.max(st.tokens[0].spawnAt, 6000) + 700;
    const res = applyBuy(st, st.tokens[0].id, 1000 + t, 3000 + t, 50);
    assert.equal(res.result, 'success');
    assert.equal(res.ms, t);
    const sum = Object.values(res.splits).reduce((a, b) => a + b, 0);
    assert.equal(sum, t);
  });
}

test('a later coin with the same name loses the round', () => {
  const st = fresh();
  completeAll(st);
  const res = applyBuy(st, st.tokens[1].id, 1000 + 9000, 3000 + 9000, 50);
  assert.equal(res.result, 'wrong_token');
  assert.equal(res.reason, 'not_first');
});

test('a look-alike coin loses the round', () => {
  const st = fresh();
  completeAll(st);
  const res = applyBuy(st, 'n123', 1000 + 9000, 3000 + 9000, 50);
  assert.equal(res.result, 'wrong_token');
  assert.equal(res.reason, 'not_listed');
});

test('a run over two minutes times out', () => {
  const st = fresh();
  completeAll(st);
  const res = applyBuy(st, st.tokens[0].id, 1000 + 130000, 3000 + 130000, 50);
  assert.equal(res.result, 'timeout');
});

test('implausible runs go to review, not the ladder', () => {
  const noTrace = fresh();
  completeAll(noTrace);
  assert.equal(applyBuy(noTrace, noTrace.tokens[0].id, 1000 + 9000, 3000 + 9000, 0).result, 'review');

  const faked = fresh();
  completeAll(faked);
  // Client says 7 s but the server watched 30 s go by.
  assert.equal(applyBuy(faked, faked.tokens[0].id, 1000 + 7000, 3000 + 30000, 50).result, 'review');
  assert.ok(faked.finished.flags.includes('clock_drift'));

  const beforeSpawn = fresh();
  completeAll(beforeSpawn);
  beforeSpawn.tokens[0].spawnAt = 8000;
  assert.equal(applyBuy(beforeSpawn, beforeSpawn.tokens[0].id, 1000 + 6000, 3000 + 6000, 50).result, 'review');
  assert.ok(beforeSpawn.finished.flags.includes('pre_spawn'));
});

test('a finished round cannot be replayed for a better time', () => {
  const st = fresh();
  completeAll(st);
  const first = applyBuy(st, st.tokens[0].id, 1000 + 8000, 3000 + 8000, 50);
  const again = applyBuy(st, st.tokens[0].id, 1000 + 1, 3000 + 8100, 50);
  assert.equal(again.ms, first.ms);
});
