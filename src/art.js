// 텍스처: 성운 · 행성 · 함선 · 보호막 무늬를 코드로 그려 둔다 (그림 파일 없음)
// 한 번 그려서 보관(오프스크린 캔버스)해 두고, 매 프레임엔 붙여 넣기만 함
'use strict';

const Art = {};

// 같은 씨앗이면 항상 같은 모양이 나오는 난수
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 부드러운 잡음 (여러 크기를 겹친 fbm) — 성운 · 행성 무늬 · 금속 얼룩에 사용
function makeNoise(w, h, cell, octaves, seed) {
  const rnd = seeded(seed);
  const out = new Float32Array(w * h);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const c = Math.max(2, cell >> o);
    const gw = Math.ceil(w / c) + 2, gh = Math.ceil(h / c) + 2;
    const grid = new Float32Array(gw * gh).map(() => rnd());
    for (let y = 0; y < h; y++) {
      const gy = y / c, y0 = gy | 0, fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < w; x++) {
        const gx = x / c, x0 = gx | 0, fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1];
        const cc = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
        out[y * w + x] += amp * ((a + (b - a) * sx) + ((cc + (d - cc) * sx) - (a + (b - a) * sx)) * sy);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ── 성운 ─────────────────────────────────────
function buildNebula() {
  const w = 640, h = 320, c = canvas(w, h), g = c.getContext('2d');
  const n1 = makeNoise(w, h, 96, 5, 11), n2 = makeNoise(w, h, 64, 4, 29), n3 = makeNoise(w, h, 24, 3, 47);
  const img = g.createImageData(w, h);
  // 두 가지 색 구름: 보라 · 청록, 가는 먼지 줄은 어둡게
  for (let i = 0; i < w * h; i++) {
    const a = Math.max(0, (n1[i] - 0.42) * 2.4);
    const mix = n2[i];
    const dust = Math.max(0, (n3[i] - 0.55) * 2);
    const k = a * (1 - dust * 0.8);
    img.data[i * 4] = 80 * (1 - mix) + 20 * mix + 120 * k * (1 - mix);
    img.data[i * 4 + 1] = 30 * (1 - mix) + 90 * mix + 60 * k * mix;
    img.data[i * 4 + 2] = 140 * (1 - mix) + 150 * mix + 60 * k;
    img.data[i * 4 + 3] = Math.min(255, k * 170);
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ── 행성 (가스 행성, 띠 무늬 + 명암 경계) ────
function buildPlanet() {
  const s = 420, c = canvas(s, s), g = c.getContext('2d');
  const r = s / 2 - 4;
  const band = makeNoise(s, s, 40, 4, 73);
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (x - s / 2) / r, dy = (y - s / 2) / r, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      // 띠: 가로로 늘인 무늬
      const bn = band[y * s + ((x * 0.25 + y * 0.02) | 0) % s];
      const t = Math.sin(dy * 9 + bn * 4) * 0.5 + 0.5;
      let R = 70 + 90 * t, Gc = 90 + 70 * t, Bc = 110 + 40 * (1 - t);
      // 빛: 오른쪽 위에서
      const nz = Math.sqrt(1 - d2);
      const light = Math.max(0, dx * 0.55 - dy * 0.35 + nz * 0.75);
      const shade = 0.08 + 0.92 * Math.pow(light, 1.4);
      const i = (y * s + x) * 4;
      img.data[i] = R * shade; img.data[i + 1] = Gc * shade; img.data[i + 2] = Bc * shade;
      img.data[i + 3] = 255 * Math.min(1, (1 - Math.sqrt(d2)) * 60);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ── 금속 얼룩 텍스처 (함선 표면에 곱하기로 덮음) ──
function buildGrime() {
  const w = 256, h = 128, c = canvas(w, h), g = c.getContext('2d');
  const n = makeNoise(w, h, 16, 4, 101), fine = makeNoise(w, h, 3, 2, 131);
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 150 + 105 * (n[i] * 0.7 + fine[i] * 0.3);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 1.02; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 가는 긁힘
  const rnd = seeded(7);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 0.6;
  for (let k = 0; k < 40; k++) {
    const x = rnd() * w, y = rnd() * h;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 24 - 12, y + rnd() * 4 - 2); g.stroke();
  }
  return c;
}

// ── 육각형 보호막 무늬 ───────────────────────
function buildHex() {
  const hw = 18, hh = 31.2, c = canvas(hw * 3, hh * 2), g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 1.2;
  const hex = (cx, cy) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; g.lineTo(cx + Math.cos(a) * hw / 1.6, cy + Math.sin(a) * hw / 1.6); }
    g.closePath(); g.stroke();
  };
  for (const [x, y] of [[0, 0], [hw * 1.5, hh / 2], [hw * 3, 0], [0, hh], [hw * 3, hh], [hw * 1.5, hh * 1.5]]) hex(x, y);
  return c;
}

// ── 함선 ─────────────────────────────────────
// 좌표: 가로 −100 ~ 100, 세로 −45 ~ 45, 오른쪽이 뱃머리. (적은 화면에서 뒤집어 그림)
// 입체 조명: 모양 → 높낮이 지도(모서리 둥글게 · 판금 돋움 · 이음새 홈) → 한 픽셀씩 빛 계산
//   (난반사 + 금속 반사광 + 틈새 그림자 + 반대편 푸른 역광) → 창문 · 등 같은 빛나는 것은 마지막에
//
// 설계 항목
//   parts   선체 다각형들 (합쳐짐)        towers  함교 · 탑 (더 높이 솟음)
//   plates  돋은 판금 [x, y, 폭, 높이, 'alt'=다른 금속색]
//   seams   세로 이음새 x들               turrets 포탑 [x, y, 반지름]
//   greebles 잔 부품 개수                 vents   통풍구 [x, y, 칸 수]
//   metal / metal2  금속색 두 가지         rust    녹 정도 (0~1)
//   paint   도장 줄 [[x1,y1],[x2,y2], 굵기, 색, 위아래대칭]
//   hazard  경고 줄무늬 칸 [x, y, 폭, 높이]  decal  선체 번호
//   windows 창문 줄 [x, y, 개수, 간격]      lights 항해등 [x, y, 색]
//   nozzles 엔진 [x, y, 반지름]            accent 강조색 · flame 불꽃색 · spec 광택 · scale 크기
const SHIP_DESIGNS = {
  // 호위함 「나침반」 — 매끈한 흰 회색 선체, 청록 도장
  player: {
    scale: 1, spec: 0.95, rust: 0, seed: 3,
    parts: [
      [[90, 0], [72, -5], [46, -9], [20, -11], [8, -14], [-12, -21], [-40, -22], [-52, -15], [-76, -14], [-76, 14], [-52, 15], [-40, 22], [-12, 21], [8, 14], [20, 11], [46, 9], [72, 5]],
      [[-66, -29], [-22, -29], [-14, -22], [-56, -19], [-72, -23]],
      [[-66, 29], [-22, 29], [-14, 22], [-56, 19], [-72, 23]],
    ],
    towers: [[[-32, -21], [-8, -21], [-3, -30], [-26, -32]]],
    plates: [[-48, -11, 30, 22], [-14, -8, 32, 16, 'alt'], [22, -6, 26, 12], [52, -4, 16, 8, 'alt'], [-62, -27, 38, 5, 'alt'], [-62, 22, 38, 5, 'alt']],
    seams: [-52, -30, -12, 6, 24, 48, 66], turrets: [[30, -9, 3], [30, 9, 3], [-4, -14, 3.4]],
    greebles: 26, vents: [[-70, -9, 4], [-70, 5, 4]],
    metal: [206, 213, 222], metal2: [168, 177, 190],
    paint: [[[42, -7], [-6, -9], 1.8, '#3FC6CC', true], [[74, -3.5], [88, -0.8], 1.6, '#2B3440', true]],
    hazard: [], decal: ['NC-01', -34, 5, 5],
    windows: [[-44, -1.5, 9, 5.2], [-24, -27, 4, 4.4]], winColor: '#AFF7FA',
    lights: [[-62, -30, '#5CE1E6'], [-62, 30, '#5CE1E6'], [88, 0, '#FFFFFF']],
    nozzles: [[-76, -8, 5], [-76, 8, 5], [-72, -25, 3.4], [-72, 25, 3.4]],
    accent: '#5CE1E6', flame: [120, 230, 255],
  },
  // 순찰 구축함 VEX-7 — 짙은 강철, 붉은 도장
  vex: {
    scale: 1, spec: 0.6, rust: 0.1, seed: 11,
    parts: [[[84, 0], [70, -6], [44, -9], [34, -24], [-4, -24], [-14, -13], [-46, -15], [-62, -27], [-82, -27], [-82, 27], [-62, 27], [-46, 15], [-14, 13], [-4, 24], [34, 24], [44, 9], [70, 6]]],
    towers: [[[-8, -24], [20, -24], [16, -33], [-4, -33]]],
    plates: [[-40, -11, 26, 22], [-10, -8, 30, 16, 'alt'], [24, -6, 22, 12], [-78, -24, 26, 10, 'alt'], [-78, 14, 26, 10, 'alt'], [2, -22, 28, 6], [2, 16, 28, 6]],
    seams: [-60, -40, -20, 0, 20, 40, 60], turrets: [[12, -19, 4], [12, 19, 4], [52, 0, 3.2]],
    greebles: 30, vents: [[-58, -4, 5]],
    metal: [132, 138, 148], metal2: [100, 106, 118],
    paint: [[[62, -4], [30, -5], 2, '#D8454A', true], [[-80, -25], [-64, -25], 2.4, '#D8454A', true]],
    hazard: [[-80, 19, 16, 6]], decal: ['VX-7', -36, 6, 5.5],
    windows: [[-36, -1.2, 8, 5]], winColor: '#FFB09F',
    lights: [[-80, -28, '#FF5A5F'], [-80, 28, '#FF5A5F'], [82, 0, '#FFB0A0']],
    nozzles: [[-82, -17, 5], [-82, 0, 5], [-82, 17, 5]],
    accent: '#FF5A5F', flame: [255, 140, 110],
  },
  // 고철단 초계정 — 작고 비대칭, 녹슨 갈색에 짝 안 맞는 판금
  scav: {
    scale: 0.84, spec: 0.35, rust: 0.65, seed: 23,
    parts: [
      [[76, 2], [58, -6], [36, -10], [20, -17], [-6, -18], [-22, -24], [-50, -22], [-64, -12], [-64, 14], [-46, 20], [-18, 19], [4, 15], [30, 12], [56, 8]],
      [[60, -4], [88, -1], [62, 4]],
      [[8, 13], [36, 13], [32, 25], [6, 25]],
    ],
    towers: [[[-28, -22], [-8, -21], [-10, -30], [-30, -29]]],
    plates: [[-50, -14, 20, 14, 'alt'], [-26, -10, 22, 20], [0, -9, 18, 12, 'alt'], [20, -6, 16, 10], [-40, 6, 26, 10, 'alt'], [10, 15, 20, 8, 'alt']],
    seams: [-44, -20, 2, 24, 46], turrets: [[22, 20, 4.2], [44, -5, 3]],
    greebles: 24, vents: [[-56, -6, 3]],
    metal: [146, 120, 94], metal2: [150, 156, 164],
    paint: [[[-6, -17], [6, 16], 4, '#E07A30', false]],
    hazard: [[40, -9, 14, 5]], decal: ['SC-3', -30, 9, 5],
    windows: [[-24, -1, 4, 6]], winColor: '#FFC98A',
    lights: [[-60, -14, '#FF8A3A'], [-60, 15, '#FF8A3A']],
    nozzles: [[-64, -4, 6], [-64, 9, 4.5]],
    accent: '#FF8A3A', flame: [255, 170, 90],
  },
  // 고철단 약탈선 — 검은 선체, 노랑 · 검정 경고 무늬, 앞쪽 두 갈래 뿔
  raider: {
    scale: 1.05, spec: 0.5, rust: 0.2, seed: 37,
    parts: [[[84, -12], [64, -16], [50, -9], [40, -20], [4, -22], [-18, -29], [-58, -27], [-80, -15], [-80, 15], [-58, 27], [-18, 29], [4, 22], [40, 20], [50, 9], [64, 16], [84, 12], [66, 4], [58, 0], [66, -4]]],
    towers: [[[-20, -26], [6, -22], [0, -32], [-18, -34]]],
    plates: [[-56, -12, 30, 24, 'alt'], [-22, -10, 34, 20], [16, -7, 24, 14, 'alt'], [-50, -24, 30, 6], [-50, 18, 30, 6], [46, -15, 18, 5, 'alt'], [46, 10, 18, 5, 'alt']],
    seams: [-60, -38, -16, 6, 28, 50], turrets: [[24, -15, 4], [24, 15, 4], [-4, 0, 4.5]],
    greebles: 30, vents: [[-72, -7, 4], [-72, 3, 4]],
    metal: [58, 62, 70], metal2: [44, 47, 54],
    paint: [[[30, -17], [-10, -19], 2.2, '#E8B23C', true]],
    hazard: [[52, -16, 26, 5], [52, 11, 26, 5], [-79, -11, 7, 22]], decal: ['RD-9', -40, 6, 5.5],
    windows: [[-50, -1.2, 8, 5]], winColor: '#FFD27A',
    lights: [[-78, -16, '#FFC24A'], [-78, 16, '#FFC24A'], [82, -12, '#FF5A5F'], [82, 12, '#FF5A5F']],
    nozzles: [[-80, -9, 6], [-80, 9, 6]],
    accent: '#FFC24A', flame: [255, 190, 90],
  },
  // 「고철왕」 — 거대하고 뭉툭한 누더기 중구축함, 충각 뱃머리
  junkKing: {
    scale: 1.28, spec: 0.35, rust: 0.7, seed: 53,
    parts: [
      [[84, 0], [74, -10], [70, -22], [42, -30], [10, -33], [-28, -33], [-48, -39], [-80, -37], [-88, -22], [-88, 22], [-80, 37], [-48, 39], [-28, 33], [10, 33], [42, 30], [70, 22], [74, 10]],
      [[78, -9], [99, 0], [78, 9]],
    ],
    towers: [[[-38, -33], [-4, -33], [-8, -42], [-34, -43]], [[-66, -12], [-44, -12], [-44, 12], [-66, 12]]],
    plates: [[-80, -30, 26, 14, 'alt'], [-80, 16, 26, 14], [-50, -26, 30, 16], [-50, 10, 30, 16, 'alt'], [-16, -24, 30, 14, 'alt'], [-16, 10, 30, 14], [18, -20, 26, 12], [18, 8, 26, 12, 'alt'], [48, -14, 18, 28], [-40, -7, 70, 14, 'alt']],
    seams: [-70, -52, -34, -16, 2, 20, 38, 56], turrets: [[0, -28, 5], [0, 28, 5], [34, -24, 4], [34, 24, 4], [60, 0, 4.4]],
    greebles: 46, vents: [[-84, -11, 5], [-84, 4, 5], [-28, -3, 6]],
    metal: [130, 108, 88], metal2: [140, 146, 152],
    paint: [[[-46, -38], [-46, 38], 4.5, '#C9432F', false], [[-40, -38], [-40, 38], 1.5, '#C9432F', false]],
    hazard: [[72, -18, 10, 36]], decal: ['KING', 4, 3, 7],
    windows: [[-34, -38, 5, 5], [-20, -1.5, 6, 6]], winColor: '#FFB27A',
    lights: [[-86, -30, '#FF5A5F'], [-86, 30, '#FF5A5F'], [96, 0, '#FFB0A0']],
    nozzles: [[-88, -26, 6], [-88, -9, 7], [-88, 9, 7], [-88, 26, 6]],
    accent: '#FF6A3A', flame: [255, 150, 90],
  },
  // ── 2장: 연합 함대 잔존함 (나침반과 같은 계열의 밝은 선체, 푸른 도장) ──
  // 연합 초계함 — 나침반보다 뭉툭한 표준형
  allyPatrol: {
    scale: 1, spec: 0.85, rust: 0.05, seed: 61,
    parts: [
      [[84, 0], [66, -7], [40, -11], [14, -13], [0, -20], [-30, -22], [-48, -16], [-76, -16], [-76, 16], [-48, 16], [-30, 22], [0, 20], [14, 13], [40, 11], [66, 7]],
      [[-60, -28], [-26, -28], [-22, -21], [-56, -20]], [[-60, 28], [-26, 28], [-22, 21], [-56, 20]],
    ],
    towers: [[[-24, -21], [0, -21], [4, -29], [-20, -31]]],
    plates: [[-46, -12, 28, 24], [-12, -9, 30, 18, 'alt'], [22, -7, 24, 14], [-58, -27, 32, 5, 'alt'], [-58, 22, 32, 5, 'alt']],
    seams: [-56, -34, -14, 6, 26, 48], turrets: [[28, -10, 3.4], [28, 10, 3.4], [50, 0, 3]],
    greebles: 26, vents: [[-70, -8, 4], [-70, 4, 4]],
    metal: [190, 198, 210], metal2: [150, 160, 176],
    paint: [[[40, -8], [-8, -10], 2, '#4F86E8', true], [[-58, -27.5], [-28, -27.5], 1.4, '#4F86E8', true]],
    hazard: [], decal: ['UF-12', -30, 5, 5],
    windows: [[-40, -1.5, 8, 5.2]], winColor: '#BFD8FF',
    lights: [[-58, -29, '#6FA8FF'], [-58, 29, '#6FA8FF'], [82, 0, '#FFFFFF']],
    nozzles: [[-76, -9, 5], [-76, 9, 5]],
    accent: '#6FA8FF', flame: [140, 190, 255],
  },
  // 연합 어뢰정 — 가늘고 작음, 양옆 어뢰관 포드
  torpBoat: {
    scale: 0.82, spec: 0.8, rust: 0.05, seed: 67,
    parts: [
      [[80, 0], [60, -5], [30, -8], [-10, -9], [-40, -10], [-66, -8], [-66, 8], [-40, 10], [-10, 9], [30, 8], [60, 5]],
      [[36, -6], [-40, -7], [-46, -22], [30, -22], [46, -15]], [[36, 6], [-40, 7], [-46, 22], [30, 22], [46, 15]],
    ],
    towers: [[[-30, -9], [-8, -9], [-12, -16], [-28, -16]]],
    plates: [[-36, -21, 64, 7, 'alt'], [-36, 14, 64, 7, 'alt'], [-50, -7, 40, 14], [-6, -6, 30, 12]],
    seams: [-50, -30, -10, 10, 30], turrets: [[50, 0, 2.6]],
    greebles: 18, vents: [[-60, -4, 4]],
    metal: [182, 190, 204], metal2: [132, 142, 160],
    paint: [[[44, -17], [36, -22], 2.2, '#4F86E8', true]],
    hazard: [], decal: ['TB-4', -34, 3, 4.5],
    windows: [[-26, -13, 4, 4]], winColor: '#BFD8FF',
    lights: [[-44, -22, '#6FA8FF'], [-44, 22, '#6FA8FF'], [78, 0, '#FFFFFF']],
    nozzles: [[-66, 0, 5], [-46, -17, 3.4], [-46, 17, 3.4]],
    accent: '#6FA8FF', flame: [140, 190, 255],
  },
  // 연합 강습함 「방패」 — 두툼한 몸통, 보호막 발생기 돔
  allyAssault: {
    scale: 1.1, spec: 0.75, rust: 0.08, seed: 71,
    parts: [
      [[78, 0], [66, -12], [40, -20], [0, -24], [-40, -26], [-70, -24], [-82, -14], [-82, 14], [-70, 24], [-40, 26], [0, 24], [40, 20], [66, 12]],
    ],
    towers: [[[-26, -24], [4, -24], [0, -34], [-22, -35]], [[10, -20], [24, -20], [24, -27], [10, -27]], [[10, 20], [24, 20], [24, 27], [10, 27]]],
    plates: [[-70, -18, 30, 36, 'alt'], [-36, -18, 36, 14], [-36, 4, 36, 14], [4, -14, 32, 28, 'alt'], [40, -10, 20, 20]],
    seams: [-60, -40, -20, 0, 20, 44], turrets: [[-10, 0, 5.5], [50, 0, 3.4], [-54, 0, 4.5]],
    greebles: 34, vents: [[-78, -8, 5]],
    metal: [176, 184, 196], metal2: [132, 142, 158],
    paint: [[[60, -13], [30, -19], 2.6, '#4F86E8', true], [[-80, -12], [-80, 12], 2, '#4F86E8', false]],
    hazard: [], decal: ['AS-2', -52, 6, 6],
    windows: [[-22, -31, 4, 4.5], [-66, -1.5, 5, 5]], winColor: '#BFD8FF',
    lights: [[-80, -16, '#6FA8FF'], [-80, 16, '#6FA8FF'], [76, 0, '#FFFFFF']],
    nozzles: [[-82, -8, 6], [-82, 8, 6]],
    accent: '#6FA8FF', flame: [140, 190, 255],
    domes: [[17, -24, 4], [17, 24, 4]],
  },
  // 순양함 「단호」 — 길고 우아한 선체, 뱃머리 너머로 뻗은 레일건 포신
  resolute: {
    scale: 1.3, spec: 0.95, rust: 0, seed: 79,
    parts: [
      [[70, 0], [56, -8], [30, -12], [0, -16], [-24, -24], [-60, -26], [-76, -20], [-90, -18], [-90, 18], [-76, 20], [-60, 26], [-24, 24], [0, 16], [30, 12], [56, 8]],
      [[98, -2], [60, -3.5], [60, 3.5], [98, 2]],
    ],
    towers: [[[-44, -26], [-10, -24], [-14, -36], [-40, -38]], [[-70, -10], [-50, -10], [-50, 10], [-70, 10]]],
    plates: [[-80, -16, 26, 32, 'alt'], [-48, -18, 40, 14], [-48, 4, 40, 14], [-4, -12, 34, 24, 'alt'], [34, -8, 20, 16]],
    seams: [-76, -56, -34, -12, 10, 32, 52], turrets: [[10, -14, 3.6], [10, 14, 3.6], [-30, -20, 3.4], [-30, 20, 3.4]],
    greebles: 36, vents: [[-86, -10, 5], [-86, 4, 5]],
    metal: [214, 220, 228], metal2: [168, 178, 192],
    paint: [[[56, -8.5], [0, -16.5], 1.8, '#3E6FCF', true], [[64, -3.2], [96, -1.8], 1.2, '#2B3440', true]],
    hazard: [], decal: ['RESOLUTE', -24, 4, 5.5],
    windows: [[-40, -33, 6, 4.4], [-44, -1.5, 9, 5]], winColor: '#D2E4FF',
    lights: [[-88, -19, '#6FA8FF'], [-88, 19, '#6FA8FF'], [98, 0, '#BFE0FF']],
    nozzles: [[-90, -12, 6], [-90, 0, 6], [-90, 12, 6]],
    accent: '#6FA8FF', flame: [150, 200, 255],
  },
};

// 흐림 (가로 · 세로 상자 흐림 2번)
function blurField(src, w, h, r) {
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / (2 * r + 1);
        acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

// lx: 빛이 오는 가로 방향 (+ 오른쪽). 적은 화면에서 뒤집히므로 반대로 구워 둠
function buildShip(key, lx) {
  const D = SHIP_DESIGNS[key], S = 3, W = 200 * S, H = 90 * S, N = W * H;
  const rnd = seeded(D.seed);
  const mk = () => { const c = canvas(W, H), g = c.getContext('2d'); g.translate(W / 2, H / 2); g.scale(S, S); return [c, g]; };
  const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  const allParts = D.parts.concat(D.towers);
  const read = (c) => c.getContext('2d').getImageData(0, 0, W, H).data;

  // 1) 모양 (마스크)
  const [mc, mg] = mk();
  mg.fillStyle = '#fff';
  for (const p of allParts) { poly(mg, p); mg.fill(); }
  const md = read(mc), M = new Float32Array(N);
  for (let i = 0; i < N; i++) M[i] = md[i * 4 + 3] / 255;
  const inside = (x, y) => { mg.save(); mg.setTransform(1, 0, 0, 1, 0, 0); const ok = md[(((y + 45) * S) | 0) * W * 4 + (((x + 100) * S) | 0) * 4 + 3] > 200; mg.restore(); return ok; };

  // 2) 잔 부품 위치 (선체 안쪽에서 무작위)
  const greebles = [];
  let guard = 0;
  while (greebles.length < D.greebles && guard++ < 2000) {
    const x = -90 + rnd() * 180, y = -40 + rnd() * 80, w = 1.5 + rnd() * 4, h = 1 + rnd() * 3;
    if (inside(x, y) && inside(x + w, y + h) && inside(x, y + h) && inside(x + w, y)) greebles.push([x, y, w, h, rnd()]);
  }

  // 3) 높낮이 지도 (회색 128 = 기준)
  const [dc, dg] = mk();
  dg.save(); dg.setTransform(1, 0, 0, 1, 0, 0); dg.fillStyle = 'rgb(128,128,128)'; dg.fillRect(0, 0, W, H); dg.restore();
  const gray = (v) => `rgb(${v},${v},${v})`;
  for (const [x, y, w, h] of D.plates) { dg.fillStyle = gray(158); dg.fillRect(x, y, w, h); dg.strokeStyle = gray(88); dg.lineWidth = 0.45; dg.strokeRect(x, y, w, h); }
  for (const t of D.towers) { poly(dg, t); dg.fillStyle = gray(215); dg.fill(); dg.strokeStyle = gray(90); dg.lineWidth = 0.6; dg.stroke(); }
  dg.strokeStyle = gray(95); dg.lineWidth = 0.4;
  for (const x of D.seams) { dg.beginPath(); dg.moveTo(x, -45); dg.lineTo(x + 2, 45); dg.stroke(); }
  dg.beginPath(); dg.moveTo(-100, 0.5); dg.lineTo(100, 0.5); dg.stroke();
  for (const [x, y, w, h, r] of greebles) { dg.fillStyle = gray(170 + ((r * 60) | 0)); dg.fillRect(x, y, w, h); }
  for (const [x, y, r] of D.turrets) {
    dg.fillStyle = gray(225); dg.beginPath(); dg.arc(x, y, r, 0, 6.28); dg.fill();
    dg.fillStyle = gray(200); dg.fillRect(x, y - 0.7, r * 2.6, 1.4);
    dg.strokeStyle = gray(90); dg.lineWidth = 0.5; dg.beginPath(); dg.arc(x, y, r, 0, 6.28); dg.stroke();
  }
  for (const [x, y, n] of D.vents) for (let k = 0; k < n; k++) { dg.fillStyle = gray(50); dg.fillRect(x, y + k * 1.6, 7, 0.8); }
  for (const [x, y, r] of D.domes || []) {      // 보호막 발생기 돔 (볼록)
    const gr = dg.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, gray(255)); gr.addColorStop(1, gray(150));
    dg.fillStyle = gr; dg.beginPath(); dg.arc(x, y, r, 0, 6.28); dg.fill();
  }
  for (const [x, y, r] of D.nozzles) { dg.fillStyle = gray(190); dg.fillRect(x - 1, y - r, 6, r * 2); dg.fillStyle = gray(40); dg.fillRect(x - 1.5, y - r * 0.7, 2, r * 1.4); }
  const dd = read(dc);

  // 둥근 몸통: 세로줄마다 위아래 끝을 찾아 원통처럼 볼록하게 (위는 빛, 아래는 그늘)
  const cyl = new Float32Array(N);
  for (let x = 0; x < W; x++) {
    let top = -1, bot = -1;
    for (let y = 0; y < H; y++) if (M[y * W + x] > 0.5) { if (top < 0) top = y; bot = y; }
    if (top < 0) continue;
    const c = (top + bot) / 2, half = (bot - top) / 2 + 1, amp = 0.45 + 0.55 * Math.min(1, half / (28 * S));
    for (let y = top; y <= bot; y++) { const t = (y - c) / half; cyl[y * W + x] = Math.sqrt(Math.max(0, 1 - t * t)) * amp; }
  }
  // 둥근 모서리 + 원통 + 돋움 합치기
  const bev = blurField(M, W, H, 11);
  const Hh = new Float32Array(N);
  for (let i = 0; i < N; i++) Hh[i] = M[i] * (0.8 * cyl[i] + 0.45 * Math.pow(Math.min(1, bev[i] * 1.6), 0.7) + ((dd[i * 4] - 128) / 128) * 0.3);
  const Hb = blurField(Hh, W, H, 5);

  // 4) 색 (도장 · 판금 · 녹 · 얼룩)
  const [ac, ag] = mk();
  const rgb = (c, k = 1) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;
  ag.fillStyle = rgb(D.metal);
  for (const p of allParts) { poly(ag, p); ag.fill(); }
  for (const [x, y, w, h, alt] of D.plates) { ag.fillStyle = rgb(alt ? D.metal2 : D.metal, 0.92 + rnd() * 0.16); ag.fillRect(x, y, w, h); }
  for (const t of D.towers) { poly(ag, t); ag.fillStyle = rgb(D.metal, 1.05); ag.fill(); }
  for (const [x, y, w, h, r] of greebles) { ag.fillStyle = rgb(r < 0.5 ? D.metal2 : D.metal, 0.8 + r * 0.3); ag.fillRect(x, y, w, h); }
  // 경고 줄무늬
  for (const [x, y, w, h] of D.hazard) {
    ag.save(); ag.beginPath(); ag.rect(x, y, w, h); ag.clip();
    ag.fillStyle = '#E8B23C'; ag.fillRect(x, y, w, h);
    ag.fillStyle = '#1A1A1A';
    for (let k = -h; k < w + h; k += 4) { ag.beginPath(); ag.moveTo(x + k, y); ag.lineTo(x + k + 2, y); ag.lineTo(x + k + 2 - h, y + h); ag.lineTo(x + k - h, y + h); ag.fill(); }
    ag.restore();
  }
  // 도장 줄
  ag.lineCap = 'butt';
  for (const [[x1, y1], [x2, y2], w, col, mirror] of D.paint) {
    ag.strokeStyle = col; ag.lineWidth = w;
    ag.beginPath(); ag.moveTo(x1, y1); ag.lineTo(x2, y2); ag.stroke();
    if (mirror) { ag.beginPath(); ag.moveTo(x1, -y1); ag.lineTo(x2, -y2); ag.stroke(); }
  }
  // 선체 번호
  if (D.decal) {
    const [txt, x, y, size] = D.decal;
    ag.font = `900 ${size}px Consolas, monospace`; ag.fillStyle = 'rgba(20,24,30,0.72)';
    ag.save(); ag.translate(x, y); if (lx < 0) ag.scale(-1, 1);   // 적은 화면에서 뒤집히므로 거꾸로
    ag.textAlign = 'center'; ag.fillText(txt, 0, 0); ag.restore();
  }
  // 엔진 뒤 그을음
  ag.globalCompositeOperation = 'multiply';
  for (const [x, y, r] of D.nozzles) {
    const gr = ag.createRadialGradient(x + 4, y, 0, x + 4, y, r * 3.5);
    gr.addColorStop(0, 'rgba(40,30,25,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ag.fillStyle = gr; ag.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  }
  // 얼룩
  ag.globalAlpha = 0.5;
  ag.drawImage(Art.grime, -100, -45, 200, 90);
  ag.globalAlpha = 1;
  ag.globalCompositeOperation = 'source-over';
  const ad = read(ac);
  // 녹 (잡음으로 번짐)
  const rustN = D.rust ? makeNoise(W, H, 30, 4, D.seed + 5) : null, rustF = D.rust ? makeNoise(W, H, 6, 2, D.seed + 9) : null;

  // 5) 빛 계산
  const L = (() => { const v = [lx, -0.62, 0.72], n = Math.hypot(...v); return v.map((q) => q / n); })();
  const Rl = (() => { const v = [-lx * 0.9, 0.35, 0.35], n = Math.hypot(...v); return v.map((q) => q / n); })();
  const Hv = (() => { const v = [L[0], L[1], L[2] + 1], n = Math.hypot(...v); return v.map((q) => q / n); })();
  const out = mc.getContext('2d').createImageData(W, H), od = out.data;
  const K = 5.5;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (M[i] <= 0) continue;
      const nx = -(Hh[i + 1] - Hh[i - 1]) * K, ny = -(Hh[i + W] - Hh[i - W]) * K;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1), Nx = nx * inv, Ny = ny * inv, Nz = inv;
      const diff = Math.max(0, Nx * L[0] + Ny * L[1] + Nz * L[2]);
      const nh = Math.max(0, Nx * Hv[0] + Ny * Hv[1] + Nz * Hv[2]);
      const spec = (Math.pow(nh, 36) + 0.22 * Math.pow(nh, 7)) * D.spec;
      const rim = Math.max(0, Nx * Rl[0] + Ny * Rl[1] + Nz * Rl[2]) * (1 - Nz) * 1.4;
      const ao = Math.max(0.4, Math.min(1, 1 - (Hb[i] - Hh[i]) * 2.6));
      const vert = 1 - 0.28 * (y / H);          // 아래쪽은 조금 어둡게
      let r = ad[i * 4], gC = ad[i * 4 + 1], b = ad[i * 4 + 2];
      if (rustN) {
        const rv = Math.max(0, Math.min(1, (rustN[i] - (0.72 - D.rust * 0.26)) * 5)) * (0.55 + 0.45 * rustF[i]);
        r = r * (1 - rv) + 118 * rv; gC = gC * (1 - rv) + 66 * rv; b = b * (1 - rv) + 38 * rv;
      }
      const lit = (0.13 + 1.08 * diff) * ao * vert;
      const sp = spec * 255;
      od[i * 4] = Math.min(255, r * lit + sp * 0.75 + r * 0.25 * spec + 70 * rim);
      od[i * 4 + 1] = Math.min(255, gC * lit + sp * 0.78 + gC * 0.25 * spec + 110 * rim);
      od[i * 4 + 2] = Math.min(255, b * lit + sp * 0.85 + b * 0.25 * spec + 190 * rim);
      od[i * 4 + 3] = M[i] * 255;
    }
  }
  const c = canvas(W, H), g = c.getContext('2d');
  g.putImageData(out, 0, 0);

  // 6) 빛나는 것들 (조명 영향 없음)
  g.translate(W / 2, H / 2); g.scale(S, S);
  g.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, col, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); g.globalAlpha = 1;
  };
  for (const [x0, y, n, sp] of D.windows) {
    for (let k = 0; k < n; k++) {
      const on = rnd() > 0.18;
      if (!on) continue;
      const x = x0 + k * sp;
      g.globalAlpha = 0.55 + rnd() * 0.45;
      g.fillStyle = D.winColor; g.fillRect(x, y, 2.2, 1.3);
      g.globalAlpha = 1;
      glow(x + 1.1, y + 0.6, 3, D.winColor, 0.35);
    }
  }
  for (const [x, y, r] of D.nozzles) glow(x - 0.5, y, r * 1.3, `rgba(${D.flame.join(',')},0.9)`, 0.55);
  for (const [x, y, r] of D.domes || []) glow(x, y, r * 2.2, 'rgba(140,190,255,0.9)', 0.45);
  g.globalCompositeOperation = 'source-over';
  return c;
}

Art.build = function () {
  Art.grime = buildGrime();
  Art.nebula = buildNebula();
  Art.planet = buildPlanet();
  Art.hex = buildHex();
  Art.design = SHIP_DESIGNS;
  Art.ship = {};
  for (const key of Object.keys(SHIP_DESIGNS)) Art.ship[key] = buildShip(key, key === 'player' ? 0.55 : -0.55);
};
