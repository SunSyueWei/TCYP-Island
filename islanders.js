// 島上的島民：在各島的六角磚上散步，會繞開建築物
import * as THREE from 'three';
import { avatarMesh, avatarGeometry, randomAvatar, seeded, sanitize } from './avatar.js';

const SCALE = 0.3;          // 島民身高約 0.3（六角磚半徑 0.9）
const BODY_R = 0.1;
const TARGET = 200;         // 島上維持大約這麼多島民；真實島民不足時用示範島民補滿

// 從島上已擺好的物件算出「不能走」的圓形區域（島的本地座標）
function obstaclesOf(isl) {
  const out = [];
  const box = new THREE.Box3(), size = new THREE.Vector3(), c = new THREE.Vector3();
  isl.updateMatrixWorld(true);
  for (const child of isl.children) {
    if (child.userData.ground || child.userData.islander) continue;
    box.setFromObject(child);
    if (box.isEmpty()) continue;
    box.getSize(size);
    if (size.y < 0.12) continue; // 跑道、花圃等平的東西可以走
    box.getCenter(c);
    out.push({ x: c.x - isl.position.x, z: c.z - isl.position.z, r: Math.max(size.x, size.z) * 0.45 + BODY_R });
  }
  return out;
}

function makeWalker(isl) {
  const tiles = isl.userData.tiles;
  const obs = isl.userData.obstacles;
  const nearestTile = (x, z) => {
    let best = null, bd = Infinity;
    for (const t of tiles) { const d = (t.x - x) ** 2 + (t.z - z) ** 2; if (d < bd) { bd = d; best = t; } }
    return [best, Math.sqrt(bd)];
  };
  const free = (x, z) => {
    const [, d] = nearestTile(x, z);
    if (d > 0.68) return false;
    return obs.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > o.r * o.r);
  };
  const pathFree = (ax, az, bx, bz) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.08);
    for (let i = 1; i <= n; i++) if (!free(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
    return true;
  };
  const sample = (rand) => {
    for (let k = 0; k < 40; k++) {
      const t = tiles[Math.floor(rand() * tiles.length)];
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.62;
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      if (free(x, z)) return [x, z];
    }
    return null;
  };
  const heightAt = (x, z) => nearestTile(x, z)[0].y;
  const sampleNear = (i, rand) => {
    const t = tiles[i];
    for (let k = 0; k < 40; k++) {
      const a = rand() * Math.PI * 2, r = 0.3 + rand() * 0.35;
      if (free(t.x + Math.cos(a) * r, t.z + Math.sin(a) * r)) return [t.x + Math.cos(a) * r, t.z + Math.sin(a) * r];
    }
    return null;
  };
  return { free, pathFree, sample, sampleNear, heightAt };
}

