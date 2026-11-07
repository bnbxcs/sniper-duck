// Draws the original sticker for each built-in scenario. Run with: npm run images
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'img');
const INK = '#2b2b33';

const eyes = {
  dot: (x, y) => `<circle cx="${x - 15}" cy="${y}" r="5" fill="${INK}"/><circle cx="${x + 15}" cy="${y}" r="5" fill="${INK}"/>`,
  flat: (x, y) => `<path d="M${x - 22} ${y}h14M${x + 8} ${y}h14" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
  shut: (x, y) => `<path d="M${x - 22} ${y}q7 7 14 0M${x + 8} ${y}q7 7 14 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  swirl: (x, y) => `<path d="M${x - 15} ${y}a3 3 0 1 1 3 3a7 7 0 1 1 7-7M${x + 15} ${y}a3 3 0 1 1 3 3a7 7 0 1 1 7-7" stroke="${INK}" stroke-width="3" fill="none"/>`,
  star: (x, y) => `<path d="M${x - 15} ${y - 9}l3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1zM${x + 15} ${y - 9}l3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z" fill="#f3ba2f" stroke="${INK}" stroke-width="2"/>`,
};
const mouths = {
  smile: (x, y) => `<path d="M${x - 14} ${y}q14 14 28 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  sad: (x, y) => `<path d="M${x - 14} ${y + 8}q14 -14 28 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  flat: (x, y) => `<path d="M${x - 12} ${y + 4}h24" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
  open: (x, y) => `<ellipse cx="${x}" cy="${y + 5}" rx="14" ry="11" fill="#b5273a" stroke="${INK}" stroke-width="3"/>`,
  laugh: (x, y) => `<path d="M${x - 18} ${y}h36q0 22-18 22t-18-22z" fill="#b5273a" stroke="${INK}" stroke-width="3"/>`,
};

function head(x, y, { eye = 'dot', mouth = 'smile', skin = '#ffe0c2' } = {}) {
  return `<circle cx="${x}" cy="${y}" r="48" fill="${skin}" stroke="${INK}" stroke-width="4"/>
<path d="M${x - 46} ${y - 12}q10-46 46-44q36-2 46 44q-22-22-46-20q-24-2-46 20z" fill="${INK}"/>
${eyes[eye](x, y)}${mouths[mouth](x, y + 20)}`;
}
const body = (x, y, color = '#4f6bd8') =>
  `<rect x="${x - 34}" y="${y}" width="68" height="74" rx="20" fill="${color}" stroke="${INK}" stroke-width="4"/>`;
const stand = (o = {}, c) => `${body(160, 158, c)}${head(160, 110, o)}`;

