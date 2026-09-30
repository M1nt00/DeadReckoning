// ─────────────────────────────────────────────
//  항해 · 이야기 데이터   (기획/02_항해와_이야기.md)
//  글이나 숫자를 바꾸고 저장 → 브라우저 새로고침(F5)
// ─────────────────────────────────────────────
window.DATA = window.DATA || {};

DATA.voyage = {
  jumpsPerChapter: 4,      // 장마다 점프 수 (그다음 기함)
  playerHull: 140,         // 항해를 시작할 때 내 함선 선체 (연습 전투는 60)
  autoRepair: 40,          // 전투에서 이기면 응급 수리
  startDistance: 96,       // 북극성까지 (광분) — 세라의 보고용
  repairAmount: 50,        // 수리 보상
  dockRepair: 64,          // 정비 지점 수리

  // 보상 카드 뽑기 비중 (클수록 자주)
  cardPool: { laser: 3, railgun: 2, torpedo: 2, scatter: 2, ram: 1, shield: 2, heavyShield: 2, pointDefense: 1, burn: 1, retro: 1,
    regenShield: 2, fallback: 1, solarLance: 1, boarding: 1, coolCatalyst: 2, ventPurge: 1,
    // 2026-10-01 새 카드
    particleCutter: 1, phaseLaser: 1, orbitShot: 2, guidedMissile: 2, evasive: 1, inertia: 1, timeDelay: 1, draw: 2, asteroids: 1 },

  // 특별한 카드 풀 (사건 보상)
  pools: {
    ally: { railgun: 3, heavyShield: 3, laser: 2, pointDefense: 2, retro: 1, torpedo: 1, regenShield: 2, coolCatalyst: 2, solarLance: 1 },   // 연합 장비
  },

  // 개조 부품
  mods: {
    cooler: { name: '냉각기 강화', desc: '매 턴 냉각 +3', apply: (s) => { s.cooling += 3; } },
    armor: { name: '장갑 보강', desc: '최대 선체 +20 (선체도 +20)', apply: (s) => { s.maxHull += 20; s.hull += 20; } },
    reactor: { name: '반응로 과급', desc: '매 턴 연료 +1', rare: true, apply: (s) => { s.reactor += 1; } },
  },

  // 목적지 이름 (항로 카드에 무작위로)
  places: ['부표 B-7 잔해', '끊어진 수송로', '얼어붙은 연료 구름', '표류 화물선 무덤', '꺼진 등대 부표', '금속 파편대', '침묵하는 중계소', '고철단 사냥터'],

  // 세라의 점프 보고 (무작위 한 줄)
  seraJump: [
    '추정 위치 갱신. 오차가 조금 늘었습니다. 조금요.',
    '연소 시간, 속도, 방향… 계산 끝. 다음 항로를 고르시죠.',
    '별빛이 이상하게 흔들립니다. 먼지겠죠. 아마.',
    '이 근처에서 조난 신호가 여럿 끊겼습니다. 조심하십시오.',
    '연료 계산은 제가 합니다. 싸움은 함장님이 하시고요.',
    '정적 이후로 들리는 건 우리 엔진 소리뿐이네요.',
  ],

  chapters: [
    {
      name: '부표 무덤', sub: '부서진 항법 부표가 떠도는 표류 구역',
      enemyHull: 0.85,       // 이 장의 일반 · 정예 적 선체 배율 (초반이라 조금 약하게)
      intro: [
        '정적(靜寂).',
        '성계의 모든 항법 신호와 통신이 한순간에 꺼졌다.',
        '좌표도, 아군도, 본대의 위치도 알 수 없다.',
        '호위함 「나침반」은 성계 반대편 — 본대 요새 북극성을 향해 첫 점프를 준비한다.',
        '믿을 것은 계산과 추측뿐이다.',
      ],
      sera: '항해장 세라입니다. 마지막으로 확인된 위치에서 추측항법을 시작합니다. …틀리면 제 탓으로 하시죠.',
      enemies: ['scav', 'vex'], elites: ['raider'], flagship: 'junkKing',
      events: ['distress', 'buoy', 'cargo'],
      flagRadio: [
        ['고철왕', '여어, 연합 깡통. 신호도 없이 헤매는 꼴이 딱 우리 먹잇감이군.'],
        ['고철왕', '거리 재느라 바쁘지? 걱정 마. 금방 0km로 만들어 줄 테니.'],
        ['세라', '붙어 오려는 배입니다. 붙기 직전을 노리세요.'],
      ],
      outro: [
        '고철왕의 선체가 부표 잔해 사이로 가라앉는다.',
        '세라가 그의 항해 기록을 복구했다.',
        '"정적 직전, 성계 곳곳의 등대 비콘이 동시에 이상한 신호를 쐈습니다."',
        '"…우연은 아니겠죠."',
      ],
      next: '2장 「안개 성운」',
    },
    {
      name: '안개 성운', sub: '센서가 흐려지는 먼지 성운',
      enemyHull: 0.95,
      startRepair: 60,       // 장 시작 전 정비 (선체 회복)
      theme: 'fog',          // 화면: 짙은 성운 안개
      fog: true,             // 적 기동 기록이 최근 2번만 보임
      intro: [
        '고철왕의 기록이 가리킨 방향 — 성계 중심 쪽 먼지 성운.',
        '성운 속에서는 센서가 흐려지고, 먼지가 빛을 삼킨다.',
        '흩어진 연합 함대의 잔존함들이 이곳에 숨어 있다는 신호가 잡혔다.',
        '하지만 정적 이후, 그들에게 우리는 아군일까.',
      ],
      sera: '성운 안입니다. 먼지 때문에 적의 움직임이 잘 안 잡힙니다. 최근 기동 두 번까지만 추적할 수 있어요. …나머지는 감으로.',
      enemies: ['allyPatrol', 'torpBoat', 'scav'], elites: ['allyAssault'], flagship: 'resolute',
      events: ['challenge', 'lifeboat', 'depot'],
      flagRadio: [
        ['카렐 대령', '호위함 나침반. 정적을 일으킨 반역자들과 함께한 배.'],
        ['카렐 대령', '변명은 필요 없다. 이 거리에서 끝낸다.'],
        ['세라', '저격함입니다. 멀리 두면 레일건에 당합니다. 파고드세요.'],
      ],
      // 기함을 이긴 뒤 선택
      flagChoice: {
        title: '불타는 「단호」',
        text: ['단호의 레일건이 멈췄다. 선체가 불꽃을 흘리며 표류한다.', '잡음 섞인 무전이 열린다.', '카렐 대령: "…정말 너희가 아니었나. 그렇다면 대체 누가—"'],
        choices: [
          { label: '살려 보낸다', desc: '단호는 물러난다. 언젠가 이 빚을 갚을지도 모른다.', effect: 'spareKarel' },
          { label: '끝낸다', desc: '잔해에서 레일건 부품을 회수한다 (개조 1).', effect: 'finishKarel' },
        ],
      },
      outro: [
        '단호의 전투 기록에는 한 가지가 반복되어 있었다.',
        '정적 직전, 성계 중심의 주 비콘 — "파수꾼" — 이 모든 부표에 같은 명령을 내렸다.',
        '"항법 신호, 전면 차단."',
        '세라: "등대가… 스스로 불을 끈 겁니다."',
      ],
      next: '3장 「등대」',
    },
  ],

  // 사건: 글 + 선택지. effect 이름은 src/voyage.js 에서 처리
  events: {
    // ── 2장 ──
    challenge: {
      title: '암호를 대라',
      text: ['먼지 속에서 연합 초계함이 나타나 포를 겨눈다.', '"식별 암호를 대라. 틀리면 반역자로 간주한다."', '세라: "정적 이전 암호는 알고 있습니다. 아직 유효할지는… 모르겠네요."'],
      choices: [
        { label: '옛 암호를 댄다', desc: '통하면 보급을 나눠 받는다. 안 통하면 전투.', effect: 'challengeCode' },
        { label: '급가속으로 이탈한다', desc: '전투는 피한다. 무리한 기동으로 선체 −12.', effect: 'challengeFlee' },
      ],
    },
    lifeboat: {
      title: '표류하는 구명정',
      text: ['연합 함정의 구명정이 성운 먼지 속을 떠돈다.', '안에는 기관병 둘. 산소가 거의 바닥났다.'],
      choices: [
        { label: '태운다', desc: '기관병들이 냉각기를 손봐 준다 (냉각 +3).', effect: 'lifeboatTake' },
        { label: '보급만 챙긴다', desc: '구명정의 비상 장비 — 카드 3장 중 1장.', effect: 'lifeboatLoot' },
      ],
    },
    depot: {
      title: '버려진 연합 보급고',
      text: ['소행성에 박힌 연합 보급고. 문은 열려 있고, 아무도 없다.', '수리 자재와 무기 상자가 남아 있다. 둘 다 싣기엔 시간이 없다.'],
      choices: [
        { label: '수리 자재', desc: '선체 +40.', effect: 'depotRepair' },
        { label: '무기 상자', desc: '카드 3장 중 1장 (연합 장비).', effect: 'depotArms' },
      ],
    },
    // ── 1장 ──
    distress: {
      title: '조난 신호',
      text: ['부표 잔해 사이에서 약한 조난 신호가 잡힌다.', '연합 수송선의 식별 부호. 하지만 정적 이후엔 무엇도 확실하지 않다.', '세라: "고철단이 미끼로 쓰는 수법이기도 합니다."'],
      choices: [
        { label: '구조하러 접근한다', desc: '생존자가 있다면 보급을 얻는다. 함정이라면 전투.', effect: 'distressRescue' },
        { label: '지나친다', desc: '아무 일도 일어나지 않는다.', effect: 'pass' },
      ],
    },
    buoy: {
      title: '부서진 항법 부표',
      text: ['정적 이후 꺼진 항법 부표가 천천히 돈다.', '외장 냉각 장치는 아직 쓸 만해 보인다. 내부 기록 장치도 살아 있을지 모른다.'],
      choices: [
        { label: '냉각 장치를 뜯어낸다', desc: '냉각 +3. 작업 중 파편에 선체 −12.', effect: 'buoyStrip' },
        { label: '기록을 해독한다', desc: '카드 3장 중 1장을 얻는다.', effect: 'buoyRead' },
      ],
    },
    cargo: {
      title: '표류 화물',
      text: ['봉인된 화물 컨테이너가 떠다닌다. 고철단의 표식이 긁혀 있다.', '세라: "열어 보면 알겠죠. 터지지만 않는다면."'],
      choices: [
        { label: '열어 본다', desc: '무기가 들어 있을 수도, 부비트랩일 수도 있다.', effect: 'cargoOpen' },
        { label: '덱 정리에 쓴다', desc: '쓸모없는 카드 1장을 버리고 그 자리를 비운다.', effect: 'cargoTrash' },
      ],
    },
  },
};

