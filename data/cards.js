// ─────────────────────────────────────────────
//  카드 — 무기 · 방어 · 기동 · 시스템 · 지원   (수치 = 카드 목록 dr-cards.json 기준, 2026-10-01)
//  숫자만 바꾸고 저장 → 브라우저 새로고침(F5)
//  text: 카드 앞면 설명 (카드 목록의 '설명') · desc: 요약 ([자세히]에도 나옴)
//
//  dmg: 거리별 피해 표. [이 거리 이하면, 이 피해] 를 위에서부터 확인
//       예) [[500, 7], [1100, 10], [2000, 14]] → 500km 이하 7, 1100km 이하 10, 그 이상 14
//  preempt: true   = 선제 (무기 · 방어만). 기동보다 먼저 — 선제 무기는 기동 전 거리로 판정
//  ignoreShield    = 관통 피해 (보호막 무시 · 피해 감소는 적용)
//  inflict: { 상태: 세기 }  = 명중하면 상대에게 상태이상 (상태 목록은 data/rules.js의 DATA.status)
//  selfStatus: { 상태: 세기 } = 쓰면 나에게 상태
//  trackMove: { min, dmg } = 상대가 이번 턴 min×100km 이상 움직였으면 피해가 dmg
//  evadedBy: n     = 상대가 이번 턴 n×100km 이상 움직였으면 빗나감
// ─────────────────────────────────────────────
window.DATA = window.DATA || {};

