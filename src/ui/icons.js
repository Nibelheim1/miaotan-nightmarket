const paths = {
  paw: '<ellipse cx="12" cy="16" rx="6" ry="4.5" fill="currentColor"/><ellipse cx="4.5" cy="9" rx="2.4" ry="3.2" fill="currentColor"/><ellipse cx="10" cy="5.8" rx="2.4" ry="3.2" fill="currentColor"/><ellipse cx="16" cy="6" rx="2.4" ry="3.2" fill="currentColor"/><ellipse cx="21" cy="10" rx="2.2" ry="3" fill="currentColor"/>',
  bolt: '<path d="M14 2 4 14h7l-1 8 10-13h-7z" fill="currentColor" stroke="none"/>',
  boom: '<path d="m12 1 2.7 6.2L21 4l-2.6 6.4L24 13l-6.5 2L20 22l-7-3-4 5-1-7-7 1 4-6L0 7l8 1z" fill="currentColor" stroke="none"/>',
  split: '<path d="M12 21V12M12 12 4 4m8 8 8-8M12 12V2M2 7V2h5M17 2h5v5"/>',
  arrow: '<path d="M2 12h18M14 5l7 7-7 7M5 4v16"/>',
  bounce: '<path d="M3 3v18M7 20 17 12 7 5m6 0H7v6M21 4v16"/>',
  return: '<path d="M6 7h9a6 6 0 0 1 0 12H7M9 2 4 7l5 5"/>',
  snow: '<path d="M12 2v20M3.4 7l17.2 10M3.4 17 20.6 7M9 4l3 3 3-3M9 20l3-3 3 3"/>',
  laser: '<path d="M2 10h7l3-7 3 7h7M2 14h7l3 7 3-7h7"/>',
  fish: '<path d="M3 12C8 3 17 4 18 12c-1 8-10 9-15 0Zm15 0 5-5v10z"/><circle cx="8" cy="11" r="1" fill="currentColor"/>',
  shield: '<path d="M12 2 3 6v7c0 5 9 9 9 9s9-4 9-9V6z"/><path d="m7 12 3 3 7-7"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 10 10m-6-6 3-3m-1 5 3-3"/>',
  heart: '<path d="M12 21C-5 10 4-2 12 6c8-8 17 4 0 15Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 4v16M16 4v16" stroke-width="4"/>',
  play: '<path d="m7 3 15 9-15 9z" fill="currentColor" stroke="none"/>',
  sound: '<path d="M3 9h4l6-6v18l-6-6H3zM17 7a8 8 0 0 1 0 10M20 4a12 12 0 0 1 0 16"/>',
  mute: '<path d="M3 9h4l6-6v18l-6-6H3zM17 9l6 6m0-6-6 6"/>',
  trophy: '<path d="M7 3h10v6c0 8-10 8-10 0ZM7 5H2v3c0 4 5 4 5 4m10-7h5v3c0 4-5 4-5 4M12 15v6M7 22h10"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z" fill="currentColor" stroke="none"/>',
  moon: '<path d="M21 15A10 10 0 0 1 9 2a10 10 0 1 0 12 13Z"/>',
  book: '<path d="M12 5C8 2 4 2 2 3v17c4-2 7-1 10 1 3-2 6-3 10-1V3c-4-1-7-1-10 2Zm0 0v16"/>',
  settings: '<path d="m9 2-1 4-4 1-2 4 3 3v4l4 3 4-2 4 1 3-4-1-4 2-4-3-3h-4z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  share: '<path d="M12 15V2m-5 5 5-5 5 5M4 12v10h16V12"/>',
  rewind: '<path d="M4 9a9 9 0 1 1-1 7M4 2v7h7"/>',
  check: '<path d="m4 12 5 5L21 5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 11v7M12 6v1"/>'
};
export function icon(name, size = 24) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.paw}</svg>`; }
export function catArt(color = '#92e3c0') {
  return `<svg viewBox="0 0 320 238" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="薄荷猫店长推着弹珠炮守护夜市">
  <ellipse cx="168" cy="218" rx="102" ry="12" fill="#080d16" opacity=".4"/>
  <path d="M91 169c-47 1-55-47-28-57 27-10 40 24 14 31" fill="none" stroke="${color}" stroke-width="20" stroke-linecap="round"/>
  <path d="M94 212c-20-56-4-111 61-116 69 2 92 47 69 116Z" fill="${color}" stroke="#121725" stroke-width="6"/>
  <path d="m102 79-5-60 49 28 36-2 41-28-2 66c24 54-9 88-62 88-54 0-90-32-57-92Z" fill="${color}" stroke="#121725" stroke-width="6" stroke-linejoin="round"/>
  <path d="m107 34 4 40 25-22zm104 0-4 38-20-21z" fill="#ffb3ac"/>
  <ellipse cx="158" cy="120" rx="46" ry="35" fill="#fff1d8"/>
  <path d="m117 88 11-3m58 0 11 4" stroke="#121725" stroke-width="7" stroke-linecap="round"/>
  <ellipse cx="129" cy="105" rx="5" ry="7" fill="#121725"/><ellipse cx="187" cy="105" rx="5" ry="7" fill="#121725"/>
  <path d="m151 117 7 6 7-6m-7 6v6m0 0c-6 8-15 4-15 0m15 0c6 8 15 4 15 0" fill="none" stroke="#121725" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="114" cy="121" rx="8" ry="4" fill="#ff7898"/><ellipse cx="202" cy="121" rx="8" ry="4" fill="#ff7898"/>
  <path d="m139 160 20 14 22-14-9 30h-25z" fill="#ff7898" stroke="#121725" stroke-width="4"/>
  <g transform="translate(222 164) rotate(-33)"><rect x="-10" y="-34" width="62" height="47" rx="15" fill="#ffe2a1" stroke="#121725" stroke-width="6"/><ellipse cx="51" cy="-10" rx="10" ry="20" fill="#27334b" stroke="#121725" stroke-width="5"/></g>
  <path d="M113 195c3-28 36-30 42-1m19 1c5-23 35-26 39-2" fill="${color}" stroke="#121725" stroke-width="6" stroke-linecap="round"/>
  <circle cx="263" cy="79" r="14" fill="#fff4df"/><circle cx="285" cy="41" r="9" fill="#ff7898"/><circle cx="241" cy="13" r="5" fill="#ffe2a1"/>
  <path d="m36 47 5 12 12 4-12 5-5 12-5-12-12-5 12-4z" fill="#ffe2a1"/><path d="m269 128 3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#92e3c0"/>
  </svg>`;
}
