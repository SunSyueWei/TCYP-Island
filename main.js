import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { ISLANDS, taipeiNow, nextEvent, daysUntil, todaysGroups, isTentative } from './content.js';
import { createIslanders } from './islanders.js';
import { createCreator } from './creator.js';
import * as store from './store.js';
import { createFishing, remainingToday } from './fishing.js';
import * as staff from './staff.js';
import { createPeople } from './people.js';
import { createTsunami } from './tsunami.js';

// ================= 基本設定 =================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
// 低階裝置：降低解析度與陰影品質
const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || matchMedia('(max-width: 720px)').matches;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW_END ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const DAY_FOG = new THREE.Color('#fbe8c8');
const NIGHT_FOG = new THREE.Color('#6b5a7a');
scene.fog = new THREE.Fog(DAY_FOG, 60, 130);

// 窄視角 → 微縮模型感
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 300);
const HOME_POS = new THREE.Vector3(33, 37, 42);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);
camera.position.copy(HOME_POS);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 14;
controls.maxDistance = 85;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.2;
controls.screenSpacePanning = false;
controls.autoRotate = !REDUCED_MOTION;
controls.autoRotateSpeed = 0.35;

// ================= 光線 =================
const hemi = new THREE.HemisphereLight('#fff3dc', '#8fb6a8', 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d0', 2.4);
sun.position.set(18, 30, 12);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(LOW_END ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

// ================= 材質工具 =================
const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...opts }));
  return mats.get(key);
}
// 夜間會亮的窗戶
const windowMat = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffcf6b', emissiveIntensity: 0, roughness: 0.4 });
const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0.2 });

const C = {
  grass: ['#a3d06f', '#93c463', '#b2d97c', '#9ccb6a'],
  sand: '#f3d9a2', soil: '#c4895a', soilDark: '#a26f48',
  cream: '#fff3dc', white: '#fffaf0', coral: '#e97a5b', sun: '#f2b544', sky: '#6ba8d8',
  pink: '#f49aa0', mint: '#8fd3c1', wood: '#b9824f', woodDark: '#8a5a35', stone: '#d9cfc0',
  leaf: '#5fa65a', leaf2: '#7cbf5e', pine: '#3f8a5b', roof2: '#c75b4a', purple: '#a993d6',
};

const animators = [];
const onTick = (fn) => animators.push(fn);

function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y + h / 2, z);
  return m;
}
function cyl(rt, rb, h, color, seg = 12, x = 0, y = 0, z = 0) {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y + h / 2, z);
  return m;
}
function cone(r, h, color, seg = 8, x = 0, y = 0, z = 0) {
  const m = mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
  m.position.set(x, y + h / 2, z);
  return m;
}
function ball(r, color, x = 0, y = 0, z = 0, detail = 0) {
  const m = mesh(new THREE.IcosahedronGeometry(r, detail), mat(color));
  m.position.set(x, y, z);
  return m;
}

// 三角屋頂
function gableRoof(w, h, d, color) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.08, 0); shape.lineTo(w / 2 + 0.08, 0); shape.lineTo(0, h); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d + 0.16, bevelEnabled: false });
  g.translate(0, 0, -(d + 0.16) / 2);
  return mesh(g, mat(color));
}

function windowsOn(group, w, h, d, rows, cols, y0, face = 'front') {
  const ww = Math.min(0.16, (w / cols) * 0.45), wh = Math.min(0.2, (h / rows) * 0.45);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (w / cols) * (c + 0.5);
      const y = y0 + (h / rows) * (r + 0.55);
      const p = mesh(new THREE.PlaneGeometry(ww, wh), windowMat, { cast: false });
      if (face === 'front') p.position.set(x, y, d / 2 + 0.005);
      group.add(p);
      if (face === 'front') { const b = p.clone(); b.position.z = -d / 2 - 0.005; b.rotation.y = Math.PI; group.add(b); }
    }
  }
}

function house({ w = 0.8, h = 0.6, d = 0.7, wall = C.cream, roof = C.coral, roofH = 0.45, door = C.woodDark, chimney = false } = {}) {
  const g = new THREE.Group();
  g.add(box(w, h, d, wall));
  const r = gableRoof(w, roofH, d, roof); r.position.y = h; g.add(r);
  g.add(box(0.16, 0.26, 0.02, door, 0, 0, d / 2 + 0.01));
  windowsOn(g, w, h * 0.6, d, 1, 2, h * 0.3);
  if (chimney) g.add(box(0.12, 0.3, 0.12, C.roof2, w * 0.25, h + roofH * 0.3, -d * 0.15));
  return g;
}

function tree(kind = 'round', s = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.05 * s, 0.07 * s, 0.3 * s, C.wood, 6));
  if (kind === 'pine') {
    g.add(cone(0.32 * s, 0.5 * s, C.pine, 7, 0, 0.22 * s));
    g.add(cone(0.24 * s, 0.42 * s, C.pine, 7, 0, 0.48 * s));
  } else {
    const col = Math.random() > 0.5 ? C.leaf : C.leaf2;
    g.add(ball(0.3 * s, col, 0, 0.5 * s, 0, 0));
    g.add(ball(0.2 * s, col, 0.14 * s, 0.68 * s, 0.05 * s, 0));
  }
  g.rotation.y = Math.random() * Math.PI;
  return g;
}

function person(color) {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.08, 0.2, color, 8));
  g.add(ball(0.065, '#f6d2b0', 0, 0.27, 0, 1));
  return g;
}

function lamp() {
  const g = new THREE.Group();
  g.add(cyl(0.02, 0.025, 0.55, '#5b4a3a', 6));
  const l = mesh(new THREE.SphereGeometry(0.06, 10, 8), lampMat, { cast: false }); l.position.y = 0.58; g.add(l);
  return g;
}

function flag(color) {
  const g = new THREE.Group();
  g.add(cyl(0.015, 0.015, 0.8, '#ddd', 6));
  const geo = new THREE.PlaneGeometry(0.4, 0.24, 8, 1);
  const f = mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
  f.position.set(0.2, 0.68, 0);
  g.add(f);
  const base = geo.attributes.position.array.slice();
  onTick((t) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) a[i + 2] = Math.sin(t * 4 + base[i] * 10) * 0.04 * (base[i] + 0.2);
    geo.attributes.position.needsUpdate = true;
  });
  return g;
}

