// 화면: 전장 위 계기판 · 거리 자 · 계획 · 손패 · 기록 · 단계별 공개 연출
'use strict';

let B = null;            // 지금 전투
let hover = null;        // 마우스를 올린 카드 id
let resolving = false;   // 공개 후 처리 중
let stepName = null;     // 지금 처리 중인 단계
const $ = (id) => document.getElementById(id);
const pct = (d) => (d / DATA.rules.maxDistance) * 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPE_NAME = { weapon: '무기', defense: '방어', move: '기동', system: '시스템' };
let skipDeal = false;   // 손패를 다시 그려도 '한 장씩 올라오기'는 생략 (시스템 카드 사용 직후)

function bandOf(d) {
  if (d === 0) return '접현';
  if (d <= 400) return '근거리';
  if (d <= 1000) return '중거리';
  return '원거리';
}

// 카드의 거리별 성능 (0 ~ 2,000km, 100km 칸 21개)
function miniBar(c) {
  if (c.type !== 'weapon' || !c.dmg) return '';
  const max = Math.max(...c.dmg.map((x) => x[1]));
  let cells = '';
  for (let d = 0; d <= DATA.rules.maxDistance; d += 100) {
    const v = dmgAt(c, d) / max;
    cells += `<i style="background:rgba(255,138,101,${v ? 0.15 + 0.85 * v : 0.06})"></i>`;
  }
  return `<div class="mini" title="거리별 피해 (0km ~ 2,000km)">${cells}</div><div class="mini labels"><span>0</span><span>1,000</span><span>2,000km</span></div>`;
}

// 카드 위 "지금 이 거리에서 몇 피해?" (오버드라이브 중이면 +30% 반영)
const fmtM = (d) => d.toLocaleString() + 'km';
function dmgNowHTML(c) {
  if (c.type !== 'weapon') return '';
  const P = B.player, sum = planSummary(P, P.plan);
  const od = sum.od;
  const now = B.distance, after = clamp(now - sum.move * 100, 0, DATA.rules.maxDistance);
  const num = (d) => { const v = weaponDmg(c, d, od); return `<b class="${v ? '' : 'zero'}${od && v ? ' od' : ''}">${v}</b>`; };
  if (c.torpedo) return `<div class="cnow">다음 턴 도착 · <span>그때 500~900km면</span> ${num(700)}</div>`;
  if (c.charge) return `<div class="cnow">${c.charge.turns}턴 뒤 <b>${c.charge.dmg}</b> <span>거리 무관</span></div>`;
  if (c.ignoreShield) return `<div class="cnow">지금 ${fmtM(now)} ${num(now)} <span>· 0km에서만 · 관통</span></div>`;
  if (after === now) return `<div class="cnow">지금 ${fmtM(now)} ${num(now)}</div>`;
  return `<div class="cnow">지금 ${fmtM(now)} ${num(now)} <span>→ 이동 후 ${fmtM(after)}</span> ${num(after)}</div>`;
}

// 계획에 넣은 무기의 예상 피해 합 (적이 가만히 있다면 · 어뢰 제외)
function expectedDmg(P) {
  const sum = planSummary(P, P.plan);
  const d = clamp(B.distance - sum.move * 100, 0, DATA.rules.maxDistance);
  let t = 0, torps = 0;
  for (const it of P.plan.items) {
    const c = DATA.cards[it.id];
    if (c.type !== 'weapon') continue;
    if (c.torpedo) torps++; else if (!c.charge) t += weaponDmg(c, isPre(c) ? B.distance : d, sum.od);   // 선제: 기동 전 거리
  }
  return { dmg: t, torps, d };
}

// ── 함선에 붙은 상태 표시 ─────────────────────
// 위: 선체 막대 (보호막은 막대 위에 덧칠 + 방패 숫자) · 아래: 열 막대 (단계 눈금) + 상태 칸 (마우스 → 설명)
const statEl = {};
function statBuild(side) {
  const top = document.createElement('div');
  top.className = `shipStat top ${side}`;
  top.innerHTML = `
    <div class="ssName"></div>
    <div class="ssRow">
      <b class="ssHp"></b>
      <div class="ssBar"><i class="trail"></i><i class="fill"></i><i class="shOver"></i><span class="ticks"></span></div>
      <span class="ssShield"></span>
    </div>`;
  const bot = document.createElement('div');
  bot.className = `shipStat bot ${side}`;
  bot.innerHTML = `
    <div class="ssHeat" data-tip=""><span class="hl">열</span><div class="hbarH"><i class="ghost"></i><i class="hf"></i><span class="mk m1"></span><span class="mk m2"></span></div><b class="heatNum"></b></div>
    <div class="ssChips"></div>
    <div class="ssAssign"></div>`;
  $('field').appendChild(top); $('field').appendChild(bot);
  statEl[side] = { top, bot, hp: null, assign: '' };
}

// 상태 칸: [아이콘 + 숫자], 마우스를 올리면 설명. kind = buff / debuff / info
function statChips(s) {
  const R = DATA.rules, out = [];
  const chip = (kind, icon, num, tip) => out.push(`<span class="sChip ${kind}" data-tip="${tip}"><i>${icon}</i>${num !== '' ? `<b>${num}</b>` : ''}</span>`);
  if (s.skip) chip('debuff', '☢', '', `멜트다운 — 이번 턴은 기본 엔진(이동)만. 턴이 끝나면 열 ${R.meltdownResetHeat}`);
  if (s.overheated) chip('debuff', '⚠', '', `과열 위험 — 이번 턴 최대 연료 −${R.dangerFuel}`);
  if (s.locked >= 0) chip('debuff', '⛓', '', '교란 — 이번 턴 손패 1장 잠김');
  if (s.jam > 0) chip('debuff', '✖', s.jam, `교란 ${s.jam} — 다음 턴 손패 1장 잠김. 턴마다 1씩 줄어듦`);
  for (const ch of s.charges) chip('info', '☀', ch.left, `초고열 응집 충전 — ${ch.left}턴 뒤 피해 ${ch.dmg}${ch.enemyHeat ? ` · 상대 열 +${ch.enemyHeat}` : ''}. 충전 중 매 턴 열 +${ch.heat} · 최대 연료 −${ch.fuel}`);
  if (s.coolTurns > 0) chip('buff', '❄', s.coolTurns, `냉각 — 매 턴 열 −${s.coolAmt} (${s.coolTurns}턴 남음)`);
  if (s.regen > 0) chip('buff', '⟳', '+' + s.regen, `재생 보호막 — 다음 방어 단계에 보호막 +${s.regen}`);
  return out.join('');
}

function heatTip(h) {
  const r = DATA.rules;
  return `열 ${h} · ${r.warnHeat}↑ 보호막 약화 · ${r.dangerHeat}↑ 다음 턴 최대 연료 −${r.dangerFuel} · ${r.meltdownHeat} 멜트다운`;
}