// ── 1장 적 함선 ──  (교리 · 선호 거리는 화면에 공개 → 읽을 단서)
Object.assign(DATA.ships, {
  scav: {
    name: '고철단 초계정', hull: 68, reactor: 4, cooling: 10, prefer: 300,
    doctrine: '돌격', doctrineDesc: '산탄 거리(300km 이내)로 파고든다',
    deck: ['scatter', 'scatter', 'scatter', 'ram', 'laser', 'shield', 'shield', 'burn', 'burn', 'inertia'],
  },
  raider: {
    name: '고철단 약탈선', hull: 96, reactor: 5, cooling: 10, prefer: 450, elite: true,
    doctrine: '강습', doctrineDesc: '어뢰로 몰아넣고 산탄으로 끝낸다',
    deck: ['scatter', 'scatter', 'heavyShield', 'shield', 'burn', 'burn', 'laser', 'boarding', 'boarding',
      'ram', 'ram', 'particleCutter', 'regenShield'],
  },
  junkKing: {
    name: '「고철왕」 누더기 중구축함', hull: 84, reactor: 5, cooling: 10, prefer: 200, flagship: true,
    doctrine: '돌격', doctrineDesc: '무조건 붙는다. 0km에서 군대를 보내 올라탄다 (보호막 무시)',
    deck: ['scatter', 'scatter', 'laser', 'boarding', 'boarding', 'boarding', 'ram', 'ram', 'heavyShield',
      'heavyShield', 'shield', 'burn', 'burn', 'inertia', 'ventPurge'],
  },
});