// ================= 六角磁磚 =================
const HEX = 1.0;
function hexShape(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  return s;
}
const hexGeoCache = new Map();
function hexGeo(h) {
  const k = h.toFixed(2);
  if (!hexGeoCache.has(k)) {
    const g = new THREE.ExtrudeGeometry(hexShape(HEX * 0.9), { depth: h, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    hexGeoCache.set(k, g);
  }
  return hexGeoCache.get(k);
}
const AXIAL_DIRS = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const axialToXZ = (q, r) => [1.5 * q * HEX, Math.sqrt(3) * (r + q / 2) * HEX];

// 一座島 = 7 塊六角磚（花形）
function buildIsland(def, cx, cz) {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  const tiles = [];
  const topCol = def.top || null;
  AXIAL_DIRS.forEach(([q, r], i) => {
    const [x, z] = axialToXZ(q, r);
    const h = (def.flat ? 0.55 : 0.5 + Math.random() * 0.2) + (i === 0 ? 0.08 : 0);
    const top = topCol ? (Array.isArray(topCol) ? topCol[i % topCol.length] : topCol) : C.grass[(((i + Math.floor(cx)) % C.grass.length) + C.grass.length) % C.grass.length];
    const m = mesh(hexGeo(h), [mat(top), mat(C.soil)]);
    m.position.set(x, -0.6, z);
    m.userData.ground = true;
    group.add(m);
    // 土層下緣
    const under = mesh(new THREE.CylinderGeometry(HEX * 0.82, HEX * 0.55, 0.6, 6), mat(C.soilDark), { cast: false });
    under.position.set(x, -0.9, z);
    under.userData.ground = true;
    group.add(under);
    tiles.push({ x, z, y: h - 0.6 + 0.07 });
  });
  group.userData.tiles = tiles;
  return group;
}

// 在磚 i 上放物件
function put(island, i, obj, dx = 0, dz = 0, rot = 0) {
  const t = island.userData.tiles[i];
  obj.position.set(t.x + dx, t.y + (obj.position.y || 0), t.z + dz);
  obj.rotation.y += rot;
  island.add(obj);
  return obj;
}

// ================= 各島建築 =================
const builders = {
  plaza(isl) {
    // 復興大樓
    const b = new THREE.Group();
    b.add(box(1.5, 2.2, 1.1, C.cream));
    b.add(box(1.6, 0.12, 1.2, C.sun, 0, 2.2));
    b.add(box(0.7, 0.4, 0.6, C.cream, 0.2, 2.32));
    windowsOn(b, 1.5, 1.9, 1.1, 5, 4, 0.2);
    b.add(box(0.4, 0.4, 0.04, C.woodDark, 0, 0, 0.56));
    const f = flag(C.coral); f.position.set(-0.5, 2.32, 0); b.add(f);
    put(isl, 0, b, 0, -0.1, 0.2);
    // 噴水池
    const fountain = new THREE.Group();
    fountain.add(cyl(0.45, 0.5, 0.14, C.stone, 16));
    fountain.add(cyl(0.38, 0.38, 0.02, '#7cc6d6', 16, 0, 0.13));
    fountain.add(cyl(0.06, 0.08, 0.35, C.stone, 8));
    const water = ball(0.1, '#bfe9f2', 0, 0.42, 0, 1); fountain.add(water);
    onTick((t) => { water.position.y = 0.42 + Math.sin(t * 5) * 0.03; water.scale.setScalar(1 + Math.sin(t * 5) * 0.12); });
    put(isl, 6, fountain);
    put(isl, 1, tree('round', 1.1), 0.2, 0.3);
    put(isl, 1, tree('round', 0.8), -0.3, -0.2);
    put(isl, 3, house({ w: 0.9, wall: '#ffe2c4', roof: C.sky }), 0, 0, 0.5);
    put(isl, 4, tree('pine', 1.1), 0.1, 0);
    put(isl, 4, lamp(), -0.5, 0.3);
    put(isl, 5, house({ w: 0.7, h: 0.5, wall: C.white, roof: C.sun }), 0, 0, -0.4);
    put(isl, 2, tree('round', 1), 0, 0);
    put(isl, 2, lamp(), 0.4, 0.4);
    // 人
    ['#e97a5b', '#6ba8d8', '#f2b544', '#8fd3c1'].forEach((c, k) => put(isl, 6, person(c), Math.cos(k * 1.6) * 0.65, Math.sin(k * 1.6) * 0.65));
    // 繞圈的小車
    const car = new THREE.Group();
    car.add(box(0.36, 0.14, 0.2, C.coral, 0, 0.04)); car.add(box(0.2, 0.12, 0.18, C.white, -0.03, 0.18));
    isl.add(car);
    onTick((t) => {
      const a = t * 0.4, R = 2.05;
      car.position.set(Math.cos(a) * R, 0.1, Math.sin(a) * R);
      car.rotation.y = -a - Math.PI / 2;
    });
  },
  calendar(isl) {
    const tower = new THREE.Group();
    tower.add(box(0.8, 2.4, 0.8, '#f6c9b5'));
    tower.add(box(0.95, 0.12, 0.95, C.roof2, 0, 2.4));
    tower.add(cone(0.7, 0.9, C.roof2, 4, 0, 2.5));
    tower.children.at(-1).rotation.y = Math.PI / 4;
    // 四面時鐘
    const hands = [];
    for (let k = 0; k < 4; k++) {
      const face = new THREE.Group();
      const disc = mesh(new THREE.CircleGeometry(0.28, 24), mat(C.white), { cast: false });
      face.add(disc);
      const hh = mesh(new THREE.PlaneGeometry(0.035, 0.15), mat('#3b2f25'), { cast: false }); hh.geometry.translate(0, 0.07, 0.002);
      const mh = mesh(new THREE.PlaneGeometry(0.025, 0.22), mat('#3b2f25'), { cast: false }); mh.geometry.translate(0, 0.1, 0.004);
      face.add(hh, mh); hands.push([hh, mh]);
      face.position.set(Math.sin(k * Math.PI / 2) * 0.41, 1.95, Math.cos(k * Math.PI / 2) * 0.41);
      face.rotation.y = k * Math.PI / 2;
      tower.add(face);
    }
    onTick(() => {
      const n = taipeiNow();
      hands.forEach(([h, m]) => { h.rotation.z = -((n.hour % 12) + n.minute / 60) / 12 * Math.PI * 2; m.rotation.z = -n.minute / 60 * Math.PI * 2; });
    });
    windowsOn(tower, 0.8, 1.2, 0.8, 2, 1, 0.3);
    put(isl, 0, tower);
    // 月曆看板
    const board = new THREE.Group();
    board.add(box(0.06, 0.6, 0.06, C.woodDark, -0.35)); board.add(box(0.06, 0.6, 0.06, C.woodDark, 0.35));
    board.add(box(0.85, 0.55, 0.06, C.white, 0, 0.45));
    board.add(box(0.85, 0.14, 0.07, C.coral, 0, 0.86));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) board.add(box(0.1, 0.08, 0.02, r === 1 && c === 3 ? C.coral : '#e8dccb', -0.3 + c * 0.15, 0.53 + r * 0.12, 0.04));
    put(isl, 1, board, 0, 0, -0.6);
    put(isl, 2, tree('round', 0.9)); put(isl, 3, tree('pine'), 0.2); put(isl, 3, tree('pine', 0.7), -0.3, 0.3);
    put(isl, 4, house({ wall: '#fff0e0', roof: C.purple }), 0, 0, 0.3);
    put(isl, 5, tree('round', 1.1)); put(isl, 6, lamp(), 0.3); put(isl, 6, person(C.sky), -0.2, 0.1);
    // 長椅
    const bench = new THREE.Group(); bench.add(box(0.6, 0.06, 0.2, C.wood, 0, 0.18)); bench.add(box(0.6, 0.2, 0.04, C.wood, 0, 0.24, -0.09));
    bench.add(box(0.05, 0.18, 0.18, C.woodDark, -0.25)); bench.add(box(0.05, 0.18, 0.18, C.woodDark, 0.25));
    put(isl, 6, bench, 0.1, -0.4);
  },
  campus(isl) {
    const school = new THREE.Group();
    school.add(box(2.2, 1.1, 0.8, '#fdf0d6'));
    school.add(box(2.3, 0.1, 0.9, C.sky, 0, 1.1));
    windowsOn(school, 2.2, 0.95, 0.8, 2, 6, 0.08);
    school.add(box(0.6, 1.5, 0.9, '#f6e2c0', 0, 0));
    school.add(box(0.7, 0.1, 1.0, C.sky, 0, 1.5));
    const clock = mesh(new THREE.CircleGeometry(0.16, 20), mat(C.white), { cast: false }); clock.position.set(0, 1.25, 0.46); school.add(clock);
    const f = flag(C.sun); f.position.set(0.9, 1.2, 0); school.add(f);
    put(isl, 0, school, 0, -0.5, 0);
    // 操場跑道
    const track = new THREE.Group();
    const ring = mesh(new THREE.RingGeometry(0.42, 0.68, 28), mat('#d9775a'), { cast: false }); ring.rotation.x = -Math.PI / 2; ring.scale.set(1.3, 1, 1);
    const field = mesh(new THREE.CircleGeometry(0.42, 28), mat('#86c062'), { cast: false }); field.rotation.x = -Math.PI / 2; field.scale.set(1.3, 1, 1);
    ring.position.y = 0.015; field.position.y = 0.01; track.add(ring, field);
    put(isl, 6, track, 0, 0.1);
    const runner = person(C.coral); isl.add(runner);
    const t6 = isl.userData.tiles[6];
    onTick((t) => { const a = t * 1.2; runner.position.set(t6.x + Math.cos(a) * 0.72, t6.y, t6.z + 0.1 + Math.sin(a) * 0.55); });
    put(isl, 1, tree('round')); put(isl, 2, tree('round', 1.2), 0.2, -0.2);
    put(isl, 3, house({ w: 0.9, h: 0.7, wall: '#fff5e6', roof: C.coral }), 0.1, 0, 0.6);
    put(isl, 4, tree('pine')); put(isl, 4, tree('pine', 0.8), 0.4, 0.3);
    put(isl, 5, house({ w: 0.7, h: 0.5, wall: '#e8f2ff', roof: C.sky }), 0, 0, -0.3);
    // 籃球架
    const hoop = new THREE.Group(); hoop.add(cyl(0.03, 0.03, 0.8, '#777', 6)); hoop.add(box(0.3, 0.22, 0.03, C.white, 0, 0.72, 0.03));
    const rim = mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12), mat(C.coral)); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.74, 0.12); hoop.add(rim);
    put(isl, 1, hoop, -0.4, 0.3, 0.4);
    ['#f2b544', '#6ba8d8', '#f49aa0'].forEach((c, k) => put(isl, 0, person(c), -0.6 + k * 0.35, 0.35));
  },
  community(isl) {
    const palette = [[C.cream, C.coral], ['#ffe7d1', C.sky], ['#f0f7e8', C.sun], [C.white, C.roof2], ['#fff0f0', C.purple], ['#fdf3dc', C.mint], ['#eef4ff', C.coral]];
    isl.userData.tiles.forEach((_, i) => {
      const [w, r] = palette[i];
      const n = i === 0 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const hs = house({ w: 0.6 + Math.random() * 0.2, h: 0.45 + Math.random() * 0.25, wall: w, roof: r, chimney: Math.random() > 0.5 });
        put(isl, i, hs, n === 1 ? 0 : (k ? 0.3 : -0.3), n === 1 ? 0 : (k ? -0.25 : 0.25), Math.random() * 0.6 - 0.3 + i);
      }
      if (i) put(isl, i, tree(Math.random() > 0.5 ? 'round' : 'pine', 0.7), 0.45, 0.4);
    });
    // 中央會所
    const hall = put(isl, 0, house({ w: 1.1, h: 0.75, d: 0.9, wall: '#fff8ea', roof: C.sun, roofH: 0.55 }), 0, 0);
    hall.add(box(0.14, 0.35, 0.14, C.sun, 0, 1.25));
    put(isl, 0, lamp(), 0.65, 0.45);
  },
  camp(isl) {
    isl.userData.tiles.forEach((t, i) => { if (i) put(isl, i, tree('pine', 0.9 + Math.random() * 0.4), 0.45 * Math.cos(i), 0.45 * Math.sin(i)); });
    const tentCols = [C.coral, C.sun, C.sky, C.mint, C.pink];
    [1, 2, 3, 5, 6].forEach((i, k) => {
      const tent = cone(0.42, 0.55, tentCols[k], 4); tent.rotation.y = Math.PI / 4 + k;
      put(isl, i, tent, -0.15, -0.1);
    });
    // 營火
    const fire = new THREE.Group();
    for (let k = 0; k < 5; k++) { const log = box(0.42, 0.06, 0.06, C.woodDark); log.rotation.y = (k * Math.PI) / 5; fire.add(log); }
    const flameMat = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff7a1a', emissiveIntensity: 1.4, flatShading: true });
    const flame = mesh(new THREE.ConeGeometry(0.16, 0.42, 6), flameMat, { cast: false }); flame.position.y = 0.26; fire.add(flame);
    const fireLight = new THREE.PointLight('#ff9a3c', 0, 4, 1.6); fireLight.position.y = 0.5; fire.add(fireLight);
    isl.userData.fireLight = fireLight;
    onTick((t) => { flame.scale.set(1 + Math.sin(t * 13) * 0.1, 1 + Math.sin(t * 9) * 0.2, 1); flame.rotation.y = t * 2; });
    put(isl, 0, fire);
    for (let k = 0; k < 6; k++) put(isl, 0, person([C.coral, C.sky, C.sun, C.pink, C.mint, C.purple][k]), Math.cos(k) * 0.6, Math.sin(k) * 0.6);
    // 木牌
    const sign = new THREE.Group(); sign.add(box(0.05, 0.5, 0.05, C.woodDark)); sign.add(box(0.5, 0.22, 0.05, C.wood, 0, 0.4));
    put(isl, 4, sign, 0, 0, 0.6);
  },
  pillar(isl) {
    // 殿（啟三12）：石階、列柱、山牆，殿中有光
    const t = new THREE.Group();
    [[1.9, 1.5], [1.75, 1.35], [1.6, 1.2]].forEach(([w, d], k) => t.add(box(w, 0.08, d, k % 2 ? '#efe6d6' : C.stone, 0, k * 0.08)));
    const cols = [];
    [-0.6, -0.2, 0.2, 0.6].forEach((x) => [-0.45, 0.45].forEach((z) => cols.push([x, z])));
    [-0.6, 0.6].forEach((x) => cols.push([x, 0]));
    cols.forEach(([x, z]) => {
      t.add(box(0.2, 0.06, 0.2, C.stone, x, 0.24, z));
      t.add(cyl(0.065, 0.075, 0.82, C.white, 10, x, 0.3, z));
      t.add(box(0.2, 0.06, 0.2, C.stone, x, 1.12, z));
    });
    t.add(box(1.6, 0.14, 1.2, '#f6efe2', 0, 1.18));
    const ped = gableRoof(1.6, 0.42, 1.2, C.sun); ped.position.y = 1.32; t.add(ped);
    // 殿中的光（發光之體）
    const glowMat = new THREE.MeshStandardMaterial({ color: '#fff7c9', emissive: '#ffd34d', emissiveIntensity: 0.9 });
    const orb = mesh(new THREE.IcosahedronGeometry(0.16, 2), glowMat, { cast: false }); orb.position.y = 0.62; t.add(orb);
    const glow = new THREE.PointLight('#ffd27a', 0.4, 5, 1.5); glow.position.y = 0.7; t.add(glow);
    isl.userData.glowLight = glow;
    onTick((tt) => { orb.position.y = 0.62 + Math.sin(tt * 1.6) * 0.05; orb.rotation.y = tt * 0.6; });
    const out = isl.userData.outward;
    put(isl, 0, t, 0, 0, Math.atan2(-out.x, -out.z));
    // 獨立的柱子
    [[2, 0, 0], [3, 0.2, 0.1], [5, -0.1, 0.2]].forEach(([i, dx, dz]) => {
      const p = new THREE.Group();
      p.add(box(0.36, 0.08, 0.36, C.stone)); p.add(cyl(0.12, 0.13, 0.9, C.white, 10, 0, 0.08)); p.add(box(0.32, 0.08, 0.32, C.stone, 0, 0.98));
      put(isl, i, p, dx, dz);
    });
    put(isl, 1, tree('round')); put(isl, 4, tree('pine', 0.9)); put(isl, 6, tree('round', 0.8), 0.2);
    put(isl, 4, lamp(), 0.4, 0.3); put(isl, 1, lamp(), -0.4, 0.3);
  },
  glory(isl) {
    // 社區裏的關懷：住家、關懷據點、向日葵
    const center = house({ w: 1.1, h: 0.75, d: 0.85, wall: '#fff6dc', roof: C.sun, roofH: 0.5 });
    const sign = new THREE.Group();
    sign.add(mesh(new THREE.CircleGeometry(0.16, 16), mat(C.sun), { cast: false }));
    const mid = mesh(new THREE.CircleGeometry(0.07, 12), mat('#8a5a35'), { cast: false }); mid.position.z = 0.002; sign.add(mid);
    sign.position.set(0, 0.95, 0.44); center.add(sign);
    put(isl, 0, center, 0, -0.1, 0.2);
    put(isl, 1, house({ w: 0.75, wall: '#ffeede', roof: C.coral, chimney: true }), 0, 0, 0.6);
    put(isl, 3, house({ w: 0.7, wall: '#eef6ff', roof: C.sky }), 0, 0, -0.4);
    put(isl, 5, house({ w: 0.75, wall: '#f4fbe9', roof: C.leaf2 }), 0, 0, 2.2);
    // 向日葵花圃
    [2, 4, 6].forEach((i) => {
      for (let k = 0; k < 6; k++) {
        const sf = new THREE.Group();
        const h = 0.4 + Math.random() * 0.25;
        sf.add(cyl(0.015, 0.018, h, C.leaf, 5));
        const head = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), mat(C.sun)); head.rotation.x = Math.PI / 2.4; head.position.y = h + 0.04; sf.add(head);
        const core = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 8), mat('#7a4a2a')); core.rotation.x = Math.PI / 2.4; core.position.set(0, h + 0.045, 0.01); sf.add(core);
        put(isl, i, sf, Math.cos(k * 1.05) * 0.4, Math.sin(k * 1.05) * 0.4, k);
      }
    });
    put(isl, 6, tree('round', 1)); put(isl, 2, lamp(), 0, 0);
    // 關懷者陪伴少年回家
    const pair = new THREE.Group();
    const adult = person(C.sky); adult.scale.setScalar(1.15); adult.position.x = -0.1; pair.add(adult);
    const teen = person(C.coral); teen.position.x = 0.1; pair.add(teen);
    put(isl, 0, pair, 0.1, 0.65);
  },
  // ---------- 服事者群島 ----------
  'st-hub'(isl) {
    const hall = house({ w: 1.3, h: 0.9, d: 1.0, wall: '#f3eefc', roof: C.purple, roofH: 0.6 });
    hall.add(box(0.22, 0.5, 0.22, C.purple, 0, 1.45));
    const bell = cone(0.12, 0.18, C.sun, 8, 0, 1.95); hall.add(bell);
    put(isl, 0, hall, 0, -0.1, Math.atan2(-isl.position.x + STAFF_CENTER.x, -isl.position.z + STAFF_CENTER.z));
    // 公告欄
    const board = new THREE.Group();
    board.add(box(0.06, 0.6, 0.06, C.woodDark, -0.32)); board.add(box(0.06, 0.6, 0.06, C.woodDark, 0.32));
    board.add(box(0.8, 0.5, 0.05, '#fffaf0', 0, 0.42));
    [[-0.2, 0.62, C.coral], [0.12, 0.66, C.sun], [-0.05, 0.5, C.sky], [0.2, 0.5, C.mint]].forEach(([x, y, c]) => board.add(box(0.18, 0.14, 0.02, c, x, y - 0.07, 0.035)));
    put(isl, 6, board, 0, 0, 0.3);
    [1, 3, 5].forEach((i) => put(isl, i, lamp(), 0.3, 0.2));
    [2, 4].forEach((i) => put(isl, i, tree('round', 0.9)));
  },
  'st-files'(isl) {
    const wh = new THREE.Group();
    wh.add(box(1.6, 0.7, 0.9, '#e3eef8'));
    const r = gableRoof(1.6, 0.4, 0.9, C.sky); r.position.y = 0.7; wh.add(r);
    wh.add(box(0.5, 0.45, 0.02, C.woodDark, 0, 0, 0.46));
    put(isl, 0, wh, 0, -0.1, 0.4);
    const cols = [C.coral, C.sun, C.sky, C.mint, C.purple, C.pink];
    [1, 2, 4, 6].forEach((i, k) => {
      for (let j = 0; j < 3; j++) put(isl, i, box(0.26, 0.22, 0.26, cols[(k + j) % cols.length]), -0.2 + (j % 2) * 0.3, -0.15 + j * 0.15);
      put(isl, i, box(0.26, 0.22, 0.26, cols[(k + 3) % cols.length], 0, 0, 0)).position.y += 0.22;
    });
    put(isl, 3, lamp(), 0, 0); put(isl, 5, tree('pine'), 0, 0);
  },
  'st-folders'(isl) {
    const cols = ['#f2b544', '#6ba8d8', '#e97a5b', '#8fd3c1', '#a993d6', '#7fb85a', '#f49aa0'];
    isl.userData.tiles.forEach((t, i) => {
      for (let k = 0; k < (i ? 3 : 5); k++) {
        const f = new THREE.Group();
        f.add(box(0.5, 0.36, 0.05, cols[(i + k) % cols.length]));
        f.add(box(0.2, 0.07, 0.05, cols[(i + k) % cols.length], -0.12, 0.36));
        f.add(box(0.44, 0.3, 0.06, '#fffaf0', 0, 0.03, 0.01));
        put(isl, i, f, -0.35 + k * 0.18, (k % 2 ? 0.12 : -0.12), (k - 1) * 0.15);
      }
    });
  },
  'st-stats'(isl) {
    const tower = new THREE.Group();
    tower.add(cyl(0.3, 0.38, 1.4, '#dff3e4', 10)); tower.add(cyl(0.48, 0.48, 0.1, C.leaf, 10, 0, 1.4));
    tower.add(cyl(0.05, 0.05, 0.5, '#888', 6, 0, 1.5)); tower.add(ball(0.08, C.coral, 0, 2.05, 0, 1));
    put(isl, 0, tower);
    const cols = [C.coral, C.sun, C.sky, C.mint, C.purple];
    [1, 3, 5].forEach((i, k) => {
      for (let j = 0; j < 4; j++) {
        const h = 0.2 + ((j * 37 + k * 17) % 7) * 0.08;
        put(isl, i, box(0.14, h, 0.14, cols[(j + k) % cols.length]), -0.3 + j * 0.2, 0);
      }
    });
    [2, 4, 6].forEach((i) => put(isl, i, tree('round', 0.8)));
  },
  harbor(isl) {
    // 碼頭（往外海方向）
    const dock = new THREE.Group();
    for (let k = 0; k < 7; k++) dock.add(box(0.7, 0.05, 0.16, C.wood, 0, 0, k * 0.2));
    for (let k = 0; k < 4; k++) { dock.add(cyl(0.035, 0.035, 0.6, C.woodDark, 6, -0.33, -0.45, k * 0.42)); dock.add(cyl(0.035, 0.035, 0.6, C.woodDark, 6, 0.33, -0.45, k * 0.42)); }
    const out = isl.userData.outward;
    dock.rotation.y = Math.atan2(out.x, out.z);
    const tEdge = isl.userData.tiles[isl.userData.edgeTile];
    dock.position.set(tEdge.x + out.x * 0.6, tEdge.y - 0.02, tEdge.z + out.z * 0.6);
    isl.add(dock);
    // 燈塔小屋 → 福音帳篷舞台
    const stage = new THREE.Group();
    stage.add(box(1.4, 0.18, 1.0, C.wood));
    [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]].forEach(([x, z]) => stage.add(cyl(0.03, 0.03, 0.9, C.white, 6, x, 0.18, z)));
    const canopy = cone(0.95, 0.5, C.coral, 4, 0, 1.05); canopy.rotation.y = Math.PI / 4; canopy.scale.set(1, 1, 0.75); stage.add(canopy);
    put(isl, 0, stage);
    // 氣球
    const balloons = [];
    [C.coral, C.sun, C.sky, C.pink, C.mint].forEach((c, k) => {
      const b = ball(0.12, c, 0, 0, 0, 1); b.scale.y = 1.2; balloons.push(b);
      put(isl, 0, b, -0.6 + k * 0.3, 0.5);
    });
    onTick((t) => balloons.forEach((b, k) => { b.position.y = isl.userData.tiles[0].y + 1.4 + Math.sin(t * 1.5 + k) * 0.08; }));
    put(isl, 1, house({ w: 0.7, wall: '#e6f6f4', roof: C.sky })); put(isl, 3, tree('round'));
    put(isl, 4, house({ w: 0.75, wall: C.cream, roof: C.mint }), 0, 0, 2); put(isl, 5, tree('pine'));
    put(isl, 2, lamp(), 0.2); put(isl, 6, tree('round', 0.8));
    for (let k = 0; k < 4; k++) put(isl, 0, person([C.sun, C.sky, C.pink, C.purple][k]), -0.5 + k * 0.33, 0.85);
  },
  home(isl) {
    const bro = put(isl, 1, house({ w: 1.0, h: 0.9, d: 0.8, wall: '#e7f0ff', roof: C.sky, roofH: 0.5, chimney: true }), 0, 0, 0.3);
    windowsOn(bro, 1.0, 0.4, 0.8, 1, 3, 0.45);
    const sis = put(isl, 5, house({ w: 1.0, h: 0.9, d: 0.8, wall: '#ffeef0', roof: C.pink, roofH: 0.5, chimney: true }), 0, 0, -0.3);
    windowsOn(sis, 1.0, 0.4, 0.8, 1, 3, 0.45);
    // 中央花園＋長桌
    const table = new THREE.Group(); table.add(box(0.8, 0.05, 0.35, C.wood, 0, 0.25));
    [[-0.35, -0.12], [0.35, -0.12], [-0.35, 0.12], [0.35, 0.12]].forEach(([x, z]) => table.add(box(0.04, 0.25, 0.04, C.woodDark, x, 0, z)));
    table.add(box(0.15, 0.03, 0.1, C.white, -0.15, 0.3)); table.add(box(0.12, 0.08, 0.1, C.sun, 0.2, 0.3));
    put(isl, 0, table);
    for (let k = 0; k < 4; k++) put(isl, 0, person([C.sky, C.pink, C.sky, C.pink][k]), (k % 2 ? 0.25 : -0.25), k < 2 ? -0.4 : 0.4);
    // 柵欄
    const fence = new THREE.Group();
    for (let k = 0; k < 6; k++) fence.add(box(0.05, 0.22, 0.04, C.white, -0.5 + k * 0.2));
    fence.add(box(1.1, 0.04, 0.03, C.white, 0, 0.14));
    put(isl, 6, fence, 0, 0.5);
    [2, 3, 4].forEach((i) => put(isl, i, tree('round', 0.8 + Math.random() * 0.3), 0.1, 0));
    put(isl, 6, tree('round', 0.7), -0.3, -0.1);
    put(isl, 3, lamp(), -0.4, 0.4);
    // 花
    for (let k = 0; k < 10; k++) put(isl, 6, ball(0.05, [C.pink, C.sun, C.coral][k % 3], 0, 0.06, 0), -0.6 + Math.random() * 1.2, -0.5 + Math.random() * 0.8);
  },
  garden(isl) {
    // 溫室
    const gh = new THREE.Group();
    gh.add(box(1.1, 0.5, 0.8, new THREE.MeshStandardMaterial({ color: '#d9f2ea', transparent: true, opacity: 0.6, roughness: 0.2 })));
    const r = gableRoof(1.1, 0.4, 0.8, '#c8eadf'); r.position.y = 0.5; r.material = new THREE.MeshStandardMaterial({ color: '#c8eadf', transparent: true, opacity: 0.7 }); gh.add(r);
    for (let k = 0; k < 5; k++) gh.add(ball(0.08, C.leaf2, -0.4 + k * 0.2, 0.15, 0));
    put(isl, 0, gh, 0, 0, 0.3);
    // 菜圃與向日葵
    [1, 2, 6].forEach((i) => {
      const bed = box(0.9, 0.08, 0.5, '#8a5a35'); put(isl, i, bed, 0, 0, i);
      for (let k = 0; k < 5; k++) {
        const sf = new THREE.Group();
        sf.add(cyl(0.015, 0.015, 0.4, C.leaf, 5));
        const head = ball(0.07, C.sun, 0, 0.42, 0); sf.add(head);
        put(isl, i, sf, -0.35 + k * 0.18, (k % 2 ? 0.1 : -0.1));
      }
    });
    // 橋（兒童 → 青少年）
    const bridge = new THREE.Group();
    for (let k = 0; k < 9; k++) { const p = box(0.18, 0.05, 0.5, C.wood, -0.8 + k * 0.2, Math.sin((k / 8) * Math.PI) * 0.25); bridge.add(p); }
    put(isl, 4, bridge, 0, 0, 0.8);
    put(isl, 3, tree('round', 1.1)); put(isl, 5, house({ w: 0.7, h: 0.5, wall: '#fff6e0', roof: C.leaf2 }), 0, 0, -0.5);
    put(isl, 3, lamp(), 0.4, 0.3);
    put(isl, 4, person(C.sun), -0.5, 0); put(isl, 4, person(C.sky), 0.5, 0);
    const small = person(C.pink); small.scale.setScalar(0.75); put(isl, 4, small, -0.3, 0.1);
  },
};