// 내용 (선체 · 보호막은 연출에 맞춰 바뀌는 값)
function statUpdate(side, ghostHeat) {
  if (!statEl[side]) statBuild(side);
  const E = statEl[side], s = B[side], v = Scene.ships[side], r = DATA.rules;
  const hp = v.hp !== undefined ? v.hp : s.hull, sh = v.sh !== undefined ? v.sh : s.shield;
  const q = (el, c) => el.querySelector(c);
  q(E.top, '.ssName').textContent = s.name;
  q(E.top, '.ssHp').textContent = hp;
  q(E.top, '.fill').style.width = (hp / s.maxHull) * 100 + '%';
  q(E.top, '.ticks').style.backgroundSize = `${(20 / s.maxHull) * 100}% 100%`;   // 20칸마다 눈금
  // 보호막: 선체 막대 오른쪽 끝부터 덧칠
  const shW = Math.min(hp, sh) / s.maxHull * 100;
  q(E.top, '.shOver').style.cssText = `left:${(hp / s.maxHull) * 100 - shW}%;width:${shW}%`;
  q(E.top, '.ssShield').innerHTML = sh > 0 ? `🛡<b>${sh}</b>` : '';
  E.top.classList.toggle('low', hp > 0 && hp / s.maxHull <= 0.3);
  if (E.hp !== null && hp < E.hp) { E.top.classList.remove('hit'); void E.top.offsetWidth; E.top.classList.add('hit'); }
  E.hp = hp;
  // 열: 단계 눈금 · 단계마다 색
  const h = s.heat;
  const stage = h >= r.meltdownHeat ? 'melt' : h >= r.dangerHeat ? 'danger' : h >= r.warnHeat ? 'warn' : '';
  E.bot.querySelector('.ssHeat').className = 'ssHeat ' + stage;
  q(E.bot, '.hf').style.width = Math.min(100, h) + '%';
  q(E.bot, '.ghost').style.width = ghostHeat !== undefined && ghostHeat > h ? Math.min(100, ghostHeat) + '%' : '0';
  q(E.bot, '.m1').style.left = r.warnHeat + '%';
  q(E.bot, '.m2').style.left = r.dangerHeat + '%';
  q(E.bot, '.heatNum').textContent = h + (ghostHeat !== undefined && ghostHeat !== h ? '→' + ghostHeat : '');
  E.bot.querySelector('.ssHeat').dataset.tip = heatTip(h);
  q(E.bot, '.ssChips').innerHTML = statChips(s);
}

// 매 프레임: 함선 위치에 맞춰 옮기기 (가까워지면 서로 바깥쪽으로)
Scene.onFrame = () => {
  const show = B && Scene.mode === 'battle' && !onTitle;
  for (const side of ['player', 'enemy']) {
    const E = statEl[side];
    if (!E) continue;
    const v = Scene.ships[side];
    const vis = show && !v.dead;
    E.top.style.display = E.bot.style.display = vis ? '' : 'none';
    if (!vis) continue;
    const w = Scene.pos(side), p = Scene.toScreen(w.x, w.y), z = Scene.z0 * Scene.cam.z;
    const F = Scene.field, out = side === 'player' ? -14 : 14;
    const x = p.x - F.x + out;
    E.top.style.transform = `translate(${x}px, ${p.y - F.y - 52 * z}px) translate(-50%, -100%)`;
    E.bot.style.transform = `translate(${x}px, ${p.y - F.y + 44 * z}px) translate(-50%, 0)`;
    if (v.trail !== undefined && v.max) E.top.querySelector('.trail').style.width = (v.trail / v.max) * 100 + '%';
    // 계획한 카드 표식 (적 아래 = 조준한 무기, 내 아래 = 방어 · 기동)
    const list = Scene.assign && Scene.assign[side];
    const txt = list && list.length ? (side === 'enemy' ? '◎ ' : '▣ ') + list.join(' · ') : '';
    if (txt !== E.assign) { E.assign = txt; E.bot.querySelector('.ssAssign').textContent = txt; }
  }
};

function renderHud() {
  const P = B.player;
  const planning = B.phase === 'plan' && !resolving;
  statUpdate('player', planning ? planSummary(P, P.plan).heatAfter : undefined);
  statUpdate('enemy');
  $('steps').innerHTML = ['시스템', '선제', '기동', '방어', '공격', '열'].map((n, i) => `<span class="${stepName === n ? 'on' : ''}">${'①②③④⑤⑥'[i]} ${n}</span>`).join('');
  $('distLbl').innerHTML = `거리 <b>${fmtM(B.distance)}</b> · ${bandOf(B.distance)} <small>(적 함선에 마우스 → 조준경)</small>`;
  $('torps').innerHTML = B.torpedoes.map((t) => `<span class="${t.owner === P ? 'me' : 'foe'}">${t.owner === P ? '▶ 내 어뢰' : '◀ 적 어뢰'} 비행 중</span>`).join(' · ');
}
// 연출에서 맞는 순간 → 계기판 갱신
Scene.onStat = () => { if (B) renderHud(); };

// ── 거리 표시: 우주 위 측정선에 그려짐 (scene.js). 여기선 무엇을 보여줄지만 알려줌 ──
function renderRange() {
  const P = B.player, sum = planSummary(P, P.plan);
  Scene.hover = drag && DATA.cards[drag.id].type === 'weapon' ? drag.id : null;
  Scene.ghost = B.phase === 'plan' && !resolving && sum.move
    ? Math.max(0, Math.min(DATA.rules.maxDistance, B.distance - sum.move * 100)) : null;
  // 계획한 카드 표식 (적 위 = 무기, 내 위 = 방어 · 기동)
  if (B.phase === 'plan' && !resolving) {
    const names = (f) => {
      const n = {};
      for (const it of P.plan.items) if (f(DATA.cards[it.id])) { const nm = DATA.cards[it.id].name; n[nm] = (n[nm] || 0) + 1; }
      return Object.entries(n).map(([nm, k]) => (k > 1 ? `${nm} ×${k}` : nm));   // 레이저 ×2
    };
    Scene.assign = { enemy: names((c) => c.type === 'weapon'), player: names((c) => c.type !== 'weapon') };
  } else Scene.assign = null;
}

// 놓은 카드가 계획 줄로 날아 들어감
function flyCard(srcEl, x, y, hand) {
  const fly = srcEl.cloneNode(true);
  fly.classList.remove('lifted', 'planned');
  fly.classList.add('flyCard');
  fly.style.left = x + 'px'; fly.style.top = y + 'px';
  document.body.appendChild(fly);
  const chip = document.querySelector(`[data-chip="${hand}"]`);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (chip) {
      const r = chip.getBoundingClientRect();
      fly.style.left = r.left + r.width / 2 + 'px'; fly.style.top = r.top + r.height / 2 + 'px';
      chip.classList.add('chipIn');
    }
    fly.classList.add('go');
  }));
  setTimeout(() => fly.remove(), 450);
}

// ── 계획 줄 ──────────────────────────────────
function chipHTML(it, editable, idx) {
  const c = DATA.cards[it.id];
  let body = `<b>${c.name}</b>`;
  if (c.variable) {
    const m = it.steps;
    const txt = m > 0 ? `${m * 100}km 전진` : m < 0 ? `${-m * 100}km 후진` : '정지';
    body += editable
      ? ` <button data-act="steps" data-i="${idx}" data-d="-1">◀ 후진</button> <span style="min-width:74px;text-align:center">${txt}</span> <button data-act="steps" data-i="${idx}" data-d="1">전진 ▶</button>`
      : ` ${txt}`;
  } else if (c.move) body += ` ${c.move > 0 ? c.move * 100 + 'km 전진' : -c.move * 100 + 'km 후진'}`;
  body += ` <span style="color:var(--fuel)">${itemCost(it)}</span>`;
  if (editable) body += ` <button data-act="remove" data-i="${idx}">×</button>`;
  return `<span class="chip" data-type="${c.type}" data-chip="${it.hand}">${body}</span>`;
}

