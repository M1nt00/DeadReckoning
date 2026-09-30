// 전투 규칙: 턴 시작 · 계획 비용 · 동시 공개 후 처리 (① 기동 → ② 방어 → ③ 공격 → ④ 열)
'use strict';

const R = () => DATA.rules;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 거리별 피해 표에서 피해 찾기
function dmgAt(card, d) {
  if (!card.dmg) return 0;
  for (const [max, v] of card.dmg) if (d <= max) return v;
  return 0;
}

// ── 함선 ─────────────────────────────────────
// cfg: 항해 중인 내 함선처럼 기본값을 덮어쓸 때 { hull, maxHull, reactor, cooling, deck }
function makeShip(key, side, cfg) {
  const s = Object.assign({}, DATA.ships[key], cfg || {});
  return {
    key, side, name: s.name, prefer: s.prefer || 1000, doctrine: s.doctrine, doctrineDesc: s.doctrineDesc,
    preferBase: s.prefer || 1000, preferJitter: s.preferJitter || 0,   // 흔들림 폭 (0이면 고정)
    moveHist: [],        // 최근 기동 (화면에 공개)
    hull: s.hull, maxHull: s.maxHull || s.hull, reactor: s.reactor, cooling: s.cooling, flagship: !!s.flagship, elite: !!s.elite,
    shield: 0, heat: 0, fuel: 0, carry: 0, overkill: 0,
    draw: shuffle((s.deck || DATA.starterDeck).slice()), hand: [], discard: [],
    locked: -1,          // 교란으로 잠긴 손패 번호
    jam: 0,              // 교란 세기 (= 남은 턴). 턴 시작마다 손패 1장 잠그고 1 줄어듦
    overheated: false,   // 이번 턴 과열 위험(열 80↑)으로 최대 연료 −1
    skip: false,         // 멜트다운: 이번 턴은 기본 엔진(이동)만
    plan: null,          // { items: [{ id, steps }], cool }
    lastMove: 0,         // 지난 턴 이동 (AI가 참고)
    odCooldown: 0,       // 오버드라이브 충전까지 남은 턴 (0 = 준비됨)
    charges: [],         // 초고열 응집 충전 { left, dmg, heat, fuel, enemyHeat }
    regen: 0,            // 이번 턴 방어 단계에 더해질 재생 보호막
    coolTurns: 0, coolAmt: 0,   // 냉각 상태 (냉각 촉매)
    dmgReduce: 0,        // 이번 턴 받는 피해 감소 (물러나기)
    usedSystem: [],      // 이번 턴 쓴 시스템 카드 (동시 공개 때 먼저 보여줌)
  };
}

function drawCards(s, n) {
  for (let i = 0; i < n; i++) {
    if (!s.draw.length) { s.draw = shuffle(s.discard); s.discard = []; }
    if (!s.draw.length) break;
    s.hand.push(s.draw.pop());
  }
}

// ── 계획 ─────────────────────────────────────
// 계획 항목: { hand: 손패 번호, id: 카드, steps: 기동 칸 수(+전진/−후진) }
function itemCost(it) {
  const c = DATA.cards[it.id];
  return c.variable ? Math.abs(it.steps) : c.cost;
}
function itemHeat(it) {
  const c = DATA.cards[it.id];
  return c.variable ? Math.abs(it.steps) * c.heatPerStep : c.heat;
}
function itemMove(it) {
  const c = DATA.cards[it.id];
  return c.variable ? it.steps : c.move || 0;
}

