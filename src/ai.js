// 적 AI: 플레이어와 똑같이 "몰래" 고른다 (플레이어가 이번 턴에 고른 카드는 보지 않음)
// 방법: 손패로 만들 수 있는 계획을 전부 따져 보고 점수가 가장 높은 것 + 약간의 무작위
'use strict';

function aiPlan(B) {
  const E = B.enemy, P = B.player;
  // 플레이어 이동 예측: 지난 턴 이동을 반쯤 믿는다 (사람은 같은 행동을 반복하는 경향)
  const predMove = Math.random() < 0.5 ? P.lastMove : 0;
  // 지원 카드 (드로우): 연료가 넉넉하면 먼저 써서 손패를 늘림 — 상대에게 안 보임
  for (let i = E.hand.length - 1; i >= 0; i--) {
    const c = DATA.cards[E.hand[i]];
    if (c.type === 'support' && i !== E.locked && E.fuel >= c.cost + 3) useSupport(B, E, i);
  }
  // 플레이어가 이번 턴 쏠 수 있는 대략의 피해 (연료는 서로 안 보이므로 원자로 기준)
  const expectedIncoming = Math.min(30, P.reactor * 5);
  const R = DATA.rules;

  // 멜트다운 턴: 기본 엔진만 — 선호 거리 쪽으로 (연료 한도 안에서)
  if (E.skip) {
    let engine = 0, bestS = -Infinity;
    for (let e = -E.fuel; e <= E.fuel; e++) {
      const d = clamp(B.distance - (e + predMove) * R.step, 0, R.maxDistance);
      const sc = -Math.abs(d - E.prefer) / 90 + Math.random() * 2;
      if (sc > bestS) { bestS = sc; engine = e; }
    }
    return { items: [], cool: 0, engine, od: false };
  }

  // 시스템 카드 (공개 때 가장 먼저 사용): 열 상황을 보고 미리 고름 → 모든 계획에 들어감
  const sysItems = [];
  let sysCost = 0;
  E.hand.forEach((id, i) => {
    const c = DATA.cards[id];
    if (c.type !== 'system' || i === E.locked) return;
    const room = E.fuel - sysCost >= c.cost + 2;
    const want = c.heatNow ? E.heat >= 55
      : c.selfStatus && c.selfStatus.cool ? statusOf(E, 'cool') === 0 && E.heat >= 35 && !sysItems.some((x) => DATA.cards[x.id].selfStatus)
      : c.extend ? statusOf(E, 'cool') > 0 || statusOf(P, 'jam') > 0 : false;
    if (want && room) { sysItems.push({ hand: i, id, steps: 0 }); sysCost += c.cost; }
  });
  // 물러나기는 400km 이내에서만
  const hand = E.hand.map((id, i) => ({ id, i })).filter((h) => h.i !== E.locked && DATA.cards[h.id].type !== 'system' && DATA.cards[h.id].type !== 'support'
    && !(DATA.cards[h.id].maxRange !== undefined && B.distance > DATA.cards[h.id].maxRange));
  const cardsNoMove = hand.filter((h) => DATA.cards[h.id].type !== 'move');
  const moveCards = hand.filter((h) => DATA.cards[h.id].type === 'move');

  // 이동 선택지: 이동 카드 없음 / 기동 카드 하나 (가변 기동은 −4 ~ +4)
  const moveOpts = [null];
  for (const h of moveCards) {
    const c = DATA.cards[h.id];
    if (c.variable) { for (let s = -4; s <= 4; s++) if (s) moveOpts.push({ hand: h.i, id: h.id, steps: s }); }
    else moveOpts.push({ hand: h.i, id: h.id, steps: 0 });
  }
  const engOpts = [];
  // 엔진 칸 수: 연료 한도만 (0km에서도 상대가 물러날 걸 예상해 전진할 수 있음)
  const fwdMax = Math.min(E.fuel + R.overdriveFuel, R.engineMaxSteps);
  const backMax = fwdMax;
  for (let e = -backMax; e <= fwdMax; e++) engOpts.push(e);
  const odOpts = E.odCooldown === 0 ? [false, true] : [false];

  // 전장: 플레이어가 있을 법한 곳에 구역을 깐다 (적 배 기준 거리)
  const fieldAt = (id) => {
    const w = DATA.cards[id].zone.width, dP = B.distance - predMove * R.step;
    return clamp(Math.round(dP / R.step - w / 2), 0, R.maxDistance / R.step);
  };
  const myField = B.fields.some((f) => f.owner === E);
  let best = null, bestScore = -Infinity;
  const n = cardsNoMove.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const picks = cardsNoMove.filter((_, k) => mask & (1 << k)).map((h) => ({ hand: h.i, id: h.id, steps: 0, at: DATA.cards[h.id].zone ? fieldAt(h.id) : undefined }));
    for (const mv of moveOpts) for (const engine of engOpts) for (const od of odOpts) {
      const items = sysItems.concat(mv ? picks.concat([mv]) : picks);
      const plan = { items, cool: 0, engine, od };
      const sum = planSummary(E, plan);
      if (!sum.ok) continue;
      plan.cool = sum.left;   // 남는 연료는 냉각에 (나중에 일부 이월)
      const s2 = planSummary(E, plan);

      const d = clamp(B.distance - (s2.move + predMove) * R.step, 0, R.maxDistance);
      let score = 0, wdmg = 0;
      for (const it of items) {
        const c = DATA.cards[it.id];
        if (c.type === 'weapon') wdmg += c.torpedo ? weaponDmg(c, clamp(d - predMove * 100, 0, 2000), od) * 0.7
          : weaponDmg(c, isPre(c) ? B.distance : d, od, isPre(c) ? 0 : predMove);   // 선제: 기동 전 거리 · 추적 무기: 예상 이동
        if (c.charge) wdmg += c.charge.dmg * 0.45;                       // 초고열 응집: 늦게 오는 큰 한 방
        if (c.inflict && weaponDmg(c, d, od)) score += 5 * Object.values(c.inflict).reduce((a, b) => a + b, 0);   // 상태이상
        if (c.evadeIfMoved && s2.move) score += expectedIncoming * c.evadeIfMoved * 0.8;   // 회피 기동: 움직이면 성공
        if (c.zone) score += myField ? 4 : 12;                             // 전장: 앞으로 여러 턴 피해
        if (c.shield) score += Math.min(c.shield, expectedIncoming) * 0.8;
        if (c.shieldNext) score += c.shieldNext * 0.4;                    // 재생 보호막
        if (c.dmgReduce) score += expectedIncoming * c.dmgReduce * 0.8;   // 물러나기
        if (c.pointDefense && B.torpedoes.some((t) => t.owner === P)) score += 12;
      }
      score += wdmg;
      // 오버드라이브는 비장의 한 수: 크게 이득일 때만 (아껴 두는 값)
      if (od) score -= 10;
      // 선호 거리 쪽으로
      score -= Math.abs(d - E.prefer) / 90;
      // 적용 중인 전장 구역 안에서 기동을 마치면 피해
      const xAfter = E.side === 'enemy' ? B.xE - s2.move * R.step : B.xP + s2.move * R.step;
      for (const f of fieldsAt(B, xAfter)) score -= f.dmg;
      // 열 위험
      if (s2.heatAfter >= R.meltdownHeat) score -= 40;
      else if (s2.heatAfter >= R.dangerHeat) score -= 10;
      else if (s2.heatAfter >= R.warnHeat) score -= 3;
      // 약간의 무작위 (읽히지 않게)
      score += Math.random() * 3;
      if (score > bestScore) { bestScore = score; best = plan; }
    }
  }
  if (!best) return { items: [], cool: 0, engine: 0, od: false };
  // 남는 연료: 열이 높으면 냉각, 아니면 일부 이월
  const sum = planSummary(E, Object.assign({}, best, { cool: 0 }));
  best.cool = E.heat + sum.heatIn > 40 ? sum.left : Math.max(0, sum.left - DATA.rules.carryMax);
  return best;
}
