// 전장: 우주 배경 · 함선 · 엔진 · 보호막 · 무기 연출 · 폭발 · 파티클
// battle.js가 남긴 이벤트(B.events)를 받아 순서대로 애니메이션으로 보여준다
'use strict';

const COL = { player: '#5CE1E6', enemy: '#FF5A5F' };
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const rand = (a, b) => a + Math.random() * (b - a);

const Scene = {
  cv: null, g: null, W: 0, H: 0, dpr: 1, time: 0, last: 0,
  dist: 1200,              // 화면에 보이는 거리 (애니메이션 중엔 실제와 다를 수 있음)
  ships: null,
  parts: [], texts: [], beams: [], shots: [], torps: [], timers: [], tweens: [],
  shake: 0,
  stars: [],
  labelStack: {}, labelT: {},
  field: { x: 0, y: 0, w: 800, h: 400 },   // 함선이 떠 있는 영역 (#field 칸의 위치)
  hover: null,                              // 마우스를 올린 무기 카드 → 측정선 위에 강한 구간 표시
  ghost: null,                              // 이동 계획 → 적 예상 위치
  aim: null,                                // 카드 조준 중: { id, x, y, target, info: {text, color} }
  rangeHover: false,                        // 적 함선에 마우스 → 줄자
  rangeK: 0,                                // 줄자 보이는 정도 (평소 0)
  mouse: { x: -999, y: -999 },              // 화면 위 마우스 위치
  skin: { player: 'player', enemy: 'vex' },  // 어떤 함선 그림을 쓸지 (Art.design 키)
  mode: 'battle',
  theme: null,                              // 장마다 배경 ('fog' = 안개 성운)                           // 'title' = 메인 화면 · 'battle' = 전투
  posOverride: null,                        // 메인 화면에서 함선을 다른 곳에 그릴 때
  assign: null,                             // 계획한 카드 표식 { enemy: [이름], player: [이름] }
  lockFx: null,                             // 조준 확정 연출 { side, t0, text, color }
  scope: { x: 0, y: 0, k: 0, lock: 0, init: false },   // 저격 조준경 (마우스를 따라감)
  // ── 시네마틱 ──
  z0: 1,                                    // 화면 크기에 맞춘 기본 확대 (큰 화면일수록 함선이 큼)
  cam: { x: 0, y: 0, z: 1 }, camT: { x: 0, y: 0, z: 1 },   // 카메라 (지금 / 목표)
  cine: 0, cineK: 0,                        // 레터박스 (1 = 처리 중 영화 모드)
  real: 0, slowUntil: 0,                    // 슬로모션 (실제 시간 기준)
  sflash: { a: 0, color: '#FFFFFF' },       // 화면 전체 번쩍임
  dust: [], grain: null,

  init(canvasEl) {
    this.cv = canvasEl;
    this.g = canvasEl.getContext('2d');
    Art.build();
    const rnd = seeded(5);
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < [180, 90, 40][layer]; i++) {
        this.stars.push({
          x: rnd(), y: rnd(), layer,
          r: [0.6, 1.0, 1.6][layer] * (0.6 + rnd() * 0.8),
          b: 0.3 + rnd() * 0.7, tw: rnd() * 6.28,
          c: rnd() < 0.15 ? '#9DC4FF' : rnd() < 0.1 ? '#FFD9A0' : '#FFFFFF',
        });
      }
    }
    // 가까운 우주 먼지 (카메라 앞을 스쳐 지나감)
    for (let i = 0; i < 46; i++) this.dust.push({ x: rnd(), y: rnd(), z: 0.5 + rnd() * 1.4, r: 0.6 + rnd() * 1.6 });
    // 필름 입자
    const gc = document.createElement('canvas');
    gc.width = gc.height = 180;
    const gg = gc.getContext('2d'), id = gg.createImageData(180, 180);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = Math.random() < 0.5 ? 40 : 0; }
    gg.putImageData(id, 0, 0);
    this.grain = gc;
    this.reset(DATA.rules.startDistance);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  },

  reset(d) {
    this.dist = d;
    const ship = () => ({ flame: 0, retro: 0, heat: 0, shieldOn: 0, shieldAmt: 0, shieldFlash: 0, pd: 0, hullFlash: 0, kick: 0, lunge: 0, hull: 1, dead: false, smokeT: 0, hp: undefined, max: 1, sh: 0, trail: 0, trailWait: 0, plateFlash: 0 });
    this.ships = { player: ship(), enemy: ship() };
    this.parts = []; this.texts = []; this.beams = []; this.shots = []; this.torps = []; this.timers = []; this.tweens = [];
    this.cam = { x: 0, y: 0, z: 1 }; this.camT = { x: 0, y: 0, z: 1 }; this.cine = 0; this.slowUntil = 0;
  },

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr;
    this.measure();
  },
  // #field 칸이 화면 어디에 있는지 (함선 위치 기준)
  measure() {
    const el = document.getElementById('field');
    if (el) { const r = el.getBoundingClientRect(); this.field = { x: r.left, y: r.top, w: r.width, h: r.height }; }
    this.z0 = Math.max(1, Math.min(1.7, this.field.h / 340));
  },
  sep(d) { return lerp(175, this.field.w / this.z0 - 320, d / DATA.rules.maxDistance); },

  // ── 카메라 ──
  center() { const F = this.field; return { x: F.x + F.w / 2, y: F.y + F.h / 2 }; },
  camFocus(side, z = 1.12, k = 0.38) {        // 한쪽 함선 쪽으로 당겨서 줌인
    const p = this.pos(side), c = this.center();
    this.camT = { x: (p.x - c.x) * k, y: (p.y - c.y) * k, z };
  },
  camReset(z = 1) { this.camT = { x: 0, y: 0, z }; },
  // 월드 → 화면 좌표
  toScreen(x, y) {
    const c = this.center(), z = this.z0 * this.cam.z;
    return { x: c.x + (x - c.x - this.cam.x) * z, y: c.y + (y - c.y - this.cam.y) * z };
  },
  // 화면 좌표 (x, y)에 있는 함선 ('player' / 'enemy' / null)
  hitShip(x, y) {
    const z = this.z0 * this.cam.z;
    for (const side of ['enemy', 'player']) {
      if (this.ships[side].dead) continue;
      const p = this.toScreen(this.pos(side).x, this.pos(side).y);
      if (Math.abs(x - p.x) < 108 * z && Math.abs(y - p.y) < 52 * z) return side;
    }
    return null;
  },
  slowmo(sec) { this.slowUntil = Math.max(this.slowUntil, this.real + sec); },
  screenFlash(a, color = '#FFFFFF') { this.sflash = { a: Math.max(this.sflash.a, a), color }; },

  // ── 위치 ──
  pos(side) {
    if (this.posOverride && this.posOverride[side]) return this.posOverride[side];
    const s = this.ships[side];
    const F = this.field, sep = this.sep(this.dist);
    const dir = side === 'player' ? -1 : 1;
    const x = F.x + F.w / 2 + dir * sep / 2 - dir * s.lunge + dir * s.kick;
    const y = F.y + F.h * 0.56 + (side === 'player' ? 8 : -8) + Math.sin(this.time * 0.9 + (side === 'player' ? 0 : 2)) * 3;   // 조금 아래: 위쪽 계기판 · 선체 막대 자리
    return { x, y };
  },
  design(side) { return Art.design[this.skin[side]] || Art.design.vex; },
  nose(side) { const p = this.pos(side), k = this.design(side).scale || 1; return { x: p.x + (side === 'player' ? 80 : -78) * k, y: p.y - 1 }; },
  other(side) { return side === 'player' ? 'enemy' : 'player'; },

  // ── 시간 예약 · 보간 ──
  after(sec, fn) { this.timers.push({ at: this.time + sec, fn }); },
  tween(dur, fn, done) { this.tweens.push({ t0: this.time, dur, fn, done }); },

  // ── 파티클 ──
  spark(x, y, color, n, speed = 260, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = rand(0.3, 1) * speed;
      this.parts.push({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.5, 1) * life, max: life, color, size: rand(1, 2.4) });
    }
  },
  smoke(x, y, n, size = 10, life = 1.6) {
    for (let i = 0; i < n; i++) this.parts.push({ type: 'smoke', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-20, 20), vy: rand(-26, -4), life: rand(0.7, 1) * life, max: life, size: rand(0.6, 1.2) * size });
  },
  debris(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = rand(40, 180);
      this.parts.push({ type: 'debris', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.8, 1.6), max: 1.6, size: rand(2, 5), rot: Math.random() * 6, vr: rand(-8, 8) });
    }
  },
  flash(x, y, size, color, life = 0.35) { this.parts.push({ type: 'glow', x, y, vx: 0, vy: 0, life, max: life, size, color }); },
  // 렌즈 광선 (가로로 길게 번지는 빛)
  streak(x, y, len, color = '#9FD8FF', life = 0.35) { this.parts.push({ type: 'streak', x, y, vx: 0, vy: 0, life, max: life, size: len, color }); },
  ring(x, y, size, color, life = 0.5) { this.parts.push({ type: 'ring', x, y, vx: 0, vy: 0, life, max: life, size, color }); },
  text(x, y, str, color, size = 18, life = 1.3) { this.texts.push({ x, y, str, color, size, life, max: life }); },

  // ── 이벤트 재생 ──────────────────────────
  play(events) {
    let t = 0;
    const shots = events.filter((e) => e.kind === 'shot');
    // 나 · 적 번갈아 쏘는 순서로
    const mine = shots.filter((e) => e.from === 'player'), theirs = shots.filter((e) => e.from === 'enemy');
    const alt = [];
    for (let i = 0; i < Math.max(mine.length, theirs.length); i++) { if (mine[i]) alt.push(mine[i]); if (theirs[i]) alt.push(theirs[i]); }
    let defense = false;
    for (const e of events) {
      if (e.kind === 'move') { this.after(t, () => this.animMove(e)); t += 1.15; }
      if (e.kind === 'shield') { defense = true; this.after(t, () => this.animShield(e)); }
      if (e.kind === 'torpArrive') { this.after(t, () => this.animTorpArrive(e)); t += 0.95; }
      if (e.kind === 'torpLaunch') { this.after(t, () => this.animTorpLaunch(e)); t += 0.45; }
      if (e.kind === 'chargeStart') { this.after(t, () => this.animChargeStart(e)); t += 0.5; }
      if (e.kind === 'evade') this.after(t, () => { const p = this.pos(e.who); this.text(p.x, p.y + 64, `물러나기 · 피해 −${e.pct}%`, '#9DB8FF', 14); this.ring(p.x, p.y, 90, '#9DB8FF', 0.5); });
      if (e.kind === 'heat') this.after(t, () => { this.ships[e.who].heat = e.heat; if (e.overdrive) this.vent(e.who); });
      if (e.kind === 'meltdown') { this.after(t, () => this.animMeltdown(e.who)); t += 1.1; }
    }
    if (defense) t += 0.6;
    for (const e of alt) {
      this.after(t, () => { this.camFocus(this.other(e.from), e.dmg >= 12 ? 1.2 : 1.1); this.animShot(e); });
      t += e.card === 'ram' ? 0.9 : 0.62;
    }
    return new Promise((res) => this.after(t + 0.3, () => { this.camReset(1.03); res(); }));
  },

  animMove(e) {
    const from = this.dist, to = e.after;
    const P = this.ships.player, E = this.ships.enemy;
    P.flame = e.pm > 0 ? 1 : 0; P.retro = e.pm < 0 ? 1 : 0;
    E.flame = e.em > 0 ? 1 : 0; E.retro = e.em < 0 ? 1 : 0;
    if (e.pm || e.em) { this.camT = { x: 0, y: 0, z: 0.94 }; this.after(1.0, () => this.camReset(1.03)); }
    this.tween(0.95, (k) => { this.dist = lerp(from, to, ease(k)); }, () => {
      this.dist = to;
      P.flame = P.retro = E.flame = E.retro = 0;
    });
  },

  // 보이는 선체 · 보호막 값 바꾸기 (계기판도 같이)
  setStat(side, dHull, sh) {
    const T = this.ships[side];
    if (T.hp === undefined) return;
    if (dHull) { T.hp = Math.max(0, T.hp - dHull); T.hull = T.hp / T.max; T.trailWait = 0.45; T.plateFlash = 1; }
    if (sh !== undefined) T.sh = Math.max(0, sh);
    if (this.onStat) this.onStat();
  },

  animShield(e) {
    const s = this.ships[e.who], p = this.pos(e.who);
    this.setStat(e.who, 0, e.amount);
    if (e.amount) { s.shieldOn = 1; s.shieldAmt = e.amount; s.shieldFlash = 1; this.text(p.x, p.y - 64, `보호막 ${e.amount}${e.weak ? ' (과열로 약화)' : ''}`, '#9DB8FF', 14); }
    if (e.pd) { s.pd = 1; this.text(p.x, p.y + 64, '점방어 가동', '#9DB8FF', 13); }
  },

  // 명중 처리 (보호막 / 선체 / 효율 표시)
  impact(targetSide, e, label = true) {
    const T = this.ships[targetSide], p = this.pos(targetSide);
    const hx = p.x + rand(-40, 40), hy = p.y + rand(-12, 12);
    this.setStat(targetSide, e.hull || 0, T.sh - (e.shield || 0));
    if (e.shield > 0) {
      const sx = p.x + (targetSide === 'enemy' ? -90 : 90) * 0.9, sy = p.y + rand(-20, 20);
      T.shieldFlash = 1;
      this.ring(sx, sy, 40, '#9DB8FF', 0.45);
      this.spark(sx, sy, '#BFD2FF', 10, 180, 0.4);
      this.text(sx, sy - 18, `-${e.shield}`, '#9DB8FF', 16);
    }
    if (e.hull > 0) {
      const big = Math.min(1, e.hull / 15);
      T.hullFlash = 0.18;
      this.flash(hx, hy, 40 + big * 70, '#FFD29A', 0.35);
      this.flash(hx, hy, 18 + big * 30, '#FFFFFF', 0.15);
      this.spark(hx, hy, '#FFB547', 12 + e.hull * 1.5, 320, 0.6);
      this.debris(hx, hy, 3 + Math.floor(e.hull / 3));
      this.smoke(hx, hy, 4 + Math.floor(e.hull / 3), 12);
      this.ring(hx, hy, 30 + big * 50, '#FFB547', 0.4);
      this.text(hx, hy - 24, `-${e.hull}`, targetSide === 'enemy' ? '#FFD166' : '#FF6B6B', 20 + big * 8);
      this.shake = Math.min(14, this.shake + 3 + e.hull * 0.4);
      this.streak(hx, hy, 120 + big * 220, '#FFD9A8', 0.4);
      if (e.hull >= 10) { this.slowmo(0.45); this.screenFlash(0.22 + big * 0.2, '#FFE3C0'); }
    }
    if (label) this.effLabel(targetSide, e.eff);
  },

  // 예측 판정: 이 거리에서 무기가 얼마나 제 힘을 냈나
  effLabel(targetSide, eff) {
    const p = this.pos(targetSide);
    const pctTxt = Math.round(eff * 100) + '%';
    let txt, col;
    if (eff >= 0.9) { txt = '예측 적중 · 효율 ' + pctTxt; col = '#7CFF9B'; }
    else if (eff >= 0.6) { txt = '유효 사격 · 효율 ' + pctTxt; col = '#E6EDF7'; }
    else if (eff > 0) { txt = '빗나간 예측 · 효율 ' + pctTxt; col = '#FFB547'; }
    else { txt = '사거리 밖'; col = '#7E8BA3'; }
    // 같은 배 위에 연달아 뜨면 위로 쌓기
    const stack = this.labelStack[targetSide] = this.time - (this.labelT[targetSide] || -9) < 0.9 ? (this.labelStack[targetSide] || 0) + 1 : 0;
    this.labelT[targetSide] = this.time;
    this.text(p.x, p.y - 96 - stack * 22, txt, col, 15, 1.6);
  },

  animShot(e) {
    const from = e.from, to = this.other(from), col = COL[from];
    const a = this.nose(from), b = this.pos(to);
    const miss = !e.dmg;
    if (e.card === 'laser') {
      this.beams.push({ from, to, kind: 'laser', color: col, life: 0.38, max: 0.38, miss });
      this.flash(a.x, a.y, 22, col, 0.2);
      this.streak(a.x, a.y, 140, col, 0.3);
      if (miss) this.after(0.1, () => this.effLabel(to, 0));
      else this.after(0.06, () => this.impact(to, e));
    } else if (e.card === 'railgun') {
      this.ships[from].kick = 10;
      this.flash(a.x, a.y, 30, '#FFFFFF', 0.18);
      this.streak(a.x, a.y, 260, '#9FD8FF', 0.3);
      this.screenFlash(0.08, '#CFE9FF');
      this.spark(a.x, a.y, col, 8, 200, 0.3);
      const tx = miss ? b.x + (to === 'enemy' ? 600 : -600) : b.x, ty = b.y + rand(-6, 6);
      this.shots.push({ kind: 'rail', x0: a.x, y0: a.y, x1: tx, y1: ty, t: 0, dur: miss ? 0.4 : 0.16, color: col, trail: [], onHit: miss ? () => this.effLabel(to, 0) : () => this.impact(to, e) });
    } else if (e.card === 'scatter') {
      this.flash(a.x, a.y, 26, '#FFB547', 0.2);
      const reach = miss ? 0.45 : 1;
      for (let i = 0; i < 14; i++) {
        this.shots.push({ kind: 'pellet', x0: a.x, y0: a.y, x1: lerp(a.x, b.x, reach) + rand(-20, 20), y1: b.y + rand(-34, 34) * reach, t: 0, dur: rand(0.22, 0.32), color: '#FFC98A', trail: [], fade: miss });
      }
      this.after(0.3, () => (miss ? this.effLabel(to, 0) : this.impact(to, e)));
    } else if (e.card === 'solarLance') {
      // 초고열 응집: 굵은 황금빛 광선 + 화면 번쩍
      this.beams.push({ from, to, kind: 'laser', color: '#FFC24A', life: 0.7, max: 0.7, miss: false, wide: true });
      this.flash(a.x, a.y, 60, '#FFE2A0', 0.4);
      this.streak(a.x, a.y, 420, '#FFD27A', 0.5);
      this.screenFlash(0.3, '#FFD9A0');
      this.after(0.12, () => this.impact(to, e));
    } else if (e.card === 'boarding') {
      // 군사작전: 강습정 몇 척이 건너가 달라붙음
      for (let i = 0; i < 5; i++) {
        this.shots.push({ kind: 'pellet', x0: a.x, y0: a.y + rand(-10, 10), x1: b.x + rand(-30, 30), y1: b.y + rand(-14, 14), t: 0, dur: rand(0.35, 0.5), color: '#9FE870', trail: [], fade: miss });
      }
      this.after(0.5, () => {
        if (miss) return this.effLabel(to, 0);
        const p = this.pos(to);
        this.text(p.x, p.y - 40, '강습! 보호막 무시', '#9FE870', 15);
        this.impact(to, e);
      });
    } else if (e.card === 'ram') {
      const S = this.ships[from];
      this.tween(0.5, (k) => { S.lunge = Math.sin(k * Math.PI) * 60; });
      this.after(0.25, () => {
        if (!miss) { this.impact(to, e); if (e.self) this.impact(from, Object.assign({ eff: 1 }, e.self), false); }
        else this.effLabel(to, 0);
      });
    }
  },

  // 초고열 응집 충전 시작: 함선 둘레에 빛이 모임
  animChargeStart(e) {
    const p = this.pos(e.from);
    this.flash(p.x, p.y, 80, '#FFC24A', 0.6);
    this.ring(p.x, p.y, 70, '#FFC24A', 0.7);
    this.text(p.x, p.y + 70, `초고열 응집 — ${e.turns}턴 뒤 발사`, '#FFC24A', 14);
  },

  animTorpLaunch(e) {
    const t = { owner: e.from, frac: 0, wob: Math.random() * 6, trailT: 0 };
    this.torps.push(t);
    const a = this.nose(e.from);
    this.flash(a.x, a.y, 20, COL[e.from], 0.2);
    this.smoke(a.x, a.y, 3, 8, 1);
    this.tween(0.7, (k) => { t.frac = 0.38 * ease(k); });
    this.text(this.pos(e.from).x, this.pos(e.from).y + 70, '어뢰 발사 — 다음 턴 도착', COL[e.from], 13);
  },

  animTorpArrive(e) {
    let t = this.torps.find((x) => x.owner === e.from && !x.going);
    if (!t) { t = { owner: e.from, frac: 0.38, wob: 0, trailT: 0 }; this.torps.push(t); }
    t.going = true;
    const to = this.other(e.from);
    const end = e.intercepted ? 0.72 : e.dmg ? 1 : 1.35;
    const f0 = t.frac;
    this.tween(0.6, (k) => { t.frac = lerp(f0, end, k); }, () => {
      this.torps = this.torps.filter((x) => x !== t);
      const p = this.torpPos(t);
      if (e.intercepted) {
        const n = this.nose(to);
        for (let i = 0; i < 4; i++) this.after(i * 0.05, () => this.beams.push({ kind: 'pd', x0: n.x, y0: n.y + rand(-8, 8), x1: p.x, y1: p.y, color: '#9DB8FF', life: 0.12, max: 0.12 }));
        this.after(0.2, () => { this.flash(p.x, p.y, 40, '#BFD2FF', 0.3); this.spark(p.x, p.y, '#BFD2FF', 16, 220, 0.5); this.smoke(p.x, p.y, 4, 8); this.text(p.x, p.y - 20, '요격', '#9DB8FF', 15); });
      } else if (!e.dmg) {
        this.effLabel(to, 0);
      } else {
        this.impact(to, e);
      }
    });
  },

  torpPos(t) {
    const a = this.nose(t.owner), b = this.pos(this.other(t.owner));
    return { x: lerp(a.x, b.x, t.frac), y: lerp(a.y, b.y, t.frac) + Math.sin(t.frac * 7 + t.wob) * 18 * (1 - Math.abs(t.frac - 0.5)) };
  },

  vent(side) {
    const p = this.pos(side), bx = p.x + (side === 'player' ? -70 : 70);
    this.smoke(bx, p.y - 16, 6, 9, 1.2);
    this.text(p.x, p.y + 88, '오버드라이브 — 과열', '#FF7A3A', 13);
  },

  animMeltdown(side) {
    const p = this.pos(side);
    this.setStat(side, DATA.rules.meltdownDamage);
    for (let i = 0; i < 5; i++) this.after(i * 0.12, () => { const x = p.x + rand(-60, 60), y = p.y + rand(-16, 16); this.flash(x, y, 50, '#FF7A3A', 0.4); this.spark(x, y, '#FF7A3A', 18, 300, 0.7); this.smoke(x, y, 5, 14); });
    this.text(p.x, p.y - 110, 'MELTDOWN', '#FF5A5F', 26, 2);
    this.shake = 12;
    this.camFocus(side, 1.18);
    this.screenFlash(0.25, '#FF7A3A');
  },

  destroy(side) {
    const S = this.ships[side];
    const p = this.pos(side);
    this.cine = 1;
    this.camFocus(side, 1.35, 0.6);
    this.slowmo(1.3);
    for (let i = 0; i < 9; i++) {
      this.after(i * 0.14, () => {
        const x = p.x + rand(-80, 80), y = p.y + rand(-22, 22);
        this.flash(x, y, rand(50, 110), '#FFD29A', 0.5);
        this.spark(x, y, '#FFB547', 24, 380, 0.9);
        this.debris(x, y, 6);
        this.smoke(x, y, 6, 16, 2.2);
        this.shake = 14;
      });
    }
    this.after(1.1, () => { S.dead = true; this.flash(p.x, p.y, 220, '#FFFFFF', 0.6); this.ring(p.x, p.y, 260, '#FFB547', 0.9); this.debris(p.x, p.y, 30); this.streak(p.x, p.y, 700, '#FFE0B0', 0.8); this.screenFlash(0.7, '#FFF1DC'); });
  },

  // 전투 상태에서 보이는 값 맞추기 (턴 시작 등)
  sync(B) {
    this.skin.enemy = Art.design[B.enemy.key] ? B.enemy.key : 'vex';
    for (const side of ['player', 'enemy']) {
      const s = B[side], v = this.ships[side];
      v.heat = s.heat;
      v.hull = s.hull / s.maxHull;
      v.shieldOn = s.shield > 0 ? 1 : 0;
      v.shieldAmt = s.shield;
      v.hp = s.hull; v.max = s.maxHull; v.sh = s.shield;
      if (!(v.trail >= v.hp)) v.trail = v.hp;
      if (!s.shield) v.pd = 0;
    }
  },

  // ── 매 프레임 ────────────────────────────
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;
    this.update(dt);
    this.draw();
    if (this.onFrame) this.onFrame();          // 화면(ui.js): 함선에 붙은 상태 표시 위치 맞추기
    requestAnimationFrame((t) => this.loop(t));
  },

  // dtReal = 실제로 흐른 시간. 슬로모션 중엔 게임 시간이 느리게 흐름
  update(dtReal) {
    this.real += dtReal;
    const dt = dtReal * (this.real < this.slowUntil ? 0.3 : 1);
    this.time += dt;
    // 카메라 · 레터박스 · 번쩍임은 실제 시간으로 부드럽게
    const ck = 1 - Math.exp(-4.5 * dtReal);
    for (const k of ['x', 'y', 'z']) this.cam[k] += (this.camT[k] - this.cam[k]) * ck;
    this.cineK += (this.cine - this.cineK) * (1 - Math.exp(-6 * dtReal));
    this.rangeK += ((this.aim || this.rangeHover ? 1 : 0) - this.rangeK) * (1 - Math.exp(-12 * dtReal));
    this.updateScope(dtReal);
    this.sflash.a *= Math.exp(-7 * dtReal);
    const due = this.timers.filter((x) => x.at <= this.time);
    this.timers = this.timers.filter((x) => x.at > this.time);
    for (const x of due) x.fn();
    for (const tw of this.tweens) {
      const k = Math.min(1, (this.time - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) { tw.over = true; if (tw.done) tw.done(); }
    }
    this.tweens = this.tweens.filter((x) => !x.over);

    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      const drag = p.type === 'smoke' ? 0.5 : 2;
      p.vx *= Math.exp(-drag * dt); p.vy *= Math.exp(-drag * dt);
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) { t.y -= 24 * dt; t.life -= dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
    for (const s of this.shots) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      s.x = lerp(s.x0, s.x1, k); s.y = lerp(s.y0, s.y1, k);
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 8) s.trail.shift();
      if (k >= 1) { s.done = true; if (s.onHit) s.onHit(); }
    }
    this.shots = this.shots.filter((s) => !s.done);
    for (const t of this.torps) {
      t.trailT -= dt;
      if (t.trailT <= 0) { t.trailT = 0.05; const p = this.torpPos(t); this.parts.push({ type: 'smoke', x: p.x, y: p.y, vx: rand(-6, 6), vy: rand(-6, 6), life: 0.6, max: 0.6, size: 4 }); }
    }
    for (const side of ['player', 'enemy']) {
      const s = this.ships[side];
      s.shieldFlash = Math.max(0, s.shieldFlash - dt * 2.5);
      s.plateFlash = Math.max(0, s.plateFlash - dt * 3);
      if (s.trailWait > 0) s.trailWait -= dt;
      else if (s.trail > s.hp) s.trail = Math.max(s.hp, s.trail - Math.max(8, (s.trail - s.hp) * 3) * dt);
      s.hullFlash = Math.max(0, s.hullFlash - dt);
      s.kick *= Math.exp(-10 * dt);
      if (s.dead) continue;
      // 손상된 선체: 연기 · 불똥
      s.smokeT -= dt;
      if (s.hull < 0.5 && s.smokeT <= 0) {
        s.smokeT = s.hull < 0.25 ? 0.08 : 0.2;
        const p = this.pos(side);
        const x = p.x + rand(-50, 40), y = p.y + rand(-10, 8);
        this.parts.push({ type: 'smoke', x, y, vx: rand(-10, 10), vy: rand(-22, -8), life: 1.4, max: 1.4, size: rand(6, 11) });
        if (s.hull < 0.25) this.parts.push({ type: 'spark', x, y, vx: rand(-40, 40), vy: rand(-60, -10), life: 0.5, max: 0.5, color: '#FF7A3A', size: 1.6 });
      }
    }
    this.shake *= Math.exp(-6 * dt);
    this.measure();
  },

  // ── 그리기 ───────────────────────────────
  draw() {
    const g = this.g, W = this.W, H = this.H;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.mode === 'title' || this.mode === 'cruise') { this.drawTitle(g, W, H); return; }
    const sx = this.shake > 0.3 ? rand(-this.shake, this.shake) : 0, sy = this.shake > 0.3 ? rand(-this.shake, this.shake) : 0;
    g.translate(sx * 0.4, sy * 0.4);
    this.drawSpace(g, W, H);
    // 월드 (카메라 적용)
    const c = this.center(), z = this.z0 * this.cam.z;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.translate(c.x + sx, c.y + sy);
    g.scale(z, z);
    g.translate(-c.x - this.cam.x, -c.y - this.cam.y);
    this.drawWorld(g, true);
    // 조준선 (방어 · 기동 카드) · 저격 조준경 (무기)
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawAim(g);
    this.drawHoverRange(g);
    this.drawScope(g, W, H);
    this.drawLockFx(g);
    // 화면 앞쪽
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawFront(g, W, H);
  },

  drawWorld(g, plates) {
    this.drawRange(g);
    g.globalAlpha = 1;
    for (const t of this.torps) this.drawTorp(g, t);
    this.drawShip(g, 'enemy');
    this.drawShip(g, 'player');
    this.drawFx(g);
    g.globalAlpha = 1;
    // 선체 · 열 · 상태 · 계획한 카드 표식은 HTML로 함선에 붙임 (ui.js shipStat)
  },

  // ── 저격 조준경 ───────────────────────────
  // 켜지는 때: 무기 카드를 끌고 있을 때 · 적 함선에 마우스를 올렸을 때
  scopeOn() { return !!(this.aim && this.aim.type === 'weapon'); },
  updateScope(dt) {
    const S = this.scope, on = this.scopeOn();
    S.k += ((on ? 1 : 0) - S.k) * (1 - Math.exp(-(on ? 14 : 26) * dt));   // 놓으면 빨리 꺼짐
    if (!on && S.k < 0.01) { S.init = false; return; }
    let tx = this.mouse.x, ty = this.mouse.y;
    // 적 위에 있으면 조준경이 적 쪽으로 살짝 끌려감 (조준 보정)
    const lock = this.aim ? this.aim.target === 'enemy' : false;
    S.lock += ((lock ? 1 : 0) - S.lock) * (1 - Math.exp(-10 * dt));
    if (lock) {
      const e = this.toScreen(this.pos('enemy').x, this.pos('enemy').y);
      tx += (e.x - tx) * 0.4; ty += (e.y - ty) * 0.4;
    }
    // 숨 쉬듯 흔들림 (열이 높을수록 더)
    const amp = 1.2 + (this.ships.player.heat || 0) / 22;
    tx += Math.sin(this.real * 1.3) * amp + Math.sin(this.real * 3.7) * amp * 0.3;
    ty += Math.cos(this.real * 1.7) * amp * 0.8;
    if (!S.init) { S.x = tx; S.y = ty; S.init = true; }
    const f = 1 - Math.exp(-16 * dt);
    S.x += (tx - S.x) * f; S.y += (ty - S.y) * f;
  },

  drawScope(g, W, H) {
    const S = this.scope;
    if (S.k < 0.01) return;
    const k = S.k, R = 128 * (0.85 + 0.15 * k), x = S.x, y = S.y;
    const weapon = this.aim && this.aim.type === 'weapon' ? this.aim : null;
    const info = weapon && weapon.info;
    const lockCol = info && S.lock > 0.5 ? info.color : '#FFB547';
    g.save();
    // 1) 바깥 어둡게
    g.globalAlpha = k;
    g.fillStyle = `rgba(0,0,0,${weapon ? 0.55 : 0.35})`;
    g.beginPath(); g.rect(0, 0, W, H); g.arc(x, y, R, 0, 6.2832, true); g.fill('evenodd');
    // 2) 렌즈 안: 확대된 세상
    g.save();
    g.beginPath(); g.arc(x, y, R, 0, 6.2832); g.clip();
    this.drawSpace(g, W, H);
    const c = this.center(), z = this.z0 * this.cam.z, mag = 1.4;   // 조준경 배율
    const wx = c.x + this.cam.x + (x - c.x) / z, wy = c.y + this.cam.y + (y - c.y) / z;
    g.translate(x, y); g.scale(z * mag, z * mag); g.translate(-wx, -wy);
    this.drawWorld(g, false);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 렌즈 색 · 가장자리 어둠
    const lens = g.createRadialGradient(x, y, R * 0.55, x, y, R);
    lens.addColorStop(0, 'rgba(40,80,70,0.08)'); lens.addColorStop(0.85, 'rgba(0,0,0,0.35)'); lens.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = lens; g.fillRect(x - R, y - R, R * 2, R * 2);
    // 3) 십자선 (굵은 기둥 + 가는 선 + 밀 도트)
    g.strokeStyle = lockCol; g.fillStyle = lockCol;
    g.shadowColor = lockCol; g.shadowBlur = 6;
    g.globalAlpha = k * 0.95;
    g.lineWidth = 4;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.beginPath(); g.moveTo(x + dx * R, y + dy * R); g.lineTo(x + dx * R * 0.42, y + dy * R * 0.42); g.stroke();
    }
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x - R * 0.42, y); g.lineTo(x + R * 0.42, y); g.moveTo(x, y - R * 0.42); g.lineTo(x, y + R * 0.42); g.stroke();
    for (let i = -3; i <= 3; i++) {
      if (!i) continue;
      const d = i * R * 0.12;
      g.beginPath(); g.arc(x + d, y, 1.8, 0, 6.28); g.arc(x, y + d, 1.8, 0, 6.28); g.fill();
    }
    // 가운데 점 (잠기면 커지고 빨갛게 빛남)
    g.fillStyle = S.lock > 0.5 ? '#FF3B3B' : lockCol;
    g.shadowColor = '#FF3B3B'; g.shadowBlur = S.lock > 0.5 ? 12 : 0;
    g.beginPath(); g.arc(x, y, 2 + S.lock * 1.5, 0, 6.28); g.fill();
    g.shadowBlur = 0;
    g.restore();
    // 4) 거리계 레이저선 (렌즈 위로, 조준경 가운데까지)
    const measured = this.drawRangeLine(g, x, y, R, weapon);
    // 5) 테두리 (금속 링) · 렌즈 반사
    g.globalAlpha = k;
    const rim = g.createLinearGradient(x - R, y - R, x + R, y + R);
    rim.addColorStop(0, '#3A4150'); rim.addColorStop(0.5, '#0B0E14'); rim.addColorStop(1, '#262B36');
    g.strokeStyle = rim; g.lineWidth = 14;
    g.beginPath(); g.arc(x, y, R + 7, 0, 6.28); g.stroke();
    g.strokeStyle = S.lock > 0.5 ? lockCol : 'rgba(255,181,71,0.5)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, R + 1, 0, 6.28); g.stroke();
    // 테두리 눈금 (돌아가는 다이얼 — 거리에 따라 회전)
    g.strokeStyle = 'rgba(200,210,230,0.45)'; g.lineWidth = 1;
    const rot = this.dist / 2000 * Math.PI;
    for (let i = 0; i < 48; i++) {
      const a = rot + i * Math.PI / 24, l = i % 6 === 0 ? 7 : 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * (R + 14), y + Math.sin(a) * (R + 14)); g.lineTo(x + Math.cos(a) * (R + 14 - l), y + Math.sin(a) * (R + 14 - l)); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 6;
    g.beginPath(); g.arc(x, y, R - 12, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
    // 6) 거리계 · 예상 피해 (조준경 옆, 화면 가운데 쪽)
    const left = x > W * 0.55;
    const tx = left ? x - R - 24 : x + R + 24;
    g.textAlign = left ? 'right' : 'left'; g.textBaseline = 'alphabetic';
    const line = (txt, yy, font, col) => { g.font = font; g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(txt, tx, yy); g.fillStyle = col; g.fillText(txt, tx, yy); };
    const now = S.lock > 0.5 ? Math.round(this.dist / 100) * 100 : measured;
    const after = this.ghost !== null && this.ghost !== undefined ? this.ghost : null;
    line('RANGE', y + 34, "700 11px Consolas, monospace", 'rgba(255,181,71,0.7)');
    line(now.toLocaleString() + 'km', y + 62, "900 30px Consolas, monospace", '#FFB547');
    line(bandOf(now) + (after !== null ? `  →  이동 후 ${after.toLocaleString()}km` : ''), y + 82, "700 12px 'Malgun Gothic', sans-serif", after !== null ? '#5CE1E6' : 'rgba(230,237,247,0.75)');
    if (info) {
      line(S.lock > 0.5 ? info.text : `${DATA.cards[weapon.id].name} — 적 함선에 조준`, y + 108, "900 16px 'Malgun Gothic', sans-serif", S.lock > 0.5 ? info.color : 'rgba(230,237,247,0.8)');
      if (S.lock > 0.5 && info.sub) line(info.sub, y + 126, "700 11px 'Malgun Gothic', sans-serif", 'rgba(230,237,247,0.7)');
    }
    if (S.lock > 0.5) line(weapon ? '■ LOCK' : '■ TARGET', y + 20, "900 12px Consolas, monospace", weapon ? lockCol : 'rgba(255,90,95,0.9)');
    g.restore();
  },

  // 카드 없이 적 위에 마우스: 스코프 없이 거리만 (레이저선 + 숫자)
  drawHoverRange(g) {
    const k = this.rangeK * (this.aim ? 0 : 1) * (1 - this.cineK);
    if (k < 0.01) return;
    const t = this.toScreen(this.nose('enemy').x, this.nose('enemy').y);
    this.drawRangeLine(g, t.x, t.y, 0, null, k, 1);
    const src = this.toScreen(this.nose('player').x, this.nose('player').y);
    const mx = (src.x + t.x) / 2, my = (src.y + t.y) / 2 - 30;
    const d = Math.round(this.dist / 100) * 100;
    g.save();
    g.globalAlpha = k;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = "900 26px Consolas, monospace";
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(d.toLocaleString() + 'km', mx, my);
    g.fillStyle = '#FFB547'; g.shadowColor = 'rgba(255,181,71,0.6)'; g.shadowBlur = 12;
    g.fillText(d.toLocaleString() + 'km', mx, my);
    g.shadowBlur = 0;
    g.font = "700 12px 'Malgun Gothic', sans-serif";
    g.strokeText(bandOf(d), mx, my + 17);
    g.fillStyle = 'rgba(230,237,247,0.8)';
    g.fillText(bandOf(d), mx, my + 17);
    g.restore();
  },

  // 조준 확정: 틀이 크게 → 함선 크기로 조여 들어오며 TARGET LOCKED
  lockOn(side, text, color) { this.lockFx = { side, t0: this.real, text, color }; },
  drawLockFx(g) {
    const L = this.lockFx;
    if (!L) return;
    const t = (this.real - L.t0) / 0.75;
    if (t >= 1) { this.lockFx = null; return; }
    const z = this.z0 * this.cam.z, p = this.toScreen(this.pos(L.side).x, this.pos(L.side).y);
    const snap = 1 - Math.pow(1 - Math.min(1, t * 2.4), 3);
    const sc = 1.9 - 0.9 * snap;
    const a = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    const w = 112 * z * sc, h = 54 * z * sc, Lc = 22 * z;
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = L.color; g.lineWidth = 3; g.shadowColor = L.color; g.shadowBlur = 16;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.beginPath(); g.moveTo(p.x + sx * w, p.y + sy * h - sy * Lc); g.lineTo(p.x + sx * w, p.y + sy * h); g.lineTo(p.x + sx * w - sx * Lc, p.y + sy * h); g.stroke();
    }
    if (snap > 0.95) {   // 조여진 순간 번쩍
      g.globalAlpha = a * 0.14;
      g.fillStyle = L.color;
      g.fillRect(p.x - w, p.y - h, w * 2, h * 2);
      g.globalAlpha = a;
    }
    g.shadowBlur = 0;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "900 14px Consolas, monospace";
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(L.text, p.x, p.y + h + 40);      // 함선 아래 (체력판 · 표식과 안 겹치게)
    g.fillStyle = L.color;
    g.fillText(L.text, p.x, p.y + h + 40);
    g.restore();
  },

  // 계획한 카드 표식: 적 위 = 노리는 무기, 내 위 = 방어 · 기동
  drawAssign(g) {
    const A = this.assign;
    if (!A) return;
    for (const side of ['enemy', 'player']) {
      const list = A[side];
      if (!list || !list.length || this.ships[side].dead) continue;
      const p = this.pos(side);
      const txt = (side === 'enemy' ? '◎ ' : '▣ ') + list.join(' · ');
      g.save();
      g.font = "900 12px 'Malgun Gothic', sans-serif";
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = g.measureText(txt).width + 16, x = p.x + (side === 'player' ? -10 : 10), y = p.y - 112;   // 함선 위 (선체 막대보다 위)
      const col = side === 'enemy' ? '#FF5A5F' : '#5CE1E6';
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 4);
      g.fillStyle = 'rgba(4,7,14,0.8)';
      g.fillRect(x - w / 2, y - 10, w, 20);
      g.strokeStyle = col; g.globalAlpha = pulse; g.lineWidth = 1.2;
      g.strokeRect(x - w / 2, y - 10, w, 20);
      g.globalAlpha = 1;
      g.fillStyle = side === 'enemy' ? '#FFB3B5' : '#BFF6F8';
      g.fillText(txt, x, y + 0.5);
      g.restore();
    }
  },

  // 거리계 레이저선: 내 함선 뱃머리 → 조준경 가운데. 100km마다 눈금, 500km마다 숫자.
  // 들고 있는 무기가 강한 구간은 선 밑에 초록, 약한 구간은 주황. 돌려주는 값 = 선으로 잰 거리
  drawRangeLine(g, x, y, R, weapon, alpha = this.scope.k, lockF = this.scope.lock) {
    const z = this.z0 * this.cam.z;
    const src = this.toScreen(this.nose('player').x, this.nose('player').y);
    const dx = x - src.x, dy = y - src.y, L = Math.hypot(dx, dy);
    if (L < 20) return 0;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    // 100km = 몇 픽셀. 적에게 잠기면 조준경 가운데가 정확히 실제 거리가 되도록 맞춤
    const free = ((this.sep(DATA.rules.maxDistance) - this.sep(0)) / (DATA.rules.maxDistance / 100)) * z;
    const locked = this.dist >= 100 ? L / (this.dist / 100) : free;
    const per100 = free + (locked - free) * lockF;
    const end = L;                                  // 조준경 가운데까지
    const P = (m) => ({ x: src.x + ux * (m / 100) * per100, y: src.y + uy * (m / 100) * per100 });
    const maxM = Math.min(DATA.rules.maxDistance, Math.floor((end / per100) * 100));
    const k = alpha;
    g.save();
    g.globalAlpha = k;
    // 무기 구간 (선 밑 띠)
    const hc = weapon && DATA.cards[weapon.id];
    if (hc && hc.dmg) {
      const max = Math.max(...hc.dmg.map((q) => q[1]));
      g.lineWidth = 7; g.lineCap = 'butt';
      for (let m = 0; m < maxM; m += 100) {
        const v = dmgAt(hc, m + 100) / max;
        if (!v) continue;
        g.strokeStyle = v >= 0.9 ? 'rgba(124,255,155,0.75)' : `rgba(255,181,71,${0.2 + 0.45 * v})`;
        const a = P(m), b = P(Math.min(maxM, m + 100));
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
    // 레이저선
    g.strokeStyle = '#FF4D4D'; g.lineWidth = 1.6;
    g.shadowColor = '#FF4D4D'; g.shadowBlur = 8;
    g.beginPath(); g.moveTo(src.x, src.y); g.lineTo(src.x + ux * end, src.y + uy * end); g.stroke();
    g.shadowBlur = 0;
    // 눈금
    g.font = "700 10px Consolas, monospace"; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let m = 100; m <= maxM; m += 100) {
      const q = P(m), major = m % 500 === 0, l = major ? 12 : 7;
      g.strokeStyle = major ? '#FFFFFF' : 'rgba(255,170,170,0.95)';
      g.lineWidth = major ? 2 : 1.5;
      g.beginPath(); g.moveTo(q.x - nx * l, q.y - ny * l); g.lineTo(q.x + nx * l, q.y + ny * l); g.stroke();
      if (major) {
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.strokeText(m / 100, q.x + nx * 20, q.y + ny * 20);
        g.fillStyle = 'rgba(255,230,230,0.95)';
        g.fillText(m / 100, q.x + nx * 20, q.y + ny * 20);
      }
    }
    // 내 이동 후 적 위치 (청록 ◆)
    if (this.ghost !== null && this.ghost !== undefined && this.ghost <= maxM && Math.round(this.ghost) !== Math.round(this.dist)) {
      const q = P(this.ghost);
      g.fillStyle = '#5CE1E6'; g.shadowColor = '#5CE1E6'; g.shadowBlur = 8;
      g.beginPath(); g.moveTo(q.x, q.y - 6); g.lineTo(q.x + 6, q.y); g.lineTo(q.x, q.y + 6); g.lineTo(q.x - 6, q.y); g.closePath(); g.fill();
      g.shadowBlur = 0;
    }
    g.restore();
    return Math.min(DATA.rules.maxDistance, Math.round((L / per100)) * 100);
  },

  // 조준경 안의 거리 자 (지금은 안 씀)
  drawScopeRuler(g, cx, y, w, weapon) {
    const x0 = cx - w / 2, px = (m) => x0 + (m / DATA.rules.maxDistance) * w;
    const hc = weapon && DATA.cards[weapon.id];
    g.save();
    g.shadowBlur = 0;
    g.globalAlpha = 0.9 * this.scope.k;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(x0 - 6, y - 12, w + 12, 30);
    if (hc && hc.dmg) {
      const max = Math.max(...hc.dmg.map((q) => q[1]));
      for (let m = 0; m < DATA.rules.maxDistance; m += 100) {
        const v = dmgAt(hc, m + 50) / max;
        if (!v) continue;
        g.fillStyle = v >= 0.9 ? `rgba(124,255,155,0.85)` : `rgba(255,181,71,${0.25 + 0.5 * v})`;
        g.fillRect(px(m) + 0.5, y - 4, px(m + 100) - px(m) - 1, 8);
      }
    }
    g.strokeStyle = 'rgba(230,237,247,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke();
    g.font = "9px Consolas, monospace"; g.textAlign = 'center'; g.fillStyle = 'rgba(230,237,247,0.7)';
    for (let m = 0; m <= DATA.rules.maxDistance; m += 100) {
      const major = m % 500 === 0;
      g.beginPath(); g.moveTo(px(m), y - (major ? 6 : 3)); g.lineTo(px(m), y + (major ? 6 : 3)); g.stroke();
      if (major) g.fillText(m / 100, px(m), y + 15);
    }
    // 지금 거리 ▼ (호박) · 이동 후 ▲ (청록)
    const mark = (m, col, up) => {
      const X = px(m);
      g.fillStyle = col;
      g.beginPath();
      if (up) { g.moveTo(X, y + 3); g.lineTo(X - 5, y + 11); g.lineTo(X + 5, y + 11); }
      else { g.moveTo(X, y - 3); g.lineTo(X - 5, y - 11); g.lineTo(X + 5, y - 11); }
      g.fill();
    };
    mark(this.dist, '#FFB547', false);
    if (this.ghost !== null && this.ghost !== undefined && this.ghost !== Math.round(this.dist)) mark(this.ghost, '#5CE1E6', true);
    g.restore();
  },

  // ── 메인 화면: 크게 떠 가는 내 함선 · 멀리 적 · 주기적으로 쏘는 거리계 ──
  drawTitle(g, W, H) {
    const t = this.time;
    this.drawSpace(g, W, H);
    // 먼 적 (작게, 흐리게)
    const es = Math.max(0.4, Math.min(0.7, H / 1300));
    const ex = W * 0.86 + Math.sin(t * 0.21) * 8, ey = H * 0.3 + Math.sin(t * 0.5) * 4;
    // 가까운 내 함선 (크게)
    const ps = Math.max(1.4, Math.min(2.6, H / 360));
    const px = W * 0.6 + Math.sin(t * 0.13) * 24, py = H * 0.62 + Math.sin(t * 0.55) * 7;
    this.ships.player.flame = 0.55 + 0.1 * Math.sin(t * 2);
    this.ships.enemy.flame = 0.3;
    this.posOverride = { player: { x: 0, y: 0 }, enemy: { x: 0, y: 0 } };
    const cruise = this.mode === 'cruise';
    if (!cruise) { g.save(); g.translate(ex, ey); g.scale(es, es); g.globalAlpha = 0.85; this.drawShip(g, 'enemy'); g.restore(); }
    g.save(); g.translate(cruise ? W * 0.72 : px, cruise ? H * 0.7 : py); g.scale(cruise ? ps * 0.8 : ps, cruise ? ps * 0.8 : ps); this.drawShip(g, 'player'); g.restore();
    this.posOverride = null;
    if (cruise) { this.drawFront(g, W, H); return; }
    // 거리계 레이저: 6초마다 쏘아 1,200km를 잼
    const cyc = t % 6, grow = Math.min(1, cyc / 1.1), fade = cyc < 4.4 ? 1 : Math.max(0, 1 - (cyc - 4.4) / 0.8);
    if (fade > 0) {
      const ax = px + 82 * ps, ay = py - 1 * ps, bx = ex - 78 * es, by = ey;
      const cx = ax + (bx - ax) * grow, cy = ay + (by - ay) * grow;
      const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux;
      g.save();
      g.globalAlpha = fade;
      g.strokeStyle = '#FF4D4D'; g.lineWidth = 1.6; g.shadowColor = '#FF4D4D'; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(cx, cy); g.stroke();
      g.shadowBlur = 0;
      g.font = "700 10px Consolas, monospace"; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let m = 1; m <= 12; m++) {
        const f = m / 12;
        if (f > grow) break;
        const qx = ax + (bx - ax) * f, qy = ay + (by - ay) * f, big = m % 5 === 0, l = big ? 10 : 5;
        g.strokeStyle = big ? '#FFFFFF' : 'rgba(255,170,170,0.9)'; g.lineWidth = big ? 1.8 : 1.2;
        g.beginPath(); g.moveTo(qx - nx * l, qy - ny * l); g.lineTo(qx + nx * l, qy + ny * l); g.stroke();
        if (big) { g.fillStyle = '#FFE6E6'; g.fillText(m, qx + nx * 18, qy + ny * 18); }
      }
      if (grow >= 1) {
        const k = Math.min(1, (cyc - 1.1) / 0.3);
        g.globalAlpha = fade * k;
        const mx = (ax + bx) / 2 - nx * 34, my = (ay + by) / 2 - ny * 34;
        g.font = "900 26px Consolas, monospace";
        g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.strokeText('1,200km', mx, my);
        g.fillStyle = '#FFB547'; g.shadowColor = 'rgba(255,181,71,0.7)'; g.shadowBlur = 14;
        g.fillText('1,200km', mx, my);
        g.shadowBlur = 0;
        // 적에 조준 틀
        g.strokeStyle = 'rgba(255,90,95,0.9)'; g.lineWidth = 2;
        const w = 110 * es, h = 52 * es, c = 10;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          g.beginPath(); g.moveTo(ex + sx * w, ey + sy * h - sy * c); g.lineTo(ex + sx * w, ey + sy * h); g.lineTo(ex + sx * w - sx * c, ey + sy * h); g.stroke();
        }
      }
      g.restore();
    }
    this.drawFront(g, W, H);
  },

  // 가까운 먼지 · 화면 번쩍임 · 레터박스 · 필름 입자
  drawFront(g, W, H) {
    const z = this.z0 * this.cam.z;
    // 안개 성운: 카메라 앞을 흐르는 먼지 띠
    if (this.theme === 'fog') {
      g.save();
      g.globalCompositeOperation = 'screen';
      for (let k = 0; k < 2; k++) {
        const sp = [0.018, 0.03][k], off = (((this.time * sp + k * 0.37) % 1) + 1) % 1;
        g.globalAlpha = [0.22, 0.16][k];
        const x = -off * W * 1.6 - this.cam.x * z * (0.9 + k * 0.4);
        g.drawImage(Art.nebula, x, H * (0.1 + k * 0.35), W * 1.6, H * 0.7);
        g.drawImage(Art.nebula, x + W * 1.6, H * (0.1 + k * 0.35), W * 1.6, H * 0.7);
      }
      g.restore();
    }
    g.fillStyle = '#C8D6F0';
    for (const d of this.dust) {
      const x = (((d.x - this.time * 0.012 * d.z) % 1 + 1) % 1) * (W + 200) - 100 - this.cam.x * z * d.z * 0.8;
      const y = d.y * H - this.cam.y * z * d.z * 0.8;
      g.globalAlpha = 0.1 + 0.18 * (d.z - 0.5);
      g.fillRect(x, y, d.r * d.z * 4, d.r * 0.6);
    }
    g.globalAlpha = 1;
    if (this.sflash.a > 0.01) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = this.sflash.a;
      g.fillStyle = this.sflash.color;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    // 레터박스
    const bh = H * 0.075 * this.cineK;
    if (bh > 0.5) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, bh);
      g.fillRect(0, H - bh, W, bh);
    }
    // 필름 입자
    g.globalAlpha = 0.5;
    g.save();
    g.translate(Math.floor(rand(0, 180)), Math.floor(rand(0, 180)));
    g.fillStyle = g.createPattern(this.grain, 'repeat');
    g.fillRect(-180, -180, W + 360, H + 360);
    g.restore();
    g.globalAlpha = 1;
  },

  drawSpace(g, W, H) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#03040B'); bg.addColorStop(1, '#070A16');
    g.fillStyle = bg;
    g.fillRect(-20, -20, W + 40, H + 40);
    // 먼 별빛 (태양)
    const sun = g.createRadialGradient(W * 0.88, H * 0.12, 0, W * 0.88, H * 0.12, H * 0.9);
    sun.addColorStop(0, 'rgba(255, 220, 170, 0.22)'); sun.addColorStop(0.3, 'rgba(255, 170, 120, 0.06)'); sun.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    // 카메라가 움직이면 배경은 조금만 (시차)
    g.save();
    g.translate(-this.cam.x * 0.08, -this.cam.y * 0.08);
    // 성운 (천천히 흐름)
    const nx = -((this.time * 3) % (W * 0.3));
    g.globalAlpha = 0.85;
    g.drawImage(Art.nebula, nx - W * 0.1, -H * 0.1, W * 1.5, H * 1.25);
    const fog = this.theme === 'fog';
    if (fog) {
      // 안개 성운: 성운을 한 겹 더, 전체를 보랏빛 · 청록 먼지로
      g.globalAlpha = 0.75;
      g.drawImage(Art.nebula, -nx * 0.6 - W * 0.3, -H * 0.3, W * 1.8, H * 1.6);
      g.globalAlpha = 1;
      const haze = g.createLinearGradient(0, 0, W, H);
      haze.addColorStop(0, 'rgba(90,60,140,0.28)'); haze.addColorStop(0.5, 'rgba(40,90,110,0.22)'); haze.addColorStop(1, 'rgba(110,70,130,0.3)');
      g.fillStyle = haze; g.fillRect(0, 0, W, H);
    }
    g.globalAlpha = 1;
    // 별 3층 (가까울수록 빨리 흐름)
    for (const s of this.stars) {
      const speed = [0.002, 0.005, 0.012][s.layer];
      const x = ((s.x - this.time * speed) % 1 + 1) % 1 * W, y = s.y * H;
      const tw = 0.6 + 0.4 * Math.sin(this.time * 2 + s.tw);
      g.globalAlpha = s.b * tw * (fog ? 0.35 : 1);
      g.fillStyle = s.c;
      g.beginPath(); g.arc(x, y, s.r, 0, 6.28); g.fill();
      if (s.layer === 2 && s.b > 0.8) { g.globalAlpha = 0.15 * tw; g.fillRect(x - 5, y - 0.5, 10, 1); g.fillRect(x - 0.5, y - 5, 1, 10); }
    }
    g.globalAlpha = 1;
    // 행성 (왼쪽 아래, 대기 빛 테두리)
    const F = this.field, px = F.x + F.w * 0.06, py = F.y + F.h * 1.2, pr = F.h * 0.8;
    g.drawImage(Art.planet, px - pr, py - pr, pr * 2, pr * 2);
    const atm = g.createRadialGradient(px, py, pr * 0.96, px, py, pr * 1.12);
    atm.addColorStop(0, 'rgba(120, 200, 255, 0.35)'); atm.addColorStop(1, 'rgba(120, 200, 255, 0)');
    g.fillStyle = atm;
    g.beginPath(); g.arc(px, py, pr * 1.12, 0, 6.28); g.fill();
    g.restore();
    // 가장자리 어둡게
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = vg;
    g.fillRect(-20, -20, W + 40, H + 40);
  },

  // ── 측정선: 두 함선 사이 100km 눈금 + 거리 숫자 + 무기 사거리 구간 + 적 예상 위치 ──
  // 내가 제자리일 때 적이 거리 m에 있으면 그 적의 뱃머리 x
  axisX(m) { return this.nose('enemy').x + (this.sep(m) - this.sep(this.dist)); },

  drawRange(g) {
    const P = this.pos('player'), E = this.pos('enemy');
    const y = (P.y + E.y) / 2 + 64;
    const x0 = this.axisX(0), x1 = this.nose('enemy').x;
    g.save();
    const k = this.rangeK;
    if (this.legacyRuler && k > 0.01) {      // 예전 줄자 — 이제 조준경이 대신 (legacyRuler = true 로 되살릴 수 있음)
    g.globalAlpha = k;
    // 줄자가 펼쳐지는 느낌: 적 쪽에서 내 쪽으로
    g.beginPath(); g.rect(x1 - (x1 - x0 + 40) * Math.min(1, k * 1.2), y - 70, (x1 - x0 + 40) * Math.min(1, k * 1.2) + 20, 140); g.clip();

    // 무기 사거리 구간 (마우스를 올린 카드)
    const hc = this.hover && DATA.cards[this.hover];
    if (hc) {
      const max = Math.max(...hc.dmg.map((x) => x[1]));
      for (let m = 0; m <= DATA.rules.maxDistance; m += 100) {
        const v = dmgAt(hc, m) / max;
        if (!v) continue;
        const xa = this.axisX(m - 50), xb = this.axisX(m + 50);
        // 측정선 위의 얇은 띠 (진할수록 강함)
        g.fillStyle = `rgba(255,138,101,${0.2 + 0.6 * v})`;
        g.fillRect(xa + 1, y - 3, xb - xa - 2, 6);
      }
    }

    // 선 + 100km 눈금
    g.strokeStyle = 'rgba(255,181,71,0.55)';
    g.lineWidth = 1.5;
    g.setLineDash([6, 5]);
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
    g.setLineDash([]);
    const d = Math.round(this.dist / 100) * 100;
    g.font = "10px Consolas, monospace";
    g.textAlign = 'center';
    for (let m = 0; m <= d; m += 100) {
      const x = this.axisX(m), major = m % 500 === 0;
      g.strokeStyle = major ? 'rgba(255,181,71,0.8)' : 'rgba(255,181,71,0.35)';
      g.beginPath(); g.moveTo(x, y - (major ? 7 : 4)); g.lineTo(x, y + (major ? 7 : 4)); g.stroke();
      if (major && m > 0 && m < d) { g.fillStyle = 'rgba(255,181,71,0.6)'; g.fillText(m, x, y + 18); }
    }
    // 양 끝 꺾쇠
    g.strokeStyle = 'rgba(255,181,71,0.9)';
    g.lineWidth = 2;
    for (const x of [x0, x1]) { g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x, y + 10); g.stroke(); }

    // 거리 숫자 (측정선 가운데)
    const cx = (x0 + x1) / 2;
    g.font = "900 30px Consolas, monospace";
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.7)';
    const label = d.toLocaleString() + 'km';
    g.strokeText(label, cx, y + 36);
    g.fillStyle = '#FFB547';
    g.shadowColor = 'rgba(255,181,71,0.6)'; g.shadowBlur = 14;
    g.fillText(label, cx, y + 36);
    g.shadowBlur = 0;
    g.font = "700 11px 'Malgun Gothic', sans-serif";
    g.fillStyle = 'rgba(230,237,247,0.6)';
    g.fillText(hc ? `${bandOf(d)}  ·  주황 띠 = ${hc.name}이 강한 거리` : bandOf(d), cx, y + 56);
    }
    g.restore();
    g.save();

    // 적 예상 위치 (내 이동 계획, 적이 가만히 있다면)
    if (this.ghost !== null && this.ghost !== undefined) {
      const gx = this.axisX(this.ghost);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
      g.globalAlpha = 0.25 + 0.2 * pulse;
      g.save();
      g.translate(gx + 78, E.y);
      g.scale(-1, 1);
      const gk = this.design('enemy').scale || 1;
      g.scale(gk, gk);
      g.drawImage(Art.ship[this.skin.enemy] || Art.ship.vex, -100, -45, 200, 90);
      g.restore();
      g.globalAlpha = 1;
      g.strokeStyle = '#5CE1E6'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(gx, y - 14); g.lineTo(gx, y + 14); g.stroke();
      g.font = "700 12px 'Malgun Gothic', sans-serif";
      g.textAlign = 'center';
      g.fillStyle = '#5CE1E6';
      if (!this.aim) g.fillText(`내 이동 후 ${this.ghost.toLocaleString()}km (적이 가만히 있다면)`, gx, y - 22);
    }
    g.restore();
  },

  // 카드 조준: 내 함선 → 커서 (목표 위면 조준경이 달라붙음)
  drawAim(g) {
    const a = this.aim;
    if (!a || a.type === 'weapon') return;
    const self = a.type !== 'weapon';
    const want = self ? 'player' : 'enemy';
    const lock = a.target === want;
    const src = this.toScreen(this.nose('player').x, this.nose('player').y);
    const tp = lock ? this.toScreen(this.pos(want).x, this.pos(want).y) : { x: a.x, y: a.y };
    const col = a.info && lock ? a.info.color : a.target && !lock ? '#FF5A5F' : '#FFB547';
    const z = this.z0 * this.cam.z;
    g.save();
    // 조준선 (무기만: 휘어진 점선)
    if (!self) {
      const mx = (src.x + tp.x) / 2, my = Math.min(src.y, tp.y) - 60;
      g.strokeStyle = col; g.lineWidth = 2; g.globalAlpha = 0.85;
      g.setLineDash([8, 6]); g.lineDashOffset = -this.real * 40;
      g.beginPath(); g.moveTo(src.x, src.y); g.quadraticCurveTo(mx, my, tp.x, tp.y); g.stroke();
      g.setLineDash([]);
    }
    // 조준경
    const w = lock ? 118 * z : 26, h = lock ? 58 * z : 26, t = this.real;
    const pul = lock ? 1 + 0.04 * Math.sin(t * 10) : 1;
    g.translate(tp.x, tp.y);
    g.scale(pul, pul);
    g.strokeStyle = col; g.lineWidth = lock ? 3 : 2; g.globalAlpha = 1;
    g.shadowColor = col; g.shadowBlur = lock ? 14 : 6;
    const L = lock ? 22 : 8;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.beginPath();
      g.moveTo(sx * w, sy * h + -sy * L); g.lineTo(sx * w, sy * h); g.lineTo(sx * w + -sx * L, sy * h);
      g.stroke();
    }
    if (!lock) { g.beginPath(); g.arc(0, 0, 3, 0, 6.28); g.fillStyle = col; g.fill(); }
    g.shadowBlur = 0;
    g.restore();
    // 설명 글자
    const txt = lock ? a.info && a.info.text : a.target && !lock ? (self ? '내 함선에 놓으세요' : '적 함선에 조준하세요') : (self ? '내 함선으로 끌어 놓기' : '적 함선으로 조준');
    if (txt) {
      // 조준경에 붙으면 두 함선 사이 빈 곳에 (적이면 조준경 왼쪽, 나면 오른쪽)
      const lx = lock ? (self ? tp.x + w + 16 : tp.x - w - 16) : tp.x;
      const ly = lock ? tp.y - 10 : tp.y - 26;
      g.font = "900 16px 'Malgun Gothic', sans-serif";
      g.textAlign = lock ? (self ? 'left' : 'right') : 'center'; g.textBaseline = 'middle';
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(txt, lx, ly);
      g.fillStyle = col;
      g.fillText(txt, lx, ly);
      if (lock && a.info && a.info.sub) {
        g.font = "700 12px 'Malgun Gothic', sans-serif";
        g.strokeText(a.info.sub, lx, ly + 20);
        g.fillStyle = 'rgba(230,237,247,0.85)';
        g.fillText(a.info.sub, lx, ly + 20);
      }
    }
  },

  drawShip(g, side) {
    const s = this.ships[side];
    if (s.dead) return;
    const p = this.pos(side), face = side === 'player' ? 1 : -1, D = this.design(side), img = Art.ship[this.skin[side]] || Art.ship.vex;
    const sc = D.scale || 1;
    g.save();
    g.translate(p.x, p.y);
    g.scale(face * sc, sc);
    g.rotate((s.flame - s.retro) * 0.03 * Math.sin(this.time * 3));

    // 엔진 불꽃 (뒤)
    g.globalCompositeOperation = 'lighter';
    const base = 0.25 + s.flame * 0.9;
    for (const [nx, ny] of D.nozzles) {   // [x, y, 반지름]
      const len = (16 + 60 * s.flame) * (0.85 + 0.15 * Math.sin(this.time * 40 + ny));
      const fl = g.createLinearGradient(nx - 8, 0, nx - 8 - len, 0);
      fl.addColorStop(0, `rgba(255,255,255,${0.9 * base})`);
      fl.addColorStop(0.2, `rgba(${D.flame.join(',')},${0.8 * base})`);
      fl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fl;
      g.beginPath(); g.moveTo(nx - 8, ny - 4); g.lineTo(nx - 8 - len, ny); g.lineTo(nx - 8, ny + 4); g.closePath(); g.fill();
    }
    // 역추진 (앞쪽 작은 분사)
    if (s.retro) {
      for (const dy of [-9, 9]) {
        const len = 30 * (0.8 + 0.2 * Math.sin(this.time * 50));
        const fl = g.createLinearGradient(40, dy, 40 + len, dy + dy * 0.6);
        fl.addColorStop(0, 'rgba(255,255,255,0.8)'); fl.addColorStop(1, 'rgba(0,0,0,0)');
        g.strokeStyle = fl; g.lineWidth = 3;
        g.beginPath(); g.moveTo(40, dy); g.lineTo(40 + len, dy + dy * 0.6); g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';

    // 몸체
    g.drawImage(img, -100, -45, 200, 90);
    if (s.hullFlash > 0) {   // 맞으면 번쩍
      g.globalAlpha = s.hullFlash * 3;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(img, -100, -45, 200, 90);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    // 과열: 배기구가 붉게
    if (s.heat > 20) {
      const k = Math.min(1, (s.heat - 20) / 80) * (0.8 + 0.2 * Math.sin(this.time * 8));
      const hg = g.createRadialGradient(-60, 0, 0, -60, 0, 40);
      hg.addColorStop(0, `rgba(255,90,40,${0.7 * k})`); hg.addColorStop(1, 'rgba(255,60,20,0)');
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = hg;
      g.beginPath(); g.arc(-60, 0, 40, 0, 6.28); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    // 항해등 깜빡임
    const blink = Math.sin(this.time * 4 + (side === 'player' ? 0 : 1.5)) > 0.6;
    if (blink) {
      g.globalCompositeOperation = 'lighter';
      for (const [lx, ly, col] of D.lights) {
        const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 6);
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(lx, ly, 6, 0, 6.28); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(lx, ly, 1.1, 0, 6.28); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();

    // 보호막 (육각 무늬 에너지 막)
    if (s.shieldOn || s.shieldFlash > 0) {
      g.save();
      g.translate(p.x, p.y);
      const a = (s.shieldOn ? 0.18 : 0) + s.shieldFlash * 0.4;
      const sg = g.createRadialGradient(0, 0, 60, 0, 0, 115);
      sg.addColorStop(0, 'rgba(120,160,255,0)'); sg.addColorStop(0.8, `rgba(140,180,255,${a})`); sg.addColorStop(1, `rgba(200,220,255,${Math.min(1, a * 1.6)})`);
      g.fillStyle = sg;
      g.beginPath(); g.ellipse(0, 0, 112, 52, 0, 0, 6.28); g.fill();
      g.clip();
      g.globalAlpha = a * 0.8;
      g.fillStyle = g.createPattern(Art.hex, 'repeat');
      g.translate(this.time * 6, 0);
      g.fillRect(-140, -60, 280, 120);
      g.restore();
    }
  },

  // 함선 위 체력판: 굵은 선체 막대 + 파란 보호막 막대 + 숫자
  drawPlate(g, side) {
    const s = this.ships[side];
    if (s.dead || s.hp === undefined) return;
    const p = this.pos(side);
    const w = 150, h = 9, x = p.x - w / 2 + (side === 'player' ? -10 : 10), y = p.y - 72;
    const col = COL[side];
    const low = s.hp / s.max <= 0.3;
    const pulse = low ? 0.5 + 0.5 * Math.sin(this.time * 8) : 0;
    g.save();
    // 바탕
    g.fillStyle = 'rgba(4,7,14,0.75)';
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    // 깎인 흔적 (하양) → 현재 선체
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(x, y, w * (s.trail / s.max), h);
    g.fillStyle = low ? `rgba(255,${80 + 60 * pulse},${80 + 60 * pulse},1)` : col;
    g.fillRect(x, y, w * (s.hp / s.max), h);
    // 20칸 눈금
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let k = 20; k < s.max; k += 20) g.fillRect(x + w * (k / s.max) - 0.5, y, 1, h);
    // 맞은 순간 번쩍
    if (s.plateFlash > 0) { g.fillStyle = `rgba(255,255,255,${s.plateFlash * 0.6})`; g.fillRect(x - 2, y - 2, w + 4, h + 4); }
    // 보호막 (바로 아래 얇은 파란 막대)
    if (s.sh > 0) {
      g.fillStyle = '#9DB8FF';
      g.shadowColor = '#9DB8FF'; g.shadowBlur = 8;
      g.fillRect(x, y + h + 3, Math.min(w, w * (s.sh / s.max)), 4);
      g.shadowBlur = 0;
    }
    // 숫자
    g.font = "900 15px Consolas, monospace";
    g.textBaseline = 'middle';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.8)';
    const txt = String(s.hp);
    const tx = side === 'player' ? x + w + 6 : x - 6;      // 숫자는 가운데(서로 마주보는 쪽)
    g.textAlign = side === 'player' ? 'left' : 'right';
    g.strokeText(txt, tx, y + h / 2);
    g.fillStyle = low ? '#FF6B6B' : '#FFFFFF';
    g.fillText(txt, tx, y + h / 2);
    if (s.sh > 0) {
      g.font = "700 11px Consolas, monospace";
      g.strokeText('+' + s.sh, tx, y + h + 7);
      g.fillStyle = '#9DB8FF';
      g.fillText('+' + s.sh, tx, y + h + 7);
    }
    g.restore();
  },

  drawTorp(g, t) {
    const p = this.torpPos(t), col = COL[t.owner];
    g.save();
    g.translate(p.x, p.y);
    g.scale(t.owner === 'player' ? 1 : -1, 1);
    g.fillStyle = '#C9D2DE';
    g.fillRect(-7, -2, 12, 4);
    g.fillStyle = col;
    g.fillRect(4, -2, 3, 4);
    g.globalCompositeOperation = 'lighter';
    const fl = g.createRadialGradient(-9, 0, 0, -9, 0, 9);
    fl.addColorStop(0, 'rgba(255,230,180,0.9)'); fl.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = fl;
    g.beginPath(); g.arc(-9, 0, 9, 0, 6.28); g.fill();
    g.restore();
  },

  drawFx(g) {
    // 연기 · 파편 (보통)
    for (const p of this.parts) {
      const k = p.life / p.max;
      if (p.type === 'smoke') {
        g.globalAlpha = 0.35 * k;
        g.fillStyle = '#6B7280';
        g.beginPath(); g.arc(p.x, p.y, p.size * (1.8 - k), 0, 6.28); g.fill();
      } else if (p.type === 'debris') {
        g.save();
        g.globalAlpha = Math.min(1, k * 2);
        g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = '#8A919C';
        g.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        g.restore();
      }
    }
    g.globalAlpha = 1;
    // 빛 (더하기)
    g.globalCompositeOperation = 'lighter';
    for (const b of this.beams) {
      const k = b.life / b.max;
      let x0, y0, x1, y1;
      if (b.kind === 'pd') { x0 = b.x0; y0 = b.y0; x1 = b.x1; y1 = b.y1; }
      else {
        const a = this.nose(b.from), t = this.pos(b.to);
        x0 = a.x; y0 = a.y;
        x1 = b.miss ? lerp(a.x, t.x, 0.55) : t.x + (b.to === 'enemy' ? -30 : 30); y1 = b.miss ? a.y : t.y;
      }
      const fl = 0.7 + 0.3 * Math.sin(this.time * 60);
      g.strokeStyle = b.color; g.globalAlpha = 0.35 * k * fl; g.lineWidth = b.kind === 'pd' ? 3 : b.wide ? 30 : 12;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = '#FFFFFF'; g.globalAlpha = k; g.lineWidth = b.kind === 'pd' ? 1 : b.wide ? 6 : 2.5;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    for (const s of this.shots) {
      g.globalAlpha = s.fade ? 1 - s.t / s.dur : 1;
      g.strokeStyle = s.color;
      g.lineWidth = s.kind === 'rail' ? 4 : 1.6;
      g.beginPath();
      s.trail.forEach((pt, i) => (i ? g.lineTo(pt.x, pt.y) : g.moveTo(pt.x, pt.y)));
      g.stroke();
      if (s.kind === 'rail') { g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(s.x, s.y, 3.5, 0, 6.28); g.fill(); }
    }
    for (const p of this.parts) {
      const k = p.life / p.max;
      if (p.type === 'spark') {
        g.globalAlpha = k;
        g.strokeStyle = p.color; g.lineWidth = p.size;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
      } else if (p.type === 'glow') {
        const r = p.size * (1.2 - 0.4 * k);
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = k;
        g.fillStyle = gr;
        g.beginPath(); g.arc(p.x, p.y, r, 0, 6.28); g.fill();
      } else if (p.type === 'streak') {
        const len = p.size * (0.6 + 0.4 * k);
        const gr = g.createLinearGradient(p.x - len, 0, p.x + len, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = k * 0.8;
        g.fillStyle = gr;
        g.fillRect(p.x - len, p.y - 1.2, len * 2, 2.4);
        g.globalAlpha = k * 0.25;
        g.fillRect(p.x - len * 0.6, p.y - 5, len * 1.2, 10);
      } else if (p.type === 'ring') {
        g.globalAlpha = k * 0.8;
        g.strokeStyle = p.color; g.lineWidth = 2 + 3 * k;
        g.beginPath(); g.arc(p.x, p.y, p.size * (1 - k * 0.7), 0, 6.28); g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    // 글자
    for (const t of this.texts) {
      const k = Math.min(1, (t.life / t.max) * 2.5);
      g.globalAlpha = k;
      g.font = `900 ${t.size}px 'Malgun Gothic', sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(t.str, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.str, t.x, t.y);
    }
    g.globalAlpha = 1;
  },
};