// ── 2장 적 함선 ──  연합 함대 잔존함 (나침반을 반역자로 의심)
Object.assign(DATA.ships, {
  allyPatrol: {
    name: '연합 초계함', hull: 100, reactor: 5, cooling: 10, prefer: 1000,
    doctrine: '균형', doctrineDesc: '레이저와 레일건을 고루 쓴다. 1,000km 안팎을 지킨다',
    deck: ['laser', 'laser', 'laser', 'railgun', 'railgun', 'torpedo', 'orbitShot', 'shield',
      'regenShield', 'heavyShield', 'pointDefense', 'retro', 'coolCatalyst'],
  },
  torpBoat: {
    name: '연합 어뢰정', hull: 76, reactor: 5, cooling: 10, prefer: 800, preferJitter: 400,
    doctrine: '기동', doctrineDesc: '어뢰를 쏘고 거리를 계속 바꾼다. 선호 거리가 매 턴 흔들린다',
    deck: ['torpedo', 'torpedo', 'torpedo', 'guidedMissile', 'guidedMissile', 'laser', 'pointDefense',
      'shield', 'evasive', 'burn', 'retro', 'inertia', 'draw'],
  },
  allyAssault: {
    name: '연합 강습함 「방패」', hull: 96, reactor: 5, cooling: 10, prefer: 900, elite: true,
    doctrine: '방어', doctrineDesc: '두꺼운 보호막 뒤에서 레이저로 버틴다',
    deck: ['heavyShield', 'heavyShield', 'regenShield', 'shield', 'pointDefense', 'fallback', 'laser',
      'laser', 'railgun', 'torpedo', 'torpedo', 'timeDelay', 'coolCatalyst'],
  },
  resolute: {
    name: '순양함 「단호」', hull: 120, reactor: 5, cooling: 10, prefer: 1500, flagship: true,
    doctrine: '저격', doctrineDesc: '멀리서 레일건으로 쏜다. 품으로 파고들어라',
    deck: ['railgun', 'railgun', 'phaseLaser', 'phaseLaser', 'solarLance', 'laser', 'shield', 'retro',
      'retro', 'ventPurge', 'inertia', 'inertia', 'evasive', 'regenShield', 'regenShield'],
  },
});

