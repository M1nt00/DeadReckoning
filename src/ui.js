// 화면: 전장 위 계기판 · 거리 자 · 계획 · 손패 · 기록 · 동시 공개 연출
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
    if (c.torpedo) torps++; else if (!c.charge) t += weaponDmg(c, d, sum.od);
  }
  return { dmg: t, torps, d };
}

function heatTag(h) {
  const r = DATA.rules;
  if (h >= r.meltdownHeat) return '<span class="tag melt">멜트다운</span>';
  if (h >= r.dangerHeat) return '<span class="tag danger">위험 — 다음 턴 최대 연료 −1</span>';
  if (h >= r.warnHeat) return '<span class="tag warn">경고 — 보호막 약화</span>';
  return '';
}

// 최근 기동 기록: ▶ 전진 · ◀ 후진 · ■ 정지 (오래된 것 → 최근)
function moveHistHTML(s) {
  if (!s.moveHist.length) return '<span class="mh none">기록 없음</span>';
  const fog = B && B.fog && s.side === 'enemy';
  const hist = fog ? s.moveHist.slice(-2) : s.moveHist;       // 성운: 최근 2번만
  return (fog && s.moveHist.length > 2 ? '<span class="mh none">성운 ··</span>' : '') + hist.map((m, i) => {
    const last = i === hist.length - 1;
    const t = m > 0 ? `▶${m * 100}` : m < 0 ? `◀${-m * 100}` : '■';
    return `<span class="mh ${m > 0 ? 'fwd' : m < 0 ? 'back' : 'hold'} ${last ? 'last' : ''}">${t}</span>`;
  }).join('');
}

// ── 전장 위 계기판 ───────────────────────────
// 선체 = 크게 · 보호막 = 바로 아래 파란 막대 · 나머지는 작게
// 선체/보호막 숫자는 연출(Scene)이 실제로 맞는 순간에 맞춰 바뀜
function hudBuild(el) {
  el.innerHTML = `
    <div class="hname"></div>
    <div class="hullRow">
      <span class="hpNum"><b class="hp"></b><small class="hpMax"></small></span>
      <span class="shNum"></span>
      <span class="lowTag">선체 위험</span>
    </div>
    <div class="hbar"><i class="trail"></i><i class="fill"></i><span class="ticks"></span></div>
    <div class="sbar"><i class="sfill"></i></div>
    <div class="subRow">
      <span class="lbl">열</span>
      <span class="bar heatBar"><i class="ghost"></i><i class="hf"></i><span class="mark m1"></span><span class="mark m2"></span></span>
      <b class="heatNum"></b>
      <span class="lbl fuelLbl">연료</span><b class="fuelNum"></b>
    </div>
    <div class="tags"></div>
    <div class="intel"></div>`;
  el.dataset.built = '1';
}

