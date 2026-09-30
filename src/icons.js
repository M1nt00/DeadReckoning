// 카드 아이콘 (선으로 그린 그림 · 색은 카드 종류 색을 따라감)
'use strict';

const ICON_PATHS = {
  railgun: '<path d="M5 17h30M5 31h30"/><path d="M35 12v24"/><path d="M9 24h22" stroke-dasharray="3 3"/><circle cx="42" cy="24" r="3.2" fill="currentColor"/>',
  laser: '<circle cx="11" cy="24" r="6"/><circle cx="11" cy="24" r="2" fill="currentColor"/><path d="M17 24h23" stroke-width="4.5"/><path d="M40 17l5 7-5 7"/>',
  torpedo: '<path d="M8 24c0-4 4-6 10-6h15l9 6-9 6H18c-6 0-10-2-10-6z"/><path d="M12 18l-5-6M12 30l-5 6"/><path d="M27 18v12"/>',
  scatter: '<path d="M6 24h9"/><path d="M15 24l14-12M15 24l18-3M15 24l18 6M15 24l13 13" stroke-dasharray="2 3"/><circle cx="31" cy="11" r="2.6" fill="currentColor"/><circle cx="36" cy="20" r="2.6" fill="currentColor"/><circle cx="36" cy="31" r="2.6" fill="currentColor"/><circle cx="30" cy="38" r="2.6" fill="currentColor"/><circle cx="43" cy="26" r="2.6" fill="currentColor"/>',
  ram: '<path d="M5 14h22l15 10-15 10H5z"/><path d="M27 14v20"/><path d="M42 24h4M40 16l4-3M40 32l4 3"/>',
  shield: '<path d="M24 5l16 9v20l-16 9-16-9V14z"/><path d="M24 14l8 4.5v9L24 32l-8-4.5v-9z" opacity=".55"/>',
  heavyShield: '<path d="M24 3l18 10v22L24 45 6 35V13z" stroke-width="3.6"/><path d="M24 12l10 5.5v13L24 36l-10-5.5v-13z"/><path d="M24 19l4 2.2v5.6L24 29l-4-2.2v-5.6z" fill="currentColor"/>',
  pointDefense: '<circle cx="24" cy="24" r="12"/><path d="M24 5v9M24 34v9M5 24h9M34 24h9"/><circle cx="24" cy="24" r="2.6" fill="currentColor"/>',
  thrust: '<path d="M24 15h16v18H24z"/><path d="M24 19l-6-4v18l6-4"/><path d="M15 19c-6 1-9 4-9 5s3 4 9 5"/>',
  burn: '<path d="M8 12l12 12-12 12M22 12l12 12-12 12"/><path d="M38 14v20"/>',
  retro: '<path d="M40 12L28 24l12 12M26 12L14 24l12 12"/><path d="M10 14v20"/>',
  engine: '<circle cx="24" cy="24" r="9"/><path d="M33 24h10M5 24h10"/><path d="M40 20l4 4-4 4M8 20l-4 4 4 4"/>',
  regenShield: '<path d="M24 5l16 9v20l-16 9-16-9V14z"/><path d="M17 25a7 7 0 1 0 2-8"/><path d="M19 12v5h-5"/>',
  fallback: '<path d="M30 12L18 24l12 12"/><path d="M18 24h22"/><path d="M8 10v28" stroke-dasharray="3 3"/>',
  solarLance: '<circle cx="15" cy="24" r="7"/><path d="M15 11v-4M15 41v-4M2 24h4M6 15l3 3M6 33l3-3M24 15l-3 3M24 33l-3-3"/><path d="M24 24h21" stroke-width="4.5"/>',
  boarding: '<path d="M8 30l10-10 6 6-10 10z"/><path d="M18 20l14-14h8v8L26 28"/><path d="M34 34l6 6M40 34l-6 6"/>',
  coolCatalyst: '<path d="M24 5v38M8 14l32 20M8 34l32-20"/><path d="M19 8l5 5 5-5M19 40l5-5 5 5"/>',
  ventPurge: '<path d="M10 12h28v10H10z"/><path d="M14 28c0 6 4 6 4 12M24 28c0 6 4 6 4 12M34 28c0 6 4 6 4 12"/><path d="M16 17h16"/>',
  // 2026-10-01 새 카드
  asteroids: '<path d="M10 14l6-4 6 3 1 6-5 4-7-2z"/><path d="M28 26l5-3 6 2 2 6-4 5-7-1-2-5z"/><circle cx="36" cy="11" r="3"/><circle cx="14" cy="34" r="2.5"/><circle cx="23" cy="40" r="1.6" fill="currentColor"/>',
  particleCutter: '<path d="M6 24h12"/><path d="M18 18l24 6-24 6z"/><path d="M26 12l4 4M26 36l4-4M36 14l2 4M36 34l2-4" stroke-dasharray="2 2"/>',
  phaseLaser: '<path d="M5 24h8M17 24h8M29 24h14" stroke-width="4"/><path d="M13 18v12M25 16v16" /><path d="M39 17l6 7-6 7"/>',
  orbitShot: '<ellipse cx="24" cy="24" rx="19" ry="9" stroke-dasharray="3 3"/><circle cx="24" cy="24" r="4"/><circle cx="41" cy="21" r="3" fill="currentColor"/><path d="M8 34l6-6"/>',
  guidedMissile: '<path d="M6 34c10 0 14-20 26-20"/><path d="M32 10l10 4-6 8"/><circle cx="40" cy="34" r="5"/><circle cx="40" cy="34" r="1.6" fill="currentColor"/>',
  evasive: '<path d="M8 36c6-14 10-14 16 0s10 14 16 0" /><path d="M36 30l4 6 5-5"/><path d="M8 14h14" stroke-dasharray="3 3"/>',
  inertia: '<path d="M6 24h24" stroke-dasharray="4 3"/><path d="M30 16l10 8-10 8"/><circle cx="10" cy="24" r="3"/>',
  timeDelay: '<circle cx="24" cy="26" r="15"/><path d="M24 17v9l6 4"/><path d="M18 6h12"/><path d="M38 12l3-3"/>',
  draw: '<rect x="12" y="10" width="18" height="26" rx="3"/><rect x="20" y="14" width="18" height="26" rx="3"/><path d="M29 22v10M24 27h10"/>',
  overdrive: '<path d="M27 4L11 27h11l-3 17 17-24H25z" fill="currentColor" stroke="none"/>',
};

function iconSVG(id, size = 44) {
  const p = ICON_PATHS[id] || '';
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}
