import { NOISE_NAMES, NOISE_COLORS, NOISE_TWEETS, NOISE_NOTES } from './noise.js';
import { ICON, hydrateIcons } from './icons.js';
import { renderShareCard, shareText, tweetUrl, saveBlob, copyImage } from './share.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(2)}s`);

const STEPS = [
  ['lens', '搜图', '把鼠标移到高亮推文的图片上，点右上角放大镜。'],
  ['copy', '复制名字', '只选中名字，按 Cmd+C。拼音和英文不算。'],
  ['back', '回战壕', '按 Esc 或关掉搜图标签页。'],
  ['filter', '过滤', '把名字粘贴到「新创建」的关键词框，或点漏斗打开筛选。'],
  ['og', '搜 OG', '按 / 粘贴名字，看到老币后按 Esc。'],
  ['buy', '买入', '点最早出现（最下面）的同名币右侧的买入区。'],
];
const SPLIT_COLORS = { lens: '#6aa9ff', copy: '#a58bff', back: '#5e626a', filter: '#55c28a', og: '#f3ba2f', buy: '#e5484d' };
const REASON_TEXT = { not_first: '买到了后来出现的同名币，不是第一个', not_listed: '买到了不相关的币' };
const STATUS_TEXT = { success: '成功', wrong_token: '买错', timeout: '超时', review: '待审核', abandoned: '放弃' };
const VIDEO_REF_MS = 16_000;
const ALERT_HANDLES = new Set(['cz_binance', 'heyibinance']);

// Browsers only allow sound after a user gesture, so the context is opened when a round is started.
let audio = null;
function unlockAudio() {
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) return;
  audio ??= new Ctx();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
}
// Three loud rising double beeps, about 0.7 s, impossible to mistake for the background.
function playAlert() {
  if (!audio) return;
  const start = audio.currentTime + 0.01;
  for (let i = 0; i < 3; i++) {
    [880, 1320].forEach((freq, j) => {
      const at = start + i * 0.24 + j * 0.1;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.1);
    });
  }
}

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window: keep playing */ } },
};

const S = {
  token: store.get('trainer_token'),
  nickname: store.get('trainer_nick'),
  best: null,
  phase: 'lobby', // lobby | idle | live | done
  round: null,
  t0: 0,
  done: {},
  q: Promise.resolve(),
  timers: [],
  trace: [],
  lastTrace: 0,
  tokens: [], // server-issued coins, once the filter is right
  noiseNew: [],
  near: [],
  keyword: '',
  sentKeyword: '',
  sentQuery: '',
  lensOpen: false,
  ogOpen: false,
  buying: false,
  monHover: false,
  board: 'all',
};

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || '网络错误'), { status: res.status });
  return data;
}

const roundT = () => performance.now();
// Events go out strictly in order; each carries the moment it really happened.
function send(type, input = {}, clientT = roundT()) {
  const id = S.round.id;
  const p = S.q.then(() => api('POST', `/api/rounds/${id}/events`, { type, input, clientT }));
  S.q = p.catch(() => {});
  return p.then((res) => {
    if (S.round?.id === id && res.done) { S.done = res.done; renderSteps(); }
    return res;
  });
}