function hudUpdate(el, s, ghostHeat) {
  const r = DATA.rules;
  if (!el.dataset.built) hudBuild(el);
  const v = Scene.ships[s.side];
  const hp = v.hp !== undefined ? v.hp : s.hull, sh = v.sh !== undefined ? v.sh : s.shield;
  const q = (c) => el.querySelector(c);
  q('.hname').textContent = s.name;
  q('.hp').textContent = hp;
  q('.hpMax').textContent = ' / ' + s.maxHull;
  const pctHp = (hp / s.maxHull) * 100;
  q('.fill').style.width = pctHp + '%';
  q('.trail').style.width = pctHp + '%';          // CSS가 늦게 따라와서 깎인 부분이 하얗게 남음
  q('.ticks').style.backgroundSize = `${(20 / s.maxHull) * 100}% 100%`;   // 20칸마다 눈금
  q('.shNum').innerHTML = sh > 0 ? `<b>+${sh}</b> 보호막` : '';
  q('.sfill').style.width = Math.min(100, (sh / s.maxHull) * 100) + '%';
  el.classList.toggle('low', hp > 0 && hp / s.maxHull <= 0.3);
  el.classList.toggle('shielded', sh > 0);
  // 맞으면 번쩍
  const prev = +(el.dataset.hp || hp);
  if (hp < prev) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
  el.dataset.hp = hp;
  // 열 · 연료
  q('.ghost').style.width = ghostHeat !== undefined && ghostHeat > s.heat ? Math.min(100, ghostHeat) + '%' : '0';
  q('.hf').style.width = Math.min(100, s.heat) + '%';
  q('.m1').style.left = r.warnHeat + '%';
  q('.m2').style.left = r.dangerHeat + '%';
  q('.heatNum').textContent = s.heat + (ghostHeat !== undefined && ghostHeat !== s.heat ? '→' + ghostHeat : '');
  // 적 연료는 보여 주지 않음
  q('.fuelLbl').style.display = s.side === 'enemy' ? 'none' : '';
  q('.fuelNum').textContent = s.side === 'enemy' ? '' : s.fuel;
  // 상태 태그
  q('.tags').innerHTML = [
    heatTag(s.heat),
    s.odCooldown === 0 ? '<span class="tag od">⚡ OD 준비됨</span>' : `<span class="tag">OD 충전 ${s.odCooldown}턴</span>`,
    s.skip ? '<span class="tag melt">멜트다운 — 기본 엔진만</span>' : '',
    s.overheated && s.side === 'player' ? '<span class="tag danger">과열 — 이번 턴 최대 연료 −1</span>' : '',
    s.locked >= 0 && s.side === 'player' ? '<span class="tag danger">교란 — 손패 1장 잠김</span>' : '',
    s.jam > 0 ? `<span class="tag danger">교란 ${s.jam} — 다음 턴 손패 잠김</span>` : '',
    ...s.charges.map((ch) => `<span class="tag solar">☀ 초고열 충전 · ${ch.left}턴 뒤 ${ch.dmg}</span>`),
    s.coolTurns > 0 ? `<span class="tag cool">❄ 냉각 상태 ${s.coolTurns}턴 (−${s.coolAmt})</span>` : '',
    s.regen > 0 ? `<span class="tag regen">재생 보호막 +${s.regen} 대기</span>` : '',
  ].join('');
  // 읽을 단서
  q('.intel').innerHTML =
    (s.side === 'enemy' && s.doctrine ? `<div><span class="lbl">교리</span><span class="tag doc" title="${s.doctrineDesc || ''}">${s.doctrine} · 선호 ${s.preferJitter ? `${fmtM(s.preferBase)} ±${s.preferJitter}` : fmtM(s.prefer)}</span></div>` : '') +
    `<div><span class="lbl">기동</span>${moveHistHTML(s)}</div>`;
}

function renderHud() {
  const P = B.player;
  const planning = B.phase === 'plan' && !resolving;
  hudUpdate($('hudPlayer'), P, planning ? planSummary(P, P.plan).heatAfter : undefined);
  hudUpdate($('hudEnemy'), B.enemy);
  $('steps').innerHTML = ['기동', '방어', '공격', '열'].map((n, i) => `<span class="${stepName === n ? 'on' : ''}">${'①②③④'[i]} ${n}</span>`).join('');
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
  let pips = '';
  const total = Math.max(P.fuel, sum.cost + sum.cool);
  for (let i = 0; i < total; i++) {
    const cls = i < Math.min(sum.cost, P.fuel) ? 'used' : i >= P.fuel ? 'over' : i < sum.cost + sum.cool ? 'cool' : '';
    pips += `<i class="${cls}"></i>`;
  }
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
  else items = engineHTML + (items || '<span class="empty">무기는 적 함선에 끌어서 조준 · 방어 · 기동은 내 함선에 (단축키 1~5)</span>');
  $('planBar').innerHTML = `
    <span class="label">내 계획</span>
    <div class="planRow">${items}</div>
    <span class="ctl">연료 <span class="fuelPips">${pips}</span> ${sum.cost}/${sum.cap}</span>
    ${exTxt}
    ${P.skip ? '' : odHTML}
    ${!sum.ok ? `<span class="ctl" style="color:var(--foe)">연료 부족${!plan.od && odReady ? ' — 오버드라이브로 +' + R.overdriveFuel : ''}</span>` : ''}
    <span class="ctl">냉각 <button data-act="cool" data-d="-1" ${editable ? '' : 'disabled'}>−</button> ${plan.cool} <button data-act="cool" data-d="1" ${editable ? '' : 'disabled'}>+</button>${carry > 0 ? ` 이월 ${carry}` : ''}</span>
    <button id="decide" ${B.phase === 'plan' && !resolving && sum.ok ? '' : 'disabled'}>결정 · 동시 공개 (Space)</button>`;
}

