// ─────────────────────────────────────────────
//  카드 — 무기 · 방어 · 기동 · 시스템   (수치 = 카드 목록 dr-cards.json 기준, 2026-10-01)
//  숫자만 바꾸고 저장 → 브라우저 새로고침(F5)
//
//  dmg: 거리별 피해 표. [이 거리 이하면, 이 피해] 를 위에서부터 확인
//       예) [[500, 7], [1100, 10], [2000, 14]] → 500km 이하 7, 1100km 이하 10, 그 이상 14
// ─────────────────────────────────────────────
window.DATA = window.DATA || {};

DATA.cards = {
  // ── 무기 ──
  railgun: {
    name: '레일건', type: 'weapon', cost: 3, heat: 15,
    dmg: [[300, 0], [900, 4], [1100, 10], [1600, 20], [2000, 0]],
    desc: '저격. 1,200~1,600km면 20. 300km 이하 · 1,700km 이상은 안 닿음',
  },
  laser: {
    name: '레이저', type: 'weapon', cost: 2, heat: 5,
    dmg: [[1200, 8], [2000, 0]],
    desc: '0~1,200km 어디서든 8',
  },
  torpedo: {
    name: '어뢰', type: 'weapon', cost: 2, heat: 10,
    dmg: [[300, 0], [400, 7], [900, 16], [1000, 8], [2000, 0]],
    torpedo: true,
    desc: '다음 턴에 도착. 그때 500~900km면 16',
  },
  scatter: {
    name: '산탄 포대', type: 'weapon', cost: 2, heat: 15,
    dmg: [[100, 22], [300, 16], [500, 8], [700, 2], [2000, 0]],
    desc: '근접 폭발. 100km 이내 22 · 300km까지 16 · 500km까지 8',
  },
  ram: {
    name: '충각', type: 'weapon', cost: 1, heat: 25,
    dmg: [[100, 26], [2000, 0]],
    selfDamage: 4,
    desc: '100km 이내 전용. 큰 피해, 나도 4 피해',
  },

  // ── 방어 ──
  shield: {
    name: '보호막 전개', type: 'defense', cost: 1, heat: 0,
    shield: 8,
    desc: '이번 턴 보호막 +8',
  },
  heavyShield: {
    name: '중보호막', type: 'defense', cost: 2, heat: 5,
    shield: 18,
    desc: '이번 턴 보호막 +18',
  },
  pointDefense: {
    name: '점방어', type: 'defense', cost: 1, heat: 5,
    pointDefense: true,
    desc: '이번 턴 나에게 도착하는 어뢰를 모두 격추',
  },

  // ── 기동 ── (move: 100km 단위. +는 전진, −는 후진)
  //   기본 이동은 카드 없이 '기본 엔진'으로 (100km당 연료 1 · 열 5). 이 카드들은 연료가 싼 대신 뜨거운 한 방 기동
  burn: {
    name: '급가속', type: 'move', cost: 2, heat: 20,
    move: 5,
    desc: '500km 전진. 싸고 멀리 가지만 뜨겁다',
  },
  retro: {
    name: '역분사', type: 'move', cost: 2, heat: 20,
    move: -5,
    desc: '500km 후진. 싸고 멀리 가지만 뜨겁다',
  },

  // ── v0.6 새 카드 ──
  regenShield: {
    name: '재생 보호막', type: 'defense', cost: 2, heat: 5,
    shield: 8, shieldNext: 6,
    desc: '이번 턴 보호막 +8, 다음 턴 보호막 +6',
  },
  fallback: {
    name: '물러나기', type: 'defense', cost: 3, heat: 0,
    maxRange: 400, move: -1, dmgReduce: 0.8,
    desc: '400km 이내에서만. 100km 후진, 이번 턴 받는 모든 피해 −80%',
  },
  solarLance: {
    name: '초고열 응집', type: 'weapon', cost: 3, heat: 10,
    charge: { turns: 2, heat: 5, fuel: 1, dmg: 30, enemyHeat: 15 },   // 2턴 동안 매 턴 열 +5 · 최대 연료 −1, 그다음 공격 단계에 30 + 상대 열 +15
    desc: '2턴 동안 매 턴 열 +5 · 최대 연료 −1. 2턴 뒤 거리 무관 30 + 상대 열 +15',
  },
  boarding: {
    name: '군사작전', type: 'weapon', cost: 4, heat: 0,
    dmg: [[0, 20], [2000, 0]], ignoreShield: true,   // 관통 피해 (보호막 무시 · 피해 감소는 적용)
    jam: 1,                                           // 명중하면 교란 1 (다음 턴 손패 1장 잠김)
    desc: '0km에서만. 관통 피해 20 + 교란 1 (다음 턴 손패 1장 잠김)',
  },

  // ── 시스템 (즉시 사용: 계획 중에 바로 발동, 동시 공개 때 가장 먼저 공개) ──
  coolCatalyst: {
    name: '냉각 촉매', type: 'system', cost: 2, heat: 0, instant: true,
    coolStatus: { turns: 3, amount: 7 },
    desc: '즉시: 이번 턴부터 3턴 동안 매 턴 열 −7',
  },
  ventPurge: {
    name: '강제 배기', type: 'system', cost: 3, heat: 0, instant: true,
    heatNow: -40,
    desc: '즉시: 열 −40',
  },
};

// 시작 덱 (14장)
DATA.starterDeck = [
  'laser', 'laser', 'laser', 'railgun', 'railgun', 'torpedo', 'torpedo', 'scatter',
  'shield', 'shield', 'shield', 'pointDefense', 'burn', 'retro',
];