// ================= 擺放小島 =================
const RING = 9.6;
const STAFF_CENTER = new THREE.Vector3(0, 0, -72); // 服事者群島在遠方，平常看不到
const islandObjs = [];
function placeIsland(def, center, ring, group) {
  let cx = center.x, cz = center.z;
  if (!def.center) { const a = THREE.MathUtils.degToRad(def.angle); cx += Math.cos(a) * ring; cz += -Math.sin(a) * ring; }
  const isl = buildIsland(def, cx, cz);
  isl.userData.group = group;
  const out = new THREE.Vector3(cx - center.x, 0, cz - center.z).normalize();
  isl.userData.outward = out;
  // 最外側的磚（給碼頭用）
  let best = 0, bestD = -Infinity;
  isl.userData.tiles.forEach((t, i) => { const d = t.x * out.x + t.z * out.z; if (d > bestD) { bestD = d; best = i; } });
  isl.userData.edgeTile = best;
  builders[def.id](isl);
  isl.userData.id = def.id;
  isl.userData.def = def;
  isl.userData.lift = 0;
  isl.userData.phase = Math.random() * Math.PI * 2;
  scene.add(isl);
  islandObjs.push(isl);
  return isl;
}
// 木棧橋：中央 → 各島
function bridge(isl, center, ring) {
  const dir = isl.position.clone().sub(center).normalize();
  const len = ring - 5.0;
  const start = center.clone().addScaledVector(dir, 2.5);
  const planks = [];
  const n = Math.round(len / 0.24);
  const ang = Math.atan2(dir.x, dir.z);
  for (let k = 0; k <= n; k++) {
    const p = start.clone().addScaledVector(dir, k * 0.24);
    const plank = box(0.55, 0.05, 0.16, k % 2 ? C.wood : '#c48f5c');
    plank.position.set(p.x, -0.12 + Math.sin((k / n) * Math.PI) * 0.12, p.z);
    plank.rotation.y = ang;
    scene.add(plank);
    planks.push(plank);
  }
  return planks;
}
ISLANDS.forEach((def) => placeIsland(def, HOME_TARGET, RING, 'main'));
islandObjs.slice(1).forEach((isl) => bridge(isl, HOME_TARGET, RING));

