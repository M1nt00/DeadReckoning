// 전투 규칙: 턴 시작 · 계획 비용 · 단계별 공개 · 처리 (시스템 → 선제 → 기동 → 방어 → 공격 → 열)
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
    hull: s.hull, maxHull: s.maxHull || s.hull, reactor: s.reactor, cooling: s.cooling, flagship: !!s.flagship, elite: !!s.elite, dummy: !!s.dummy,
    shield: 0, heat: 0, fuel: 0, carry: 0, overkill: 0,
    draw: shuffle((s.deck || DATA.starterDeck).slice()), hand: [], discard: [],
    locked: -1,          // 교란으로 잠긴 손패 번호
    st: {},              // 상태 (버프 · 디버프) { 교란 jam: 세기, 냉각 cool: 세기 } — 세기 = 남은 턴
    overheated: false,   // 이번 턴 과열 위험(열 80↑)으로 최대 연료 −1
    skip: false,         // 멜트다운: 이번 턴은 기본 엔진(이동)만
    plan: null,          // { items: [{ id, steps }], cool }
    lastMove: 0,         // 지난 턴 이동 (AI가 참고)
    odCooldown: 0,       // 오버드라이브 충전까지 남은 턴 (0 = 준비됨)
    charges: [],         // 초고열 응집 충전 { left, dmg, heat, fuel, enemyHeat }
    regen: 0,            // 이번 턴 방어 단계에 더해질 재생 보호막
    dmgReduce: 0,        // 이번 턴 받는 피해 감소 (물러나기)
    pd: false,           // 이번 턴 점방어 가동
  };
}

// ── 상태 (버프 · 디버프) — 종류는 data/rules.js의 DATA.status ──
function statusOf(s, key) { return s.st[key] || 0; }
function addStatus(s, key, n) { s.st[key] = statusOf(s, key) + n; }

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
function itemMove(it, s) {
  const c = DATA.cards[it.id];
  if (c.inertia) return s ? Math.sign(s.lastMove) * c.inertia : 0;   // 관성 항행: 지난 턴에 움직인 방향으로
  return c.variable ? it.steps : c.move || 0;
}

// 계획 요약: 비용 · 오버드라이브 · 예상 열
// plan = { items, cool, engine: 기본 엔진 칸 수(+전진/−후진), od: 오버드라이브 켬 }
function planSummary(s, plan) {
  const eng = plan.engine || 0;
  const od = !!plan.od;
  const cost = plan.items.reduce((t, it) => t + itemCost(it), 0) + Math.abs(eng);
  const cap = s.fuel + (od ? R().overdriveFuel : 0);
  // 오버드라이브 연료는 카드 · 기본 엔진에만 → 그쪽에 먼저 씀. 원래 연료는 남겨서 냉각 · 이월에
  const short = Math.min(cost, od ? R().overdriveFuel : 0);   // 오버드라이브 연료로 낸 비용
  const left = Math.max(0, s.fuel - (cost - short));          // 남은 원래 연료 (냉각 · 이월)
  const cool = Math.min(plan.cool, left);
  const heatIn = plan.items.reduce((t, it) => t + itemHeat(it), 0) + Math.abs(eng) * R().engineHeatPerStep + (od ? R().overdriveHeat : 0);
  // 시스템 카드 (공개 때 가장 먼저): 강제 배기 = 곧바로 열 − · 냉각 촉매 = 이번 턴부터
  const sys = plan.items.map((it) => DATA.cards[it.id]).filter((c) => c.type === 'system');
  const heatNow = sys.reduce((t, c) => t + (c.heatNow || 0), 0);
  const coolOn = statusOf(s, 'cool') > 0 || sys.some((c) => c.selfStatus && c.selfStatus.cool);
  const coolAmt = coolOn ? DATA.status.cool.amount : 0;
  // 멜트다운 턴: 얼마나 움직였든 턴이 끝나면 열 40
  const heatAfter = s.skip ? R().meltdownResetHeat
    : Math.max(0, Math.max(0, s.heat + heatNow) + heatIn - s.cooling - cool * R().coolPerFuel - coolAmt);
  const move = plan.items.reduce((t, it) => t + itemMove(it, s), 0) + eng;
  const ok = cost <= cap && (!od || s.odCooldown === 0) && Math.abs(eng) <= R().engineMaxSteps;
  return { cost, cap, short, left, cool, heatIn, heatAfter, move, od, ok };
}

