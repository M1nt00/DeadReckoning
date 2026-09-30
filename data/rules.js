// ─────────────────────────────────────────────
//  전투 규칙 숫자 · 함선   (기획/01_기획서.md 3~5장, 7장)
// ─────────────────────────────────────────────
window.DATA = window.DATA || {};

DATA.rules = {
  maxDistance: 2000,     // 최대 거리 (km)
  step: 100,             // 거리 단위
  startDistance: 1200,   // 시작 거리
  handSize: 5,           // 매 턴 손패
  carryMax: 2,           // 다음 턴으로 넘어가는 연료 최대
  coolPerFuel: 15,       // 연료 1을 냉각에 쓰면 열 −15
  // 오버드라이브 = 비장의 한 수. 버튼으로 켜고, 쓰면 한동안 다시 못 씀
  overdriveFuel: 3,      // 켜면 이번 턴 연료 +3
  overdriveBonus: 0.5,   // 이번 턴 무기 피해 +50% (다음 턴 도착하는 어뢰 포함)
  overdriveHeat: 30,     // 열 +30
  overdriveCooldown: 4,  // 쓰고 나면 4턴 동안 충전
  // 기본 엔진: 카드 없이 언제나 쓸 수 있는 이동
  engineMaxSteps: 20,    // 사실상 제한 없음 — 연료가 허락하는 만큼 (100km당 연료 1)
  engineHeatPerStep: 5,  // 100km당 열 +5 (연료는 100km당 1)
  // 열 단계
  warnHeat: 50,          // 경고: 보호막 효율 하락
  warnShieldMult: 0.7,
  dangerHeat: 80,        // 위험: 다음 턴 최대 연료 −1
  dangerFuel: 1,
  meltdownHeat: 100,     // 멜트다운: 선체 피해 + 다음 턴은 기본 엔진(이동)만
  meltdownDamage: 30,
  meltdownResetHeat: 40, // 멜트다운 턴이 끝나면 (얼마나 움직였든) 열 40
};

// 상태 (버프 · 디버프) — 기획서 v0.8 11번
//   이름이 붙은 상태만 버프 · 디버프. 세기 = 남은 턴 (걸릴 때마다 더해지고, 턴마다 1씩 줄어듦)
//   상태이상은 보호막과 상관없이 걸린다
DATA.status = {
  jam:  { name: '교란', kind: 'debuff', icon: '✖', desc: '턴 시작에 손패 1장 잠김' },
  cool: { name: '냉각', kind: 'buff',   icon: '❄', amount: 7, desc: '열 단계에 열 −7' },
};

// 함선 (cooling = 매 턴 자연 냉각. 지금은 모두 10 — 함선별 차이는 나중에)
DATA.ships = {
  player: {
    name: '호위함 「나침반」', hull: 120, reactor: 5, cooling: 10,
    deck: null,            // null이면 DATA.starterDeck
  },
  // 첫 적: 중거리 구축함. prefer = 선호 거리 (화면에 공개됨 → 플레이어가 읽을 단서)
  vex: {
    name: '순찰 구축함 VEX-7', hull: 110, reactor: 5, cooling: 10, prefer: 800,
    doctrine: '중거리 사수', doctrineDesc: '레이저 · 어뢰 거리(600~900km)를 지키려 한다',
    deck: ['laser', 'laser', 'laser', 'railgun', 'torpedo', 'torpedo', 'scatter', 'scatter',
      'shield', 'shield', 'heavyShield', 'pointDefense', 'burn', 'retro', 'asteroids'],   // 소행성 지대 = 전장 시험용
  },
};