// ─────────────────────────────────────────────
//  끝없는 항해 (로그라이트)  — 난이도는 여기 숫자로 조절
//  깊이 = 지금까지 점프한 수 (1부터). 구역마다 점프 4번 + 보스
// ─────────────────────────────────────────────
DATA.endless = {
  jumpsPerSector: 4,                 // 구역마다 일반 점프 수 (그다음 보스)
  // 적 위협도
  tier1: ['scav', 'torpBoat'],       // 약한 적
  tier2: ['vex', 'allyPatrol'],      // 보통 적
  elites: ['raider', 'allyAssault'], // 정예
  bosses: ['junkKing', 'resolute'],  // 보스 (구역마다 번갈아)
  // 깊이에 따라 나오는 일반 적: 깊이 ≤ tier1Until → 약한 적만, ≤ mixUntil → 섞여서, 그 뒤 → 보통 적 위주
  tier1Until: 3, mixUntil: 8,
  // 적 선체 배율 (일반 · 정예): base + perDepth × (깊이 − 1)
  hullBase: 0.55, hullPerDepth: 0.03,
  // 보스 선체 배율: base + perSector × (구역 − 1)
  bossBase: 0.75, bossPerSector: 0.15,
  // 깊이 N마다 적 덱에 강화 카드 1장씩 추가
  extraCardEvery: 5,
  extraCards: ['heavyShield', 'railgun', 'laser', 'regenShield', 'torpedo', 'scatter'],
  // 보스를 잡으면: 수리 + 카드 + 개조(희귀 포함)
  bossRepair: 50,
  // 구역 배경 (번갈아): null = 표류 구역, 'fog' = 안개 성운 (적 기동 기록 2번만)
  themes: [null, 'fog'],
  themeNames: ['표류 구역', '안개 성운'],
};