function renderPlan() {
  const P = B.player, plan = P.plan, sum = planSummary(P, plan);
  const canPlan = B.phase === 'plan' && !resolving;
  const editable = canPlan && !P.skip;          // 멜트다운 턴: 카드 · 냉각 · 오버드라이브 불가
  // 연료 칸: 원래 연료 칸 + 오버드라이브로 늘어난 칸(주황 테두리). 카드 · 엔진은 오버드라이브 칸부터 씀. 넘치면 빨강
  let pips = '';
  const realUsed = sum.cost - sum.short, odN = sum.cap - P.fuel;
  for (let i = 0; i < P.fuel; i++) pips += `<i class="${i < realUsed ? 'used' : i < realUsed + sum.cool ? 'cool' : ''}"></i>`;
  for (let j = 0; j < odN; j++) pips += `<i class="odSlot ${j < sum.short ? 'used' : ''}"></i>`;
  for (let k = sum.cap; k < sum.cost; k++) pips += '<i class="over"></i>';
  const carry = Math.min(DATA.rules.carryMax, sum.left - sum.cool);
  const ex = expectedDmg(P);
  const R = DATA.rules, eng = plan.engine;
  const engTxt = eng > 0 ? `${eng * 100}km 전진` : eng < 0 ? `${-eng * 100}km 후진` : '정지';
  const dis = canPlan ? '' : 'disabled';        // 기본 엔진은 멜트다운 턴에도 됨
  const engineHTML = `<span class="chip engine" data-type="move"><b>기본 엔진</b>
    <button data-act="engine" data-d="-5" ${dis} title="500km 후진">◀◀</button><button data-act="engine" data-d="-1" ${dis} title="100km 후진">◀</button><span class="engTxt">${engTxt}</span><button data-act="engine" data-d="1" ${dis} title="100km 전진">▶</button><button data-act="engine" data-d="5" ${dis} title="500km 전진">▶▶</button>
    ${eng ? `<small class="engCost">연료 ${Math.abs(eng)} · 열 +${Math.abs(eng) * R.engineHeatPerStep}</small>` : ''}</span>`;
  const odReady = P.odCooldown === 0;
  const odHTML = `<button data-act="od" class="odBtn ${plan.od ? 'on' : ''}" ${editable && odReady ? '' : 'disabled'}
    title="이번 턴 연료 +${R.overdriveFuel} · 무기 피해 +${Math.round(R.overdriveBonus * 100)}% · 열 +${R.overdriveHeat} · 쓰면 ${R.overdriveCooldown}턴 충전">⚡ 오버드라이브${odReady ? (plan.od ? ' ON' : '') : ` (${P.odCooldown}턴)`}</button>`;
  const exTxt = ex.dmg || ex.torps
    ? `<span class="ctl expect">예상 피해 <b>${ex.dmg}</b>${ex.torps ? ` + 어뢰 ${ex.torps}` : ''} <small>(${fmtM(ex.d)}, 적이 가만히 있다면)</small></span>` : '';
  let items = plan.items.map((it, i) => chipHTML(it, editable, i)).join('');
  if (P.skip) items = engineHTML + '<span class="empty">멜트다운 — 이번 턴은 기본 엔진(이동)만. 턴이 끝나면 열 40</span>';
  else items = engineHTML + (items || '<span class="empty">카드를 함선에 끌어 놓기 (1~5)</span>');
  const fuelLeft = Math.max(0, sum.cap - sum.cost - sum.cool);
  $('planBar').innerHTML = `
    <span class="label">내 계획</span>
    <div class="planRow">${items}${exTxt}</div>
    <div class="pbCtl">
    <div class="fuelBox ${sum.ok ? '' : 'short'}" title="연료: 카드 · 기본 엔진 · 냉각에 씀. 남으면 ${R.carryMax}까지 다음 턴으로 이월${!sum.ok ? ' — 지금 연료 부족' + (!plan.od && odReady ? ' (오버드라이브로 +' + R.overdriveFuel + ')' : '') : ''}">
      <span class="fbl">연료</span>
      <span class="fuelPips">${pips}</span>
      <b class="fuelBig">${fuelLeft}<small> 남음${carry > 0 ? ` · 이월 ${carry}` : ''}</small></b>
      ${!sum.ok ? `<span class="fshort">부족${!plan.od && odReady ? ' · OD +' + R.overdriveFuel : ''}</span>` : ''}
    </div>
    <div class="coolBox" title="남는 연료 1당 열 −${R.coolPerFuel}">
      <span class="fbl">냉각</span>
      <button data-act="cool" data-d="-1" ${editable ? '' : 'disabled'}>−</button><b>${plan.cool}</b><button data-act="cool" data-d="1" ${editable ? '' : 'disabled'}>+</button>
      <small title="자연 냉각 ${P.cooling} + 연료 냉각 ${plan.cool} × ${R.coolPerFuel}">열 −${P.skip ? 0 : P.cooling + plan.cool * R.coolPerFuel}</small>
    </div>
    ${P.skip ? '' : odHTML}
    <button id="decide" ${B.phase === 'plan' && !resolving && sum.ok ? '' : 'disabled'} title="결정 → 동시 공개">결정 (Space)</button>
    </div>`;
}

// 손패: 새 턴에만 새로 그리고(한 장씩 올라옴), 그 밖엔 상태만 바꿔서 부드럽게 움직이게
let handSig = '';
function renderHand() {
  const P = B.player;
  const inPlan = new Set(P.plan.items.map((it) => it.hand));
  const sig = B.turn + '|' + P.hand.join(',') + '|' + P.locked;
  if (sig === handSig) {
    for (const el of $('hand').querySelectorAll('.card')) el.classList.toggle('planned', inPlan.has(+el.dataset.hand));
    return;
  }
  handSig = sig;
  $('hand').innerHTML = P.hand.map((id, i) => {
    const c = DATA.cards[id];
    const locked = i === P.locked;
    const far = c.maxRange !== undefined && B.distance > c.maxRange;   // 물러나기: 400km보다 멀면 못 씀
    return `<div class="card ${skipDeal ? '' : 'dealt'} ${inPlan.has(i) ? 'planned' : ''} ${locked || far ? 'locked' : ''}" data-type="${c.type}" data-hand="${i}" data-id="${id}" style="animation-delay:${i * 0.07}s">
      <div class="armed">${c.type === 'weapon' ? '◎ 조준' : '▣ 준비'}</div>
      <div class="ctop">
        <span class="cost" title="연료 비용">${c.variable ? '?' : c.cost}</span>
        <span class="ctype">${TYPE_NAME[c.type]}</span>
        <span class="cheat" title="열">🔥${c.variable ? c.heatPerStep : c.heat}</span>
      </div>
      <div class="cart">${iconSVG(id, 40)}</div>
      <div class="cbody">
        <div class="cname">${c.name}</div>
        <div class="ctext">${c.text || c.desc}</div>
      </div>
      <div class="cfoot"><span class="key">${i + 1}</span><button class="detailBtn" data-hand="${i}">자세히</button></div>
      ${locked ? '<div class="lockNote">교란으로 잠김</div>' : far ? `<div class="lockNote">${c.maxRange}km 이내에서만</div>` : ''}
      ${c.type === 'system' ? '<div class="sysBadge">가장 먼저</div>' : ''}
      ${c.preempt ? '<div class="preBadge">선제</div>' : ''}
    </div>`;
  }).join('');
  skipDeal = false;
}