let toastTimer;
function toast(text, good = false) {
  const el = $('toast');
  el.textContent = text;
  el.className = good ? 'toast good' : 'toast';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

/* ---------- background market ---------- */

let serial = 0;
function makeNoise() {
  const near = S.near.length && Math.random() < 0.15 ? pick(S.near) : null;
  const [noiseName, en] = pick(NOISE_NAMES);
  const name = near ?? noiseName;
  const id = `n${++serial}`;
  return {
    id, name, en,
    born: performance.now(),
    addr: `0x${Math.floor(Math.random() * 0xff).toString(16).padStart(2, '0')}...7777`,
    mc: rand(3, 9).toFixed(1),
    tint: Math.floor(Math.random() * 4),
    color: pick(NOISE_COLORS),
    // Half the coins carry a sticker, as a real trench does. It says nothing about the answer.
    image: near ? (S.round?.image ?? null) : Math.random() < 0.5 ? `/scenario-img/s${String(1 + Math.floor(Math.random() * 20)).padStart(2, '0')}` : null,
    holders: 1 + Math.floor(Math.random() * 40),
    note: Math.random() < 0.3 ? pick(NOISE_NOTES) : '',
  };
}

function cardHtml(t) {
  const icon = t.image
    ? `<img class="ic" src="${esc(t.image)}" alt="">`
    : `<div class="ci" style="background:${esc(t.color)}">${esc([...t.name][0])}</div>`;
  // Decoration is derived from the address, so a card looks the same every time it is redrawn.
  const seed = [...t.addr].reduce((a, c) => a + c.charCodeAt(0), 0);
  const tax = [2, 1, 1.25, 3.25, 1.5][seed % 5];
  const amber = seed % 3 === 0;
  const pct = seed % 40;
  // Mostly purple, with the odd green, navy or crimson row.
  const roll = seed % 20;
  const tint = roll < 13 ? 0 : roll < 16 ? 1 : roll < 18 ? 2 : 3;
  const hl = seed % 4 === 0;
  return `<div class="c t${tint}${hl ? ' hl' : ''}" data-id="${esc(t.id)}">
    <div class="icWrap">${icon}<span class="badge">${ICON.butterfly}</span>
      <div class="bar"><i style="width:${seed % 60 + 6}%"></i></div><div class="addr">${esc(t.addr)}</div></div>
    <div class="cBody">
      <div class="n">${esc(t.name)}<small>${esc(t.en)}</small><span class="pen">${ICON.pencil}</span></div>
      <div class="tags"><span class="tag tax">${ICON.hat}Tax ${tax}%</span><span class="tag chain">${ICON.coin}BNB</span>${seed % 2 ? `<span class="tag plain">${ICON.coin}BNB</span>` : ''}${t.note ? `<span class="note">${esc(t.note)}</span>` : ''}</div>
      <div class="line2"><span class="age" data-born="${t.born}">${ageText(t.born)}</span><span class="crown">${ICON.crown}0/${t.holders ?? 1}</span></div>
      <span class="quote ${amber ? 'amber' : ''}">BNB | →BNB</span>
      <div class="chips"><span class="cp ${pct > 30 ? 'warn' : ''}">${ICON.hat}${pct}%</span>${seed % 2 ? `<span class="cp ds">DS <u>${seed % 90 + 1}d</u></span>` : ''}</div>
    </div>
    <div class="zone" data-buy="${esc(t.id)}"><span class="mcv">MC<b>$${esc(t.mc)}K</b></span><span class="bz">${ICON.bolt}0.48 BNB</span></div>
  </div>`;
}

function ageText(born) {
  const s = Math.max(0, Math.floor((performance.now() - born) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
}

const matches = (t) => !S.keyword || t.name.includes(S.keyword);
function visibleNew() {
  // Newest on top: the first coin sinks as later ones arrive.
  return [...S.tokens.filter((t) => t.shown), ...S.noiseNew].sort((a, b) => b.born - a.born).filter(matches).slice(0, 30);
}
function renderNew() {
  const list = visibleNew();
  $('bodyNew').innerHTML = list.length
    ? list.map(cardHtml).join('')
    : `<div class="empty">等待匹配「${esc(S.keyword)}」的新币…</div>`;
}
function pushNew(t) {
  if (!matches(t)) return;
  const body = $('bodyNew');
  if (body.querySelector('.empty')) body.innerHTML = '';
  body.insertAdjacentHTML('afterbegin', cardHtml(t));
  while (body.children.length > 30) body.lastElementChild.remove();
}

function tickNoise() {
  const t = makeNoise();
  S.noiseNew.unshift(t);
  S.noiseNew.length = Math.min(S.noiseNew.length, 60);
  pushNew(t);
  setTimeout(tickNoise, rand(450, 1400));
}

function fillStatic(el, ageLo, ageHi, mcLo, mcHi) {
  const cards = Array.from({ length: 12 }, () => {
    const t = makeNoise();
    t.born = performance.now() - rand(ageLo, ageHi);
    t.mc = rand(mcLo, mcHi).toFixed(1);
    return cardHtml(t);
  });
  el.innerHTML = cards.join('');
}

function fans() {
  const n = Math.random() < 0.5 ? rand(1, 99).toFixed(1) : Math.floor(rand(100, 999));
  return `${n}K`;
}

function addTweet({ id, author, handle, initial, color, text, image, kol, reply, quote, followers }) {
  const el = document.createElement('div');
  el.className = kol ? `tw kol${ALERT_HANDLES.has(handle) ? ' alert' : ''}` : 'tw';
  el.innerHTML = `<div class="who"><div class="av" style="background:${esc(color)}">${esc(initial)}</div>
      <div class="whoT"><b>${esc(author)}</b><span class="pen">${ICON.pencil}</span>
        <div class="sub">@${esc(handle)} ${kol ? '模拟推文' : `${ICON.trophy}${ICON.people}${esc(followers ?? fans())}`}</div></div>
      <span class="age" data-born="${performance.now()}">0s</span>
      <span class="kind" style="display:block">${reply ? ICON.reply : ICON.feather}</span>
      </div>
    ${reply ? `<div class="replyTo">${ICON.reply}回复 <u>@${esc(reply)}</u></div>` : ''}
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${quote ? `<div class="quoteBox"><div class="who"><div class="av" style="background:${esc(quote.color)}">${esc(quote.initial)}</div><b>${esc(quote.author)}</b><span class="sub">@${esc(quote.handle)}</span></div><p>${esc(quote.text)}</p></div>` : ''}
    ${image ? `<div class="twImg"><img src="${esc(image)}" alt="推文图片"><button class="lensBtn" type="button" data-tweet="${esc(id)}" aria-label="Google 搜图">${ICON.search}</button></div>` : ''}`;
  const list = $('monList');
  list.prepend(el);
  while (list.children.length > 30) list.lastElementChild.remove();
}

function noiseTweet() {
  const [author, handle, text] = pick(NOISE_TWEETS);
  const base = { id: '', author, handle, text, initial: [...author][0], color: pick(NOISE_COLORS) };
  if (Math.random() < 0.7) {
    const [qa, qh, qt] = pick(NOISE_TWEETS);
    if (qh !== handle) {
      base.reply = qh;
      base.quote = { author: qa, handle: qh, text: qt, initial: [...qa][0], color: pick(NOISE_COLORS) };
    }
  }
  return base;
}

function tickTweets() {
  // The feed holds still under the mouse, so the image never slides away from the button.
  if (!S.monHover) {
    addTweet(noiseTweet());
  }
  setTimeout(tickTweets, rand(2200, 5000));
}

/* ---------- round flow ---------- */

function clearRoundTimers() {
  S.timers.forEach(clearTimeout);
  S.timers = [];
}
const later = (fn, ms) => S.timers.push(setTimeout(fn, ms));

async function startRound() {
  if (S.starting) return;
  S.starting = true;
  unlockAudio();
  try {
    const round = await api('POST', '/api/rounds');
    const restarted = S.phase === 'idle' || S.phase === 'live';
    clearRoundTimers();
    // Tweets from the last round belong to it: leaving them would look like nothing happened,
    // and their search buttons no longer lead anywhere.
    document.querySelectorAll('#monList .tw').forEach((el) => { if (el.querySelector('.twImg')) el.remove(); });
    if (restarted) toast('已重新开始，等新的推文', true);
    Object.assign(S, { round, phase: 'idle', done: {}, tokens: [], near: [], keyword: '', sentKeyword: '', sentQuery: '', trace: [], buying: false, q: Promise.resolve() });
    $('kw').value = '';
    $('kw').parentElement.classList.remove('active');
    renderNew();
    closeLens(true);
    showPage('trench');
    ['result', 'detail'].forEach((id) => { $(id).hidden = true; });
    closeSearch(true);
    closeFilter();
    renderSteps();
    setTimer(null);

    // Decode ahead of time: slow image loading must not count against the player.
    await Promise.all([round.target, ...round.decoys].map((t) => {
      const img = new Image();
      img.src = t.image;
      return img.decode().catch(() => {});
    }));

    round.decoys.forEach((d) => later(() => addTweet({ ...d }), rand(600, Math.max(900, round.idleMs - 700))));
    later(showTarget, round.idleMs);
  } catch (e) {
    if (e.status === 401) { S.token = null; store.set('trainer_token', ''); $('join').hidden = false; }
    toast(e.message);
    S.phase = 'lobby';
    renderSteps();
  } finally {
    S.starting = false;
  }
}

function showTarget() {
  if (S.phase !== 'idle') return;
  const { target } = S.round;
  addTweet({ ...target, kol: true });
  if (ALERT_HANDLES.has(target.handle)) playAlert();
  // Start the clock on the frame the tweet is actually painted.
  const start = () => {
    if (S.phase !== 'idle' || S.round?.target !== target) return;
    S.t0 = roundT();
    S.phase = 'live';
    send('tweet_shown', {}, S.t0);
    tickTimer();
    renderSteps();
  };
  requestAnimationFrame(() => requestAnimationFrame(start));
  later(start, 250); // Hidden tabs get no frames; the round must still begin.
}

function setTimer(ms) {
  const el = $('timer');
  el.classList.toggle('idle', ms === null);
  if (ms === null) { el.textContent = '等待推文'; return; }
  const s = Math.floor(ms / 1000);
  el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;
}
function tickTimer() {
  if (S.phase !== 'live') return;
  setTimer(roundT() - S.t0);
  requestAnimationFrame(tickTimer);
}

function nextStep() {
  return STEPS.find(([k]) => S.done[k] === undefined)?.[0];
}
function renderSteps() {
  const next = S.phase === 'live' ? nextStep() : null;
  $('steps').innerHTML = STEPS.map(([k, label], i) => {
    const cls = S.done[k] !== undefined ? 'd' : k === next ? 'a' : '';
    return `<span class="step ${cls}">${i + 1} ${label}</span>`;
  }).join('');
  const running = S.phase === 'live' || S.phase === 'idle';
  $('startBtn').textContent = running ? '重新开始' : '开始';
  $('startBtn').classList.toggle('running', running);
  const hints = $('hintToggle').checked;
  let hint = '';
  if (hints && S.phase === 'lobby') hint = '点「开始」后盯住左边的监控。';
  if (hints && S.phase === 'idle') hint = '盯住左边的监控，等高亮的大号推文。';
  if (hints && next) hint = STEPS.find(([k]) => k === next)[2];
  $('hint').textContent = hint;
}

/* ----- step: image search ----- */

function openLens(tweetId) {
  if (S.phase !== 'live') return;
  const clientT = roundT();
  const tweetEl = document.querySelector(`[data-tweet="${CSS.escape(tweetId)}"]`);
  const thumb = tweetEl?.parentElement.querySelector('img')?.src;
  if (thumb) $('lensThumb').src = thumb;
  S.lensOpen = true;
  $('lensDoc').innerHTML = '<div class="skeleton">正在识别图片…</div>';
  $('lens').hidden = false;
  $('tabs').hidden = false;
  $('trench').hidden = true;
  send('lens_open', { tweetId }, clientT).then((res) => {
    if (!S.lensOpen || !res.doc) return;
    renderLens(res.doc);
    if (res.doc.near && res.ok) S.near = res.doc.near;
  }).catch((e) => toast(e.message));
}

function renderLens(d) {
  $('lensDoc').innerHTML = `<b>✦ AI 概览</b>
    <p>这张图是一个流行的中文网络表情包，名字叫 <span class="nm">${esc(d.name)}</span> (${esc(d.pinyin)})，英文大致是 "${esc(d.en)}"。</p>
    <h4>含义和用法</h4>
    <ul><li><b>含义：</b>${esc(d.meaning)}</li><li><b>画面元素：</b>${esc(d.visual)}</li></ul>
    <div class="thumbs">
      <figure><img src="${esc(d.image)}" alt=""><figcaption>表情包合集</figcaption></figure>
      <figure><img src="${esc(d.image)}" alt=""><figcaption>动图搜索结果</figcaption></figure>
      <figure><img src="${esc(d.image)}" alt=""><figcaption>相关讨论</figcaption></figure>
    </div>`;
}

function closeLens(silent = false) {
  const wasOpen = S.lensOpen;
  S.lensOpen = false;
  $('lens').hidden = true;
  $('tabs').hidden = true;
  $('trench').hidden = false;
  if (wasOpen && !silent && S.phase === 'live') {
    send('back').then((res) => {
      if (!res.ok) toast('还没复制到名字，这一步不算完成');
      // A keyword typed before the copy was refused; it counts now that the copy is done.
      else if (S.keyword && !S.tokens.length) { S.sentKeyword = ''; applyKeyword(S.keyword); }
    }).catch((e) => toast(e.message));
  }
}

// Browsers split Chinese words unevenly on double-click ("内卷" picks one character),
// so make it take the whole name for every scenario. Dragging works as usual.
$('lensDoc').addEventListener('dblclick', (e) => {
  const nm = e.target.closest('.nm');
  if (!nm) return;
  const range = document.createRange();
  range.selectNodeContents(nm);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});

document.addEventListener('copy', () => {
  if (!S.lensOpen || S.phase !== 'live') return;
  const text = String(window.getSelection() ?? '');
  const clientT = roundT();
  send('copy', { text: text.slice(0, 100) }, clientT).then((res) => {
    if (res.ok) toast('已复制', true);
    else toast('复制的内容不对：只选中名字');
  }).catch((e) => toast(e.message));
});

/* ----- step: trench filter ----- */

function applyKeyword(value) {
  S.keyword = value.trim();
  $('kw').parentElement.classList.toggle('active', !!S.keyword);
  renderNew();
  if (S.phase !== 'live' || !S.keyword || S.keyword === S.sentKeyword) return;
  S.sentKeyword = S.keyword;
  send('filter', { keyword: S.keyword }).then((res) => {
    if (res.ok) receiveTokens(res);
    else if (res.reason === 'copy_first') toast('先完成搜图和复制');
  }).catch((e) => toast(e.message));
}

function receiveTokens(res) {
  if (S.tokens.length) return;
  S.tokens = res.tokens.map((t) => ({ ...t, image: res.image, shown: false, holders: 1 }));
  S.round.image = res.image;
  // The first coin has been queued since the tweet; ones already due land oldest first.
  for (const t of S.tokens) {
    const due = S.t0 + t.spawnAt;
    t.born = due;
    const reveal = () => {
      if (S.phase === 'done') return;
      t.shown = true;
      pushNew(t);
    };
    if (due <= performance.now()) reveal();
    else later(reveal, due - performance.now());
  }
}

function openFilter() {
  $('filterModal').hidden = false;
  $('filterInput').value = S.keyword;
  $('filterInput').focus();
}
function closeFilter() { $('filterModal').hidden = true; }

/* ----- step: OG search ----- */

function openSearch() {
  S.ogOpen = true;
  $('searchModal').hidden = false;
  $('searchInput').value = '';
  $('searchList').innerHTML = '';
  $('searchNote').textContent = '粘贴名字，确认 OG';
  S.sentQuery = '';
  $('searchInput').focus();
}
function closeSearch(silent = false) {
  const was = S.ogOpen;
  S.ogOpen = false;
  $('searchModal').hidden = true;
  if (was && !silent && S.phase === 'live') send('og_close').catch((e) => toast(e.message));
}
function runSearch(value) {
  const query = value.trim();
  if (query === S.sentQuery) return;
  S.sentQuery = query;
  if (!query) { $('searchList').innerHTML = ''; return; }
  if (S.phase !== 'live') { $('searchNote').textContent = '没有结果'; return; }
  send('og_search', { query }).then((res) => {
    if (query !== S.sentQuery) return;
    if (!res.ok) {
      $('searchList').innerHTML = '';
      $('searchNote').textContent = res.reason === 'copy_first' ? '先完成搜图和复制' : '没有结果';
      return;
    }
    $('searchNote').textContent = `找到 ${res.results.length} 个老币。看完按 Esc 关闭。`;
    $('searchList').innerHTML = res.results.map((t) => `<div class="r"><img src="${esc(res.image)}" alt="">
      <div class="grow"><b>${esc(t.name)}</b> <span class="sub">${esc(t.en)}</span><div class="sub">${t.ageMonths} 个月前 · ${esc(t.addr)}</div></div>
      <div>MC <b>$${esc(t.mc)}K</b></div><div class="sub">V $0</div><span class="q1" data-oldcoin>⚡ 1</span><span class="q1" data-oldcoin>⚡ 4</span></div>`).join('');
  }).catch((e) => toast(e.message));
}

/* ----- step: buy ----- */

async function buy(tokenId, clientT) {
  if (S.phase === 'idle') return toast('推文还没出现');
  if (S.phase !== 'live') return toast('先开始一局');
  if (S.buying) return;
  S.buying = true;
  const id = S.round.id;
  // Wait for earlier steps to land, so the server sees them in order.
  const run = S.q.then(() => api('POST', `/api/rounds/${id}/buy`, { tokenId, clientT, trace: S.trace }));
  S.q = run.catch(() => {});
  try {
    const res = await run;
    if (res.result === 'blocked') {
      const names = res.missing.map((m) => STEPS.find(([k]) => k === m)[1]).join('、');
      toast(`还没完成：${names}`);
      return;
    }
    finish(res);
  } catch (e) {
    toast(e.message);
  } finally {
    S.buying = false;
  }
}

function finish(res) {
  S.phase = 'done';
  clearRoundTimers();
  S.done = res.done ?? S.done;
  if (res.result === 'success' || res.result === 'review') S.done.buy = res.ms;
  renderSteps();
  setTimer(res.ms);
  if (res.best != null) S.best = res.best;
  renderMe();
  showResult(res);
}

function showResult(res) {
  const ok = res.result === 'success' || res.result === 'review';
  const title = {
    success: '买入成功',
    review: '成绩待审核',
    wrong_token: REASON_TEXT[res.reason] ?? '买错了',
    timeout: '超过两分钟，本局超时',
  }[res.result];

  let splitHtml = '';
  if (res.splits) {
    const total = res.ms || 1;
    const order = STEPS.map(([k, label]) => [k, label, res.splits[k]]);
    const slowest = Math.max(...order.map((o) => o[2]));
    splitHtml = `<div class="splitBar">${order.map(([k, , v]) => `<i style="width:${(v / total) * 100}%;background:${SPLIT_COLORS[k]}"></i>`).join('')}</div>
      ${order.map(([k, label, v]) => `<div class="splitRow ${v === slowest ? 'slow' : ''}"><span class="dot" style="background:${SPLIT_COLORS[k]}"></span><span>${label}</span><em>${fmt(v)}</em></div>`).join('')}`;
  }
  const lines = [];
  if (ok) {
    const delta = res.ms - VIDEO_REF_MS;
    lines.push(`比视频${delta <= 0 ? '快' : '慢'} <b>${fmt(Math.abs(delta))}</b>`);
    if (res.best != null) lines.push(`最佳 <b>${fmt(res.best)}</b>`);
    if (res.rank) lines.push(`天梯第 <b>${res.rank}</b> 名`);
    if (res.waited > 0) lines.push(`等币上线 ${fmt(res.waited)}`);
  }
  if (res.result === 'review') lines.push('这一局的操作数据不太寻常，暂时不进天梯。');
  if (!ok) lines.push(`本局目标：<b>${esc(res.scenario)}</b>。只进记录，不进天梯。`);

  $('resultBody').innerHTML = `<h1>${esc(title)}</h1>
    <div class="bigTime ${ok ? '' : 'bad'}">${ok ? fmt(res.ms) : '未完成'}</div>
    <div class="compare">${lines.join(' · ')}</div>
    ${splitHtml}
    <div class="btnRow"><button class="primary big" type="button" data-again>再来一局</button>${res.result === 'success' ? '<button class="ghost share" type="button" data-share disabled>分享到推特</button><button class="ghost" type="button" data-save disabled>保存图片</button>' : ''}<button class="ghost" type="button" data-page="ladder">天梯</button></div>`;
  $('result').hidden = false;
  S.share = null;
  if (res.result === 'success') prepareShare(res);
}

// Drawn ahead of the click, so writing to the clipboard stays inside the click's permission.
async function prepareShare(res) {
  const roundId = S.round?.id;
  try {
    const blob = await renderShareCard({ nickname: S.nickname, ms: res.ms, splits: res.splits, rank: res.rank });
    if (S.round?.id !== roundId || !blob) return;
    S.share = { blob, text: shareText({ ms: res.ms, rank: res.rank }), name: `sniper-duck-${(res.ms / 1000).toFixed(2)}s.png` };
    document.querySelectorAll('[data-share],[data-save]').forEach((b) => { b.disabled = false; });
  } catch {
    toast('成绩图片生成失败');
  }
}

async function shareToX() {
  if (!S.share) return;
  const { blob, text, name } = S.share;
  const copied = await copyImage(blob);
  if (!copied) saveBlob(blob, name);
  const win = window.open(tweetUrl(text), '_blank');
  if (!win) return toast('浏览器拦截了新窗口，请允许弹窗后再试');
  toast(copied ? '图片已复制，在发帖框按 Cmd+V 粘贴' : '图片已下载，请在发帖框手动添加', true);
}

/* ---------- pages ---------- */

function showPage(name) {
  document.querySelectorAll('.top nav a').forEach((a) => a.classList.toggle('on', a.dataset.page === name));
  $('ladder').hidden = name !== 'ladder';
  $('history').hidden = name !== 'history';
  if (name === 'ladder') loadLadder();
  if (name === 'history') loadHistory();
}

const splitCell = (s) => (s ? STEPS.map(([k]) => (s[k] / 1000).toFixed(1)).join(' / ') : '-');

async function loadLadder() {
  const tabs = [['all', '总榜'], ['today', '今日'], ['week', '本周'], ['stable', '稳定榜（近 10 局平均）']];
  const el = $('ladder');
  const tabHtml = `<h2>天梯</h2><div class="boardTabs">${tabs.map(([k, l]) => `<button type="button" data-board="${k}" class="${k === S.board ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  el.innerHTML = `${tabHtml}<div class="dim">加载中…</div>`;
  try {
    const { rows } = await api('GET', `/api/leaderboard?board=${S.board}`);
    el.innerHTML = `${tabHtml}<table><thead><tr><th>名次</th><th>昵称</th><th>用时</th><th>分段（搜图 / 复制 / 回战壕 / 过滤 / OG / 买入，秒）</th><th>局数</th><th>成功率</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.roundId ? 'link' : ''} ${r.nickname === S.nickname ? 'mine' : ''}" ${r.roundId ? `data-round="${esc(r.roundId)}"` : ''}>
        <td class="rank${r.rank}">${r.rank}</td><td>${esc(r.nickname)}</td><td class="num">${fmt(r.ms)}</td><td class="dim">${splitCell(r.splits)}</td><td class="dim">${r.played}</td><td class="dim">${Math.round((r.wins / r.played) * 100)}%</td></tr>`).join('')
        || '<tr><td colspan="6" class="dim">还没有人上榜，第一名等你来拿。</td></tr>'}
      </tbody></table>`;
  } catch (e) {
    el.innerHTML = `${tabHtml}<div class="dim">${esc(e.message)}</div>`;
  }
}

async function loadHistory() {
  const el = $('history');
  el.innerHTML = '<h2>我的记录</h2><div class="dim">加载中…</div>';
  try {
    const { rounds } = await api('GET', '/api/me/rounds');
    el.innerHTML = `<h2>我的记录</h2><table><thead><tr><th>时间</th><th>结果</th><th>用时</th><th>分段（秒）</th></tr></thead><tbody>
      ${rounds.map((r) => `<tr class="link" data-round="${esc(r.id)}"><td class="dim">${new Date(r.started_at).toLocaleString('zh-CN', { hour12: false })}</td><td class="st-${esc(r.status)}">${STATUS_TEXT[r.status] ?? esc(r.status)}</td><td class="num">${fmt(r.ms)}</td><td class="dim">${splitCell(r.splits)}</td></tr>`).join('')
        || '<tr><td colspan="4" class="dim">还没有记录。</td></tr>'}
      </tbody></table>`;
  } catch (e) {
    el.innerHTML = `<h2>我的记录</h2><div class="dim">${esc(e.message)}</div>`;
  }
}

const EVENT_TEXT = { tweet_shown: '推文出现', lens_open: '打开搜图', copy: '复制', back: '回到战壕', filter: '过滤', og_search: '搜索 OG', og_close: '关闭搜索', buy: '点击买入' };
async function showDetail(id) {
  try {
    const d = await api('GET', `/api/rounds/${id}`);
    const t0 = d.events.find((e) => e.type === 'tweet_shown')?.client_t ?? 0;
    $('detailBody').innerHTML = `<div class="closeRow"><h1 style="margin:0">${esc(d.nickname)} · ${fmt(d.ms)}</h1><button class="ghost" style="padding:5px 12px" type="button" data-close-detail>关闭</button></div>
      <p>${STATUS_TEXT[d.status] ?? esc(d.status)} · 鼠标采样 ${d.tracePoints} 点${d.flags?.length ? ` · 标记：${esc(d.flags.join(', '))}` : ''}</p>
      <table><thead><tr><th>时间</th><th>操作</th><th>内容</th><th>有效</th></tr></thead><tbody>
      ${d.events.map((e) => `<tr><td class="num">${fmt(e.client_t - t0)}</td><td>${EVENT_TEXT[e.type] ?? esc(e.type)}</td><td class="dim">${esc(Object.values(e.input ?? {}).join(' ').slice(0, 40))}</td><td class="${e.ok ? 'st-success' : 'dim'}">${e.ok ? '是' : '否'}</td></tr>`).join('')}
      </tbody></table>`;
    $('detail').hidden = false;
  } catch (e) {
    toast(e.message);
  }
}

function renderMe() {
  $('me').textContent = S.nickname ? `${S.nickname}${S.best != null ? ` · 最佳 ${fmt(S.best)}` : ''}` : '';
}

/* ---------- wiring ---------- */

document.addEventListener('click', (e) => {
  const target = e.target;
  const lensBtn = target.closest('[data-tweet]');
  if (lensBtn) return openLens(lensBtn.dataset.tweet);
  const zone = target.closest('[data-buy]');
  if (zone) return buy(zone.dataset.buy, e.timeStamp);
  if (target.closest('[data-oldcoin]')) return toast('这是老币，要买的是新出现的第一个');
  if (target.closest('[data-again]')) return startRound();
  if (target.closest('[data-share]')) return shareToX();
  if (target.closest('[data-save]')) { if (S.share) saveBlob(S.share.blob, S.share.name); return; }
  const board = target.closest('[data-board]');
  if (board) { S.board = board.dataset.board; return loadLadder(); }
  const row = target.closest('[data-round]');
  if (row) return showDetail(row.dataset.round);
  if (target.closest('[data-close-detail]')) { $('detail').hidden = true; return; }
  const nav = target.closest('[data-page]');
  if (nav) {
    e.preventDefault();
    $('result').hidden = true;
    if ((S.phase === 'live' || S.phase === 'idle') && nav.dataset.page !== 'trench') return toast('打完这一局再看');
    showPage(nav.dataset.page);
  }
});

// Mouse samples at 20 Hz, kept for replay review.
document.addEventListener('mousemove', (e) => {
  if (S.phase !== 'live') return;
  const now = performance.now();
  if (now - S.lastTrace < 50 || S.trace.length >= 3000) return;
  S.lastTrace = now;
  S.trace.push([Math.round(now - S.t0), e.clientX, e.clientY]);
});

document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '');
  if (e.key === 'Escape') {
    if (!$('detail').hidden) { $('detail').hidden = true; return; }
    if (S.ogOpen) { closeSearch(); return; }
    if (!$('filterModal').hidden) { closeFilter(); return; }
    if (S.lensOpen) { closeLens(); return; }
    if (typing) document.activeElement.blur();
    return;
  }
  if (typing) return;
  if (e.key === '/' && $('join').hidden && $('result').hidden) {
    e.preventDefault();
    if (!S.lensOpen) openSearch();
    return;
  }
});

$('startBtn').addEventListener('click', () => {
  $('startBtn').blur(); // A focused button would restart the round on a stray key press.
  startRound();
});
$('openSearch').addEventListener('click', () => { if (!S.lensOpen) openSearch(); });
$('tabClose').addEventListener('click', () => closeLens());
$('tabTrench').addEventListener('click', () => closeLens());
$('openFilter').addEventListener('click', openFilter);
$('filterClose').addEventListener('click', closeFilter);
const applyFromModal = () => {
  $('kw').value = $('filterInput').value;
  applyKeyword($('kw').value);
  closeFilter();
};
$('filterApply').addEventListener('click', applyFromModal);
$('filterInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) applyFromModal(); });
$('searchModal').addEventListener('mousedown', (e) => { if (e.target === $('searchModal')) closeSearch(); });

// Pasting fires "input" straight away; a Chinese input method waits until the word is chosen.
const live = (el, fn) => {
  let composing = false;
  el.addEventListener('compositionstart', () => { composing = true; });
  el.addEventListener('compositionend', () => { composing = false; fn(el.value); });
  el.addEventListener('input', () => { if (!composing) fn(el.value); });
};
live($('kw'), applyKeyword);
live($('searchInput'), runSearch);

$('monList').addEventListener('mouseenter', () => { S.monHover = true; $('monPaused').textContent = '已暂停'; });
$('monList').addEventListener('mouseleave', () => { S.monHover = false; $('monPaused').textContent = ''; });

window.addEventListener('beforeunload', (e) => {
  if (S.phase === 'live') e.preventDefault();
});

$('hintToggle').checked = store.get('trainer_hints') !== '0';
$('hintToggle').addEventListener('change', () => {
  store.set('trainer_hints', $('hintToggle').checked ? '1' : '0');
  renderSteps();
});

$('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('joinErr').textContent = '';
  try {
    const nickname = $('nick').value.trim();
    const res = await api('POST', '/api/users', { nickname });
    S.token = res.token;
    S.nickname = res.nickname;
    store.set('trainer_token', res.token);
    store.set('trainer_nick', res.nickname);
    $('join').hidden = true;
    renderMe();
  } catch (err) {
    $('joinErr').textContent = err.message;
  }
});

// Age labels tick once a second, across every list.
setInterval(() => {
  document.querySelectorAll('[data-born]').forEach((el) => { el.textContent = ageText(Number(el.dataset.born)); });
}, 1000);

async function boot() {
  for (let i = 0; i < 14; i++) { const t = makeNoise(); t.born -= i * 2500; S.noiseNew.push(t); }
  renderNew();
  hydrateIcons();
  fillStatic($('bodySoon'), 60_000, 3_000_000, 15, 60);
  fillStatic($('bodyOpen'), 600_000, 40_000_000, 30, 300);
  $('ticker').innerHTML = `<span class="tkIcons"><i>${ICON.gear}</i><i>${ICON.starFill}</i><i>${ICON.chart}</i><i>${ICON.clock}</i></span>`;
  for (let i = 0; i < 5; i++) addTweet(noiseTweet());
  setTimeout(tickNoise, 400);
  setTimeout(tickTweets, 1500);
  renderSteps();
  setTimer(null);
  $('timer').textContent = '--:--.--';
  $('timer').classList.add('idle');

  if (!S.token) { $('join').hidden = false; $('nick').focus(); return; }
  try {
    const me = await api('GET', '/api/me');
    S.nickname = me.nickname;
    S.best = me.best;
    renderMe();
    renderSteps();
  } catch (e) {
    if (e.status === 401) { S.token = null; $('join').hidden = false; $('nick').focus(); return; }
    toast(e.message);
  }
}
boot();