// ================= 島民 =================
const islanders = createIslanders({ islands: islandObjs, onTick, lowEnd: LOW_END });

// ================= 水面 =================
// 加密頂點做波浪
const wg = new THREE.PlaneGeometry(240, 240, LOW_END ? 60 : 100, LOW_END ? 60 : 100); wg.rotateX(-Math.PI / 2);
const waterMat = new THREE.MeshStandardMaterial({ color: '#7ccfd0', roughness: 0.35, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.94 });
const water = new THREE.Mesh(wg, waterMat);
water.position.y = -0.55; water.receiveShadow = true;
scene.add(water);
const wBase = wg.attributes.position.array.slice();
onTick((t) => {
  const a = wg.attributes.position.array;
  for (let i = 0; i < a.length; i += 3) {
    const x = wBase[i], z = wBase[i + 2];
    a[i + 1] = Math.sin(x * 0.45 + t * 1.1) * 0.06 + Math.cos(z * 0.5 + t * 0.9) * 0.06;
  }
  wg.attributes.position.needsUpdate = true;
  wg.computeVertexNormals();
});
// 海底沙
const seabed = new THREE.Mesh(new THREE.CircleGeometry(200, 48), mat('#e8cf9c'));
seabed.rotation.x = -Math.PI / 2; seabed.position.y = -1.6; scene.add(seabed);

