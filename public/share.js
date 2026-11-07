// Builds the score image and the post text for sharing a finished round.
export const REPO_URL = 'https://github.com/bnbxcs/sniper-duck';
const REPO_LABEL = 'github.com/bnbxcs/sniper-duck';
const VIDEO_REF_MS = 16_000;
const W = 1200;
const H = 675;
const FONT = 'Geist, sans-serif, "Microsoft YaHei"';

const STEP_LABELS = [
  ['lens', '搜图', '#6aa9ff'],
  ['copy', '复制名字', '#a58bff'],
  ['back', '回战壕', '#8d9199'],
  ['filter', '过滤', '#55c28a'],
  ['og', '搜 OG', '#f3ba2f'],
  ['buy', '买入', '#e5484d'],
];

const secs = (ms) => (ms / 1000).toFixed(2);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function renderShareCard({ nickname, ms, splits, rank }) {
  await Promise.all(['500 20px Geist', '600 20px Geist'].map((f) => document.fonts.load(f)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#130a38';
  rounded(ctx, 32, 32, W - 64, H - 64, 20);
  ctx.fill();
  ctx.strokeStyle = '#a11b4a';
  ctx.lineWidth = 2;
  ctx.stroke();

  const logo = await loadImage('/logo.svg');
  ctx.drawImage(logo, 72, 68, 84, 84);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f5f5f5';
  ctx.font = `600 44px ${FONT}`;
  ctx.fillText('狙击鸭', 176, 110);
  ctx.fillStyle = '#808080';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText('meme 买入速度练习 · 模拟环境', 176, 146);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#f5f5f5';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(nickname, W - 72, 104);
  if (rank) {
    ctx.fillStyle = '#fed15c';
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(`天梯第 ${rank} 名`, W - 72, 144);
  }
  ctx.textAlign = 'left';

  ctx.fillStyle = '#69cf8d';
  ctx.font = `600 132px ${FONT}`;
  ctx.fillText(`${secs(ms)}s`, 72, 308);
  ctx.fillStyle = '#cccccc';
  ctx.font = `500 26px ${FONT}`;
  const delta = ms - VIDEO_REF_MS;
  ctx.fillText(`从推文出现到点击买入 · 比 clukz ${delta <= 0 ? '快' : '慢'} ${secs(Math.abs(delta))} 秒`, 76, 356);

  const barX = 72;
  const barW = W - 144;
  const barY = 392;
  let x = barX;
  ctx.save();
  rounded(ctx, barX, barY, barW, 22, 11);
  ctx.clip();
  for (const [key, , color] of STEP_LABELS) {
    const w = (splits[key] / ms) * barW;
    ctx.fillStyle = color;
    ctx.fillRect(x, barY, w, 22);
    x += w;
  }
  ctx.restore();

  const cell = barW / STEP_LABELS.length;
  STEP_LABELS.forEach(([key, label, color], i) => {
    const cx = barX + i * cell;
    ctx.fillStyle = color;
    rounded(ctx, cx, 442, 14, 14, 4);
    ctx.fill();
    ctx.fillStyle = '#808080';
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(label, cx + 22, 457);
    ctx.fillStyle = '#f5f5f5';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(`${secs(splits[key])}s`, cx, 500);
  });

  ctx.strokeStyle = '#2a2350';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(72, 540);
  ctx.lineTo(W - 72, 540);
  ctx.stroke();
  ctx.fillStyle = '#4ea7fa';
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(REPO_LABEL, 72, 590);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#808080';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText('你能多快？', W - 72, 590);
  ctx.textAlign = 'left';

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function shareText({ ms, rank }) {
  const place = rank ? `，天梯第 ${rank} 名` : '';
  return `我在狙击鸭练 meme 买入速度，从推文出现到点击买入只用了 ${secs(ms)} 秒${place}。你能多快？`;
}

export function tweetUrl(text) {
  return `https://x.com/intent/tweet?${new URLSearchParams({ text, url: REPO_URL })}`;
}

export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// The post box cannot take an image by link, so the image goes on the clipboard first.
export async function copyImage(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}