DATA.cards = {
  // ── 무기 ──
  railgun: {
    name: '레일건', type: 'weapon', cost: 3, heat: 15,
    dmg: [[300, 0], [900, 4], [1100, 10], [1600, 20], [2000, 0]],
    text: '거리가 증가할수록 강해지는 레일건을 발포합니다. 1200~1600km에서 최대 20의 피해를 입힙니다.',
    desc: '저격. 1,200~1,600km면 20. 300km 이하 · 1,700km 이상은 안 닿음',
  },
  laser: {
    name: '레이저', type: 'weapon', cost: 1, heat: 5,
    dmg: [[1200, 8], [2000, 0]],
    text: '레이저를 발사해 8의 피해를 입힙니다.',
    desc: '0~1,200km 어디서든 8',
  },
  torpedo: {
    name: '어뢰', type: 'weapon', cost: 2, heat: 10,
    dmg: [[300, 0], [400, 7], [900, 16], [1000, 8], [2000, 0]],
    torpedo: true,
    text: '상대를 추적하는 어뢰를 발사해 다음 턴 적과의 거리에 따라 500~900km에서 최대 16의 피해를 입힙니다.',
    desc: '다음 턴에 도착. 그때 500~900km면 16',
  },
  scatter: {
    name: '산탄 포대', type: 'weapon', cost: 2, heat: 15,
    dmg: [[100, 22], [300, 16], [500, 8], [700, 2], [2000, 0]],
    text: '상대와 멀어질수록 피해가 감소하는 산탄총을 발사해 최대 22의 피해를 입힙니다.',
    desc: '근접 폭발. 100km 이내 22 · 300km까지 16 · 500km까지 8',
  },
  ram: {
    name: '충각', type: 'weapon', cost: 1, heat: 25,
    dmg: [[100, 26], [2000, 0]],
    selfDamage: 4,
    text: '100km 이내의 적에게 돌진해 26의 피해를 입히고 4의 피해를 받습니다.',
    desc: '100km 이내 전용. 큰 피해, 나도 4 피해',
  },
  solarLance: {
    name: '초고열 응집', type: 'weapon', cost: 3, heat: 10,
    charge: { turns: 2, heat: 5, fuel: 1, dmg: 30, enemyHeat: 15 },   // 2턴 동안 매 턴 열 +5 · 최대 연료 −1, 그다음 공격 단계에 30 + 상대 열 +15
    text: '근처 항성에서 오는 열을 응집하여 2턴 동안 최대 연료가 1만큼 감소하며 열이 5씩 증가합니다. 2턴 후, 상대에게 열 15와 피해 30을 입힙니다.',
    desc: '2턴 동안 매 턴 열 +5 · 최대 연료 −1. 2턴 뒤 거리 무관 30 + 상대 열 +15',
  },
  boarding: {
    name: '군사작전', type: 'weapon', cost: 4, heat: 0,
    dmg: [[0, 20], [2000, 0]], ignoreShield: true,
    inflict: { jam: 1 },
    text: "상대의 함선에 군대를 보내어 20의 관통 피해를 입히고 1턴 동안 '교란' 상태를 부여합니다.",
    desc: '0km에서만. 관통 피해 20 + 교란 1',
  },
  particleCutter: {
    name: '입자 절단기', type: 'weapon', cost: 4, heat: 30,
    dmg: [[300, 35], [2000, 0]], ignoreShield: true,
    text: '강력한 입자 절단기로 300km 이내의 적 함선을 공격해 35의 관통 피해를 입힙니다.',
    desc: '0~300km 관통 피해 35',
  },
  phaseLaser: {
    name: '위상 가속 레이저', type: 'weapon', cost: 2, heat: 20,
    // 1,000km부터 100km마다 +3: 1,000km 15 → 2,000km 45
    dmg: [[900, 0], [1000, 15], [1100, 18], [1200, 21], [1300, 24], [1400, 27], [1500, 30], [1600, 33], [1700, 36], [1800, 39], [1900, 42], [2000, 45]],
    text: '1000km부터 거리가 멀어질수록 피해가 증가하는 레이저를 발사합니다. 2000km에서 최대 45의 피해를 입힙니다.',
    desc: '1,000km 15, 100km마다 +3 → 2,000km 45',
  },
  orbitShot: {
    name: '궤도 예측 사격', type: 'weapon', cost: 1, heat: 5,
    dmg: [[2000, 5]],
    trackMove: { min: 2, dmg: 25 },
    text: '거리에 관계없이 피해 5를 입힙니다. 만약 상대가 이번 턴에 200km 이상 이동했을 경우 20의 피해를 추가로 입힙니다.',
    desc: '거리 무관 5. 상대가 이번 턴 200km 이상 움직였으면 25',
  },
  guidedMissile: {
    name: '유도 미사일', type: 'weapon', cost: 1, heat: 5,
    dmg: [[2000, 15]],
    evadedBy: 3,
    text: '상대를 쫓는 미사일을 발사해 거리에 관계없이 15의 피해를 입힙니다. 상대가 이번 턴에 300km 이상 이동했다면 빗나갑니다.',
    desc: '거리 무관 15. 상대가 이번 턴 300km 이상 움직였으면 빗나감',
  },

  // ── 방어 ──
  shield: {
    name: '보호막 전개', type: 'defense', cost: 1, heat: 0,
    shield: 8,
    text: '이번 턴에 보호막 8을 얻습니다.',
    desc: '이번 턴 보호막 +8',
  },
  heavyShield: {
    name: '중보호막', type: 'defense', cost: 2, heat: 5,
    shield: 15,
    text: '이번 턴에 보호막 15를 얻습니다.',
    desc: '이번 턴 보호막 +15',
  },
  pointDefense: {
    name: '점방어', type: 'defense', cost: 1, heat: 5,
    pointDefense: true,
    text: '이번 턴에 나에게 도착하는 어뢰를 모두 격추시킵니다.',
    desc: '이번 턴 나에게 도착하는 어뢰를 모두 격추',
  },
  regenShield: {
    name: '재생 보호막', type: 'defense', cost: 2, heat: 5,
    shield: 8, shieldNext: 6,
    text: '이번 턴에 보호막 8을 얻고, 다음 턴에 보호막 6을 얻습니다.',
    desc: '이번 턴 보호막 +8, 다음 턴 보호막 +6',
  },
  fallback: {
    name: '물러나기', type: 'defense', cost: 3, heat: 0,
    maxRange: 400, move: -1, dmgReduce: 0.8,
    text: '뒤로 100km 이동합니다. 400km 이내에서 받는 모든 피해가 80% 감소합니다.',
    desc: '400km 이내에서만. 100km 후진, 이번 턴 받는 모든 피해 −80%',
  },
  evasive: {
    name: '회피 기동', type: 'defense', cost: 0, heat: 15,
    evade: 0.5,                 // 이번 턴 상대가 나와 다른 방향으로 움직였으면 받는 피해 −50%
    text: '이번 턴에 상대가 나와 다른 방향으로 이동했을 경우 받는 모든 피해가 50% 감소합니다.',
    desc: '상대가 나와 다른 방향으로 움직였으면 이번 턴 받는 피해 −50%',
  },

  // ── 기동 ── (move: 100km 단위. +는 전진, −는 후진)
  //   기본 이동은 카드 없이 '기본 엔진'으로 (100km당 연료 1 · 열 5). 이 카드들은 연료가 싼 대신 뜨거운 한 방 기동
  burn: {
    name: '급가속', type: 'move', cost: 2, heat: 20,
    move: 5,
    text: '앞으로 500km 이동합니다.',
    desc: '500km 전진',
  },
  retro: {
    name: '역분사', type: 'move', cost: 2, heat: 20,
    move: -5,
    text: '뒤로 500km 이동합니다.',
    desc: '500km 후진',
  },
  inertia: {
    name: '관성 항행', type: 'move', cost: 0, heat: 0,
    inertia: 2,                 // 지난 턴에 움직인 방향으로 200km (지난 턴에 안 움직였으면 0)
    text: '이전 턴에 이동한 방향으로 200km 이동합니다.',
    desc: '지난 턴에 움직인 방향으로 200km (지난 턴에 정지했다면 이동 없음)',
  },

  // ── 시스템 (공개 때 가장 먼저 발동해 그 턴의 규칙을 바꿈) ──
  coolCatalyst: {
    name: '냉각 촉매', type: 'system', cost: 2, heat: 0,
    selfStatus: { cool: 3 },
    text: "나에게 3턴 동안 '냉각' 상태를 부여합니다.",
    desc: '나에게 냉각 3 (매 턴 열 −7)',
  },
  ventPurge: {
    name: '강제 배기', type: 'system', cost: 3, heat: 0,
    heatNow: -40,
    text: '즉시 열을 40 감소시킵니다.',
    desc: '곧바로 열 −40',
  },
  timeDelay: {
    name: '시간 지연', type: 'system', cost: 1, heat: 0,
    extend: 1,                  // 내 버프 +1턴 · 상대 디버프 +1턴 (걸려 있는 것만)
    text: '내 함선의 버프 지속시간을 1턴 증가시키고 상대 함선의 디버프 지속시간을 1턴 증가시킵니다.',
    desc: '내 버프 +1턴 · 상대 디버프 +1턴',
  },

  // ── 지원 (계획 중에 바로 사용 · 상대에게 보이지 않음) ──
  draw: {
    name: '드로우', type: 'support', cost: 1, heat: 0,
    draw: 1,
    text: '나의 뽑을 더미에서 1장을 뽑습니다.',
    desc: '뽑을 더미에서 1장 뽑기',
  },
};

// 시작 덱 (14장)
DATA.starterDeck = [
  'laser', 'laser', 'laser', 'railgun', 'railgun', 'torpedo', 'torpedo', 'scatter',
  'shield', 'shield', 'shield', 'pointDefense', 'burn', 'retro',
];