// ── [자세히]: 카드의 실제 효과 (거리별 피해 등) ──
// 거리별 피해 표 → 구간 [[시작, 끝, 피해]] (피해 0 구간은 뺌)
function bandsOf(c) {
  const R = DATA.rules, out = [];
  for (let d = 0; d <= R.maxDistance; d += R.step) {
    const v = dmgAt(c, d), last = out[out.length - 1];
    if (last && last[2] === v && last[1] === d - R.step) last[1] = d; else out.push([d, d, v]);
  }
  return out.filter((b) => b[2] > 0);
}

function detailHTML(c) {
  const R = DATA.rules, P = B.player, sum = planSummary(P, P.plan);
  const now = B.distance, after = isPre(c) ? now : clamp(now - sum.move * R.step, 0, R.maxDistance);   // 선제: 기동 전 거리로 판정
  const km = (a, b) => (a === b ? fmtM(a) : `${a.toLocaleString()}~${fmtM(b)}`);
  let body = '';
  if (c.type === 'weapon' && c.dmg) {
    const rows = bandsOf(c).map(([a, b, v]) => {
      const here = !c.torpedo && now >= a && now <= b, aft = !c.torpedo && after !== now && after >= a && after <= b;
      return `<tr class="${here ? 'now' : ''} ${aft ? 'after' : ''}"><td>${km(a, b)}</td><td><b>${v}</b></td><td>${here ? '◀ 지금' : ''}${aft ? '◀ 이동 후' : ''}</td></tr>`;
    }).join('');
    body += `<div class="dsub">${c.torpedo ? '거리별 피해 — 다음 턴 도착했을 때의 거리' : '거리별 피해'}</div><table class="dtable">${rows}</table>${miniBar(c)}`;
    if (!c.torpedo) body += `<div class="dnow">지금 ${fmtM(now)} → <b>${weaponDmg(c, now, sum.od)}</b>${after !== now ? ` · 이동 후 ${fmtM(after)} → <b>${weaponDmg(c, after, sum.od)}</b>` : ''} <small>(적이 가만히 있다면)</small></div>`;
  }
  const notes = [];
  if (isPre(c)) notes.push(c.type === 'weapon' ? '선제 — 기동보다 먼저 쏜다. 상대가 움직이기 전의 거리로 판정.' : '선제 — 기동보다 먼저 켜진다. 기동 단계의 피해부터 막는다.');
  if (c.type === 'system') notes.push('공개 때 가장 먼저 발동해 이번 턴의 규칙을 바꾼다.');
  if (c.torpedo) notes.push('다음 턴에 도착해서 그때의 거리로 명중 판정. 점방어에 격추된다.');
  if (c.charge) notes.push(`${c.charge.turns}턴 동안 매 턴: 열 +${c.charge.heat} · 최대 연료 −${c.charge.fuel}`, `${c.charge.turns}턴 후: 거리 무관 피해 ${c.charge.dmg}${c.charge.enemyHeat ? ` · 상대 열 +${c.charge.enemyHeat}` : ''}`);
  if (c.ignoreShield) notes.push('관통 피해 — 보호막을 무시한다 (피해 감소는 적용).');
  if (c.jam) notes.push(`명중하면 교란 ${c.jam} — 다음 턴 손패 1장 잠김 (쌓이고, 턴마다 1씩 줄어듦).`);
  if (c.selfDamage) notes.push(`명중하면 나도 피해 ${c.selfDamage}.`);
  if (c.type === 'weapon' && !c.charge) notes.push(`오버드라이브 중이면 피해 +${Math.round(R.overdriveBonus * 100)}%.`);
  if (c.type !== 'weapon') notes.push(c.desc);
  return `<div class="dhead"><span class="cost">${c.variable ? '?' : c.cost}</span><b>${c.name}</b><span class="dtype" data-type="${c.type}">${TYPE_NAME[c.type]}</span><span class="cheat">🔥${c.heat}</span></div>
    ${body}${notes.length ? `<ul>${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}`;
}

let detailHand = -1;
function closeDetail() {
  detailHand = -1;
  const el = $('cardDetail');
  if (el) el.classList.add('hidden');
}
function toggleDetail(i) {
  if (detailHand === i) { closeDetail(); return; }
  let el = $('cardDetail');
  if (!el) { el = document.createElement('div'); el.id = 'cardDetail'; document.body.appendChild(el); }
  const card = document.querySelector(`#hand .card[data-hand="${i}"]`);
  if (!card) return;
  el.innerHTML = detailHTML(DATA.cards[B.player.hand[i]]);
  el.classList.remove('hidden');
  // 카드 바로 위에 (화면 밖으로 안 나가게)
  const r = card.getBoundingClientRect(), w = el.offsetWidth;
  el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  el.style.bottom = window.innerHeight - r.top + 10 + 'px';
  detailHand = i;
}

// ── 더미 보기: 뽑을 더미는 순서를 숨기고 정렬해서 ──
function showPile(kind) {
  if (!B || resolving) return;
  closeDetail();
  const P = B.player, list = kind === 'draw' ? P.draw : P.discard, cnt = {};
  for (const id of list) cnt[id] = (cnt[id] || 0) + 1;
  const order = ['weapon', 'defense', 'move', 'system'];
  const ids = Object.keys(cnt).sort((a, b) => order.indexOf(DATA.cards[a].type) - order.indexOf(DATA.cards[b].type) || DATA.cards[a].name.localeCompare(DATA.cards[b].name, 'ko'));
  $('overlay').innerHTML = `<div class="box pileBox"><h1>${kind === 'draw' ? '뽑을 더미' : '버린 더미'} <small>${list.length}장</small></h1>
    <p class="pnote">${kind === 'draw' ? '순서는 숨겨져 있다 — 무엇이 남았는지만 보인다.' : '뽑을 더미가 떨어지면 이 카드들을 섞어서 다시 뽑는다.'}</p>
    <div class="pileList">${ids.length ? ids.map((id) => `<div class="pileItem" data-type="${DATA.cards[id].type}"><span class="ri">${iconSVG(id, 26)}</span><b>${DATA.cards[id].name}</b><span class="pn">×${cnt[id]}</span></div>`).join('') : '<p class="pnote">비어 있다</p>'}</div>
    <button id="closePile">닫기</button></div>`;
  $('overlay').classList.remove('hidden');
  $('closePile').onclick = () => $('overlay').classList.add('hidden');
}
$('drawPile').onclick = () => showPile('draw');
$('discardPile').onclick = () => showPile('discard');

function renderLog() {
  $('log').innerHTML = '<h3>전투 기록</h3>' + B.log.slice(-80).map((l) => `<p class="${l.t}">${l.text}</p>`).join('');
  $('log').scrollTop = 1e9;
}