// 계획 요약: 비용 · 오버드라이브 · 예상 열
// plan = { items, cool, engine: 기본 엔진 칸 수(+전진/−후진), od: 오버드라이브 켬 }
function planSummary(s, plan) {
  const eng = plan.engine || 0;
  const od = !!plan.od;
  const cost = plan.items.reduce((t, it) => t + itemCost(it), 0) + Math.abs(eng);
  const cap = s.fuel + (od ? R().overdriveFuel : 0);
  const short = Math.max(0, cost - s.fuel);          // 오버드라이브로 끌어 쓴 연료
  const left = Math.max(0, s.fuel - cost);           // 남은 연료 (냉각 · 이월)
  const cool = Math.min(plan.cool, left);
  const heatIn = plan.items.reduce((t, it) => t + itemHeat(it), 0) + Math.abs(eng) * R().engineHeatPerStep + (od ? R().overdriveHeat : 0);
  // 멜트다운 턴: 얼마나 움직였든 턴이 끝나면 열 40
  const heatAfter = s.skip ? R().meltdownResetHeat
    : Math.max(0, s.heat + heatIn - s.cooling - cool * R().coolPerFuel - (s.coolTurns > 0 ? s.coolAmt : 0));
  const move = plan.items.reduce((t, it) => t + itemMove(it), 0) + eng;
  const ok = cost <= cap && (!od || s.odCooldown === 0) && Math.abs(eng) <= R().engineMaxSteps;
  return { cost, cap, short, left, cool, heatIn, heatAfter, move, od, ok };
}

// ── 턴 ───────────────────────────────────────
function startTurn(B) {
  B.turn++;
  for (const s of [B.player, B.enemy]) {
    s.discard.push(...s.hand);
    s.hand = [];
    drawCards(s, R().handSize);
    s.fuel = s.reactor + s.carry;
    s.carry = 0;
    s.shield = 0;
    s.overkill = 0;
    s.locked = -1;
    s.usedSystem = [];
    s.dmgReduce = 0;
    // 초고열 응집 충전 중: 매 턴 최대 연료 −1 · 열 +5
    for (const ch of s.charges) { s.fuel -= ch.fuel; s.heat += ch.heat; }
    // 과열 위험 (열 80↑): 최대 연료 −1
    s.overheated = s.heat >= R().dangerHeat && !s.skip;
    if (s.overheated) s.fuel -= R().dangerFuel;
    s.fuel = Math.max(0, s.fuel);
    s.odCooldown = Math.max(0, s.odCooldown - 1);
    if (s.preferJitter) s.prefer = clamp(s.preferBase + Math.round((Math.random() * 2 - 1) * s.preferJitter / 100) * 100, 200, 1800);
    // 교란: 손패 1장 잠김, 세기 1 감소
    if (s.jam > 0) { if (s.hand.length) s.locked = Math.floor(Math.random() * s.hand.length); s.jam--; }
    s.plan = { items: [], cool: 0, engine: 0, od: false };
  }
  B.phase = 'plan';
  B.log.push({ t: 'turn', text: `— 턴 ${B.turn} · 거리 ${B.distance}km —` });
}

function newBattle(enemyKey, playerCfg) {
  const B = {
    turn: 0, distance: R().startDistance, phase: 'plan', log: [], torpedoes: [], winner: null, events: [],
    player: makeShip('player', 'player', playerCfg), enemy: makeShip(enemyKey, 'enemy'),
  };
  startTurn(B);
  return B;
}

// 시스템 카드 즉시 사용 (계획 중). 성공하면 true
function useSystem(B, s, handIdx) {
  const id = s.hand[handIdx], c = DATA.cards[id];
  if (!c || c.type !== 'system' || s.skip || handIdx === s.locked || s.fuel < c.cost) return false;
  s.fuel -= c.cost;
  s.heat = Math.max(0, s.heat + (c.heat || 0) + (c.heatNow || 0));
  if (c.coolStatus) { s.coolTurns = c.coolStatus.turns; s.coolAmt = c.coolStatus.amount; }
  s.hand.splice(handIdx, 1);
  s.discard.push(id);
  // 뒤에 있던 손패 번호 당기기
  if (s.plan) for (const it of s.plan.items) if (it.hand > handIdx) it.hand--;
  if (s.locked > handIdx) s.locked--;
  s.usedSystem.push(id);
  B.log.push({ t: 'def', text: `${s.side === 'player' ? '나' : '적'} ${c.name} 발동` });
  return true;
}