// 손패: 새 턴에만 새로 그리고(한 장씩 올라옴), 그 밖엔 상태만 바꿔서 부드럽게 움직이게
let handSig = '';
function renderHand() {
  const P = B.player;
  const inPlan = new Set(P.plan.items.map((it) => it.hand));
  const sig = B.turn + '|' + P.hand.join(',') + '|' + P.locked;
  if (sig === handSig) {
    for (const el of $('hand').querySelectorAll('.card')) {
      const i = +el.dataset.hand;
      el.classList.toggle('planned', inPlan.has(i));
      const w = el.querySelector('.cnowWrap');
      if (w) w.innerHTML = dmgNowHTML(DATA.cards[el.dataset.id]);
    }
    return;
  }
  handSig = sig;
  $('hand').innerHTML = P.hand.map((id, i) => {
    const c = DATA.cards[id];
    const locked = i === P.locked;
    const far = c.maxRange !== undefined && B.distance > c.maxRange;   // 물러나기: 400km보다 멀면 못 씀
    return `<div class="card ${skipDeal ? '' : 'dealt'} ${inPlan.has(i) ? 'planned' : ''} ${locked || far ? 'locked' : ''}" data-type="${c.type}" data-hand="${i}" data-id="${id}" style="animation-delay:${i * 0.07}s">
      <div class="armed">${c.type === 'weapon' ? '◎ 조준' : '▣ 준비'}</div>
      <div class="cost">${c.variable ? '?' : c.cost}</div>
      <div class="key">${i + 1}</div>
      <div class="cart">${iconSVG(id, 42)}</div>
      <div class="cbody">
        <div class="ctype">${TYPE_NAME[c.type]}<span class="cheat">열 ${c.variable ? `연료당 ${c.heatPerStep}` : c.heat}</span></div>
        <div class="cname">${c.name}</div>
        ${miniBar(c)}
        <div class="cnowWrap">${dmgNowHTML(c)}</div>
        <div class="cdesc">${c.desc}</div>
      </div>
      ${locked ? '<div class="lockNote">교란으로 잠김</div>' : far ? `<div class="lockNote">${c.maxRange}km 이내에서만</div>` : ''}
      ${c.type === 'system' ? '<div class="sysBadge">즉시</div>' : ''}
    </div>`;
  }).join('');
  skipDeal = false;
}

function renderLog() {
  $('log').innerHTML = '<h3>전투 기록</h3>' + B.log.slice(-80).map((l) => `<p class="${l.t}">${l.text}</p>`).join('');
  $('log').scrollTop = 1e9;
}

function render() {
  document.body.classList.toggle('resolving', resolving);
  $('turnInfo').textContent = `턴 ${B.turn}  ·  덱 ${B.player.draw.length}  ·  버린 카드 ${B.player.discard.length}`;
  renderHud();
  renderRange();
  renderPlan();
  renderHand();
  renderLog();
}