function render() {
  document.body.classList.toggle('resolving', resolving);
  $('turnInfo').textContent = `턴 ${B.turn}`;
  $('drawPile').innerHTML = `<b>${B.player.draw.length}</b><small>뽑을 더미</small>`;
  $('discardPile').innerHTML = `<b>${B.player.discard.length}</b><small>버린 더미</small>`;
  closeDetail();
  renderHud();
  renderRange();
  renderPlan();
  renderHand();
  renderLog();
}

// ── 단계별 공개: 한 단계씩 카드 뒷면 → 동시에 뒤집힘 → 처리 ─────
// 그 단계에 공개할 것: 계획한 카드 (+ 기동 단계엔 기본 엔진, 공격 단계엔 오버드라이브)
function phaseItems(step, s) {
  const out = step.reveal ? step.reveal(s).map((it) => ({ it })) : [];
  if (step.engine && step.engine(s)) out.push({ engine: step.engine(s) });
  if (step.od && step.od(s)) out.push({ od: true });
  return out;
}
const mvTxt = (m) => (m > 0 ? `${m * 100}km 전진` : `${-m * 100}km 후진`);
function phaseCardHTML(x, i, big) {
  const delay = `style="animation-delay:${i * 0.06}s"`;
  if (x.od) return `<div class="rcard front od" ${delay}><span class="ri">${iconSVG('overdrive', 46)}</span>오버드라이브<small>무기 +50%</small></div>`;
  if (x.engine) return `<div class="rcard front" data-type="move" ${delay}><span class="ri">${iconSVG('engine', 46)}</span>기본 엔진<small>${mvTxt(x.engine)}</small></div>`;
  const it = x.it, c = DATA.cards[it.id];
  if (big) return `<div class="rcard front sys" ${delay}><span class="ri">${iconSVG(it.id, 52)}</span>${c.name}<small>${c.desc}</small></div>`;
  const extra = c.variable ? mvTxt(it.steps) : c.move ? mvTxt(c.move) : (c.preempt ? '선제 ' : '') + TYPE_NAME[c.type];
  return `<div class="rcard front" data-type="${c.type}" ${delay}><span class="ri">${iconSVG(it.id, 46)}</span>${c.name}<small>${extra}</small></div>`;
}
async function revealPhase(step, mine, theirs) {
  const el = $('reveal');
  const me = el.querySelector('.me'), foe = el.querySelector('.foe'), mid = el.querySelector('.revealMid');
  const big = step.name === '시스템';          // 시스템 카드는 가장 먼저, 크게
  const html = (list, front) => (list.length ? list.map((x, i) => (front ? phaseCardHTML(x, i, big) : '<div class="rcard back"></div>')).join('')
    : '<div class="rcard front none">없음</div>');
  el.classList.toggle('sysPhase', big);
  mid.textContent = step.name;
  me.innerHTML = html(mine, false);
  foe.innerHTML = html(theirs, false);
  el.classList.remove('docked', 'hidden');
  await sleep(380);
  me.innerHTML = html(mine, true);
  foe.innerHTML = html(theirs, true);
  await sleep(!mine.length && !theirs.length ? 500 : big ? 1200 : 850);   // 둘 다 '없음'이면 짧게
  el.classList.add('docked');
  await sleep(260);
}

// ── 턴 요약: 이번 턴 누가 더 잘 읽었나 ─────────
function turnSummary(events, turn) {
  const st = { player: { dealt: 0, hit: 0, shots: 0 }, enemy: { dealt: 0, hit: 0, shots: 0 } };
  for (const e of events) {
    if (e.kind !== 'shot' && e.kind !== 'torpArrive') continue;
    if (e.intercepted) continue;
    const s = st[e.from];
    s.dealt += e.dmg || 0;
    s.shots++;
    if ((e.eff || 0) >= 0.9) s.hit++;
  }
  const p = st.player, en = st.enemy;
  const read = (x) => (x.shots ? `${x.hit}/${x.shots}` : '—');
  const verdict = p.dealt > en.dealt ? '<em class="me">이번 턴 우세</em>' : p.dealt < en.dealt ? '<em class="foe">이번 턴 열세</em>' : '<em>팽팽</em>';
  $('turnSum').innerHTML = `<div class="tsHead">턴 ${turn} 결과 · ${verdict}</div>
    <div class="tsRow"><span>준 피해</span><b class="me">${p.dealt}</b><span>받은 피해</span><b class="foe">${en.dealt}</b></div>
    <div class="tsRow"><span>내 예측 적중</span><b class="me">${read(p)}</b><span>적 예측 적중</span><b class="foe">${read(en)}</b></div>`;
  $('turnSum').classList.remove('hidden');
}

// ── 조작 ─────────────────────────────────────
// 카드 조준: 무기는 적 함선에, 방어 · 기동은 내 함선에 끌어다 놓는다
let drag = null;   // { hand, id, sx, sy, moved, el }

function planHas(i) { return B.player.plan.items.some((it) => it.hand === i); }

// 조준 중인 카드가 목표 위에 있을 때 보여줄 글자
function aimInfo(id, hand) {
  const c = DATA.cards[id], P = B.player;
  if (c.type === 'system') return { text: `${c.name} · 공개 때 가장 먼저 발동`, sub: c.desc, color: '#C08BFF' };
  if (c.maxRange !== undefined && B.distance > c.maxRange) return { text: `${c.name} · ${c.maxRange}km 이내에서만 (지금 ${fmtM(B.distance)})`, color: '#FF5A5F' };
  if (c.dmgReduce) return { text: `${c.name} · 100km 후진 · 받는 피해 −${Math.round(c.dmgReduce * 100)}%`, color: '#9DB8FF' };
  if (c.type !== 'weapon') {
    if (c.shieldNext) return { text: `${c.name} · 보호막 +${c.shield} (다음 턴 +${c.shieldNext})`, color: '#9DB8FF' };
    if (c.shield) return { text: `${c.name} · 보호막 +${c.shield}`, color: '#9DB8FF' };
    if (c.pointDefense) return { text: `${c.name} · 날아오는 어뢰 격추`, color: '#9DB8FF' };
    return { text: `${c.name} · ${c.move > 0 ? c.move * 100 + 'km 전진' : -c.move * 100 + 'km 후진'}`, color: '#7CFF9B' };
  }
  // 이 카드까지 넣었을 때의 계획 기준
  const plan = Object.assign({}, P.plan, { items: P.plan.items.concat([{ hand, id, steps: 0 }]) });
  const sum = planSummary(P, plan);
  const d = isPre(c) ? B.distance : clamp(B.distance - sum.move * 100, 0, DATA.rules.maxDistance);   // 선제: 기동 전 거리
  if (c.charge) return { text: `${c.name} → ${c.charge.turns}턴 뒤 ${c.charge.dmg} 피해${c.charge.enemyHeat ? ` · 상대 열 +${c.charge.enemyHeat}` : ''}`, sub: `거리 무관 · ${c.charge.turns}턴 동안 매 턴 열 +${c.charge.heat} · 최대 연료 −${c.charge.fuel}`, color: '#FFC24A' };
  if (c.torpedo) return { text: `어뢰 발사 · 다음 턴 도착`, sub: `그때 500~900km면 ${weaponDmg(c, 700, sum.od)} · 지금 ${fmtM(d)}`, color: '#FFB547' };
  const dmg = weaponDmg(c, d, sum.od), eff = efficiency(c, d);
  const tag = eff >= 0.9 ? '강한 거리' : eff >= 0.6 ? '쓸 만한 거리' : eff > 0 ? '약한 거리' : '사거리 밖';
  const color = eff >= 0.9 ? '#7CFF9B' : eff >= 0.6 ? '#FFD166' : eff > 0 ? '#FFB547' : '#FF5A5F';
  return { text: `${c.name} → ${dmg} 피해 · ${tag}`, sub: isPre(c) ? `선제 — 기동 전 거리 ${fmtM(d)}로 판정` : `${sum.move ? '내 이동 후 ' : ''}${fmtM(d)} (적이 가만히 있다면)`, color };
}

