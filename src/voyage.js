// 로그라이트 항해: 이야기 → 항로 고르기 → 전투 / 사건 / 정비 → 보상 → … → 기함 → 장 마무리
// 화면은 #voyage 한 칸에 그때그때 그림. 전투는 ui.js 의 start() 를 그대로 씀
'use strict';

const Voyage = {
  V: null,            // 이번 항해 상태
  on: false,          // 항해 화면이 떠 있음 (전투 중엔 false)
  keys: [],           // 숫자키 1~n 에 연결된 동작
  cont: null,         // Enter 로 넘어갈 동작

  // ── 시작 ──
  start() {
    const P = DATA.ships.player, VD = DATA.voyage;
    this.V = {
      ch: 0, jump: 0,
      ship: { hull: VD.playerHull, maxHull: VD.playerHull, reactor: P.reactor, cooling: P.cooling, deck: DATA.starterDeck.slice() },
      dist: VD.startDistance, err: 0.8, kills: 0, battles: 0,
      usedEvents: [], routes: null,
    };
    const ch = this.chapter();
    this.story(`1장 「${ch.name}」`, ch.sub, ch.intro, () => this.say(ch.sera, () => this.routes()));
  },
  chapter() { return this.V.endless ? this.sectorInfo() : DATA.voyage.chapters[this.V.ch]; },

  // ── 끝없는 항해 (로그라이트) ──
  // 깊이 = 구역 × (점프 4 + 보스 1) + 점프 + 1
  depth() { const V = this.V; return V.ch * (DATA.endless.jumpsPerSector + 1) + V.jump + 1; },
  startEndless() {
    const P = DATA.ships.player, VD = DATA.voyage;
    this.V = {
      endless: true, ch: 0, jump: 0,
      ship: { hull: VD.playerHull, maxHull: VD.playerHull, reactor: P.reactor, cooling: P.cooling, deck: DATA.starterDeck.slice() },
      dist: VD.startDistance, err: 0.8, kills: 0, battles: 0,
      usedEvents: [], routes: null,
    };
    this.story('끝없는 항해', '정적 이후 — 끝이 없는 추측항법',
      ['항법 신호가 꺼진 성계.', '나침반은 좌표 없이 점프를 거듭한다.', '깊이 들어갈수록 적은 강해진다.', '얼마나 멀리 갈 수 있을까.'],
      () => this.say('항해장 세라입니다. 구역마다 점프 네 번, 그리고 그 구역의 주인이 기다립니다. …가 보죠.', () => this.routes()));
  },
  // 테스트용: 깊이 d 부터 (앞 구역을 깬 것처럼)
  startEndlessAt(d) {
    this.startEndless();
    const V = this.V, s = V.ship, E = DATA.endless, per = E.jumpsPerSector + 1;
    V.ch = Math.floor((d - 1) / per);
    V.jump = (d - 1) % per;
    for (let k = 1; k < d; k++) {
      if (k % per === 0) { DATA.voyage.mods.armor.apply(s); s.deck.push(this.randCards(1)[0]); }
      else if (k % 2 === 0) s.deck.push(this.randCards(1)[0]);
    }
    V.kills = d - 1; V.battles = d - 1;
    s.hull = Math.round(s.maxHull * 0.7);
    this.routes();
  },
  sectorInfo() {
    const V = this.V, E = DATA.endless, d = this.depth(), n = V.ch;
    const ti = n % E.themes.length;
    let enemies = E.tier2;
    if (d <= E.tier1Until) enemies = E.tier1;
    else if (d <= E.mixUntil) enemies = E.tier1.concat(E.tier2);
    const boss = E.bosses[n % E.bosses.length];
    const story = DATA.voyage.chapters.find((c) => c.flagship === boss) || {};
    return {
      name: `구역 ${n + 1} · ${E.themeNames[ti]}`, sub: `깊이 ${d}`,
      enemies, elites: E.elites, flagship: boss,
      events: Object.keys(DATA.voyage.events),
      theme: E.themes[ti], fog: E.themes[ti] === 'fog',
      enemyHull: E.hullBase + E.hullPerDepth * (d - 1),
      bossHull: E.bossBase + E.bossPerSector * n,
      flagRadio: story.flagRadio || [],
    };
  },
  // 보스를 잡은 뒤: 수리 · 카드 · 개조 → 다음 구역
  sectorEnd() {
    const V = this.V, E = DATA.endless;
    this.repair(E.bossRepair, `구역 ${V.ch + 1} 돌파 — 수리`, () =>
      this.cardPick('보스 보상 — 카드 한 장', () =>
        this.modPick('보스 보상 — 개조', () => {
          V.ch++; V.jump = 0; V.usedEvents = []; V.routes = null;
          const n = this.sectorInfo();
          this.say(`구역 ${V.ch + 1} 진입 — ${n.name.split(' · ')[1]}. ${n.fog ? '먼지가 짙습니다. 적의 기동을 두 번까지만 추적할 수 있어요.' : '시야는 깨끗합니다. …적도 우릴 잘 보겠죠.'}`, () => this.routes());
        }, true)));
  },

  // 테스트용: 앞 장들을 깬 것처럼 해 두고 chIndex 장부터 시작
  startAt(chIndex) {
    this.start();
    const V = this.V, s = V.ship;
    for (let c = 0; c < chIndex; c++) {
      for (let k = 0; k < 3; k++) s.deck.push(this.randCards(1)[0]);   // 장마다 카드 3장
      DATA.voyage.mods.armor.apply(s);                                  // 장갑 보강 1회
      V.kills += 5; V.battles += 5;
      V.dist -= 30;
    }
    s.hull = Math.round(s.maxHull * 0.55);                              // 기함전 뒤처럼 깎인 상태
    V.ch = chIndex;
    this.beginChapter();
  },
  // 장 시작: 이야기 → (정비) → 세라 → 항로
  beginChapter() {
    const V = this.V, n = this.chapter();
    V.jump = 0; V.usedEvents = []; V.routes = null;
    this.story(`${V.ch + 1}장 「${n.name}」`, n.sub, n.intro, () => {
      const go = () => this.say(n.sera, () => this.routes());
      if (n.startRepair) this.repair(n.startRepair, '장 사이 정비', go); else go();
    });
  },

  // ── 화면 틀 ──
  show(html, cls = '') {
    const el = $('voyage');
    el.className = cls;
    el.innerHTML = html;
    el.classList.remove('hidden');
    this.keys = []; this.cont = null; this.skip = null;
    document.body.classList.add('onVoyage');
    Scene.mode = 'cruise';
    Scene.theme = this.V ? this.chapter().theme || null : null;
    Scene.cine = 0; Scene.camReset(1);   // 전투 연출(레터박스 · 줌) 끄기
    this.on = true;
  },
  hide() {
    $('voyage').classList.add('hidden');
    document.body.classList.remove('onVoyage');
    if (Scene.mode === 'cruise') Scene.mode = 'battle';   // 전투 화면으로
    this.on = false;
    this.keys = []; this.cont = null;
  },
  statusHTML() {
    const s = this.V.ship;
    const low = s.hull / s.maxHull <= 0.3;
    return `<div class="vStatus">
      <span>선체 <b class="${low ? 'low' : ''}">${s.hull}</b> / ${s.maxHull}</span>
      <span>덱 <b>${s.deck.length}</b>장</span>
      <span>반응로 <b>${s.reactor}</b></span>
      <span>냉각 <b>${s.cooling}</b></span>
      <span>격침 <b>${this.V.kills}</b></span>
    </div>`;
  },
  headHTML(extra = '') {
    const ch = this.chapter();
    const title = this.V.endless ? `깊이 ${this.depth()} · ${ch.name}` : `${this.V.ch + 1}장 · ${ch.name}`;
    return `<div class="vHead"><div class="vCh">${title}</div>${extra}</div>${this.statusHTML()}`;
  },

  // ── 이야기 (검은 화면에 한 줄씩) ──
  story(title, sub, lines, done) {
    this.show(`<div class="vStory">
      <div class="vsTitle">${title}</div>${sub ? `<div class="vsSub">${sub}</div>` : ''}
      ${lines.map((l, i) => `<p style="animation-delay:${0.6 + i * 0.9}s">${l}</p>`).join('')}
      <button class="vNext" style="animation-delay:${0.8 + lines.length * 0.9}s">계속 ▶ <small>Enter</small></button>
    </div>`, 'dark');
    this.cont = done;
    $('voyage').querySelector('.vNext').onclick = () => this.next();
  },
  // 세라의 한마디 (짧은 무전 화면)
  say(text, done) {
    this.show(`${this.headHTML()}<div class="vSay"><div class="vWho">항해장 세라</div><p>${text}</p>
      <button class="vNext">계속 ▶ <small>Enter</small></button></div>`);
    this.cont = done;
    $('voyage').querySelector('.vNext').onclick = () => this.next();
  },
  next() { const f = this.cont; this.cont = null; if (f) f(); },

  // ── 항로 고르기 ──
  routes() {
    const V = this.V, VD = DATA.voyage;
    if (V.jump >= VD.jumpsPerChapter) return this.flagApproach();
    if (!V.routes) V.routes = this.genRoutes();
    const line = VD.seraJump[Math.floor(Math.random() * VD.seraJump.length)];
    const cards = V.routes.map((r, i) => this.routeCardHTML(r, i)).join('');
    const jumpsLeft = VD.jumpsPerChapter - V.jump;
    const jumpTxt = V.endless ? `보스까지 점프 ${jumpsLeft}번` : `점프 ${V.jump + 1} / ${VD.jumpsPerChapter} → 기함`;
    const seraTxt = V.endless ? `깊이 <b>${this.depth()}</b> · 적 선체 <b>×${this.chapter().enemyHull.toFixed(2)}</b>` : `추정 위치 — 북극성까지 <b>${V.dist}광분</b> · 오차 ±${V.err.toFixed(1)}천 km`;
    this.show(`${this.headHTML(`<div class="vJump">${jumpTxt}</div>`)}
      <div class="vSera"><span class="vWho">세라</span> ${seraTxt}<br><i>"${line}"</i></div>
      <div class="vRoutes">${cards}</div>
      <div class="vHint">항로를 고르세요 (클릭 또는 1~${V.routes.length})</div>`);
    this.keys = V.routes.map((r, i) => () => this.pickRoute(i));
    $('voyage').querySelectorAll('.vRoute').forEach((el, i) => { el.onclick = () => this.pickRoute(i); });
  },
  genRoutes() {
    const V = this.V, ch = this.chapter(), VD = DATA.voyage;
    const n = V.jump === 0 ? 2 : Math.random() < 0.5 ? 2 : 3;
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const types = [];
    const freeEvents = ch.events.filter((e) => !V.usedEvents.includes(e));
    const pool = ['battle', 'battle'];
    if (V.jump >= 1) pool.push('elite', 'dock');
    if (freeEvents.length) pool.push('event');
    types.push('battle');                               // 전투 하나는 꼭
    while (types.length < n) {
      const t = rnd(pool);
      if ((t === 'dock' || t === 'elite' || t === 'event') && types.includes(t)) continue;
      types.push(t);
    }
    types.sort(() => Math.random() - 0.5);
    const places = VD.places.slice().sort(() => Math.random() - 0.5);
    const usedEv = [];
    return types.map((t, i) => {
      const r = { type: t, place: places[i] };
      if (t === 'battle') { r.enemy = rnd(ch.enemies); r.reward = Math.random() < 0.6 ? ['card'] : Math.random() < 0.5 ? ['repair'] : ['mod']; }
      if (t === 'elite') { r.enemy = rnd(ch.elites); r.reward = ['card', 'mod']; }
      if (t === 'event') { r.event = rnd(freeEvents.filter((e) => !usedEv.includes(e))); usedEv.push(r.event); }
      return r;
    });
  },
  routeCardHTML(r, i) {
    const RW = { card: '새 카드', repair: '수리', mod: '개조' };
    const TY = { battle: ['전투', 'battle'], elite: ['정예', 'elite'], event: ['사건', 'event'], dock: ['정비', 'dock'] };
    let body = '';
    if (r.enemy) {
      const e = DATA.ships[r.enemy];
      body = `<div class="vrEnemy">${e.name}</div>
        <div class="vrDoc">교리 <b>${e.doctrine}</b> · 선호 <b>${e.prefer.toLocaleString()}km${e.preferJitter ? ' ±' + e.preferJitter : ''}</b></div>
        <div class="vrDesc">${e.doctrineDesc}</div>
        <div class="vrReward">보상 · ${r.reward.map((x) => RW[x]).join(' + ')}</div>`;
    } else if (r.type === 'event') {
      body = `<div class="vrEnemy">???</div><div class="vrDesc">무언가가 신호를 보내고 있다. 전투는 없을지도 모른다.</div><div class="vrReward">보상 · 선택에 따라</div>`;
    } else {
      body = `<div class="vrEnemy">버려진 정비 부표</div><div class="vrDesc">수리 · 카드 제거 · 개조 중 하나.</div><div class="vrReward">전투 없음</div>`;
    }
    return `<div class="vRoute t-${TY[r.type][1]}" style="animation-delay:${i * 0.08}s">
      <div class="vrKey">${i + 1}</div>
      <div class="vrType">${TY[r.type][0]}</div>
      <div class="vrPlace">${r.place}</div>
      ${body}
    </div>`;
  },
  pickRoute(i) {
    if (!this.V.routes) return;                       // 두 번 누름 방지 (화면 전환 중)
    const r = this.V.routes[i];
    this.V.routes = null;
    if (r.type === 'battle' || r.type === 'elite') this.battle(r.enemy, r.reward);
    else if (r.type === 'event') { this.V.usedEvents.push(r.event); this.event(r.event); }
    else this.dock();
  },
  // 점프 완료 → 거리 · 오차 갱신 → 다음 항로
  advance() {
    const V = this.V;
    V.jump++;
    V.dist = Math.max(1, V.dist - (5 + Math.floor(Math.random() * 4)));
    V.err += 0.3 + Math.random() * 0.6;
    this.routes();
  },

  // ── 전투 ──
  battle(enemyKey, reward) {
    this.keys = []; this.cont = null; this.skip = null;   // 화면 전환 중 입력 막기
    this.V.pending = { reward, enemy: enemyKey };
    fadeTo(() => {
      this.hide();
      const s = this.V.ship;
      start(enemyKey, { hull: s.hull, maxHull: s.maxHull, reactor: s.reactor, cooling: s.cooling, deck: s.deck.slice() });
      B.voyage = true;
      B.introShown = true;
      B.fog = !!this.chapter().fog;
      Scene.theme = this.chapter().theme || null;
      // 적 선체 배율 (장마다 / 끝없는 항해는 깊이마다, 보스도)
      const ch = this.chapter(), isBoss = !!DATA.ships[enemyKey].flagship;
      const m = isBoss ? (this.V.endless ? ch.bossHull : 1) : ch.enemyHull || 1;
      if (m !== 1) B.enemy.hull = B.enemy.maxHull = Math.round(B.enemy.hull * m);
      // 끝없는 항해: 깊이에 따라 적 덱에 강화 카드
      if (this.V.endless) {
        const E = DATA.endless, extra = Math.floor((this.depth() - 1) / E.extraCardEvery);
        for (let k = 0; k < extra; k++) B.enemy.draw.push(E.extraCards[Math.floor(Math.random() * E.extraCards.length)]);
        shuffle(B.enemy.draw);
      }
      Scene.sync(B); renderHud();
      showBanner();
      const e = DATA.ships[enemyKey];
      if (e.flagship) radio(this.chapter().flagRadio);
      else if (e.elite) radio([['세라', `정예함입니다. ${e.doctrineDesc}.`]]);
    });
  },
  battleEnd(B) {
    const V = this.V;
    V.ship.hull = Math.max(0, B.player.hull);
    V.battles++;
    const won = B.winner === 'player';
    setTimeout(() => fadeTo(() => {
      if (!won) return this.over(false);
      V.kills++;
      const before = V.ship.hull;
      V.ship.hull = Math.min(V.ship.maxHull, V.ship.hull + DATA.voyage.autoRepair);
      if (V.ship.hull > before) setTimeout(() => this.toast(`응급 수리 +${V.ship.hull - before}`), 500);
      const e = DATA.ships[V.pending.enemy];
      if (e.flagship) return V.endless ? this.sectorEnd() : this.chapter().flagChoice ? this.flagChoice() : this.chapterEnd();
      this.rewards(V.pending.reward.slice(), () => this.advance(), !!e.elite);
    }), 300);
  },

  // ── 보상 (여러 개면 차례로) ──
  // elite: 정예함 보상이면 희귀 개조(반응로)도 나올 수 있음
  rewards(list, done, elite = false) {
    if (!list.length) return done();
    const k = list.shift();
    const then = () => this.rewards(list, done, elite);
    if (k === 'card') this.cardPick('전투 보상 — 카드 한 장', then);
    else if (k === 'repair') this.repair(DATA.voyage.repairAmount, '전투 보상 — 수리', then);
    else this.modPick(elite ? '정예함 보상 — 개조' : '전투 보상 — 개조', then, elite);
  },
  randCards(n, poolName) {
    const pool = (poolName && DATA.voyage.pools[poolName]) || DATA.voyage.cardPool, ids = [];
    const total = Object.values(pool).reduce((a, b) => a + b, 0);
    let guard = 0;
    while (ids.length < n && guard++ < 100) {
      let r = Math.random() * total, id = null;
      for (const [k, w] of Object.entries(pool)) { r -= w; if (r <= 0) { id = k; break; } }
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  },
  cardHTML(id, i) {
    const c = DATA.cards[id];
    return `<div class="card vcard" data-type="${c.type}" data-i="${i}" style="animation-delay:${i * 0.08}s">
      <div class="vrKey">${i + 1}</div>
      <div class="cost">${c.cost}</div>
      <div class="cart">${iconSVG(id, 42)}</div>
      <div class="cbody">
        <div class="ctype">${TYPE_NAME[c.type]}<span class="cheat">열 ${c.heat}</span></div>
        <div class="cname">${c.name}</div>
        ${miniBar(c)}
        <div class="cdesc">${c.desc}</div>
      </div></div>`;
  },
  cardPick(title, done, poolName) {
    const ids = this.randCards(3, poolName);
    this.show(`${this.headHTML()}<div class="vTitle">${title}</div>
      <div class="vCards">${ids.map((id, i) => this.cardHTML(id, i)).join('')}</div>
      <button class="vSkip">건너뛰기 <small>Esc</small></button>`);
    const pick = (i) => { this.V.ship.deck.push(ids[i]); this.toast(`${DATA.cards[ids[i]].name} — 덱에 추가`); done(); };
    this.keys = ids.map((id, i) => () => pick(i));
    this.cont = null; this.skip = done;
    $('voyage').querySelectorAll('.vcard').forEach((el, i) => { el.onclick = () => pick(i); });
    $('voyage').querySelector('.vSkip').onclick = () => { this.skip = null; done(); };
  },
  repair(n, title, done) {
    const s = this.V.ship, before = s.hull;
    s.hull = Math.min(s.maxHull, s.hull + n);
    this.show(`${this.headHTML()}<div class="vSay"><div class="vWho">${title}</div>
      <p>선체 수리 <b>${before} → ${s.hull}</b> / ${s.maxHull}</p><button class="vNext">계속 ▶ <small>Enter</small></button></div>`);
    this.cont = done;
    $('voyage').querySelector('.vNext').onclick = () => this.next();
  },
  modPick(title, done, allowRare = false) {
    const all = Object.entries(DATA.voyage.mods).filter(([, m]) => allowRare || !m.rare);
    const opts = all.sort(() => Math.random() - 0.5).slice(0, 2);
    this.show(`${this.headHTML()}<div class="vTitle">${title}</div>
      <div class="vRoutes">${opts.map(([k, m], i) => `<div class="vRoute t-dock" data-i="${i}" style="animation-delay:${i * 0.08}s">
        <div class="vrKey">${i + 1}</div><div class="vrType">개조</div><div class="vrEnemy">${m.name}</div><div class="vrDesc">${m.desc}</div></div>`).join('')}</div>`);
    const pick = (i) => { opts[i][1].apply(this.V.ship); this.toast(`${opts[i][1].name} 완료`); done(); };
    this.keys = opts.map((o, i) => () => pick(i));
    $('voyage').querySelectorAll('.vRoute').forEach((el, i) => { el.onclick = () => pick(i); });
  },

  // ── 정비 지점: 수리 / 카드 제거 / 개조 ──
  dock() {
    const VD = DATA.voyage;
    const opts = [
      ['수리', `선체 +${VD.dockRepair}`, () => this.repair(VD.dockRepair, '정비 — 수리', () => this.advance())],
      ['카드 제거', '덱에서 1장을 버린다 (덱이 가벼워진다)', () => this.removeCard(() => this.advance())],
      ['개조', '부품 2개 중 1개', () => this.modPick('정비 — 개조', () => this.advance(), false)],
    ];
    this.show(`${this.headHTML()}<div class="vTitle">버려진 정비 부표 — 하나만 할 수 있다</div>
      <div class="vRoutes">${opts.map(([n, d], i) => `<div class="vRoute t-dock" style="animation-delay:${i * 0.08}s">
        <div class="vrKey">${i + 1}</div><div class="vrType">정비</div><div class="vrEnemy">${n}</div><div class="vrDesc">${d}</div></div>`).join('')}</div>`);
    this.keys = opts.map((o) => o[2]);
    $('voyage').querySelectorAll('.vRoute').forEach((el, i) => { el.onclick = opts[i][2]; });
  },
  removeCard(done) {
    const deck = this.V.ship.deck;
    const counts = {};
    for (const id of deck) counts[id] = (counts[id] || 0) + 1;
    const ids = Object.keys(counts);
    this.show(`${this.headHTML()}<div class="vTitle">버릴 카드를 고르세요 (덱 ${deck.length}장)</div>
      <div class="vCards small">${ids.map((id, i) => this.cardHTML(id, i).replace('<div class="cart">', `<div class="vCount">×${counts[id]}</div><div class="cart">`)).join('')}</div>
      <button class="vSkip">그만두기 <small>Esc</small></button>`);
    const pick = (i) => { deck.splice(deck.indexOf(ids[i]), 1); this.toast(`${DATA.cards[ids[i]].name} 1장 버림`); done(); };
    this.keys = ids.slice(0, 9).map((id, i) => () => pick(i));
    this.skip = done;
    $('voyage').querySelectorAll('.vcard').forEach((el, i) => { el.onclick = () => pick(i); });
    $('voyage').querySelector('.vSkip').onclick = () => { this.skip = null; done(); };
  },

  // ── 사건 ──
  event(key) {
    const ev = DATA.voyage.events[key];
    this.show(`${this.headHTML()}<div class="vEvent"><div class="vTitle">${ev.title}</div>
      ${ev.text.map((t) => `<p>${t}</p>`).join('')}
      <div class="vChoices">${ev.choices.map((c, i) => `<button class="vChoice"><i>${i + 1}</i><b>${c.label}</b><small>${c.desc}</small></button>`).join('')}</div></div>`);
    const pick = (i) => this.effect(ev.choices[i].effect);
    this.keys = ev.choices.map((c, i) => () => pick(i));
    $('voyage').querySelectorAll('.vChoice').forEach((el, i) => { el.onclick = () => pick(i); });
  },
  // 사건 결과
  effect(name) {
    const s = this.V.ship;
    const result = (text, then = () => this.advance()) => {
      this.show(`${this.headHTML()}<div class="vSay"><div class="vWho">결과</div><p>${text}</p><button class="vNext">계속 ▶ <small>Enter</small></button></div>`);
      this.cont = then;
      $('voyage').querySelector('.vNext').onclick = () => this.next();
    };
    switch (name) {
      case 'pass': return result('항로를 유지한다. 세라: "현명하실지도요."');
      case 'distressRescue':
        if (Math.random() < 0.6) {
          s.hull = Math.min(s.maxHull, s.hull + 30);
          return result('생존자 세 명. 보급품을 넘겨받았다. <b>선체 +30</b>', () => this.cardPick('생존자의 보답 — 카드 한 장', () => this.advance()));
        }
        return result('신호가 끊기고, 잔해 뒤에서 엔진이 켜진다. <b>고철단의 매복!</b>', () => this.battle('scav', ['card']));
      case 'buoyStrip':
        s.cooling += 3; s.hull = Math.max(1, s.hull - 12);
        return result('냉각 장치를 떼어 냈다. <b>냉각 +3</b> · 파편에 <b>선체 −12</b>');
      case 'buoyRead':
        return result('기록 일부가 복구됐다. 정적 직전, 부표가 <b>알 수 없는 명령</b>을 받은 흔적.', () => this.cardPick('부표 기록 — 카드 한 장', () => this.advance()));
      case 'cargoOpen':
        if (Math.random() < 0.55) {
          const id = this.randCards(1)[0];
          s.deck.push(id);
          return result(`고철단의 무기고였다. <b>${DATA.cards[id].name}</b> 카드를 얻었다.`);
        }
        s.hull = Math.max(1, s.hull - 16);
        return result('부비트랩! 컨테이너가 터졌다. <b>선체 −16</b> · 세라: "…터졌네요."');
      case 'cargoTrash':
        return this.removeCard(() => this.advance());
      // ── 2장 ──
      case 'challengeCode':
        if (Math.random() < 0.55) {
          s.hull = Math.min(s.maxHull, s.hull + 24);
          return result('잠깐의 침묵. "…확인됐다. 살아 있었군." 초계함이 보급을 나눠 준다. <b>선체 +24</b>', () => this.cardPick('연합 보급 — 카드 한 장', () => this.advance(), 'ally'));
        }
        return result('"암호 불일치. 반역자다!" 초계함의 포문이 열린다.', () => this.battle('allyPatrol', ['card']));
      case 'challengeFlee':
        s.hull = Math.max(1, s.hull - 12);
        return result('급가속으로 먼지 속에 숨었다. 무리한 기동에 <b>선체 −12</b> · 세라: "추적은 없습니다. 아마."');
      case 'lifeboatTake':
        s.cooling += 3;
        return result('기관병들이 냉각 배관을 다시 짰다. <b>냉각 +3</b> · "빚 갚은 겁니다, 함장님."');
      case 'lifeboatLoot':
        return result('구명정의 비상 장비를 옮겨 실었다.', () => this.cardPick('비상 장비 — 카드 한 장', () => this.advance(), 'ally'));
      case 'depotRepair':
        s.hull = Math.min(s.maxHull, s.hull + 40);
        return result('수리 자재로 선체를 덧댔다. <b>선체 +40</b>');
      case 'depotArms':
        return result('무기 상자를 싣고 떠난다.', () => this.cardPick('연합 무기고 — 카드 한 장', () => this.advance(), 'ally'));
      // ── 기함 뒤 선택 ──
      case 'spareKarel':
        this.V.flags = Object.assign(this.V.flags || {}, { karel: 'spared' });
        return result('단호가 불꽃을 끌며 먼지 속으로 물러난다. 카렐 대령: "…빚을 졌군, 나침반."', () => this.chapterEnd());
      case 'finishKarel':
        this.V.flags = Object.assign(this.V.flags || {}, { karel: 'killed' });
        return result('단호의 불빛이 꺼졌다. 잔해에서 쓸 만한 부품을 회수한다.', () => this.modPick('단호의 잔해 — 개조', () => this.chapterEnd(), true));
    }
  },

  // ── 기함 ──
  flagApproach() {
    const ch = this.chapter(), e = DATA.ships[ch.flagship];
    this.show(`${this.headHTML(`<div class="vJump">기함</div>`)}
      <div class="vSera"><span class="vWho">세라</span> 강한 엔진 신호 하나. <i>"구역의 주인이 우리를 기다리고 있었습니다."</i></div>
      <div class="vRoutes"><div class="vRoute t-flag">
        <div class="vrKey">1</div><div class="vrType">기함</div><div class="vrPlace">${ch.name} 심층부</div>
        <div class="vrEnemy">${e.name}</div>
        <div class="vrDoc">교리 <b>${e.doctrine}</b> · 선호 <b>${e.prefer.toLocaleString()}km</b> · 선체 <b>${Math.round(e.hull * (this.V.endless ? ch.bossHull : 1))}</b></div>
        <div class="vrDesc">${e.doctrineDesc}</div>
      </div></div>
      <div class="vHint">접근한다 (클릭 또는 1 · Enter)</div>`);
    let went = false;
    const go = () => { if (went) return; went = true; this.battle(ch.flagship, []); };
    this.keys = [go]; this.cont = go;
    $('voyage').querySelector('.vRoute').onclick = go;
  },
  flagChoice() {
    const fc = this.chapter().flagChoice;
    this.show(`${this.headHTML()}<div class="vEvent"><div class="vTitle">${fc.title}</div>
      ${fc.text.map((t) => `<p>${t}</p>`).join('')}
      <div class="vChoices">${fc.choices.map((c, i) => `<button class="vChoice"><i>${i + 1}</i><b>${c.label}</b><small>${c.desc}</small></button>`).join('')}</div></div>`);
    const pick = (i) => this.effect(fc.choices[i].effect);
    this.keys = fc.choices.map((c, i) => () => pick(i));
    $('voyage').querySelectorAll('.vChoice').forEach((el, i) => { el.onclick = () => pick(i); });
  },
  chapterEnd() {
    const ch = this.chapter();
    this.story(`${this.V.ch + 1}장 끝`, ch.name, ch.outro, () => {
      if (this.V.ch + 1 < DATA.voyage.chapters.length) {
        this.V.ch++;
        this.beginChapter();
      } else this.over(true, ch.next);
    });
  },

  // ── 항해 끝 ──
  over(win, nextName) {
    const V = this.V;
    if (V.endless) return this.overEndless();
    const title = win ? '구역 돌파' : '나침반 격침';
    const where = V.jump >= DATA.voyage.jumpsPerChapter ? '기함전' : `점프 ${V.jump + 1}`;
    const sub = win ? `${nextName || '다음 장'} — 준비 중입니다. 여기까지가 지금 만들어진 항해입니다.` : `${V.ch + 1}장 · ${where}에서 항해가 끝났다.`;
    this.show(`<div class="vStory"><div class="vsTitle ${win ? 'win' : 'lose'}">${title}</div><div class="vsSub">${sub}</div>
      <p style="animation-delay:0.4s">격침한 배 <b>${V.kills}</b>척 · 전투 <b>${V.battles}</b>번 · 남은 선체 <b>${V.ship.hull}</b> / ${V.ship.maxHull} · 덱 ${V.ship.deck.length}장</p>
      <button class="vNext" style="animation-delay:0.8s">메인 화면 ▶ <small>Enter</small></button></div>`, 'dark');
    this.cont = () => { this.hide(); this.V = null; goTitle(); };
    $('voyage').querySelector('.vNext').onclick = () => this.next();
  },

  overEndless() {
    const V = this.V, d = this.depth();
    let best = 0;
    try { best = +localStorage.getItem('dr-best-depth') || 0; } catch (e) {}
    const record = d > best;
    if (record) { best = d; try { localStorage.setItem('dr-best-depth', String(d)); } catch (e) {} }
    this.show(`<div class="vStory"><div class="vsTitle lose">나침반 격침</div>
      <div class="vsSub">깊이 ${d} · 구역 ${V.ch + 1}에서 항해가 끝났다</div>
      <p style="animation-delay:0.3s">${record ? '<b>새 기록!</b> ' : ''}최고 깊이 <b>${best}</b></p>
      <p style="animation-delay:0.5s">격침한 배 <b>${V.kills}</b>척 · 전투 <b>${V.battles}</b>번 · 덱 ${V.ship.deck.length}장 · 최대 선체 ${V.ship.maxHull}</p>
      <button class="vNext" style="animation-delay:0.8s">메인 화면 ▶ <small>Enter</small></button></div>`, 'dark');
    this.cont = () => { this.hide(); this.V = null; goTitle(); };
    $('voyage').querySelector('.vNext').onclick = () => this.next();
  },

  // 짧은 알림
  toast(msg) {
    let t = $('vToast');
    if (!t) { t = document.createElement('div'); t.id = 'vToast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  },

  // 키보드 (항해 화면이 떠 있을 때)
  key(e) {
    if (e.key >= '1' && e.key <= '9') { const f = this.keys[+e.key - 1]; if (f) { e.preventDefault(); f(); } return; }
    if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); if (this.cont) this.next(); return; }
    if (e.key === 'Escape' && this.skip) { const f = this.skip; this.skip = null; f(); }
  },
};

// 무전: 전장 왼쪽 아래에 한 줄씩
function radio(lines) {
  const el = $('radio');
  let i = 0;
  const step = () => {
    if (i >= lines.length) { el.classList.remove('show'); return; }
    const [who, text] = lines[i++];
    el.innerHTML = `<b>${who}</b><span>${text}</span>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    setTimeout(step, 3200);
  };
  setTimeout(step, 1600);
}