// ── 턴 ───────────────────────────────────────
function startTurn(B) {
  B.turn++;
  B.fields = (B.fields || []).filter((f) => B.turn <= f.born + f.turns);   // 유지 턴이 끝난 전장은 사라짐
  for (const s of [B.player, B.enemy]) {
    s.discard.push(...s.hand);
    s.hand = [];
    drawCards(s, R().handSize);
    s.fuel = s.reactor + s.carry;
    s.carry = 0;
    s.shield = 0;
    s.overkill = 0;
    s.locked = -1;
    s.pd = false;
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
    if (statusOf(s, 'jam') > 0) { if (s.hand.length) s.locked = Math.floor(Math.random() * s.hand.length); s.st.jam--; }
    s.plan = { items: [], cool: 0, engine: 0, od: false };
  }
  B.phase = 'plan';
  B.log.push({ t: 'turn', text: `— 턴 ${B.turn} · 거리 ${B.distance}km —` });
}

function newBattle(enemyKey, playerCfg) {
  const B = {
    turn: 0, distance: R().startDistance, phase: 'plan', log: [], torpedoes: [], winner: null, events: [],
    // 위치 (km): 나는 xP에서 오른쪽(적 쪽)이 전진, 적은 xE에서 왼쪽이 전진. 거리 = xE − xP (서로 지나칠 수 없음)
    xP: 0, xE: R().startDistance,
    fields: [],          // 깔린 전장 { owner, side, id, name, lo, hi, dmg, born } — 1인당 하나, born 다음 턴부터 적용
    player: makeShip('player', 'player', playerCfg), enemy: makeShip(enemyKey, 'enemy'),
  };
  startTurn(B);
  return B;
}

// 전장 구역: 깐 배에서 적 쪽으로 at×100km 떨어진 곳부터 폭 width×100km (깔린 뒤엔 그 자리에 고정)
function fieldZone(B, s, it) {
  const c = DATA.cards[it.id], st = R().step;
  const x0 = s === B.player ? B.xP : B.xE, dir = s === B.player ? 1 : -1;
  const a = x0 + dir * (it.at || 0) * st, b = a + dir * c.zone.width * st;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}
// 함선 몸체 (km): 위치 = 뱃머리, 몸체는 뱃머리에서 뒤로 shipLength. 나는 뒤 = 왼쪽, 적은 뒤 = 오른쪽
function shipBody(side, x) { const L = R().shipLength; return side === 'player' ? [x - L, x] : [x, x + L]; }
// 이 함선 몸체에 걸친 전장 (적용 중인 것만). 조금이라도 걸치면 (경계 포함) 안으로 침
const fieldActive = (B, f) => f.born < B.turn && B.turn <= f.born + f.turns;
function fieldsOn(B, side, x) {
  const [a, b] = shipBody(side, x);
  return B.fields.filter((f) => fieldActive(B, f) && f.hi >= a && f.lo <= b);
}
// 구역 위치 글: 깐 배 기준 (+ = 적 쪽 앞, − = 뒤)
function zoneLabel(it, ship = '내 배') {
  const w = DATA.cards[it.id].zone.width, a = (it.at || 0) * 100, b = a + w * 100, km = (v) => v.toLocaleString() + 'km';
  if (a >= 0) return `${ship}에서 ${a.toLocaleString()}~${km(b)}`;
  if (b <= 0) return `${ship} 뒤쪽 ${Math.abs(b).toLocaleString()}~${km(Math.abs(a))}`;
  return `${ship} 뒤 ${km(-a)} ~ 앞 ${km(b)}`;
}

