// 島民角色：外觀設定 → 一個合併後的 3D 模型（單一 draw call，適合同時顯示兩百多位）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

import { OPTIONS, DEFAULT_AVATAR, sanitize, randomAvatar, seeded } from './avatar-data.js';

export { OPTIONS, DEFAULT_AVATAR, sanitize, randomAvatar, seeded };

// ---------- 建模 ----------
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
function part(list, geo, color, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  tmpM.compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(tmpM);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  list.push(g);
}
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const Sph = (r, ws = 10, hs = 7, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl);

// 身高約 1（之後在島上縮小）
function buildParts(a) {
  const P = [];
  const skin = a.skin;
  const girl = a.gender === 'f';
  const sleeveLong = a.top !== 'tee';
  // 鞋子
  [-0.07, 0.07].forEach((x) => part(P, Box(0.1, 0.06, 0.16), a.shoes, [x, 0.03, 0.02]));
  // 腿／下身
  if (a.bottom === 'pants') {
    [-0.07, 0.07].forEach((x) => part(P, Cyl(0.055, 0.05, 0.32), a.bottomColor, [x, 0.22, 0]));
  } else if (a.bottom === 'shorts') {
    [-0.07, 0.07].forEach((x) => { part(P, Cyl(0.045, 0.045, 0.2), skin, [x, 0.16, 0]); part(P, Cyl(0.065, 0.062, 0.14), a.bottomColor, [x, 0.31, 0]); });
  } else {
    [-0.07, 0.07].forEach((x) => part(P, Cyl(0.042, 0.042, 0.22), skin, [x, 0.17, 0]));
    part(P, Cyl(0.13, 0.21, 0.2, 14), a.bottomColor, [0, 0.3, 0]);
  }
  // 上身
  const shoulder = girl ? 0.125 : 0.14;
  part(P, Cyl(shoulder, 0.15, 0.3, 12), a.topColor, [0, 0.52, 0]);
  if (a.top === 'jacket') part(P, Box(0.07, 0.28, 0.02), '#fffaf0', [0, 0.52, 0.145]);
  if (a.top === 'hoodie') { part(P, Sph(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), a.topColor, [0, 0.66, -0.09], [-0.5, 0, 0], [1, 0.8, 0.7]); part(P, Box(0.14, 0.06, 0.02), a.topColor, [0, 0.46, 0.15]); }
  // 手臂
  [-1, 1].forEach((sd) => {
    const x = sd * (shoulder + 0.045);
    if (sleeveLong) part(P, Cyl(0.042, 0.038, 0.28), a.topColor, [x, 0.53, 0], [0, 0, sd * 0.12]);
    else { part(P, Cyl(0.048, 0.046, 0.1), a.topColor, [x, 0.62, 0], [0, 0, sd * 0.12]); part(P, Cyl(0.036, 0.034, 0.2), skin, [x + sd * 0.012, 0.47, 0], [0, 0, sd * 0.12]); }
    part(P, Sph(0.04, 8, 6), skin, [x + sd * 0.02, 0.37, 0]);
  });
  // 脖子、頭
  part(P, Cyl(0.04, 0.045, 0.06), skin, [0, 0.69, 0]);
  const hy = 0.86;
  part(P, Sph(0.17, 14, 10), skin, [0, hy, 0]);
  [-0.06, 0.06].forEach((x) => part(P, Sph(0.022, 8, 6), '#2b211c', [x, hy + 0.01, 0.155]));
  part(P, Box(0.05, 0.012, 0.01), '#b4584a', [0, hy - 0.07, 0.163]);
  if (girl) [-0.1, 0.1].forEach((x) => part(P, Sph(0.025, 8, 6), '#f4a6a0', [x, hy - 0.04, 0.135], [0, 0, 0], [1, 0.6, 0.4]));
  // 頭髮
  const hc = a.hairColor;
  // 頭頂一片完整的髮、後側往下延伸（前面留臉）
  const dome = () => part(P, Sph(0.182, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.34), hc, [0, hy, -0.005]);
  const sides = (to) => part(P, Sph(0.186, 14, 6, Math.PI * 0.7, Math.PI * 1.6, Math.PI * 0.33, Math.PI * (to - 0.33)), hc, [0, hy, -0.005]);
  if (a.hair !== 'none') {
    dome();
    sides({ bob: 0.75, long: 0.8 }[a.hair] || 0.6);
    part(P, Box(0.24, 0.05, 0.05), hc, [0, hy + 0.12, 0.13], [0.35, 0, 0]); // 瀏海
  }
  if (a.hair === 'spiky') for (let k = 0; k < 5; k++) part(P, new THREE.ConeGeometry(0.05, 0.12, 5), hc, [Math.cos(k * 1.25) * 0.08, hy + 0.17, Math.sin(k * 1.25) * 0.08 - 0.02], [Math.sin(k * 1.25) * 0.5, 0, -Math.cos(k * 1.25) * 0.5]);
  if (a.hair === 'long') { part(P, Box(0.3, 0.32, 0.08), hc, [0, hy - 0.16, -0.12]); }
  if (a.hair === 'ponytail') { part(P, Sph(0.06, 8, 6), hc, [0, hy + 0.06, -0.19]); part(P, Cyl(0.05, 0.025, 0.24, 8), hc, [0, hy - 0.09, -0.21], [0.2, 0, 0]); }
  if (a.hair === 'buns') [-0.12, 0.12].forEach((x) => part(P, Sph(0.065, 10, 8), hc, [x, hy + 0.15, -0.03]));
  // 帽子
  const ht = a.hatColor;
  if (a.hat === 'cap') { part(P, Sph(0.19, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), ht, [0, hy + 0.04, 0]); part(P, Cyl(0.13, 0.13, 0.02, 14), ht, [0, hy + 0.08, 0.16], [0, 0, 0], [1, 1, 0.8]); }
  if (a.hat === 'beanie') { part(P, Sph(0.192, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), ht, [0, hy + 0.05, 0], [0, 0, 0], [1, 1.15, 1]); part(P, Cyl(0.196, 0.196, 0.06, 16), ht, [0, hy + 0.07, 0]); part(P, Sph(0.05, 8, 6), '#fffaf0', [0, hy + 0.28, 0]); }
  if (a.hat === 'bucket') { part(P, Cyl(0.15, 0.19, 0.14, 14), ht, [0, hy + 0.13, 0]); part(P, Cyl(0.2, 0.27, 0.04, 16), ht, [0, hy + 0.06, 0]); }
  if (a.hat === 'straw') { part(P, Cyl(0.14, 0.17, 0.12, 14), '#e8c27a', [0, hy + 0.14, 0]); part(P, Cyl(0.33, 0.33, 0.02, 18), '#e8c27a', [0, hy + 0.08, 0]); part(P, Cyl(0.172, 0.172, 0.035, 14), ht, [0, hy + 0.1, 0]); }
  // 配件
  const ac = a.accColor;
  if (a.acc.includes('glasses')) { [-0.06, 0.06].forEach((x) => part(P, new THREE.TorusGeometry(0.04, 0.009, 5, 12), '#3b2f25', [x, hy + 0.01, 0.165])); part(P, Box(0.04, 0.01, 0.01), '#3b2f25', [0, hy + 0.02, 0.17]); }
  if (a.acc.includes('bow')) { [-0.05, 0.05].forEach((x) => part(P, new THREE.ConeGeometry(0.045, 0.08, 6), ac, [0.1 + x, hy + 0.16, 0.02], [0, 0, x > 0 ? -Math.PI / 2 : Math.PI / 2])); part(P, Sph(0.025, 6, 5), ac, [0.1, hy + 0.16, 0.02]); }
  if (a.acc.includes('headphones')) { part(P, new THREE.TorusGeometry(0.19, 0.018, 5, 16, Math.PI), ac, [0, hy + 0.02, 0]); [-0.19, 0.19].forEach((x) => part(P, Cyl(0.05, 0.05, 0.05, 10), ac, [x, hy, 0], [0, 0, Math.PI / 2])); }
  if (a.acc.includes('backpack')) { part(P, Box(0.22, 0.26, 0.1), ac, [0, 0.54, -0.18]); part(P, Box(0.16, 0.08, 0.03), ac, [0, 0.46, -0.24]); }
  if (a.acc.includes('scarf')) { part(P, new THREE.TorusGeometry(0.075, 0.03, 6, 14), ac, [0, 0.69, 0], [Math.PI / 2, 0, 0]); part(P, Box(0.06, 0.16, 0.03), ac, [0.05, 0.6, 0.11]); }
  return P;
}

export const avatarMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true });

export function avatarGeometry(a) {
  const parts = buildParts(sanitize(a));
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

export function avatarMesh(a, scale = 1) {
  const m = new THREE.Mesh(avatarGeometry(a), avatarMaterial);
  m.scale.setScalar(scale);
  return m;
}