// ── 공개 연출: 카드 뒷면 → 동시에 뒤집힘 ─────
function revealCards(plan, front) {
  const extras = [];
  if (plan.od) extras.push({ od: true });
  if (plan.engine) extras.push({ engine: plan.engine });
  if (!plan.items.length && !extras.length) return `<div class="rcard ${front ? 'front' : 'back'}">${front ? '대기<small>아무것도 안 함</small>' : ''}</div>`;
  return plan.items.map((it, i) => {
    const c = DATA.cards[it.id];
    if (!front) return '<div class="rcard back"></div>';
    const extra = c.variable ? (it.steps > 0 ? `${it.steps * 100}km 전진` : `${-it.steps * 100}km 후진`) : c.move ? (c.move > 0 ? `${c.move * 100}km 전진` : `${-c.move * 100}km 후진`) : TYPE_NAME[c.type];
    return `<div class="rcard front" data-type="${c.type}" style="animation-delay:${i * 0.06}s"><span class="ri">${iconSVG(it.id, 32)}</span>${c.name}<small>${extra}</small></div>`;
  }).join('') + extras.map((x) => {
    if (!front) return '<div class="rcard back"></div>';
    if (x.od) return `<div class="rcard front od"><span class="ri">${iconSVG('overdrive', 32)}</span>오버드라이브<small>무기 +50%</small></div>`;
    return `<div class="rcard front" data-type="move"><span class="ri">${iconSVG('engine', 32)}</span>기본 엔진<small>${x.engine > 0 ? x.engine * 100 + 'km 전진' : -x.engine * 100 + 'km 후진'}</small></div>`;
  }).join('');
}
function sysRevealCards(list) {
  if (!list.length) return '<div class="rcard front none">시스템 카드 없음</div>';
  return list.map((id, i) => `<div class="rcard front sys" style="animation-delay:${i * 0.1}s"><span class="ri">${iconSVG(id, 44)}</span>${DATA.cards[id].name}<small>${DATA.cards[id].desc.replace('즉시: ', '')}</small></div>`).join('');
}
async function showReveal() {
  const el = $('reveal');
  const me = el.querySelector('.me'), foe = el.querySelector('.foe'), mid = el.querySelector('.revealMid');
  // ① 이번 턴 쓴 시스템 카드를 가장 먼저, 크게
  const ps = B.player.usedSystem, es = B.enemy.usedSystem;
  if (ps.length || es.length) {
    el.classList.add('sysPhase');
    mid.textContent = '시스템';
    me.innerHTML = sysRevealCards(ps);
    foe.innerHTML = sysRevealCards(es);
    el.classList.remove('docked');
    el.classList.remove('hidden');
    await sleep(1700);
    el.classList.remove('sysPhase');
  }
  mid.textContent = '동시 공개';
  const myPlan = B.player.skip ? { items: [], engine: B.player.plan.engine } : B.player.plan;
  me.innerHTML = revealCards(myPlan, false);
  foe.innerHTML = revealCards(B.enemy.plan, false);
  el.classList.remove('docked');
  el.classList.remove('hidden');
  await sleep(650);
  me.innerHTML = revealCards(myPlan, true);
  foe.innerHTML = revealCards(B.enemy.plan, true);
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
  if (c.type === 'system') return { text: `${c.name} · 즉시 발동`, sub: c.desc.replace('즉시: ', ''), color: '#C08BFF' };
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
  const d = clamp(B.distance - sum.move * 100, 0, DATA.rules.maxDistance);
  if (c.charge) return { text: `${c.name} → ${c.charge.turns}턴 뒤 ${c.charge.dmg} 피해${c.charge.enemyHeat ? ` · 상대 열 +${c.charge.enemyHeat}` : ''}`, sub: `거리 무관 · ${c.charge.turns}턴 동안 매 턴 열 +${c.charge.heat} · 최대 연료 −${c.charge.fuel}`, color: '#FFC24A' };
  if (c.torpedo) return { text: `어뢰 발사 · 다음 턴 도착`, sub: `그때 500~900km면 ${weaponDmg(c, 700, sum.od)} · 지금 ${fmtM(d)}`, color: '#FFB547' };
  const dmg = weaponDmg(c, d, sum.od), eff = efficiency(c, d);
  const tag = eff >= 0.9 ? '강한 거리' : eff >= 0.6 ? '쓸 만한 거리' : eff > 0 ? '약한 거리' : '사거리 밖';
  const color = eff >= 0.9 ? '#7CFF9B' : eff >= 0.6 ? '#FFD166' : eff > 0 ? '#FFB547' : '#FF5A5F';
  return { text: `${c.name} → ${dmg} 피해 · ${tag}`, sub: `${sum.move ? '내 이동 후 ' : ''}${fmtM(d)} (적이 가만히 있다면)`, color };
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
    if (c.type === 'system') {                       // 시스템: 계획에 넣지 않고 바로 발동
      if (!useSystem(B, B.player, d.hand)) { hint(`연료가 모자라요 (${c.name}: 연료 ${c.cost})`); renderRange(); return; }
      Scene.lockOn('player', `${c.name} 발동`, '#C08BFF');
      Scene.flash(Scene.pos('player').x, Scene.pos('player').y, 90, '#C08BFF', 0.5);
      P_afterSystem();
      return;
    }
    if (c.maxRange !== undefined && B.distance > c.maxRange) { hint(`${c.name}는 ${c.maxRange}km 이내에서만 쓸 수 있어요`); renderRange(); return; }
    const info = want === 'enemy' ? aimInfo(d.id, d.hand) : null;   // 넣기 전에 계산
    togglePlan(d.hand);
    if (want === 'enemy') Scene.lockOn('enemy', `TARGET LOCKED · ${c.name}`, info.color);
    else Scene.lockOn('player', `${c.name} 준비`, c.type === 'defense' ? '#9DB8FF' : '#7CFF9B');
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
    else hint(DATA.cards[d.id].type === 'weapon' ? '카드를 끌어서 적 함선에 조준하세요 (또는 숫자키)' : DATA.cards[d.id].type === 'system' ? '시스템 카드: 내 함선에 놓으면 바로 발동해요 (또는 숫자키)' : '카드를 끌어서 내 함선에 놓으세요 (또는 숫자키)');
    renderRange();
    return;
  }
  endAim(d, e.clientX, e.clientY);
});