// 지원 카드: 계획 중에 바로 사용 (연료 · 열 즉시). 상대에게 보이지 않음. 성공하면 true
function useSupport(B, s, handIdx) {
  const id = s.hand[handIdx], c = DATA.cards[id];
  if (!c || c.type !== 'support' || s.skip || handIdx === s.locked || s.fuel < c.cost) return false;
  s.fuel -= c.cost;
  s.heat = Math.max(0, s.heat + (c.heat || 0));
  s.hand.splice(handIdx, 1);
  s.discard.push(id);
  // 뒤에 있던 손패 번호 당기기
  if (s.plan) for (const it of s.plan.items) if (it.hand > handIdx) it.hand--;
  if (s.locked > handIdx) s.locked--;
  if (c.draw) drawCards(s, c.draw);
  if (s.side === 'player') B.log.push({ t: 'def', text: `나 ${c.name} 사용 (상대에게 안 보임)` });
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

// 무기 피해: 거리 표 × 오버드라이브 보너스
//   targetMove = 상대가 이번 턴 움직인 칸 수 (추적 무기: 궤도 예측 사격 · 유도 미사일). 모르면 undefined → 가만히 있다고 봄
function weaponDmg(card, d, overdrive, targetMove) {
  let base = dmgAt(card, d);
  const m = Math.abs(targetMove || 0);
  if (card.trackMove && m >= card.trackMove.min) base = card.trackMove.dmg;
  if (card.evadedBy && m >= card.evadedBy) base = 0;
  return overdrive ? Math.round(base * (1 + R().overdriveBonus)) : base;
}

// 거리 효율: 이 거리에서의 피해 ÷ 그 무기의 최대 피해 (예측 판정 표시용)
function efficiency(card, d) {
  if (!card.dmg) return 1;
  const max = Math.max(...card.dmg.map((x) => x[1]));
  return max ? dmgAt(card, d) / max : 0;
}

// ── 처리: 단계별 공개 · 처리 (화면이 한 단계씩 공개하고 보여줌) ──
// 순서: 특수능력 → 전장 → 시스템 → 선제 → 기동 → 방어 → 공격 → 열   (기획서 v0.8 15번. 특수능력 = 지금은 오버드라이브)
// 각 단계: reveal(s) = 그 단계에 공개할 계획 항목 (양쪽 다 없으면 공개 생략), run() = 처리
const isPre = (c) => !!c.preempt && (c.type === 'weapon' || c.type === 'defense');   // 선제: 무기 · 방어에만

function resolveSteps(B) {
  const P = B.player, E = B.enemy;
  const ships = [P, E];
  const other = (s) => (s === P ? E : P);
  // 멜트다운 턴: 기본 엔진(이동)만
  const plans = new Map(ships.map((s) => [s, s.skip ? { items: [], cool: 0, engine: s.plan.engine || 0, od: false } : s.plan]));
  const sums = new Map(ships.map((s) => [s, planSummary(s, plans.get(s))]));
  const itemsOf = (s, f) => plans.get(s).items.filter((it) => f(DATA.cards[it.id]));
  const cardsOf = (s, f) => itemsOf(s, f).map((it) => DATA.cards[it.id]);
  const side = (s) => s.side;
  const who = (s) => (s === P ? '나' : '적');
  // 연출용 이벤트: 각 단계가 끝나면 화면이 이것을 보고 애니메이션을 그림
  const ev = (e) => B.events.push(e);

  // 전투 끝: 선체가 0이 되면 그 단계에서 끝 (같은 순간 둘 다 0이면 무승부)
  const over = () => {
    // 시험장 무적: 선체가 0이 돼도 1로 버팀
    for (const s of ships) if (s.god && s.hull <= 0) { s.hull = 1; s.overkill = 0; B.log.push({ t: 'info', text: `${who(s)} 무적 (시험장) — 선체 1로 버팀` }); }
    if (P.hull > 0 && E.hull > 0) return false;
    if (P.hull <= 0 && E.hull <= 0) { B.winner = 'draw'; B.log.push({ t: 'info', text: '동시 격침 — 둘 다 가라앉았다' }); }
    else { B.winner = P.hull <= 0 ? 'enemy' : 'player'; B.log.push({ t: 'info', text: `${B.winner === 'player' ? '적함' : '나침반'} 격침 — 전투 끝` }); }
    B.phase = 'over';
    return true;
  };

  // 방어 카드 켜기 (선제 단계 · 방어 단계 공통). 보호막은 더해짐 (턴 끝까지 유지)
  const defend = (s, cards, withRegen) => {
    const mult = s.heat >= R().warnHeat ? R().warnShieldMult : 1;
    const add = Math.round((cards.reduce((t, c) => t + (c.shield || 0), 0) + (withRegen ? s.regen || 0 : 0)) * mult);
    s.shield += add;
    // 회피 기동: 이번 턴 내가 움직였으면
    const moved = s.lastMove !== 0;
    for (const c of cards) if (c.evadeIfMoved) B.log.push({ t: 'def', text: `${who(s)} ${c.name} ${moved ? '성공' : '실패 — 움직이지 않음'}` });
    const red = Math.max(0, ...cards.map((c) => Math.max(c.dmgReduce || 0, c.evadeIfMoved && moved ? c.evadeIfMoved : 0)));
    if (red > s.dmgReduce) {
      s.dmgReduce = red;
      ev({ kind: 'evade', who: side(s), pct: Math.round(red * 100) });
      B.log.push({ t: 'def', text: `${who(s)} 물러나기 — 받는 피해 −${Math.round(red * 100)}%` });
    }
    const pd = cards.some((c) => c.pointDefense);
    if (pd) { s.pd = true; B.log.push({ t: 'def', text: `${who(s)} 점방어 가동` }); }
    if (add || pd) ev({ kind: 'shield', who: side(s), amount: s.shield, pd: s.pd, weak: mult < 1 });
    if (add) B.log.push({ t: 'def', text: `${who(s)} 보호막 +${add}` + (mult < 1 ? ' (과열 경고로 약화)' : '') });
  };

  // 무기 한 발 (선제 단계 · 공격 단계 공통). d = 명중 판정 거리
  const fire = (s, it, d) => () => {
    const c = DATA.cards[it.id];
    if (c.charge) {
      s.charges.push({ left: c.charge.turns, dmg: c.charge.dmg, heat: c.charge.heat, fuel: c.charge.fuel, enemyHeat: c.charge.enemyHeat || 0 });
      B.log.push({ t: 'info', text: `${who(s)} ${c.name} 시작 — ${c.charge.turns}턴 뒤 ${c.charge.dmg}` });
      ev({ kind: 'chargeStart', from: side(s), turns: c.charge.turns });
      return;
    }
    if (c.torpedo) {
      B.torpedoes.push({ owner: s, overdrive: sums.get(s).od });
      B.log.push({ t: 'info', text: `${who(s)} 어뢰 발사 — 다음 턴 도착` });
      ev({ kind: 'torpLaunch', from: side(s) });
      return;
    }
    const tm = isPre(c) ? 0 : other(s).lastMove;            // 상대가 이번 턴 움직인 만큼 (선제는 아직 안 움직임)
    const dmg = weaponDmg(c, d, sums.get(s).od, tm);
    const e = { kind: 'shot', from: side(s), card: it.id, dmg, eff: efficiency(c, d), shield: 0, hull: 0 };
    if (dmg) Object.assign(e, hit(B, other(s), dmg, `${isPre(c) ? '선제 ' : ''}${c.name} ${d}km`, { ignoreShield: !!c.ignoreShield }));
    else if (c.evadedBy && Math.abs(tm) >= c.evadedBy) B.log.push({ t: 'miss', text: `${s === P ? '내' : '적'} ${c.name} 빗나감 (상대가 ${Math.abs(tm) * 100}km 기동)` });
    else B.log.push({ t: 'miss', text: `${s === P ? '내' : '적'} ${c.name} 사거리 밖 (${d}km)` });
    if (c.selfDamage && dmg) e.self = hit(B, s, c.selfDamage, `${c.name} 반동`);
    if (c.inflict && dmg) {                 // 상태이상: 명중하면 (보호막과 상관없이) 세기만큼 쌓임
      for (const [k, n] of Object.entries(c.inflict)) {
        addStatus(other(s), k, n);
        B.log.push({ t: 'info', text: `${who(other(s))} ${DATA.status[k].name} ${statusOf(other(s), k)} (${DATA.status[k].desc})` });
      }
    }
    ev(e);
  };

  // '일제 사격' 단위로: (내 1발째 + 적 1발째) → (내 2발째 + 적 2발째) …
  //   같은 일제 사격 안의 두 발은 동시에 맞는다. 일제 사격이 끝날 때마다 확인:
  //   한쪽만 0 이하 → 그 순간 전투 끝 (뒤따르는 사격 없음) · 둘 다 0 이하 → 무승부 (둘 다 격침).
  const volleys = (first, f, d) => {
    const mine = itemsOf(P, f).map((it) => fire(P, it, d)), theirs = itemsOf(E, f).map((it) => fire(E, it, d));
    const list = first.length ? [first] : [];
    for (let i = 0; i < Math.max(mine.length, theirs.length); i++) list.push([mine[i], theirs[i]].filter(Boolean));
    for (const v of list) {
      for (const g of v) g();
      if (over()) return;
    }
  };

  const reveal = (f) => (s) => itemsOf(s, f);
  return [
    // ⓪ 특수능력 — 지금은 오버드라이브 (연료 +3은 계획 때, 무기 +50%는 사격 때, 열 +30은 열 단계에 반영)
    { name: '특수능력', reveal: () => [], od: (s) => sums.get(s).od, run() {
      for (const s of ships) if (sums.get(s).od) {
        ev({ kind: 'overdrive', who: side(s) });
        B.log.push({ t: 'heat', text: `${who(s)} 오버드라이브 가동 — 이번 턴 무기 피해 +${Math.round(R().overdriveBonus * 100)}%` });
      }
    } },
    // 전장 — 구역을 만듦 (다음 턴부터 적용). 1인당 하나: 새로 깔면 내 이전 전장은 사라짐
    { name: '전장', reveal: reveal((c) => c.type === 'field'), run() {
      for (const s of ships) for (const it of itemsOf(s, (c) => c.type === 'field')) {
        const c = DATA.cards[it.id], z = fieldZone(B, s, it);
        B.fields = B.fields.filter((f) => f.owner !== s);
        B.fields.push({ owner: s, side: side(s), id: it.id, name: c.name, lo: z.lo, hi: z.hi, dmg: c.zone.dmg, turns: c.zone.turns || 99, born: B.turn });
        ev({ kind: 'field', who: side(s), name: c.name, lo: z.lo, hi: z.hi });
        B.log.push({ t: 'info', text: `${who(s)} ${c.name} 전개 — ${zoneLabel(it, s === P ? '내 배' : '적 배')} · 다음 턴부터 ${c.zone.turns || ''}턴` });
      }
    } },
    // ① 시스템 — 가장 먼저 처리되어 이번 턴의 규칙을 바꿈
    { name: '시스템', reveal: reveal((c) => c.type === 'system'), run() {
      for (const s of ships) for (const c of cardsOf(s, (c) => c.type === 'system')) {
        if (c.heatNow) s.heat = Math.max(0, s.heat + c.heatNow);
        if (c.selfStatus) for (const [k, n] of Object.entries(c.selfStatus)) addStatus(s, k, n);
        ev({ kind: 'system', who: side(s), name: c.name });
        B.log.push({ t: 'def', text: `${who(s)} ${c.name} 발동` });
      }
      // 시간 지연: 내 버프 · 상대 디버프 연장 (걸려 있는 것만. 이번 단계에 걸린 것 포함)
      for (const s of ships) for (const c of cardsOf(s, (c) => c.extend)) {
        for (const [k, def] of Object.entries(DATA.status)) {
          if (def.kind === 'buff' && statusOf(s, k) > 0) addStatus(s, k, c.extend);
          if (def.kind === 'debuff' && statusOf(other(s), k) > 0) addStatus(other(s), k, c.extend);
        }
      }
    } },
    // ② 선제 — 기동 전에: 선제 방어 먼저, 그다음 선제 공격 (기동 전의 거리로 판정)
    { name: '선제', reveal: reveal(isPre), run() {
      for (const s of ships) { const cs = cardsOf(s, (c) => isPre(c) && c.type === 'defense'); if (cs.length) defend(s, cs, false); }
      volleys([], (c) => isPre(c) && c.type === 'weapon', B.distance);
    } },
    // ③ 기동
    { name: '기동', reveal: reveal((c) => c.type === 'move'), engine: (s) => plans.get(s).engine || 0, run() {
      const pm = sums.get(P).move, em = sums.get(E).move, st = R().step;
      const before = B.distance, xP0 = B.xP, xE0 = B.xE;
      let nP = B.xP + pm * st, nE = B.xE - em * st;
      if (nE < nP) { const m = Math.round((nP + nE) / 2 / st) * st; nP = nE = m; }            // 서로 지나칠 수 없음: 만난 자리에서 멈춤
      if (nE - nP > R().maxDistance) {                                                    // 최대 거리
        const c = Math.round((nP + nE) / 2 / st) * st;
        nP = c - R().maxDistance / 2; nE = c + R().maxDistance / 2;
      }
      B.xP = nP; B.xE = nE; B.distance = nE - nP;
      P.lastMove = pm; E.lastMove = em;
      for (const [s, m] of [[P, pm], [E, em]]) { s.moveHist.push(m); if (s.moveHist.length > 4) s.moveHist.shift(); }
      ev({ kind: 'move', pm, em, before, after: B.distance, xP0, xE0, xP: B.xP, xE: B.xE });
      const desc = (m) => (m > 0 ? `${m * 100}km 전진` : m < 0 ? `${-m * 100}km 후진` : '정지');
      B.log.push({ t: 'move', text: `기동: 나 ${desc(pm)} · 적 ${desc(em)} → ${before}km → ${B.distance}km` });
      // 전장: 기동을 마친 위치가 구역 안이면 피해 (지나가기만 하면 영향 없음 · 적용 중인 구역만)
      for (const s of ships) for (const f of fieldsOn(B, side(s), s === P ? B.xP : B.xE)) {
        ev(Object.assign({ kind: 'fieldHit', who: side(s), name: f.name, dmg: f.dmg }, hit(B, s, f.dmg, `${f.name} (${f.side === 'player' ? '내' : '적'} 전장)`)));
      }
      over();
    } },
    // ④ 방어
    { name: '방어', reveal: reveal((c) => c.type === 'defense' && !isPre(c)), run() {
      for (const s of ships) {
        defend(s, cardsOf(s, (c) => c.type === 'defense' && !isPre(c)), true);
        s.regen = cardsOf(s, (c) => c.type === 'defense').reduce((t, c) => t + (c.shieldNext || 0), 0);   // 다음 턴 재생분
      }
    } },
    // ⑤ 공격 — 도착하는 어뢰 · 충전 끝난 초고열 응집(일제 사격 0) → 무기
    { name: '공격', reveal: reveal((c) => c.type === 'weapon' && !isPre(c)), run() {
      const d = B.distance;
      const arriving = B.torpedoes;
      B.torpedoes = [];
      const acts = [];
      for (const s of ships) {
        for (const ch of s.charges) {
          ch.left--;
          if (ch.left > 0) continue;
          acts.push(() => {
            ev(Object.assign({ kind: 'shot', from: side(s), card: 'solarLance', dmg: ch.dmg, eff: 1, shield: 0, hull: 0 }, hit(B, other(s), ch.dmg, '초고열 응집')));
            if (ch.enemyHeat) {
              other(s).heat += ch.enemyHeat;
              B.log.push({ t: 'heat', text: `${who(other(s))} 열 +${ch.enemyHeat} (초고열 응집)` });
            }
          });
        }
        s.charges = s.charges.filter((ch) => ch.left > 0);
      }
      for (const t of arriving) {
        acts.push(() => {
          const target = other(t.owner);
          if (target.pd) {
            B.log.push({ t: 'def', text: `어뢰 격추 (${who(target)}의 점방어)` });
            ev({ kind: 'torpArrive', from: side(t.owner), intercepted: true });
            return;
          }
          const dmg = weaponDmg(DATA.cards.torpedo, d, t.overdrive);
          const eff = efficiency(DATA.cards.torpedo, d);
          if (dmg) ev(Object.assign({ kind: 'torpArrive', from: side(t.owner), dmg, eff }, hit(B, target, dmg, `어뢰 도착 ${d}km`)));
          else { B.log.push({ t: 'miss', text: `어뢰 빗나감 (${d}km — 500~900km 밖)` }); ev({ kind: 'torpArrive', from: side(t.owner), dmg: 0, eff: 0 }); }
        });
      }
      volleys(acts, (c) => c.type === 'weapon' && !isPre(c), d);
    } },
    // ⑥ 냉각 · 과열
    { name: '열', run() {
      for (const s of ships) {
        const sum = sums.get(s);
        const meltTurn = s.skip;                // 이번 턴이 멜트다운 턴이었나
        s.heat = Math.max(0, s.heat + sum.heatIn - s.cooling - sum.cool * R().coolPerFuel);
        s.carry = Math.min(R().carryMax, sum.left - sum.cool);
        if (statusOf(s, 'cool') > 0) { s.heat = Math.max(0, s.heat - DATA.status.cool.amount); s.st.cool--; }   // 냉각 (버프)
        ev({ kind: 'heat', who: side(s), heat: s.heat, overdrive: sum.od });
        if (sum.od) {
          s.odCooldown = R().overdriveCooldown + 1;   // 다음 턴 시작에 1 줄어 4턴 충전
          B.log.push({ t: 'heat', text: `${who(s)} 오버드라이브! 열 +${R().overdriveHeat} · ${R().overdriveCooldown}턴 충전` });
        }
        s.skip = false;
        if (meltTurn) s.heat = R().meltdownResetHeat;   // 멜트다운 턴: 얼마나 움직였든 열 40
        else if (s.heat >= R().meltdownHeat) {
          s.overkill += Math.max(0, R().meltdownDamage - s.hull);
          s.hull = Math.max(0, s.hull - R().meltdownDamage);
          s.heat = R().meltdownResetHeat;
          s.skip = true;
          ev({ kind: 'meltdown', who: side(s) });
          B.log.push({ t: 'hurt', text: `${who(s)} 멜트다운! 선체 −${R().meltdownDamage}, 다음 턴은 기본 엔진(이동)만` });
        }
      }
      over();
    } },
  ];
}