// 小船
function boat(color) {
  const g = new THREE.Group();
  const hull = box(0.7, 0.18, 0.3, color); g.add(hull);
  g.add(cyl(0.02, 0.02, 0.7, C.white, 5, 0, 0.18));
  const sail = mesh(new THREE.ConeGeometry(0.22, 0.55, 3), mat(C.white)); sail.position.set(0.08, 0.5, 0); sail.scale.z = 0.15; g.add(sail);
  return g;
}
[[C.coral, 12.8, 0.15, 0], [C.sky, 14.5, -0.11, 2.2], [C.sun, 11.6, 0.09, 4.1]].forEach(([c, R, sp, off]) => {
  const b = boat(c); scene.add(b);
  onTick((t) => {
    const a = t * sp + off;
    b.position.set(Math.cos(a) * R, -0.5 + Math.sin(t * 2 + off) * 0.05, Math.sin(a) * R);
    b.rotation.y = -a + (sp > 0 ? 0 : Math.PI);
    b.rotation.z = Math.sin(t * 1.7 + off) * 0.06;
  });
});

// 雲
const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 1, flatShading: true, transparent: true, opacity: 0.9 });
const clouds = [];
for (let k = 0; k < 6; k++) {
  const cl = new THREE.Group();
  [[0, 0, 0, 0.7], [0.75, -0.1, 0.1, 0.5], [-0.7, -0.12, 0, 0.5], [0.25, 0.35, 0, 0.45]].forEach(([x, y, z, r]) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cloudMat); s.scale.y = 0.75; s.position.set(x, y, z); cl.add(s); });
  clouds.push(cl);
  const R = 13 + Math.random() * 10, a0 = (k / 6) * Math.PI * 2, y = 11 + Math.random() * 3, sp = 0.01 + Math.random() * 0.015;
  scene.add(cl);
  onTick((t) => { const a = a0 + t * sp; cl.position.set(Math.cos(a) * R, y, Math.sin(a) * R); });
}

// 鳥
for (let k = 0; k < 5; k++) {
  const bird = new THREE.Group();
  const wingG = new THREE.PlaneGeometry(0.25, 0.08);
  const wl = new THREE.Mesh(wingG, new THREE.MeshBasicMaterial({ color: '#4a3b2f', side: THREE.DoubleSide })); wl.position.x = -0.12;
  const wr = wl.clone(); wr.position.x = 0.12;
  bird.add(wl, wr); scene.add(bird);
  const R = 5 + k * 1.3, y = 5 + k * 0.4, sp = 0.25 + k * 0.05;
  onTick((t) => {
    const a = t * sp + k;
    bird.position.set(Math.cos(a) * R, y + Math.sin(t * 2 + k) * 0.2, Math.sin(a) * R);
    bird.rotation.y = -a;
    const f = Math.sin(t * 10 + k) * 0.6; wl.rotation.z = f; wr.rotation.z = -f;
  });
}

// ================= 標籤（Pins）=================
const pinsEl = document.getElementById('pins');
addEventListener('resize', () => pinEls.forEach((el) => { el._w = 0; }));
const pinEls = [];
function makePin(isl) {
  const def = isl.userData.def;
  const el = document.createElement('button');
  el.className = 'pin';
  el.tabIndex = -1;
  el.innerHTML = `<span class="em" style="--c:${def.tint}">${def.emoji}</span>${def.name}<span class="badge" hidden></span>`;
  el.addEventListener('click', () => openIsland(def.id));
  el.addEventListener('pointerenter', () => { hovered = isl; });
  el.addEventListener('pointerleave', () => { if (hovered === isl) hovered = null; });
  pinsEl.appendChild(el);
  pinEls.push(el);
  return el;
}
islandObjs.forEach(makePin);