// 피해 주기: 피해 감소(물러나기) 먼저 → 보호막. opt.ignoreShield: 관통 피해 (보호막 무시, 피해 감소는 적용)
function hit(B, target, amount, src, opt = {}) {
  if (amount <= 0) return 0;
  if (target.dmgReduce) amount = Math.max(0, Math.round(amount * (1 - target.dmgReduce)));   // 물러나기
  if (amount <= 0) { B.log.push({ t: 'def', text: `${src} → 회피 (피해 0)` }); return { shield: 0, hull: 0 }; }
  const onShield = opt.ignoreShield ? 0 : Math.min(target.shield, amount);
  target.shield -= onShield;
  const toHull = amount - onShield;
  target.overkill += Math.max(0, toHull - target.hull);   // 0 아래로 뚫린 만큼 (무승부 판정용)
  target.hull = Math.max(0, target.hull - toHull);
  B.log.push({ t: target.side === 'enemy' ? 'hit' : 'hurt', text: `${src} → ${target.side === 'enemy' ? '적' : '나'} ${amount}` + (onShield ? ` (보호막 ${onShield})` : '') });
  return { shield: onShield, hull: toHull };
}

// 무기 피해: 거리 표 × 오버드라이브 보너스 (연료가 모자라 무리한 턴엔 +30%)
function weaponDmg(card, d, overdrive) {
  const base = dmgAt(card, d);
  return overdrive ? Math.round(base * (1 + R().overdriveBonus)) : base;
}

// 거리 효율: 이 거리에서의 피해 ÷ 그 무기의 최대 피해 (예측 판정 표시용)
function efficiency(card, d) {
  if (!card.dmg) return 1;
  const max = Math.max(...card.dmg.map((x) => x[1]));
  return max ? dmgAt(card, d) / max : 0;
}

