// Small hand-drawn icons, sized by the surrounding CSS.
const s = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const f = (d) => `<svg viewBox="0 0 24 24" fill="currentColor">${d}</svg>`;

export const ICON = {
  search: s('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M12 3l2 2.5 3.2-.4.9 3.1 2.9 1.4-1.4 2.9 1.4 2.9-2.9 1.4-.9 3.1-3.2-.4L12 21l-2-2.5-3.2.4-.9-3.1L3 14.4l1.4-2.9L3 8.6l2.9-1.4.9-3.1 3.2.4z"/>'),
  star: s('<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/>'),
  starFill: f('<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/>'),
  bell: s('<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  chart: s('<path d="M4 20V5"/><path d="M4 20h16"/><path d="M7 15l4-5 3 3 5-6"/>'),
  clock: s('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  pencil: s('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
  crown: s('<path d="M4 8l4 4 4-7 4 7 4-4-1.5 11h-13z"/><path d="M9 15h6"/>'),
  hat: s('<path d="M7 18v-4a4 4 0 1 1 3-7 4 4 0 0 1 4 0 4 4 0 1 1 3 7v4z"/><path d="M7 18h10v2H7z"/>'),
  rocket: f('<path d="M20.5 3.5c-4.8-.5-8.6 1.4-11 5.2L6 9l-3 3 4 1 4 4 1 4 3-3 .3-3.5c3.8-2.4 5.7-6.2 5.2-11zM15 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM6 16c-1.5.5-2.5 2-3 5 3-.5 4.500-1.500 5-3z"/>'),
  speaker: s('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6"/>'),
  mute: s('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9l5 6M21 9l-5 6"/>'),
  eyeOff: s('<path d="M3 3l18 18"/><path d="M10 6a9 9 0 0 1 11 6 11 11 0 0 1-3 4M6 8a11 11 0 0 0-3 4 9 9 0 0 0 12 5"/>'),
  filter: s('<path d="M4 5h16l-6 7v6l-4 2v-8z"/>'),
  up: s('<path d="M6 15l6-6 6 6"/>'),
  down: s('<path d="M6 9l6 6 6-6"/>'),
  expand: s('<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>'),
  windows: s('<rect x="8" y="4" width="12" height="12" rx="2"/><path d="M16 20H6a2 2 0 0 1-2-2V8"/>'),
  close: s('<path d="M5 5l14 14M19 5L5 19"/>'),
  reply: s('<path d="M9 7l-5 5 5 5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/>'),
  feather: s('<path d="M20 4c-8 0-13 4-13 11v5"/><path d="M7 15c5 0 11-3 13-11"/>'),
  people: s('<circle cx="9" cy="8" r="3.500"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5a3.500 3.500 0 0 1 0 6.500M18 14a6 6 0 0 1 3 6"/>'),
  trophy: s('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M12 14v4M8 20h8"/>'),
  hash: s('<path d="M5 9h15M4 15h15M10 4L8 20M16 4l-2 16"/>'),
  image: s('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15l3-4 3 3 2-2 3 3"/>'),
  bolt: f('<path d="M13 2L5 14h6l-1 8 9-13h-6z"/>'),
  wallet: s('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h3"/>'),
  book: s('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
  friends: s('<circle cx="9" cy="8" r="3"/><path d="M4 19a5 5 0 0 1 10 0"/><path d="M17 8v6M14 11h6"/>'),
  fire: f('<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 2 3 4 1-2 1-5 1-9z"/>'),
  signal: s('<path d="M5 20v-5M12 20V9M19 20V4"/>'),
  helmet: f('<path d="M12 4a9 9 0 0 0-9 9v2h18v-2a9 9 0 0 0-9-9z" fill="#7a8a5a"/><path d="M2 15h20v3H2z" fill="#4e5a3a"/>'),
  coin: `<svg viewBox="0 0 24 24"><path fill="#fed15c" d="M12 2l8.700 5v10L12 22l-8.700-5V7z"/><path fill="none" stroke="#3a2c06" stroke-width="1.600" stroke-linejoin="round" d="M12 7l4.500 2.600v4.800L12 17l-4.500-2.600V9.600zM7.500 9.600L12 12l4.500-2.400M12 12v5"/></svg>`,
  solana: `<svg viewBox="0 0 24 24"><path fill="#3fc9b0" d="M6 5h15l-3 3H3z"/><path fill="#7c6bf0" d="M3 10.500h15l3 3H6z"/><path fill="#c04de0" d="M6 16h15l-3 3H3z"/></svg>`,
  leaf: s('<path d="M5 19C5 10 11 5 20 4c0 9-5 15-14 15"/><path d="M5 20L14 10"/>', 'style="color:#7fb24a"'),
  grid: `<svg viewBox="0 0 24 24" fill="#d8d8d8"><path d="M3 6h5v4H3zM13 6h4v4h-4zM8 10h5v4H8zM17 10h4v4h-4zM3 14h5v4H3zM13 14h4v4h-4z"/></svg>`,
  butterfly: `<svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.400" stroke-linecap="round"><path d="M12 12C9 5 4 5 4 8s4 4 8 4zM12 12c3-7 8-7 8-4s-4 4-8 4zM12 12c-3 6-7 6-7 3s3-3 7-3zM12 12c3 6 7 6 7 3s-3-3-7-3z"/></svg>`,
  rain: f('<path d="M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z"/>'),
};

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach((el) => {
    el.innerHTML = ICON[el.dataset.ic] ?? '';
    el.removeAttribute('data-ic');
  });
}