// 自己島民頭上的名字
const mePin = document.createElement('div');
mePin.className = 'pin me hidden';
pinsEl.appendChild(mePin);
// 名字標籤：滑鼠經過時只顯示名字；點一下變成小卡片，可以檢舉（管理員可隱藏）
const whoPin = document.createElement('div');
whoPin.className = 'pin who hidden';
pinsEl.appendChild(whoPin);
let whoCard = false, whoShown = null;
function renderWho(p, card) {
  whoPin.classList.toggle('card', card);
  whoPin.innerHTML = '<b class="who-name"></b>';
  whoPin.querySelector('.who-name').textContent = p.name; // 暱稱一律當純文字
  if (card && store.cloudEnabled && p.pid) {
    whoPin.insertAdjacentHTML('beforeend', `<div class="who-acts"><button data-who="report">🚩 檢舉</button>${isAdminNow ? '<button data-who="hide">隱藏</button>' : ''}</div><div class="who-msg" role="status"></div>`);
  }
  whoShown = p;
}
function openWhoCard(p) { whoCard = true; namePerson = p; nameUntil = Infinity; renderWho(p, true); }
function closeWhoCard() { whoCard = false; namePerson = null; whoShown = null; }
whoPin.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !whoShown) return;
  const p = whoShown;
  const msg = whoPin.querySelector('.who-msg');
  if (b.dataset.who === 'report') {
    if (!store.myUid()) { msg.textContent = '請先登入（👤 我的島民），或私訊 IG @tc_yp 檢舉。'; return; }
    whoPin.querySelector('.who-acts').innerHTML = store.REPORT_REASONS.map(([k, l]) => `<button data-reason="${k}">${l}</button>`).join('');
    return;
  }
  if (b.dataset.reason) {
    try { await store.report(p.pid, b.dataset.reason); msg.textContent = '已收到，謝謝你。管理員會處理。'; whoPin.querySelector('.who-acts').innerHTML = ''; } catch { msg.textContent = '送出失敗，請稍後再試。'; }
    return;
  }
  if (b.dataset.who === 'hide') {
    try { await store.adminSetHidden(p.pid, true); islanders.removeOther(p.pid); closeWhoCard(); } catch { msg.textContent = '隱藏失敗。'; }
  }
});
function updateWhoPin(w, h) {
  const p = namePerson;
  if (!p || performance.now() > nameUntil || p.mine || !p.mesh.parent) {
    whoPin.classList.add('hidden');
    if (whoCard && (!p || !p.mesh.parent)) closeWhoCard();
    return;
  }
  if (whoShown !== p || whoPin.classList.contains('card') !== whoCard) renderWho(p, whoCard);
  p.mesh.getWorldPosition(tmpV);
  tmpV.y += 0.5;
  tmpV.project(camera);
  whoPin.classList.toggle('hidden', tmpV.z >= 1);
  whoPin.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * w}px, ${(-tmpV.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
}
function updateMePin(w, h) {
  const me = islanders.mine();
  if (!me) { mePin.classList.add('hidden'); return; }
  me.mesh.getWorldPosition(tmpV);
  tmpV.y += 0.55;
  tmpV.project(camera);
  const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.05 && Math.abs(tmpV.y) < 1.05;
  mePin.classList.toggle('hidden', !vis);
  mePin.textContent = `👤 ${me.name || '我'}`;
  mePin.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * w}px, ${(-tmpV.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
}

// 其他島民頭上的暱稱：只顯示離鏡頭最近的幾位，避免畫面太亂
const MAX_TAGS = 30;
const tagEls = [];
function tagEl(i) {
  if (!tagEls[i]) {
    const el = document.createElement('div');
    el.className = 'pin tag hidden';
    pinsEl.appendChild(el);
    tagEls[i] = el;
  }
  return tagEls[i];
}
const tagPos = new THREE.Vector3();
function updateTags(w, h) {
  let shown = [];
  if (arch === 'main' && people.tagsOn()) {
    for (const p of islanders.real()) {
      if (!p.name || p === namePerson || !p.mesh.parent) continue;
      p.mesh.getWorldPosition(tagPos);
      const d = tagPos.distanceToSquared(camera.position);
      tagPos.y += 0.5;
      tagPos.project(camera);
      if (tagPos.z >= 1 || Math.abs(tagPos.x) > 1.02 || Math.abs(tagPos.y) > 1.02) continue;
      shown.push({ p, d, x: (tagPos.x * 0.5 + 0.5) * w, y: (-tagPos.y * 0.5 + 0.5) * h });
    }
    shown.sort((a, b) => a.d - b.d);
    shown = shown.slice(0, MAX_TAGS);
  }
  shown.forEach((s, i) => {
    const el = tagEl(i);
    if (el._p !== s.p || el.textContent !== s.p.name) { el.textContent = s.p.name; el._p = s.p; } // 暱稱一律當純文字
    el.classList.remove('hidden');
    el.classList.toggle('far', s.d > 45 * 45);
    el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    el.style.zIndex = String(Math.max(1, 60 - Math.round(Math.sqrt(s.d)))); // 壓在小島標籤下面
  });
  for (let i = shown.length; i < tagEls.length; i++) { tagEls[i].classList.add('hidden'); tagEls[i]._p = null; }
}

// 下方目錄
const dock = document.getElementById('dock');
let myPid = null;
let isAdminNow = false;
const creator = createCreator({
  initial: null,
  account: {
    enabled: store.cloudEnabled,
    inAppBrowser: store.inAppBrowser,
    signIn: store.signIn,
    signOut: store.signOutUser,
    reasons: store.REPORT_REASONS,
    deleteMine: async () => { await store.deleteMine(); islanders.clearMine(); creator.setAvatar(null); },
    adminReports: store.adminReports,
    adminSetHidden: async (pid, hidden) => { await store.adminSetHidden(pid, hidden); refreshOthers(true); },
    adminClear: store.adminClearReports,
  },
  // 先寫雲端，成功後才更新島上的樣子（失敗時兩邊保持一致）
  onSave: async (a) => {
    const res = await store.saveMine(a);
    if (res.publicId) { myPid = res.publicId; islanders.removeOther(myPid); }
    islanders.setMine(a);
    focusMine();
  },
});

// 帳號切換：每次都先清掉上一位的島民與編輯狀態；非同步結果回來時，帳號已經換了就丟掉
let authGen = 0;
store.onUser(async (u) => {
  const gen = ++authGen;
  refreshStaffAccess(u);
  myPid = null;
  isAdminNow = false;
  closeWhoCard();
  islanders.clearMine();
  creator.setUser(u);
  if (!u) {
    const guest = store.loadDraft();
    creator.setAvatar(guest);
    if (guest) islanders.setMine(guest);
    return;
  }
  const cached = store.loadDraft(u.uid);
  creator.setAvatar(cached);
  if (cached) islanders.setMine(cached);
  try {
    const [mine, admin] = await Promise.all([store.loadMyIslander(), store.isAdmin()]);
    if (gen !== authGen) return;
    isAdminNow = admin;
    creator.setAdmin(admin);
    if (mine) {
      islanders.setMine(mine.avatar);
      creator.setAvatar(mine.avatar);
      creator.setHidden(mine.hidden);
      if (mine.legacy) {
        const res = await store.saveMine(mine.avatar); // 舊版資料搬到新格式
        if (gen !== authGen) return;
        myPid = res.publicId;
      } else myPid = mine.publicId;
      islanders.removeOther(myPid);
      return;
    }
    // 雲端沒有這個帳號的島民：清掉過期的快取；訪客草稿要本人同意才發布
    store.saveDraft(null, u.uid);
    islanders.clearMine();
    creator.setAvatar(null);
    const guest = store.loadDraft();
    if (guest && confirm(`這台裝置上有一個登入前捏的島民「${guest.name || '未命名'}」。\n要把它放到你的帳號，公開在島上嗎？`)) {
      const res = await store.saveMine(guest);
      if (gen !== authGen) return;
      myPid = res.publicId;
      store.saveDraft(null);
      islanders.setMine(guest);
      creator.setAvatar(guest);
    }
  } catch (err) { console.error(err); }
});

// 右側的島民名單
const peopleBtn = document.getElementById('peopleBtn');
const people = createPeople({
  list: () => islanders.real(),
  mine: () => islanders.mine(),
  onOpen: () => { closePanel(); setMenu(false); peopleBtn.setAttribute('aria-expanded', 'true'); },
  onFind: (p) => {
    if (isMobile()) people.close();
    flyToPerson(p);
    if (!p.mine) openWhoCard(p);
  },
});
peopleBtn.addEventListener('click', () => { if (people.isOpen()) people.close(); else people.open(); });
new MutationObserver(() => { if (!people.isOpen()) peopleBtn.setAttribute('aria-expanded', 'false'); })
  .observe(document.getElementById('people'), { attributes: true, attributeFilter: ['hidden'] });

// 其他人的島民：打開時讀一次，之後每 10 分鐘（畫面在前景時）更新；本機有 10 分鐘快取
async function refreshOthers(force = false) {
  try {
    const list = await store.loadOthers({ force });
    islanders.setOthers(list, { exclude: myPid });
    people.refresh();
  } catch (err) { console.error('讀取島民失敗', err); }
}
refreshOthers();
setInterval(() => { if (document.visibilityState === 'visible') refreshOthers(); }, 10 * 60 * 1000 + 5000);
// 切回這個分頁時也檢查一次（快取沒過期就不會讀雲端）
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshOthers(); });
// 選單：點「小島目錄」展開所有小島
const menu = document.getElementById('menu');
const menuBtn = document.getElementById('menuBtn');
function setMenu(open) {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) people.close();
  if (open) (dock.querySelector('.on') || dock.firstElementChild)?.focus();
}
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
document.getElementById('menuClose').addEventListener('click', () => { setMenu(false); menuBtn.focus(); });
document.getElementById('meBtn').addEventListener('click', () => { setMenu(false); creator.open(); });
// 釣魚
const fishing = createFishing();
const fishCount = document.getElementById('fishCount');
const updateFishCount = () => { fishCount.textContent = `${remainingToday()}/3`; };
updateFishCount();
function openFishing() { setMenu(false); fishing.open(); }
document.getElementById('fishBtn').addEventListener('click', openFishing);
new MutationObserver(updateFishCount).observe(document.querySelector('.fishing'), { attributes: true, attributeFilter: ['hidden'] });
addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false); });
function renderMenu() {
  dock.innerHTML = '';
  (arch === 'staff' ? staff.STAFF_ISLANDS : ISLANDS).forEach((d) => {
    const b = document.createElement('button');
    b.dataset.id = d.id;
    b.innerHTML = `<span class="mi-em" aria-hidden="true">${d.emoji}</span><span class="mi-text"><b>${d.short}</b>${d.name !== d.short ? `<small>${d.name}</small>` : ''}</span>`;
    b.addEventListener('click', () => { setMenu(false); openIsland(d.id); });
    dock.appendChild(b);
  });
  document.querySelector('.menu-head b').textContent = arch === 'staff' ? '服事者群島' : '小島目錄';
}