// 시스템 카드를 쓴 뒤: 손패가 한 장 줄었으니 다시 그림 (올라오기 연출 없이)
function P_afterSystem() {
  const P = B.player;
  P.plan.cool = Math.min(P.plan.cool, planSummary(P, Object.assign({}, P.plan, { cool: 0 })).left);
  skipDeal = true;
  render();
}

function togglePlan(i) {
  const P = B.player;
  if (B.phase !== 'plan' || resolving || P.skip || i >= P.hand.length || i === P.locked) return;
  const tc = DATA.cards[P.hand[i]];
  if (tc.type === 'system' && !P.plan.items.some((it) => it.hand === i)) return;               // 시스템은 계획에 안 넣음
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
  aiSystem(B, B.enemy);                 // 적도 시스템 카드를 먼저 (즉시)
  B.enemy.plan = aiPlan(B);
  resolving = true;
  $('turnSum').classList.add('hidden');
  const turn = B.turn, allEv = [];
  render();
  Scene.cine = 1;
  await showReveal();
  await sleep(1150);
  $('reveal').classList.add('docked');
  await sleep(350);
  for (const step of resolveSteps(B)) {
    stepName = step.name;
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
      <li><b>처리 순서: ① 기동 → ② 방어 → ③ 공격 → ④ 열.</b> 기동이 먼저라서, 공격은 <b>바뀐 거리</b>로 판정된다. 상대가 어디로 갈지 추측하라.</li>
      <li><b>거리</b> 0 ~ 2,000km. 다음 거리 = 지금 − 내 전진 − 적 전진. 무기마다 강한 거리가 다르다. <b>적 함선에 마우스를 올리면 조준경</b>이 뜬다 (거리 · 거리 자).</li>
      <li><b>카드 사용:</b> 무기는 <b>끌어서 적 함선에 조준</b> — 저격 조준경 안의 거리 자에 강한 거리(초록)가, 옆에 예상 피해가 보인다. 방어 · 기동 카드는 <b>내 함선에 끌어다 놓기</b>. 넣은 카드는 클릭하면 뺀다.</li>
      <li>무기가 맞으면 <b>예측 판정</b>이 뜬다: 효율 90%↑ 예측 적중 · 60%↑ 유효 사격 · 그 아래는 빗나간 예측.</li>
      <li><b>어뢰</b>는 다음 턴에 도착한다. 그때의 거리가 500~900km면 큰 피해. 점방어로 막을 수 있다.</li>
      <li><b>연료</b>는 매 턴 5. 남는 연료는 냉각(1당 열 −15)에 돌리거나 2까지 이월. 적의 연료는 보이지 않는다.</li>
      <li><b>기본 엔진</b>은 카드 없이 언제나: 연료 1당 100km · 열 +5, <b>연료가 허락하는 만큼</b> 멀리 (←/→ 100km, Shift+←/→ 500km). 급가속 · 역분사 카드는 연료 2로 500km — 싸지만 뜨겁다.</li>
      <li><b>시스템 카드 (보라색 · 즉시)</b>: 내 함선에 놓으면 계획 중에 <b>바로 발동</b>한다 (연료 · 열도 즉시). 되돌릴 수 없다. 동시 공개 때 양쪽이 쓴 시스템 카드가 <b>가장 먼저, 크게</b> 공개된다.</li>
      <li><b>⚡ 오버드라이브</b>는 비장의 한 수 (O): 이번 턴 연료 +3 · <b>무기 피해 +50%</b> · 열 +30. 쓰고 나면 4턴 충전. 적의 충전 상태도 보인다.</li>
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
    P.plan.cool = Math.min(P.plan.cool, planSummary(P, Object.assign({}, P.plan, { cool: 0 })).left);
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