const art = {
  s01: `<ellipse cx="160" cy="262" rx="130" ry="14" fill="#d7d9de"/><rect x="108" y="196" width="150" height="56" rx="26" fill="#4f6bd8" stroke="${INK}" stroke-width="4"/>${head(92, 200, { eye: 'flat', mouth: 'smile' })}
<path d="M170 240L250 130" stroke="#7b4a21" stroke-width="7"/><path d="M250 130l-22 4 12 16z" fill="#7b4a21"/><path d="M155 252q12-22 34-14q6 22-14 28z" fill="#d3202f"/>`,
  s02: `${head(90, 130, { eye: 'flat', mouth: 'sad' })}<path d="M215 215c-60-40-60-90-25-96c15-2 25 12 25 18c0-6 10-20 25-18c35 6 35 56-25 96z" fill="#e23b4e" stroke="${INK}" stroke-width="4"/>
<path d="M270 70L210 170" stroke="#8b93a5" stroke-width="10"/><path d="M262 62l20 12" stroke="${INK}" stroke-width="10"/>`,
  s03: `${stand({ eye: 'swirl', mouth: 'open' })}<path d="M222 120h60v60q0 38-30 56q-30-18-30-56z" fill="#8ea6c8" stroke="${INK}" stroke-width="4"/><path d="M252 118l-12 34 20 18-14 52" stroke="#fff" stroke-width="7" fill="none"/>`,
  s04: `<path d="M86 165h148l-16 102H102z" fill="#7a8a78" stroke="${INK}" stroke-width="4"/><path d="M76 165h168" stroke="${INK}" stroke-width="10"/>${head(160, 106, { eye: 'flat', mouth: 'flat' })}<path d="M122 178v80M160 178v80M198 178v80" stroke="${INK}" stroke-width="3"/>`,
  s05: `<rect x="30" y="218" width="260" height="34" rx="14" fill="#b7d4f2" stroke="${INK}" stroke-width="4"/><rect x="120" y="178" width="150" height="46" rx="20" fill="#4f6bd8" stroke="${INK}" stroke-width="4"/>${head(84, 176, { eye: 'shut', mouth: 'flat' })}<text x="180" y="110" font-size="40" fill="#8c93a3" font-family="sans-serif">z z</text>`,
  s06: `${stand({ eye: 'dot', mouth: 'smile' })}<path d="M90 190a70 70 0 0 0 140 0z" fill="#e8384e" stroke="#2e9a4c" stroke-width="10"/><circle cx="130" cy="210" r="4" fill="${INK}"/><circle cx="160" cy="222" r="4" fill="${INK}"/><circle cx="190" cy="210" r="4" fill="${INK}"/>`,
  s07: `${stand({ eye: 'flat', mouth: 'flat' }, '#59616f')}<path d="M108 76a52 44 0 0 1 104 0z" fill="#f3ba2f" stroke="${INK}" stroke-width="4"/><path d="M98 76h124" stroke="${INK}" stroke-width="8"/><rect x="212" y="198" width="64" height="48" rx="6" fill="#7b4a21" stroke="${INK}" stroke-width="4"/><path d="M230 198v-12h28v12" stroke="${INK}" stroke-width="4" fill="none"/>`,
  s08: `${stand({ eye: 'shut', mouth: 'flat', skin: '#ff9d94' })}<rect x="104" y="100" width="46" height="40" rx="16" fill="#ffd0b0" stroke="${INK}" stroke-width="4"/><rect x="170" y="100" width="46" height="40" rx="16" fill="#ffd0b0" stroke="${INK}" stroke-width="4"/><path d="M238 70q10 16 0 28M258 62q14 22 0 42" stroke="#e23b4e" stroke-width="4" fill="none"/>`,
  s09: `${stand({ eye: 'swirl', mouth: 'open' })}<path d="M160 50l-14 34 20 10-20 36" stroke="#fff" stroke-width="9" fill="none"/><path d="M160 50l-14 34 20 10-20 36" stroke="${INK}" stroke-width="3" fill="none"/>`,
  s10: `${stand({ eye: 'shut', mouth: 'laugh' })}<path d="M210 182h76q-4 46-38 46t-38-46z" fill="#f4f5f7" stroke="${INK}" stroke-width="4"/><path d="M216 182q32-22 64 0" fill="#fff" stroke="${INK}" stroke-width="3"/><path d="M236 100l22 76M254 96l14 80" stroke="#7b4a21" stroke-width="5"/>`,
  s11: `${stand({ eye: 'swirl', mouth: 'open', skin: '#ffb09c' })}<path d="M120 50q-14-18 0-34M160 44q-14-18 0-36M200 50q-14-18 0-34" stroke="#e23b4e" stroke-width="7" fill="none"/>`,
  s12: `<path d="M160 150m-8 0a8 8 0 1 1 16 0a24 24 0 1 1-48 0a40 40 0 1 1 80 0a60 60 0 1 1-120 0a84 84 0 1 1 168 0a108 108 0 1 1-216 0" stroke="#8c93a3" stroke-width="7" fill="none"/>${head(160, 120, { eye: 'flat', mouth: 'open' })}<rect x="138" y="168" width="44" height="50" rx="14" fill="#4f6bd8" stroke="${INK}" stroke-width="4"/>`,
  s13: `${stand({ eye: 'flat', mouth: 'flat' }, '#8a6b45')}<path d="M112 72q-24-14-20-44q22 8 38 28M208 72q24-14 20-44q-22 8-38 28" fill="#efe6d5" stroke="${INK}" stroke-width="4"/><rect x="214" y="190" width="72" height="42" fill="#a5855a" stroke="${INK}" stroke-width="4"/><circle cx="232" cy="244" r="14" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="270" cy="244" r="14" fill="#fff" stroke="${INK}" stroke-width="4"/>`,
  s14: `${stand({ eye: 'flat', mouth: 'sad' })}<path d="M250 70v110M222 150l28 34 28-34" stroke="#2fb36a" stroke-width="14" fill="none" stroke-linecap="round"/>`,
  s15: `${stand({ eye: 'dot', mouth: 'open' })}<path d="M214 250q-34-90 26-190q58 100 26 190z" fill="#b6c75a" stroke="${INK}" stroke-width="4"/><path d="M226 160q18-10 38 0M224 200q22-12 46 0M240 110q10-8 18 0" stroke="${INK}" stroke-width="3" fill="none"/>`,
  s16: `${body(160, 158)}${head(160, 110, { eye: 'flat', mouth: 'flat' })}<path d="M160 186l-26 46h52z" fill="#ffe0c2" stroke="${INK}" stroke-width="4"/><path d="M160 186v46" stroke="${INK}" stroke-width="3"/>`,
  s17: `${stand({ eye: 'swirl', mouth: 'sad' })}<rect x="216" y="190" width="84" height="12" fill="#59616f" stroke="${INK}" stroke-width="3"/><path d="M228 202l-8 50M288 202l8 50" stroke="${INK}" stroke-width="5"/><path d="M238 188q-10-24 8-44q2 14 12 18q2-14 14-22q8 28-4 48z" fill="#ff7a2f" stroke="${INK}" stroke-width="3"/>`,
  s18: `${stand({ eye: 'star', mouth: 'laugh' }, '#d84fa0')}<path d="M60 70l6 14 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2zM262 50l6 14 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2zM270 190l5 11 11 2-8 8 2 11-10-6-10 6 2-11-8-8 11-2z" fill="#f3ba2f" stroke="${INK}" stroke-width="2"/>`,
  s19: `<path d="M30 200q130 110 260 0q-40 66-130 66t-130-66z" fill="#c9b6e8" stroke="${INK}" stroke-width="4"/><path d="M34 196q126-210 252 0" fill="#ded2f2" stroke="${INK}" stroke-width="4"/>${head(160, 170, { eye: 'shut', mouth: 'laugh' })}`,
  s20: `${stand({ eye: 'flat', mouth: 'flat' }, '#7b3fa8')}<path d="M112 62l10-40 24 26 14-32 14 32 24-26 10 40z" fill="#f3ba2f" stroke="${INK}" stroke-width="4"/><path d="M126 190L70 168M194 190l56-22" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><circle cx="64" cy="164" r="10" fill="#ffe0c2" stroke="${INK}" stroke-width="3"/><circle cx="256" cy="164" r="10" fill="#ffe0c2" stroke="${INK}" stroke-width="3"/>`,
};

mkdirSync(OUT, { recursive: true });
for (const [id, inner] of Object.entries(art)) {
  writeFileSync(join(OUT, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 280"><rect width="320" height="280" fill="#fff"/>${inner}</svg>\n`);
}
console.log(`Wrote ${Object.keys(art).length} images to ${OUT}`);