function hint(msg) {
  const el = $('hint');
  el.textContent = msg;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

// 조준 시작: 카드가 마우스에 붙음 (끌기 · 숫자키 공통)
function beginAim(d, x, y) {
  d.moved = true;
  d.el = d.src.cloneNode(true);
  d.el.classList.remove('planned', 'dealt');
  d.el.classList.add('dragGhost');
  if (DATA.cards[d.id].type === 'weapon') { d.el.classList.add('weaponAim'); document.body.classList.add('scoping'); }
  document.body.appendChild(d.el);
  d.src.classList.add('lifted');
  document.body.classList.add('aiming');
  renderRange();
  moveAim(d, x, y);
}

function moveAim(d, x, y) {
  d.el.style.left = x + 'px';
  d.el.style.top = y + 'px';
  const target = Scene.hitShip(x, y);
  const c = DATA.cards[d.id];
  Scene.aim = { id: d.id, type: c.type, x, y, target, info: aimInfo(d.id, d.hand) };
  // 목표 위에서는 카드가 작아져 조준경에 자리를 내줌
  d.el.classList.toggle('onTarget', target === (c.type === 'weapon' ? 'enemy' : 'player'));
}

// 조준 끝: (x, y)가 알맞은 함선이면 확정, 아니면 취소
function endAim(d, x, y) {
  drag = null;
  if (d.el) d.el.remove();
  d.src.classList.remove('lifted');
  document.body.classList.remove('aiming', 'scoping');
  Scene.aim = null;
  if (x === null) { renderRange(); return; }       // 취소 (Esc 등)
  const want = DATA.cards[d.id].type === 'weapon' ? 'enemy' : 'player';
  if (Scene.hitShip(x, y) === want && !planHas(d.hand)) {
    const c = DATA.cards[d.id];
    if (c.maxRange !== undefined && B.distance > c.maxRange) { hint(`${c.name}는 ${c.maxRange}km 이내에서만 쓸 수 있어요`); renderRange(); return; }
    const info = want === 'enemy' ? aimInfo(d.id, d.hand) : null;   // 넣기 전에 계산
    togglePlan(d.hand);
    if (want === 'enemy') Scene.lockOn('enemy', `TARGET LOCKED · ${c.name}`, info.color);
    else Scene.lockOn('player', `${c.name} 준비`, c.type === 'defense' ? '#9DB8FF' : c.type === 'system' ? '#C08BFF' : '#7CFF9B');
    flyCard(d.src, x, y, d.hand);
  } else renderRange();
}

// 숫자키: 카드를 집어서 마우스에 붙임 → 목표를 클릭해 확정 (이미 넣은 카드면 빼기)
function pickUp(i) {
  const P = B.player;
  if (B.phase !== 'plan' || resolving || P.skip || i >= P.hand.length || i === P.locked) return;
  if (drag) { const same = drag.hand === i; endAim(drag, null, null); if (same) return; }
  if (planHas(i)) { togglePlan(i); return; }
  const src = document.querySelector(`#hand .card[data-hand="${i}"]`);
  if (!src) return;
  let { x, y } = Scene.mouse;
  if (x < 0) { const r = src.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
  drag = { hand: i, id: P.hand[i], src, el: null, sticky: true };
  beginAim(drag, x, y);
  hint(DATA.cards[drag.id].type === 'weapon' ? '적 함선을 클릭해 확정 · Esc 취소' : '내 함선을 클릭해 확정 · Esc 취소');
}

document.addEventListener('pointerdown', (e) => {
  // 숫자키로 집은 카드: 클릭한 곳에서 확정 / 취소
  if (drag && drag.sticky) { e.preventDefault(); endAim(drag, e.clientX, e.clientY); drag = null; window.__eatUp = true; return; }
  // [자세히] 버튼: 끌기 대신 설명창
  const dBtn = e.target.closest('.detailBtn');
  if (dBtn) { e.preventDefault(); toggleDetail(+dBtn.dataset.hand); return; }
  if (!e.target.closest('#cardDetail')) closeDetail();
  const card = e.target.closest('#hand .card');
  if (!card || !B || B.phase !== 'plan' || resolving || B.player.skip) return;
  const i = +card.dataset.hand;
  if (i === B.player.locked) return;
  e.preventDefault();
  drag = { hand: i, id: card.dataset.id, sx: e.clientX, sy: e.clientY, moved: false, src: card, el: null };
});

document.addEventListener('pointermove', (e) => {
  Scene.mouse = { x: e.clientX, y: e.clientY };
  if (!drag) {
    // 적 함선에 마우스 → 거리
    const over = e.target === $('field') && Scene.hitShip(e.clientX, e.clientY) === 'enemy';
    if (over !== Scene.rangeHover) { Scene.rangeHover = over; document.body.classList.toggle('measuring', over); }
    return;
  }
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
    if (planHas(drag.hand)) { drag = null; return; }   // 이미 넣은 카드는 클릭으로 빼기만
    beginAim(drag, e.clientX, e.clientY);
  }
  if (drag.moved) moveAim(drag, e.clientX, e.clientY);
});

document.addEventListener('pointerup', (e) => {
  if (window.__eatUp) { window.__eatUp = false; return; }
  if (!drag || drag.sticky) return;
  const d = drag;
  if (!d.moved) {
    drag = null;
    // 짧게 클릭: 넣은 카드면 빼고, 아니면 사용법 안내
    if (planHas(d.hand)) togglePlan(d.hand);
    else hint(DATA.cards[d.id].type === 'weapon' ? '카드를 끌어서 적 함선에 조준하세요 (또는 숫자키)' : DATA.cards[d.id].type === 'system' ? '시스템 카드: 내 함선에 놓으면 공개 때 가장 먼저 발동해요 (또는 숫자키)' : '카드를 끌어서 내 함선에 놓으세요 (또는 숫자키)');
    renderRange();
    return;
  }
  endAim(d, e.clientX, e.clientY);
});

function togglePlan(i) {
  const P = B.player;
  if (B.phase !== 'plan' || resolving || P.skip || i >= P.hand.length || i === P.locked) return;
  const tc = DATA.cards[P.hand[i]];
  if (tc.maxRange !== undefined && B.distance > tc.maxRange && !P.plan.items.some((it) => it.hand === i)) { hint(`${tc.name}는 ${tc.maxRange}km 이내에서만 쓸 수 있어요`); return; }
  const k = P.plan.items.findIndex((it) => it.hand === i);
  if (k >= 0) P.plan.items.splice(k, 1);
  else {
    const id = P.hand[i];
    P.plan.items.push({ hand: i, id, steps: DATA.cards[id].variable ? 2 : 0 });
  }
  P.plan.cool = Math.min(P.plan.cool, planSummary(P, Object.assign({}, P.plan, { cool: 0 })).left);
  render();
}

// 기본 엔진: 연료가 허락하는 만큼 (지금 거리와 상관없이).
// 이동은 동시에 일어나므로, 0km에서도 '적이 물러날 것'을 읽고 전진할 수 있다. 최종 거리만 0 ~ 2,000km로 맞춰짐
function nudgeEngine(d) {
  const P = B.player, m = DATA.rules.engineMaxSteps;
  P.plan.engine = Math.max(-m, Math.min(m, P.plan.engine + d));
}

async function decide() {
  const P = B.player;
  if (B.phase !== 'plan' || resolving || !planSummary(P, P.plan).ok) return;
  if (drag) endAim(drag, null, null);
  B.enemy.plan = aiPlan(B);
  resolving = true;
  $('turnSum').classList.add('hidden');
  const turn = B.turn, allEv = [];
  render();
  Scene.cine = 1;
  for (const step of resolveSteps(B)) {
    // 이 단계에 낸 것이 있으면 먼저 공개 (선택은 바꿀 수 없음 — 공개만 단계별로)
    const mine = phaseItems(step, B.player), theirs = phaseItems(step, B.enemy);
    stepName = step.name;
    renderHud();
    if (step.reveal) await revealPhase(step, mine, theirs);   // 공개 단계는 늘 보여줌 (둘 다 안 냈으면 '없음')
    B.events = [];
    step.run();
    renderHud();
    allEv.push(...B.events);
    await Scene.play(B.events);
    render();
    if (B.phase === 'over') break;
  }
  stepName = null;
  $('reveal').classList.add('hidden');
  Scene.cine = 0;
  if (B.phase === 'over') {
    Scene.sync(B); renderHud();          // 버텨낸 쪽 선체 1 반영
    if (B.winner !== 'player') Scene.destroy('player');
    if (B.winner !== 'enemy') Scene.destroy('enemy');
    await sleep(2200);
    resolving = false;
    render();
    if (B.voyage) Voyage.battleEnd(B);
    else showResult();
    return;
  }
  startTurn(B);
  Scene.sync(B);
  resolving = false;
  render();
  turnSummary(allEv, turn);
  showBanner();
}

// 턴 시작 자막
function showBanner() {
  const el = $('banner');
  el.innerHTML = `<div class="bt">TURN ${B.turn}</div><div class="bline"></div><div class="bs">${fmtM(B.distance)} · ${bandOf(B.distance)}</div>`;
  el.classList.add('hidden');
  void el.offsetWidth;          // 애니메이션 다시 시작
  el.classList.remove('hidden');
}

// 창 닫기. 전투 첫 턴이면 자막
function closeOverlay() {
  $('overlay').classList.add('hidden');
  if (!onTitle && B.phase === 'plan' && !B.introShown) { B.introShown = true; showBanner(); }
}

function toggleLog() {
  $('log').classList.toggle('open');
  $('logBtn').classList.toggle('on', $('log').classList.contains('open'));
}

function showResult() {
  const w = B.winner;
  const title = w === 'player' ? '<h1 class="win">적함 격침</h1>' : w === 'enemy' ? '<h1 class="lose">격침당함</h1>' : '<h1>상호 격침</h1>';
  $('overlay').innerHTML = `<div class="box">${title}
    <p>${B.turn}턴 · 남은 선체 ${B.player.hull} / ${B.player.maxHull} · 거리 ${B.distance}km</p>
    ${w === 'draw' ? '<p>같은 순간 서로를 꿰뚫었다. 둘 다 가라앉았다.</p>' : ''}
    <button id="again">다시 전투</button> <button id="toMain" class="ghostBtn">메인 화면</button></div>`;
  $('overlay').classList.remove('hidden');
  $('again').onclick = () => { start(); closeOverlay(); };
  $('toMain').onclick = () => goTitle();
}

function showHelp() {
  $('overlay').innerHTML = `<div class="box">
    <h1>규칙</h1>
    <ul>
      <li><b>몰래 고르고 동시에 공개.</b> 손패에서 카드를 골라 계획을 세우고 [결정]. 적도 같은 순간 몰래 고른다.</li>
      <li><b>단계별 공개 · 처리: ① 시스템 → ② 선제 → ③ 기동 → ④ 방어 → ⑤ 공격 → ⑥ 열.</b> 카드는 계획 때 모두 정하고, 공개만 단계마다 한다 (공개 중엔 못 바꾼다). 기동이 공격보다 먼저라서, 공격은 <b>바뀐 거리</b>로 판정된다. 상대가 어디로 갈지 추측하라.</li>
      <li><b>거리</b> 0 ~ 2,000km. 다음 거리 = 지금 − 내 전진 − 적 전진. 무기마다 강한 거리가 다르다. <b>적 함선에 마우스를 올리면 조준경</b>이 뜬다 (거리 · 거리 자).</li>
      <li><b>카드 사용:</b> 무기는 <b>끌어서 적 함선에 조준</b> — 저격 조준경 안의 거리 자에 강한 거리(초록)가, 옆에 예상 피해가 보인다. 방어 · 기동 카드는 <b>내 함선에 끌어다 놓기</b>. 넣은 카드는 클릭하면 뺀다.</li>
      <li>무기가 맞으면 <b>예측 판정</b>이 뜬다: 효율 90%↑ 예측 적중 · 60%↑ 유효 사격 · 그 아래는 빗나간 예측.</li>
      <li><b>어뢰</b>는 다음 턴에 도착한다. 그때의 거리가 500~900km면 큰 피해. 점방어로 막을 수 있다.</li>
      <li><b>연료</b>는 매 턴 5. 남는 연료는 냉각(1당 열 −15)에 돌리거나 2까지 이월. 적의 연료는 보이지 않는다.</li>
      <li><b>기본 엔진</b>은 카드 없이 언제나: 연료 1당 100km · 열 +5, <b>연료가 허락하는 만큼</b> 멀리 (←/→ 100km, Shift+←/→ 500km). 급가속 · 역분사 카드는 연료 2로 500km — 싸지만 뜨겁다.</li>
      <li><b>시스템 카드 (보라색)</b>: 내 함선에 놓으면 공개 때 <b>가장 먼저, 크게</b> 공개되고 발동해 그 턴의 규칙을 바꾼다 (예: 강제 배기 = 곧바로 열 −40).</li>
      <li><b>선제</b>가 붙은 무기 · 방어 카드는 기동보다 먼저 쓰인다. 선제 무기는 <b>상대가 움직이기 전의 거리</b>로 맞히고, 선제 방어는 기동 단계부터 막는다.</li>
      <li><b>⚡ 오버드라이브</b>는 비장의 한 수 (O): 이번 턴 연료 +3 · <b>무기 피해 +50%</b> · 열 +30. 쓰고 나면 4턴 충전. 적이 언제 다시 쓸 수 있는지는 보이지 않는다 — 기억하라.</li>
      <li><b>열</b> 매 턴 냉각기가 −10. 50↑ 보호막 약화 · 80↑ 다음 턴 최대 연료 −1 · 100 멜트다운(선체 −30, 다음 턴은 기본 엔진으로 이동만 — 그 턴이 끝나면 열 40).</li>
      <li><b>교란</b>: 다음 턴 손패 1장이 잠긴다 (군사작전). 걸릴 때마다 쌓이고, 턴마다 1씩 줄어든다.</li>
      <li>공격은 <b>일제 사격</b> 단위: 도착 어뢰 → (내 1발째 + 적 1발째) → (내 2발째 + 적 2발째) … <b>한쪽이 0이 되는 순간 끝</b> — 남은 사격은 없다. 같은 일제 사격에서 <b>둘 다 격침</b>되면 무승부 (항해에선 패배).</li>
      <li>단축키: 1~5 카드 집기 (목표 클릭으로 확정, Esc 취소) · ←/→ 기본 엔진 (Shift = 500km) · O 오버드라이브 · Space 결정 · L 기록 · H 규칙</li>
    </ul>
    <button id="closeHelp">시작</button></div>`;
  $('overlay').classList.remove('hidden');
  $('closeHelp').onclick = closeOverlay;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (btn) {
    const P = B.player, i = +btn.dataset.i, d = +btn.dataset.d;
    if (btn.dataset.act === 'remove') P.plan.items.splice(i, 1);
    if (btn.dataset.act === 'steps') {
      const it = P.plan.items[i], c = DATA.cards[it.id];
      it.steps = Math.max(-c.maxSteps, Math.min(c.maxSteps, it.steps + d));
    }
    if (btn.dataset.act === 'cool') P.plan.cool = Math.max(0, P.plan.cool + d);
    if (btn.dataset.act === 'engine') nudgeEngine(d);
    if (btn.dataset.act === 'od' && P.odCooldown === 0) P.plan.od = !P.plan.od;
    const want = P.plan.cool;
    const s0 = planSummary(P, Object.assign({}, P.plan, { cool: 0 }));
    P.plan.cool = Math.min(P.plan.cool, s0.left);
    // 냉각을 더 올리려 했는데 막힘 → 이유 알려주기
    if (btn.dataset.act === 'cool' && d > 0 && P.plan.cool < want) {
      if (P.plan.od && s0.cap - s0.cost > s0.left) hint(`오버드라이브로 늘어난 연료(+${DATA.rules.overdriveFuel})는 냉각에 쓸 수 없어요 — 카드 · 기본 엔진에만`);
      else hint('냉각에 쓸 연료가 남지 않았어요');
    }
    render();
    return;
  }
  if (e.target.id === 'decide') decide();
});