// ── 처리: 단계별로 나눠서 (화면이 한 단계씩 보여줌) ──
function resolveSteps(B) {
  const P = B.player, E = B.enemy;
  const ships = [P, E];
  const other = (s) => (s === P ? E : P);
  // 멜트다운 턴: 기본 엔진(이동)만
  const plans = new Map(ships.map((s) => [s, s.skip ? { items: [], cool: 0, engine: s.plan.engine || 0, od: false } : s.plan]));
  const sums = new Map(ships.map((s) => [s, planSummary(s, plans.get(s))]));
  const cardsOf = (s) => plans.get(s).items.map((it) => DATA.cards[it.id]);
  const side = (s) => s.side;
  // 연출용 이벤트: 각 단계가 끝나면 화면이 이것을 보고 애니메이션을 그림
  const ev = (e) => B.events.push(e);

  return [
    // ① 기동
    { name: '기동', run() {
      const pm = sums.get(P).move, em = sums.get(E).move;
      const before = B.distance;
      B.distance = clamp(B.distance - (pm + em) * R().step, 0, R().maxDistance);
      P.lastMove = pm; E.lastMove = em;
      for (const [s, m] of [[P, pm], [E, em]]) { s.moveHist.push(m); if (s.moveHist.length > 4) s.moveHist.shift(); }
      ev({ kind: 'move', pm, em, before, after: B.distance });
      const desc = (m) => (m > 0 ? `${m * 100}km 전진` : m < 0 ? `${-m * 100}km 후진` : '정지');
      B.log.push({ t: 'move', text: `이동: 나 ${desc(pm)} · 적 ${desc(em)} → ${before}km → ${B.distance}km` });
    } },
    // ② 방어
    { name: '방어', run() {
      for (const s of ships) {
        const mult = s.heat >= R().warnHeat ? R().warnShieldMult : 1;
        s.shield = Math.round((cardsOf(s).reduce((t, c) => t + (c.shield || 0), 0) + (s.regen || 0)) * mult);
        s.regen = cardsOf(s).reduce((t, c) => t + (c.shieldNext || 0), 0);        // 다음 턴 재생분
        s.dmgReduce = Math.max(0, ...cardsOf(s).map((c) => c.dmgReduce || 0));
        if (s.dmgReduce) { ev({ kind: 'evade', who: side(s), pct: Math.round(s.dmgReduce * 100) }); B.log.push({ t: 'def', text: `${s === P ? '나' : '적'} 물러나기 — 받는 피해 −${Math.round(s.dmgReduce * 100)}%` }); }
        s.pd = cardsOf(s).some((c) => c.pointDefense);
        if (s.shield || s.pd) ev({ kind: 'shield', who: side(s), amount: s.shield, pd: s.pd, weak: mult < 1 });
        if (s.shield) B.log.push({ t: 'def', text: `${s === P ? '나' : '적'} 보호막 ${s.shield}` + (mult < 1 ? ' (과열 경고로 약화)' : '') });
        if (s.pd) B.log.push({ t: 'def', text: `${s === P ? '나' : '적'} 점방어 가동` });
      }
    } },
    // ③ 공격 — '일제 사격' 단위로: 도착하는 어뢰(양쪽 동시) → (내 1발째 + 적 1발째) → (내 2발째 + 적 2발째) …
    //   같은 일제 사격 안의 두 발은 동시에 맞는다. 일제 사격이 끝날 때마다 확인:
    //   한쪽만 0 이하 → 그 순간 전투 끝 (뒤따르는 사격 없음) · 둘 다 0 이하 → 무승부 (둘 다 격침).
    { name: '공격', run() {
      const d = B.distance;
      const arriving = B.torpedoes;
      B.torpedoes = [];
      const acts = [];
      // 초고열 응집: 충전이 끝난 것은 이번 공격 단계 맨 처음(도착 어뢰와 같은 일제 사격)에 발사
      for (const s of ships) {
        for (const ch of s.charges) {
          ch.left--;
          if (ch.left > 0) continue;
          acts.push(() => {
            ev(Object.assign({ kind: 'shot', from: side(s), card: 'solarLance', dmg: ch.dmg, eff: 1, shield: 0, hull: 0 }, hit(B, other(s), ch.dmg, '초고열 응집')));
            if (ch.enemyHeat) {
              other(s).heat += ch.enemyHeat;
              B.log.push({ t: 'heat', text: `${other(s) === P ? '나' : '적'} 열 +${ch.enemyHeat} (초고열 응집)` });
            }
          });
        }
        s.charges = s.charges.filter((ch) => ch.left > 0);
      }
      for (const t of arriving) {
        acts.push(() => {
          const target = t.owner === P ? E : P;
          if (target.pd) {
            B.log.push({ t: 'def', text: `어뢰 격추 (${target === P ? '나' : '적'}의 점방어)` });
            ev({ kind: 'torpArrive', from: side(t.owner), intercepted: true });
            return;
          }
          const dmg = weaponDmg(DATA.cards.torpedo, d, t.overdrive);
          const eff = efficiency(DATA.cards.torpedo, d);
          if (dmg) ev(Object.assign({ kind: 'torpArrive', from: side(t.owner), dmg, eff }, hit(B, target, dmg, `어뢰 도착 ${d}km`)));
          else { B.log.push({ t: 'miss', text: `어뢰 빗나감 (${d}km — 500~900km 밖)` }); ev({ kind: 'torpArrive', from: side(t.owner), dmg: 0, eff: 0 }); }
        });
      }
      const shotsOf = (s) => plans.get(s).items.filter((it) => DATA.cards[it.id].type === 'weapon').map((it) => () => {
        const c = DATA.cards[it.id];
        if (c.charge) {
          s.charges.push({ left: c.charge.turns, dmg: c.charge.dmg, heat: c.charge.heat, fuel: c.charge.fuel, enemyHeat: c.charge.enemyHeat || 0 });
          B.log.push({ t: 'info', text: `${s === P ? '나' : '적'} 초고열 응집 시작 — ${c.charge.turns}턴 뒤 ${c.charge.dmg}` });
          ev({ kind: 'chargeStart', from: side(s), turns: c.charge.turns });
          return;
        }
        if (c.torpedo) {
          B.torpedoes.push({ owner: s, overdrive: sums.get(s).od });
          B.log.push({ t: 'info', text: `${s === P ? '나' : '적'} 어뢰 발사 — 다음 턴 도착` });
          ev({ kind: 'torpLaunch', from: side(s) });
          return;
        }
        const dmg = weaponDmg(c, d, sums.get(s).od);
        const e = { kind: 'shot', from: side(s), card: it.id, dmg, eff: efficiency(c, d), shield: 0, hull: 0 };
        if (dmg) Object.assign(e, hit(B, other(s), dmg, `${c.name} ${d}km`, { ignoreShield: !!c.ignoreShield }));
        else B.log.push({ t: 'miss', text: `${s === P ? '내' : '적'} ${c.name} 사거리 밖 (${d}km)` });
        if (c.selfDamage && dmg) e.self = hit(B, s, c.selfDamage, `${c.name} 반동`);
        if (c.jam && dmg) {                     // 교란: 명중하면 세기만큼 (쌓임)
          other(s).jam += c.jam;
          B.log.push({ t: 'info', text: `${other(s) === P ? '나' : '적'} 교란 ${other(s).jam} — 다음 턴 손패 1장 잠김` });
        }
        ev(e);
      });
      const mine = shotsOf(P), theirs = shotsOf(E);
      const volleys = [acts];                                   // 일제 사격 0: 도착하는 어뢰
      for (let i = 0; i < Math.max(mine.length, theirs.length); i++) volleys.push([mine[i], theirs[i]].filter(Boolean));
      for (const v of volleys) {
        for (const f of v) f();
        if (P.hull <= 0 || E.hull <= 0) return this.finish(P.hull <= 0 && E.hull <= 0);
      }
    },
    // 전투 끝 처리
    finish(both) {
      if (both) {
        // 둘 다 격침 → 무승부
        B.winner = 'draw';
        B.log.push({ t: 'info', text: '동시 격침 — 둘 다 가라앉았다' });
      } else {
        B.winner = P.hull <= 0 ? 'enemy' : 'player';
        B.log.push({ t: 'info', text: `${B.winner === 'player' ? '적함' : '나침반'} 격침 — 전투 끝` });
      }
      B.phase = 'over';
    } },
    // ④ 냉각 · 과열
    { name: '열', run() {
      for (const s of ships) {
        const sum = sums.get(s);
        const meltTurn = s.skip;                // 이번 턴이 멜트다운 턴이었나
        s.heat = Math.max(0, s.heat + sum.heatIn - s.cooling - sum.cool * R().coolPerFuel);
        s.carry = Math.min(R().carryMax, sum.left - sum.cool);
        if (s.coolTurns > 0) { s.heat = Math.max(0, s.heat - s.coolAmt); s.coolTurns--; }   // 냉각 촉매
        ev({ kind: 'heat', who: side(s), heat: s.heat, overdrive: sum.od });
        if (sum.od) {
          s.odCooldown = R().overdriveCooldown + 1;   // 다음 턴 시작에 1 줄어 4턴 충전
          B.log.push({ t: 'heat', text: `${s === P ? '나' : '적'} 오버드라이브! 열 +${R().overdriveHeat} · ${R().overdriveCooldown}턴 충전` });
        }
        s.skip = false;
        if (meltTurn) s.heat = R().meltdownResetHeat;   // 멜트다운 턴: 얼마나 움직였든 열 40
        else if (s.heat >= R().meltdownHeat) {
          s.overkill += Math.max(0, R().meltdownDamage - s.hull);
          s.hull = Math.max(0, s.hull - R().meltdownDamage);
          s.heat = R().meltdownResetHeat;
          s.skip = true;
          ev({ kind: 'meltdown', who: side(s) });
          B.log.push({ t: 'hurt', text: `${s === P ? '나' : '적'} 멜트다운! 선체 −${R().meltdownDamage}, 다음 턴은 기본 엔진(이동)만` });
        }
      }
      if (P.hull <= 0 || E.hull <= 0) {
        if (P.hull <= 0 && E.hull <= 0) {
          // 둘 다 격침 → 무승부
          B.winner = 'draw';
          B.log.push({ t: 'info', text: '동시 격침 — 둘 다 가라앉았다' });
        } else B.winner = P.hull <= 0 ? 'enemy' : 'player';
        B.phase = 'over';
      }
    } },
  ];
}