export function createIslanders({ islands, onTick, lowEnd }) {
  islands.forEach((isl) => {
    isl.userData.obstacles = obstaclesOf(isl);
    isl.userData.walker = makeWalker(isl);
  });

  const people = [];
  const rand = seeded(20261028);

  function add(isl, cfg, { mine = false, near = null } = {}) {
    const w = isl.userData.walker;
    const start = (near && w.sampleNear(near, rand)) || w.sample(rand);
    if (!start) return null;
    const mesh = avatarMesh(cfg, SCALE);
    mesh.castShadow = !lowEnd;
    mesh.userData.islander = true;
    mesh.position.set(start[0], w.heightAt(...start), start[1]);
    mesh.rotation.y = rand() * Math.PI * 2;
    isl.add(mesh);
    const p = { isl, mesh, mine, target: null, wait: rand() * 3, speed: 0.22 + rand() * 0.12, phase: rand() * 10 };
    mesh.userData.person = p;
    people.push(p);
    return p;
  }
  function remove(p) {
    p.isl.remove(p.mesh);
    p.mesh.geometry.dispose();
    people.splice(people.indexOf(p), 1);
    const i = demo.indexOf(p);
    if (i >= 0) demo.splice(i, 1);
  }

  // 示範島民：中央廣場多一些，其他島平均分配
  const outer = islands.filter((i) => !i.userData.def.center);
  const plaza = islands.find((i) => i.userData.def.center);
  const islandFor = (k) => (k % 11 === 0 ? plaza : outer[k % outer.length]);
  const demo = [];
  let demoSeq = 0;
  function topUpDemo() {
    while (people.length < TARGET) {
      const p = add(islandFor(demoSeq++), randomAvatar(rand));
      if (!p) break;
      demo.push(p);
    }
  }
  topUpDemo();

  // 其他人的島民（來自帳號系統，用公開 ID 辨識）：每加一位真實島民就收掉一位示範島民
  const others = new Map();
  const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  // 以最新清單為準：新增、更新，並移除已刪除或被隱藏的島民
  function setOthers(list, { exclude = null } = {}) {
    const seen = new Set();
    for (const { pid, avatar } of list) {
      if (pid === exclude) continue;
      seen.add(pid);
      const cfg = sanitize(avatar);
      const old = others.get(pid);
      if (old) {
        old.mesh.geometry.dispose();
        old.mesh.geometry = avatarGeometry(cfg);
        old.name = cfg.name;
        old.cfg = cfg;
        continue;
      }
      const p = add(islandFor(hash(pid)), cfg);
      if (!p) continue;
      p.name = cfg.name;
      p.cfg = cfg;
      p.pid = pid;
      others.set(pid, p);
      if (demo.length && people.length > TARGET) remove(demo.pop());
    }
    for (const [pid, p] of others) if (!seen.has(pid)) { remove(p); others.delete(pid); }
    topUpDemo();
  }
  function removeOther(pid) {
    const p = others.get(pid);
    if (!p) return;
    remove(p);
    others.delete(pid);
    topUpDemo();
  }

  // 我的島民：站在中央廣場，頭上有黃色標記
  let mine = null;
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ color: '#f2b544', emissive: '#f2b544', emissiveIntensity: 0.6 }));
  function setMine(cfg) {
    if (!cfg) return;
    const name = sanitize(cfg).name;
    if (!mine) {
      mine = add(plaza, sanitize(cfg), { mine: true, near: 6 });
      if (!mine) return;
      mine.mesh.add(marker);
      marker.position.y = 1.35;
      marker.scale.setScalar(5.5);
    } else {
      mine.mesh.geometry.dispose();
      mine.mesh.geometry = avatarGeometry(sanitize(cfg));
    }
    mine.name = name;
    mine.cfg = sanitize(cfg);
  }

  const tmp = new THREE.Vector2();
  onTick((t, dt) => {
    for (const p of people) {
      const w = p.isl.userData.walker;
      const m = p.mesh;
      if (!p.target) {
        p.wait -= dt;
        m.position.y = w.heightAt(m.position.x, m.position.z);
        if (p.wait <= 0) {
          const tg = w.sample(Math.random);
          if (tg && w.pathFree(m.position.x, m.position.z, tg[0], tg[1])) p.target = tg;
          else p.wait = 0.5 + Math.random();
        }
        continue;
      }
      tmp.set(p.target[0] - m.position.x, p.target[1] - m.position.z);
      const d = tmp.length();
      if (d < 0.03) { p.target = null; p.wait = 1.5 + Math.random() * 4; continue; }
      const step = Math.min(d, p.speed * dt);
      m.position.x += (tmp.x / d) * step;
      m.position.z += (tmp.y / d) * step;
      const want = Math.atan2(tmp.x, tmp.y);
      let diff = want - m.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      m.rotation.y += diff * Math.min(1, dt * 8);
      m.position.y = w.heightAt(m.position.x, m.position.z) + Math.abs(Math.sin(t * 9 + p.phase)) * 0.025;
    }
    marker.rotation.y = t * 2;
    marker.position.y = 1.35 + Math.sin(t * 3) * 0.08;
  });

  function clearMine() {
    if (!mine) return;
    mine.mesh.remove(marker);
    remove(mine);
    mine = null;
  }
  // 真實島民（不含示範島民）：給名單和名字標籤用
  const real = () => [...others.values()];
  return { setMine, clearMine, setOthers, removeOther, real, count: () => people.length, mine: () => mine, meshes: () => people.map((p) => p.mesh) };
}