document.addEventListener('keydown', (e) => {
  if (Voyage.on && $('overlay').classList.contains('hidden')) { Voyage.key(e); return; }
  if (onTitle && $('overlay').classList.contains('hidden')) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); titleMove(e.key === 'ArrowDown' ? 1 : -1); }
    if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); titlePick(titleItems()[titleSel].dataset.m); }
    return;
  }
  if (!$('overlay').classList.contains('hidden')) {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'h' || e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); closeOverlay(); }
    return;
  }
  if (e.key >= '1' && e.key <= '5') pickUp(+e.key - 1);
  if (e.key === 'Escape' && drag) endAim(drag, null, null);
  if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); decide(); }
  if (e.key.toLowerCase() === 'h') showHelp();
  if (e.key.toLowerCase() === 'l') toggleLog();
  if (B.phase === 'plan' && !resolving) {
    const P = B.player;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); nudgeEngine((e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 1)); }
    else if (e.key.toLowerCase() === 'o' && P.odCooldown === 0 && !P.skip) P.plan.od = !P.plan.od;
    else return;
    P.plan.cool = Math.min(P.plan.cool, planSummary(P, Object.assign({}, P.plan, { cool: 0 })).left);
    render();
  }
});
$('helpBtn').onclick = showHelp;
$('logBtn').onclick = toggleLog;