// ================= 服事者群島 =================
// 登入的人如果在青少年服事文件 Google Drive 的共用名單裏，就會出現入口
let arch = 'main';
let staffBuilt = false;
const staffExtras = [];
const archBtn = document.getElementById('archBtn');
function buildStaffArchipelago() {
  if (staffBuilt) return;
  staffBuilt = true;
  staff.STAFF_ISLANDS.forEach((def) => makePin(placeIsland(def, STAFF_CENTER, 7.5, 'staff')));
  islandObjs.filter((i) => i.userData.group === 'staff' && !i.userData.def.center).forEach((isl) => staffExtras.push(...bridge(isl, STAFF_CENTER, 7.5)));
}
function setStaffVisible(v) {
  islandObjs.forEach((i) => { if (i.userData.group === 'staff') i.visible = v; });
  staffExtras.forEach((o) => { o.visible = v; });
}
const archCenter = () => (arch === 'staff' ? STAFF_CENTER : HOME_TARGET);
function homeView() { const c = archCenter(); return [HOME_POS.clone().add(c), c.clone()]; }
function switchArch(to) {
  if (to === arch) return;
  closePanel();
  people.close();
  setMenu(false);
  arch = to;
  if (to === 'staff') { buildStaffArchipelago(); setStaffVisible(true); }
  sun.position.copy(archCenter()).add(new THREE.Vector3(18, 30, 12));
  sun.target.position.copy(archCenter());
  renderMenu();
  archBtn.innerHTML = to === 'staff' ? '<span aria-hidden="true">🏝️</span><b>回青少年群島</b>' : '<span aria-hidden="true">🗝️</span><b>服事者群島</b>';
  document.body.classList.toggle('staff-mode', to === 'staff');
  stopAuto();
  flyTo(...homeView(), 1.6);
  if (to === 'staff') {
    setTimeout(() => openIsland('st-hub'), 1700);
    if (staff.state.status !== 'ready') staff.loadDashboard().then(() => { if (selected?.userData.group === 'staff') renderPanel(); });
  } else setTimeout(() => setStaffVisible(false), 1700);
}
archBtn.addEventListener('click', () => switchArch(arch === 'staff' ? 'main' : 'staff'));
async function refreshStaffAccess(u) {
  archBtn.hidden = true;
  staff.reset();
  if (arch === 'staff') switchArch('main');
  if (!u || !staff.staffEnabled) return;
  if (await staff.checkStaff()) archBtn.hidden = false;
}
renderMenu();

// ================= 互動 =================
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let hovered = null;
let selected = null;
let downAt = null;

function pickIsland(ev) {
  const r = canvas.getBoundingClientRect();
  ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(islandObjs.filter((i) => i.userData.group === arch), true)[0];
  if (!hit) return null;
  let o = hit.object;
  while (o && !o.userData.id) o = o.parent;
  return o;
}
// 指到（或點到）有暱稱的島民，頭上顯示名字
let namePerson = null, nameUntil = 0;
function pickPerson(ev) {
  const r = canvas.getBoundingClientRect();
  ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(islanders.meshes(), false)[0];
  const p = hit?.object.userData.person;
  return p && (p.name || p.mine) ? p : null;
}
let lastPick = 0;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  hovered = pickIsland(e);
  const now = performance.now();
  if (now - lastPick > 80) {
    lastPick = now;
    const p = pickPerson(e);
    if (p && !whoCard) { namePerson = p; nameUntil = now + 400; }
  }
  canvas.style.cursor = hovered ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; stopAuto(); });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 6) return;
  const who = pickPerson(e);
  if (who) { openWhoCard(who); return; }
  if (whoCard) { closeWhoCard(); return; }
  const isl = pickIsland(e);
  if (isl) openIsland(isl.userData.id); else closePanel();
});

// 鏡頭飛行
let fly = null;
function flyTo(pos, target, dur = 1.1) {
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), dur: dur * 1000 };
}
const ease = (x) => 1 - Math.pow(1 - x, 3);
function stopAuto() { controls.autoRotate = false; }

// ================= 面板 =================
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panelBody');
const state = {};
const isMobile = () => innerWidth <= 720;