// 전투 시작. enemyKey = 적 함선, playerCfg = 항해 중인 내 함선 상태 (없으면 기본)
function start(enemyKey = 'vex', playerCfg = null) {
  B = newBattle(enemyKey, playerCfg);
  Scene.theme = null;
  hover = null;
  resolving = false;
  handSig = '';
  $('turnSum').classList.add('hidden');
  Scene.reset(B.distance);
  Scene.sync(B);
  render();
}

// ── 메인 화면 ────────────────────────────────
let onTitle = false, titleSel = 0;
const titleItems = () => [...document.querySelectorAll('.tMenu button')].filter((b) => !b.disabled);
function titleMark() { titleItems().forEach((b, i) => b.classList.toggle('sel', i === titleSel)); }
function titleMove(d) { const n = titleItems().length; titleSel = (titleSel + d + n) % n; titleMark(); }
function titlePick(m) {
  if (m === 'practice') fadeTo(() => { hideTitle(); start(); B.introShown = true; showBanner(); });
  if (m === 'voyage') fadeTo(() => { hideTitle(); Voyage.start(); });
  if (m === 'skip1') fadeTo(() => { hideTitle(); Voyage.startAt(1); });
  if (m === 'endless') fadeTo(() => { hideTitle(); Voyage.startEndless(); });
  if (m === 'depth10') fadeTo(() => { hideTitle(); Voyage.startEndlessAt(10); });
  if (m === 'rules') showHelp();
}
function showTitle() {
  onTitle = true;
  document.body.classList.add('onTitle');
  $('title').classList.remove('hidden', 'out');
  $('overlay').classList.add('hidden');
  if (drag) endAim(drag, null, null);
  Voyage.hide(); Voyage.V = null;
  Scene.mode = 'title';
  Scene.cine = 0; Scene.camReset(1);
  let best = 0; try { best = +localStorage.getItem('dr-best-depth') || 0; } catch (e) {}
  $('bestDepth').textContent = best ? `최고 깊이 ${best}` : '로그라이트 · 격침될 때까지';
  titleSel = 0; titleMark();
}
function hideTitle() {
  onTitle = false;
  document.body.classList.remove('onTitle');
  $('title').classList.add('hidden');
  Scene.mode = 'battle';
}
// 검게 → (바꾸기) → 밝게
function fadeTo(fn) {
  let f = $('fade');
  if (!f) { f = document.createElement('div'); f.id = 'fade'; document.body.appendChild(f); }
  f.classList.add('on');
  setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), 60); }, 470);
}
function goTitle() { fadeTo(() => { start(); showTitle(); }); }

document.querySelectorAll('.tMenu button').forEach((b) => {
  b.addEventListener('mouseenter', () => { const i = titleItems().indexOf(b); if (i >= 0) { titleSel = i; titleMark(); } });
  b.addEventListener('click', () => titlePick(b.dataset.m));
});
$('menuBtn').onclick = () => {
  if (resolving) return;
  $('overlay').innerHTML = `<div class="box"><h1>메인 화면으로?</h1><p>${B && B.voyage ? '진행 중인 <b>항해 전체</b>가 사라집니다.' : '지금 전투는 끝나지 않은 채로 사라집니다.'}</p>
    <button id="yesMain">메인 화면</button> <button id="noMain" class="ghostBtn">계속 싸우기</button></div>`;
  $('overlay').classList.remove('hidden');
  $('yesMain').onclick = goTitle;
  $('noMain').onclick = () => $('overlay').classList.add('hidden');
};

Scene.init($('space'));
start();
showTitle();