function renderPanel() {
  if (!selected) return;
  const def = selected.userData.def;
  panelBody.innerHTML = def.render(taipeiNow(), state);
}
function openIsland(id) {
  const isl = islandObjs.find((i) => i.userData.id === id);
  if (!isl) return;
  people.close();
  stopAuto();
  selected = isl;
  renderPanel();
  panelBody.scrollTop = 0;
  panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
  [...dock.children].forEach((b) => {
    const on = b.dataset.id === id;
    b.classList.toggle('on', on);
    b.toggleAttribute('aria-current', on);
  });
  panel.setAttribute('aria-label', isl.userData.def.name);
  panel.removeAttribute('inert');
  panelBody.querySelector('h2')?.setAttribute('tabindex', '-1');
  panelBody.querySelector('h2')?.focus({ preventScroll: true });
  const c = isl.position.clone();
  // 讓小島避開面板：桌機往左偏、手機往上偏
  const target = c.clone();
  if (isMobile()) target.y -= 3.2; else {
    const right = new THREE.Vector3().subVectors(camera.position, controls.target).cross(new THREE.Vector3(0, 1, 0)).normalize();
    target.addScaledVector(right, -2.8);
  }
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).setY(0).normalize();
  const dist = isMobile() ? 1.25 : 1;
  const pos = target.clone().add(new THREE.Vector3(dir.x * 17 * dist, 15 * dist, dir.z * 17 * dist));
  flyTo(pos, target);
  history.replaceState(null, '', '#' + id);
}
function closePanel() {
  if (!selected) return;
  selected = null;
  panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('inert', '');
  panel.style.transform = '';
  document.body.classList.remove('panel-open');
  [...dock.children].forEach((b) => { b.classList.remove('on'); b.removeAttribute('aria-current'); });
  history.replaceState(null, '', location.pathname);
}
// 鏡頭飛到自己的島民
function focusMine() {
  const me = islanders.mine();
  if (me) flyToPerson(me);
}
// 鏡頭飛到某位島民（桌機開著名單時，讓他避開右側的名單）
function flyToPerson(person) {
  closePanel();
  stopAuto();
  const p = new THREE.Vector3();
  person.mesh.getWorldPosition(p);
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).setY(0).normalize();
  const target = p.clone();
  if (people.isOpen() && !isMobile()) target.addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 1.6);
  flyTo(target.clone().add(new THREE.Vector3(dir.x * 7, 6, dir.z * 7)), target, 1.2);
}
function goHome() {
  closePanel();
  flyTo(...homeView(), 1.3);
}
document.getElementById('panelClose').addEventListener('click', goHome);
// 手機：從面板頂端往下拖可關閉
{
  let y0 = null, dy = 0;
  const startDrag = (e) => { if (!isMobile() || panelBody.scrollTop > 0) return; y0 = e.clientY; dy = 0; panel.style.transition = 'none'; };
  panel.addEventListener('pointerdown', (e) => { if (e.target.closest('.panel-grip, .p-hero')) { startDrag(e); panel.setPointerCapture(e.pointerId); } });
  panel.addEventListener('pointermove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    panel.style.transform = `translateY(${dy}px)`;
  });
  const endDrag = () => {
    if (y0 == null) return;
    y0 = null;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 90) goHome();
  };
  panel.addEventListener('pointerup', endDrag);
  panel.addEventListener('pointercancel', endDrag);
}
document.getElementById('homeBtn').addEventListener('click', goHome);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!menu.hidden) { setMenu(false); menuBtn.focus(); return; }
  goHome();
});
panelBody.addEventListener('click', (e) => {
  if (e.target.closest('[data-open="fishing"]')) return openFishing();
  if (e.target.closest('[data-staff="refresh"]')) { staff.loadDashboard(true).then(renderPanel); renderPanel(); return; }
  const g = e.target.closest('[data-goto]');
  if (g) {
    const anchor = g.dataset.anchor;
    if (selected?.userData.id !== g.dataset.goto) openIsland(g.dataset.goto);
    if (anchor) panelBody.querySelector('#' + anchor)?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const tab = e.target.closest('[data-tabs] button');
  if (tab) {
    const key = tab.parentElement.dataset.tabs;
    const v = tab.dataset.v;
    state[key] = v === 'all' ? 'all' : +v;
    const st = panelBody.scrollTop;
    renderPanel();
    panelBody.scrollTop = st;
  }
});

// ================= 即時資訊列 =================
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const liveToday = document.getElementById('liveToday');
const liveNext = document.getElementById('liveNext');
const clockEl = document.getElementById('clock');
liveToday.addEventListener('click', () => { state.campusDay = undefined; openIsland('campus'); });
liveNext.addEventListener('click', () => openIsland('calendar'));
let lastMinute = -1;
function updateLive() {
  const n = taipeiNow();
  clockEl.textContent = `${String(n.hour).padStart(2, '0')}:${String(n.minute).padStart(2, '0')}`;
  if (n.minute === lastMinute) return;
  lastMinute = n.minute;
  const g = todaysGroups(n.day);
  liveToday.innerHTML = `週${WD[n.day]}・今天有 <b>${g.campus.length}</b> 個校園排、<b>${g.community.length}</b> 個社區排`;
  const ev = nextEvent(n.date);
  if (ev) {
    const d = daysUntil(ev.start, n.date);
    const date = `${+ev.start.slice(5, 7)}/${+ev.start.slice(8, 10)}`;
    liveNext.innerHTML = d <= 0 ? `<b>進行中</b>：${ev.title}`
      : isTentative(ev) ? `下一場：${ev.title} ${date} <b>（暫定）</b>` : `下一場：${ev.title} ${date} <b>倒數 ${d} 天</b>`;
  } else liveNext.textContent = '';
  pinEls.forEach((el, i) => {
    const def = islandObjs[i].userData.def;
    const badge = el.querySelector('.badge');
    const txt = def.badge ? def.badge(n) : '';
    badge.hidden = !txt; badge.textContent = txt;
    el._w = 0;
  });
  if (selected) { const st = panelBody.scrollTop; renderPanel(); panelBody.scrollTop = st; }
  if (autoNight) setNight(n.hour >= 18 || n.hour < 6);
  updateFishCount();
}

// ================= 日夜 =================
let night = false, autoNight = true, nightK = 0;
const nightBtn = document.getElementById('nightBtn');
function setNight(v) {
  night = v;
  document.documentElement.classList.toggle('night', v);
  nightBtn.textContent = v ? '☀️' : '🌙';
}
nightBtn.addEventListener('click', () => { autoNight = false; setNight(!night); });

// ================= 迴圈 =================
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 42 : 30;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// 釣魚或捏島民的視窗打開時，暫停後面的 3D 畫面（省電，也讓 QTE 在低階手機上反應即時）
const overlays = () => document.querySelector('.fishing:not([hidden]), .creator:not([hidden])');
function frame() {
  if (overlays()) { clock.getDelta(); requestAnimationFrame(frame); return; }
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (fly) {
    const k = Math.min(1, (performance.now() - fly.start) / fly.dur);
    const e = ease(k);
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (k >= 1) fly = null;
  }
  controls.update();

  animators.forEach((fn) => fn(t, dt));

  // 島嶼浮動＋hover 抬升
  islandObjs.forEach((isl) => {
    const want = (isl === hovered || isl === selected) ? 0.35 : 0;
    isl.userData.lift += (want - isl.userData.lift) * Math.min(1, dt * 8);
    isl.position.y = Math.sin(t * 0.8 + isl.userData.phase) * 0.04 + isl.userData.lift;
  });

  // 日夜漸變
  nightK += ((night ? 1 : 0) - nightK) * Math.min(1, dt * 2);
  sun.intensity = 2.4 * (1 - nightK) + 0.7 * nightK;
  sun.color.set('#fff0d0').lerp(new THREE.Color('#9fb2ff'), nightK);
  hemi.intensity = 1.3 * (1 - nightK) + 0.85 * nightK;
  hemi.color.set('#fff3dc').lerp(new THREE.Color('#7f86c7'), nightK);
  scene.fog.color.copy(DAY_FOG).lerp(NIGHT_FOG, nightK);
  windowMat.emissiveIntensity = nightK * 1.6;
  lampMat.emissiveIntensity = 0.2 + nightK * 2.2;
  waterMat.color.set('#7ccfd0').lerp(new THREE.Color('#6f93b8'), nightK);
  cloudMat.emissiveIntensity = 0.35 - nightK * 0.2;
  islandObjs.forEach((isl) => {
    if (isl.userData.glowLight) isl.userData.glowLight.intensity = 0.4 + nightK * 2.5;
    if (isl.userData.fireLight) isl.userData.fireLight.intensity = 0.4 + nightK * 3 + Math.sin(t * 12) * 0.2;
  });

  // 標籤位置
  const w = innerWidth, h = innerHeight;
  islandObjs.forEach((isl, i) => {
    tmpV.set(isl.position.x, isl.position.y + 3.6, isl.position.z).project(camera);
    const el = pinEls[i];
    const vis = isl.userData.group === arch && tmpV.z < 1 && Math.abs(tmpV.x) < 1.1 && Math.abs(tmpV.y) < 1.1;
    el.classList.toggle('hidden', !vis);
    el.classList.toggle('hover', isl === hovered);
    el.classList.toggle('dim', !!selected && isl !== selected);
    // 標籤不超出畫面左右邊緣
    const half = (el._w ||= el.offsetWidth) / 2 + 8;
    const px = Math.min(w - half, Math.max(half, (tmpV.x * 0.5 + 0.5) * w));
    el.style.transform = `translate(${px}px, ${(-tmpV.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    el.style.zIndex = String(Math.round((1 - tmpV.z) * 10000));
  });

  updateMePin(w, h);
  updateWhoPin(w, h);
  updateTags(w, h);
  updateLive();
  renderer.render(scene, camera);
  window.__tcypReady = true;
  requestAnimationFrame(frame);
}

document.getElementById('loading').classList.add('gone');
const intro = document.getElementById('intro');
document.querySelectorAll('[data-enter]').forEach((btn) => btn.addEventListener('click', () => {
  intro.classList.add('gone');
  if (btn.dataset.enter === 'avatar') return creator.open();
  const [id, anchor] = btn.dataset.enter.split('#');
  openIsland(id);
  if (anchor) setTimeout(() => panelBody.querySelector('#' + anchor)?.scrollIntoView({ behavior: 'smooth' }), 500);
}));
document.getElementById('enterBtn').addEventListener('click', () => {
  intro.classList.add('gone');
  const id = location.hash.slice(1);
  if (ISLANDS.some((i) => i.id === id)) openIsland(id);
});
if (location.hash && ISLANDS.some((i) => i.id === location.hash.slice(1))) {
  intro.classList.add('gone');
  setTimeout(() => openIsland(location.hash.slice(1)), 300);
}
// 重大行動的海嘯警報
const tsunami = createTsunami({
  today: taipeiNow().date,
  onDetails: () => { intro.classList.add('gone'); if (arch !== 'main') switchArch('main'); openIsland('calendar'); },
});
if (tsunami.active) pinEls[islandObjs.findIndex((i) => i.userData.id === 'calendar')]?.classList.add('alarm');
frame();
