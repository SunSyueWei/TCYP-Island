// 小羊群島：自己登記的福音朋友變成一隻隻小羊。每天為每隻小羊禱告一次，小羊就會長大。
// 名字只有登記的本人看得到（後端 lambs 只回傳自己的）；禱告紀錄存在代禱網的試算表，一天一次由後端判斷。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { post, summaryHtml as prayerSummary, state as prayerState } from './prayer.js';
import { obstaclesOf, makeWalker } from './islanders.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 成長 ----------
export const LEVELS = [
  { lv: 1, name: '小羊', need: 0 }, { lv: 2, name: '學步羊', need: 3 }, { lv: 3, name: '活潑羊', need: 7 },
  { lv: 4, name: '毛茸羊', need: 14 }, { lv: 5, name: '棉花羊', need: 30 }, { lv: 6, name: '雲朵羊', need: 50 }, { lv: 7, name: '牧場之星', need: 100 },
];
export function levelOf(xp) {
  let L = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.need) L = l;
  const next = LEVELS[L.lv] || null;
  const pct = next ? (xp - L.need) / (next.need - L.need) : 1;
  return { ...L, next, pct };
}

// 禱告提示（輪流顯示，經文是「參」：意思相近的提示，不是逐字引用）
const PROMPTS = [
  ['主啊，求你像好牧人一樣尋找 {n}，把他帶回你的羊群。', '參 路加福音 15:4–7'],
  ['主啊，你願意萬人得救，求你開 {n} 的心，認識你。', '參 提摩太前書 2:4'],
  ['主啊，求你讓 {n} 願意來小排，和我們一起享受你。', '參 希伯來書 10:25'],
  ['主啊，你是好牧人，你認識自己的羊；求你呼喚 {n}。', '參 約翰福音 10:14–16'],
  ['主啊，求你給我機會和勇氣，再一次邀約 {n}。', '參 歌羅西書 4:3'],
  ['主啊，求你保守 {n} 的學校生活和家人，讓他經歷你的愛。', ''],
];

// ---------- 資料 ----------
export const lambState = { status: 'idle', data: null, error: null, loadedAt: 0 };
const listeners = new Set();
export const onLambs = (f) => listeners.add(f);
const emit = () => listeners.forEach((f) => f());

export async function loadLambs() {
  lambState.status = 'loading'; emit();
  try {
    const j = await post('lambs');
    lambState.data = j.data; lambState.status = 'ready'; lambState.error = null; lambState.loadedAt = Date.now();
  } catch (err) {
    lambState.status = err.code === 'signin' ? 'signin' : 'error'; lambState.error = err.message;
  }
  emit();
  return lambState;
}
export function resetLambs() { Object.assign(lambState, { status: 'idle', data: null, error: null, loadedAt: 0 }); emit(); }

const lambKey = (l) => `${l.id}#${l.index}`;
export function findLamb(key) { return lambState.data?.lambs.find((l) => lambKey(l) === key) || null; }

function badges(d) {
  const L = d.lambs;
  const lv = (l) => levelOf(l.xp).lv;
  return [
    ['🌱', '第一次禱告', d.totalPrayers >= 1],
    ['🔥', '連續 3 天', d.userStreak >= 3],
    ['🔥', '連續 7 天', d.userStreak >= 7],
    ['🏆', '連續 30 天', d.userStreak >= 30],
    ['🐑', '每隻小羊都記念過', L.length > 0 && L.every((l) => l.xp >= 1)],
    ['🌟', '有小羊長到活潑羊', L.some((l) => lv(l) >= 3)],
    ['💫', '全部長到活潑羊', L.length > 0 && L.every((l) => lv(l) >= 3)],
    ['🧣', '有朋友進了小排', L.some((l) => l.g)],
  ];
}

// ---------- 面板（小羊群島的小島） ----------
const sec = (title, inner) => `<section class="p-sec">${title ? `<h3>${title}</h3>` : ''}${inner}</section>`;
const hero = (d, sub) => `<div class="p-hero" style="--c:${d.tint}"><div class="em">${d.emoji}</div><h2>${d.name}</h2><p>${sub}</p></div>`;

function todayHtml(d) {
  const n = d.lambs.length, done = d.lambs.filter((l) => l.prayedToday).length;
  return `<div class="lb-today"><div class="lb-today-top"><b>今天為 ${done}／${n} 隻小羊禱告</b><span>🔥 連續 ${d.userStreak} 天・共 ${d.totalPrayers} 次</span></div>
    <span class="lb-bar"><i style="width:${n ? (done / n) * 100 : 0}%"></i></span>
    ${n && done === n ? '<p class="lb-alldone">🎉 今天每一隻小羊都被記念了！</p>' : ''}</div>`;
}
function pastureHtml(auth) {
  if (!auth.signedIn()) return sec('', `<p>登入後，你在代禱牆登記的朋友會變成小羊，住在這座牧場。每天為他們禱告，小羊就會長大！</p><div class="goto"><button data-open="signin">用 Google 帳號登入</button></div>`);
  const s = lambState;
  if (s.status === 'error' && !s.data) return sec('', `<p class="cr-warn">小羊們暫時讀不到（${esc(s.error)}）。</p>`);
  if (!s.data) return sec('', '<p class="hint">正在叫小羊們回來…</p>');
  const d = s.data;
  if (!d.lambs.length) return sec('', `<p>你的牧場還沒有小羊。到代禱牆新增你邀約的朋友，或認領你以前在舊網站的登記，他們就會變成小羊住進來。</p><div class="goto"><button data-open="prayer-add">➕ 新增代禱名單</button><button data-open="prayer">🙋 認領以前的登記</button></div>`);
  const list = [...d.lambs].sort((a, b) => Number(a.prayedToday) - Number(b.prayedToday) || b.xp - a.xp);
  return sec('今天的牧場', todayHtml(d))
    + sec('我的小羊', `<ul class="lb-list">${list.map((l) => {
      const L = levelOf(l.xp);
      return `<li><button class="lb-who" data-lamb-open="${esc(lambKey(l))}"><b>${esc(l.name)}</b><small>Lv${L.lv} ${L.name}${l.g ? '・🧣' + esc(l.g.n) : ''}${l.c ? '・✋' : ''}${l.b ? '・✨受浸' : ''}</small><span class="lb-bar sm"><i style="width:${L.pct * 100}%"></i></span></button>
        ${l.prayedToday ? '<span class="lb-done">✅ 今天</span>' : `<button class="lb-pray" data-lamb-pray="${esc(lambKey(l))}">🙏 禱告</button>`}</li>`;
    }).join('')}</ul>`)
    + sec('徽章', `<div class="lb-badges">${badges(d).map(([em, label, got]) => `<span class="${got ? 'got' : ''}" title="${esc(label)}">${em}<small>${esc(label)}</small></span>`).join('')}</div>`)
    + sec('', '<p class="hint">小羊用「名字」對應成長紀錄；在代禱牆改了朋友的名字，那隻小羊會從頭長大。只有你自己看得到小羊的名字。</p>');
}

export function lambIslands(auth) {
  const pasture = (id, name, emoji, tint, angle, sub) => ({ id, name, short: name, emoji, tint, angle, lamb: true, render: () => hero(LAMB_ISLANDS.find((x) => x.id === id), sub) + pastureHtml(auth) });
  const LAMB_ISLANDS = [
    {
      id: 'lb-altar', name: '金香壇之島', short: '代禱牆', emoji: '🕯️', tint: '#fff1c9', center: true, lamb: true,
      render: () => {
        const me = auth.signedIn() && lambState.data ? todayHtml(lambState.data) : '';
        const mine = prayerState.rows.filter((r) => r.mine).length;
        return hero(LAMB_ISLANDS[0], '在金香壇前，為我們邀約的朋友一同代禱')
          + sec('🙏 代禱牆', `<p>把你邀約的同學朋友加進代禱名單，大家一起為他們禱告，也一起關心他們：<b>答應前來 → 進入小排 → 受浸</b>。</p>
            ${prayerSummary()}<div class="goto"><button data-open="prayer">🙏 打開代禱牆</button><button data-open="prayer-add">➕ 新增代禱名單</button></div>`)
          + (auth.signedIn() && !mine ? sec('🙋 以前登記過嗎？', '<p>在舊網站登記過的人，可以打開代禱牆，找到自己那一筆按「🙋 這是我登記的」，服事者確認後就會變成你的。</p>') : '')
          + sec('🐑 我的小羊', `${me || '<p>你登記的朋友會變成小羊，住在旁邊的牧場。每天為他們禱告，小羊就會長大。</p>'}<div class="goto"><button data-goto="lb-grass">🌿 去青草地看小羊</button></div>`);
      },
    },
    pasture('lb-grass', '青草地', '🌿', '#e3f4d2', 90, '祂使我躺臥在青草地上（參 詩篇 23:2）'),
    pasture('lb-water', '溪水旁', '💧', '#d8eef6', 210, '領我在可安歇的水邊（參 詩篇 23:2）'),
    pasture('lb-fold', '羊圈', '🏡', '#f6e7d2', 330, '好牧人認識自己的羊（參 約翰福音 10:14）'),
  ];
  return LAMB_ISLANDS;
}

// ---------- 3D 小羊 ----------
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
function part(list, geo, color, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  tmpM.compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(tmpM);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  list.push(g);
}
const Sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const Cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
// 長度約 1（之後縮小）。等級越高羊毛越蓬；跟進狀態變成配件
function sheepGeometry(l, demo = false) {
  const P = [];
  const lv = levelOf(l.xp || 0).lv;
  const wool = demo ? '#e9e4da' : '#fbf8f2', face = '#4a3f3a', leg = '#3d3431';
  const fluff = 1 + (lv - 1) * 0.06;
  [[-0.18, -0.12], [0.18, -0.12], [-0.18, 0.12], [0.18, 0.12]].forEach(([x, z]) => part(P, Cyl(0.045, 0.04, 0.26), leg, [x, 0.13, z]));
  const puffs = 5 + lv;
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2;
    part(P, Sph(0.2 * fluff), wool, [Math.cos(a) * 0.17, 0.42 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.12]);
  }
  part(P, Sph(0.26 * fluff, 10, 8), wool, [0, 0.46, 0], [0, 0, 0], [1.25, 0.95, 1]);
  part(P, Sph(0.13 * fluff), wool, [0.3, 0.62, 0]);              // 頭頂的毛
  part(P, Sph(0.12, 8, 6), face, [0.38, 0.5, 0], [0, 0, -0.3], [1.25, 1, 0.95]);
  [-1, 1].forEach((s) => {
    part(P, Sph(0.05, 6, 4), face, [0.33, 0.56, s * 0.12], [0, 0, 0], [0.6, 0.35, 1.3]);
    part(P, Sph(0.022, 6, 4), '#ffffff', [0.47, 0.54, s * 0.05]);
  });
  part(P, Sph(0.06), wool, [-0.34, 0.5, 0]);                    // 尾巴
  if (!demo) {
    if (l.g) part(P, new THREE.TorusGeometry(0.12, 0.035, 6, 14), '#2f9e5b', [0.28, 0.42, 0], [0, Math.PI / 2, 0.35], [1, 1, 1.1]);   // 進小排：綠色圍巾
    if (l.c) part(P, Sph(0.045), '#f2b544', [0.36, 0.33, 0]);   // 答應前來：鈴鐺
    if (l.b) part(P, new THREE.TorusGeometry(0.11, 0.018, 6, 18), '#ffd84d', [0.36, 0.78, 0], [Math.PI / 2, 0, 0]);   // 受浸：光環
  }
  return mergeGeometries(P);
}
const sheepMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
const scaleOf = (xp) => 0.62 * (1 + (levelOf(xp).lv - 1) * 0.11);

// world：小羊在牧場的三座島上漫步。頭上的名字標籤只有本人的畫面有。
export function createLambWorld({ islands, onTick, pinsEl, camera, lowEnd }) {
  islands.forEach((isl) => { isl.userData.obstacles = obstaclesOf(isl); isl.userData.walker = makeWalker(isl); });
  const sheep = new Map();   // key → { lamb, mesh, isl, label, target, wait, hop, grow }
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function spawn(key, l, isl, demo) {
    const w = isl.userData.walker;
    const p = w.sample(rand) || [isl.userData.tiles[0].x, isl.userData.tiles[0].z];
    const mesh = new THREE.Mesh(sheepGeometry(l, demo), sheepMat);
    mesh.castShadow = !lowEnd;
    mesh.position.set(p[0], w.heightAt(...p), p[1]);
    mesh.rotation.y = rand() * Math.PI * 2;
    mesh.scale.setScalar(demo ? 0.55 : scaleOf(l.xp));
    mesh.userData.lambKey = demo ? null : key;
    isl.add(mesh);
    let label = null;
    if (!demo) {
      label = document.createElement('div');
      label.className = 'pin lamb-tag hidden';
      pinsEl.appendChild(label);
    }
    sheep.set(key, { lamb: l, mesh, isl, label, demo, target: null, wait: rand() * 3, hop: 0, sig: '' });
  }
  function remove(key) {
    const s = sheep.get(key);
    s.isl.remove(s.mesh); s.mesh.geometry.dispose(); s.label?.remove();
    sheep.delete(key);
  }
  const sig = (l) => `${levelOf(l.xp).lv}|${l.c ? 1 : 0}|${l.g ? 1 : 0}|${l.b ? 1 : 0}`;

  // 依最新資料新增、更新、移除小羊；沒登入或沒有小羊時放三隻打瞌睡的示範小羊
  function sync(lambs) {
    const want = new Map();
    if (lambs && lambs.length) lambs.forEach((l) => want.set(lambKey(l), l));
    else for (let i = 0; i < 3; i++) want.set('demo' + i, { xp: 0, demo: true });
    for (const k of [...sheep.keys()]) if (!want.has(k)) remove(k);
    let i = 0;
    for (const [k, l] of want) {
      const s = sheep.get(k);
      if (!s) spawn(k, l, islands[i % islands.length], !!l.demo);
      else {
        s.lamb = l;
        if (!s.demo && s.sig !== sig(l)) { s.mesh.geometry.dispose(); s.mesh.geometry = sheepGeometry(l); s.sig = sig(l); }
      }
      i++;
    }
    for (const s of sheep.values()) if (!s.demo) s.sig = sig(s.lamb);
  }

  function celebrate(key) {
    const s = sheep.get(key);
    if (!s) return;
    s.hop = 1.2;
    s.grow = scaleOf(s.lamb.xp);
    for (let i = 0; i < 6; i++) {
      const h = document.createElement('div');
      h.className = 'lamb-heart';
      h.textContent = i % 3 ? '💖' : '✨';
      h.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`);
      h.style.animationDelay = `${i * 90}ms`;
      s.heartsAt = performance.now();
      (s.hearts ||= []).push(h);
      pinsEl.appendChild(h);
      setTimeout(() => { h.remove(); s.hearts = s.hearts.filter((x) => x !== h); }, 1800);
    }
  }

  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function pick(ev, canvas) {
    const r = canvas.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const meshes = [...sheep.values()].filter((s) => !s.demo).map((s) => s.mesh);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.object.userData.lambKey : null;
  }
  function worldPos(key, out) {
    const s = sheep.get(key);
    if (!s) return null;
    return s.mesh.getWorldPosition(out);
  }

  const tmp = new THREE.Vector2(), v = new THREE.Vector3();
  onTick((t, dt) => {
    for (const s of sheep.values()) {
      const m = s.mesh, w = s.isl.userData.walker;
      if (s.grow) { const cur = m.scale.x; const nx = cur + (s.grow - cur) * Math.min(1, dt * 4); m.scale.setScalar(nx); if (Math.abs(nx - s.grow) < 0.002) s.grow = 0; }
      let hopY = 0;
      if (s.hop > 0) { s.hop -= dt; hopY = Math.abs(Math.sin(s.hop * 9)) * 0.18 * Math.min(1, s.hop); }
      if (s.demo) { m.position.y = w.heightAt(m.position.x, m.position.z); continue; }   // 示範小羊打瞌睡不走動
      if (!s.target) {
        s.wait -= dt;
        m.position.y = w.heightAt(m.position.x, m.position.z) + hopY;
        if (s.wait <= 0) {
          const tg = w.sample(Math.random);
          if (tg && w.pathFree(m.position.x, m.position.z, tg[0], tg[1])) s.target = tg; else s.wait = 0.6 + Math.random();
        }
        continue;
      }
      tmp.set(s.target[0] - m.position.x, s.target[1] - m.position.z);
      const d = tmp.length();
      if (d < 0.03) { s.target = null; s.wait = 2 + Math.random() * 5; continue; }
      const step = Math.min(d, (s.lamb.prayedToday ? 0.28 : 0.16) * dt);   // 今天被記念的小羊特別有活力
      m.position.x += (tmp.x / d) * step; m.position.z += (tmp.y / d) * step;
      let diff = Math.atan2(-tmp.y, tmp.x) - m.rotation.y;   // 小羊的頭朝 +x
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      m.rotation.y += diff * Math.min(1, dt * 6);
      m.position.y = w.heightAt(m.position.x, m.position.z) + hopY + Math.abs(Math.sin(t * 10 + m.id)) * 0.02;
    }
  });

  // 每一幀更新名字標籤位置（由主程式的畫面迴圈呼叫）
  function updateLabels(w, h, visible) {
    for (const s of sheep.values()) {
      if (!s.label) continue;
      if (!visible) { s.label.classList.add('hidden'); continue; }
      s.mesh.getWorldPosition(v);
      v.y += s.mesh.scale.x * 0.95;
      v.project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      s.label.classList.toggle('hidden', !vis);
      if (!vis) continue;
      const txt = `${s.lamb.prayedToday ? '💖' : '💭'} ${s.lamb.name}`;
      if (s.label.textContent !== txt) s.label.textContent = txt;   // 名字一律當純文字
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      s.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      s.label.classList.toggle('done', !!s.lamb.prayedToday);
      for (const hEl of s.hearts || []) hEl.style.left = `${x}px`, hEl.style.top = `${y}px`;
    }
  }

  // 花：總禱告次數越多，牧場的花越多（最多 60 朵）
  const flowers = [];
  const flowerGeo = new THREE.ConeGeometry(0.05, 0.12, 5);
  const petal = ['#f49aa0', '#f2b544', '#ffffff', '#a993d6', '#e97a5b'].map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true }));
  function setFlowers(n) {
    const want = Math.min(60, n);
    while (flowers.length < want) {
      const k = flowers.length, isl = islands[k % islands.length], tiles = isl.userData.tiles;
      const t = tiles[(k * 7) % tiles.length], a = k * 2.4, r = 0.25 + ((k * 37) % 30) / 100;
      const f = new THREE.Mesh(flowerGeo, petal[k % petal.length]);
      f.rotation.x = Math.PI;
      f.position.set(t.x + Math.cos(a) * r, t.y + 0.06, t.z + Math.sin(a) * r);
      isl.add(f); flowers.push(f);
    }
  }

  return { sync, celebrate, pick, worldPos, updateLabels, setFlowers };
}

// ---------- 小羊卡片 ----------
export function createLambCard({ onPray, onClose }) {
  const el = document.createElement('div');
  el.className = 'lamb-card';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '小羊');
  document.body.appendChild(el);
  let key = null, msg = '';
  function render() {
    const l = findLamb(key);
    if (!l) { close(); return; }
    const L = levelOf(l.xp);
    const day = Number((lambState.data?.today || '').replace(/-/g, '')) || 0;
    const [text, ref] = PROMPTS[(day + l.index + l.name.length) % PROMPTS.length];
    el.innerHTML = `<button class="lc-x" data-act="close" aria-label="關閉">✕</button>
      <div class="lc-top"><span class="lc-em" aria-hidden="true">🐑</span><div><b class="lc-name"></b><small>${esc(l.group)}</small></div><span class="lc-lv">Lv${L.lv} ${L.name}</span></div>
      <div class="lc-xp"><span class="lb-bar"><i style="width:${L.pct * 100}%"></i></span><small>${L.next ? `再禱告 ${L.next.need - l.xp} 次長成「${L.next.name}」` : '已經是牧場之星了！'}・共 ${l.xp} 次・🔥 連續 ${l.streak} 天</small></div>
      <div class="lc-tags">${l.c ? '<span>✋ 答應前來</span>' : ''}${l.g ? `<span class="g">🧣 ${esc(l.g.n)}</span>` : '<span class="off">還沒進小排</span>'}${l.b ? '<span class="b">✨ 已受浸</span>' : ''}</div>
      <p class="lc-prompt"></p>${ref ? `<small class="lc-ref">${esc(ref)}</small>` : ''}
      ${msg ? `<p class="lc-msg" role="status">${esc(msg)}</p>` : ''}
      ${l.prayedToday ? '<button class="lc-pray done" disabled>💖 今天已經為他禱告了</button>' : '<button class="lc-pray" data-act="pray">🙏 我今天為他禱告了</button>'}`;
    el.querySelector('.lc-name').textContent = l.name;                 // 名字一律當純文字
    el.querySelector('.lc-prompt').textContent = text.replace('{n}', l.name);
  }
  function open(k) { key = k; msg = ''; el.hidden = false; render(); el.querySelector('.lc-pray:not([disabled])')?.focus({ preventScroll: true }); }
  function close() { el.hidden = true; key = null; onClose?.(); }
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'close') return close();
    if (a === 'pray') { msg = await onPray(key); render(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });
  onLambs(() => { if (!el.hidden) render(); });
  return { open, close, refresh: () => !el.hidden && render(), isOpen: () => !el.hidden, key: () => key };
}

// 為小羊禱告：先在畫面上長大（樂觀更新），再送到後端；失敗就還原
export async function prayFor(key) {
  const l = findLamb(key);
  if (!l || l.prayedToday) return '';
  const before = { xp: l.xp, streak: l.streak, prayedToday: l.prayedToday, total: lambState.data.totalPrayers, us: lambState.data.userStreak };
  const lvBefore = levelOf(l.xp).lv;
  l.xp += 1; l.prayedToday = true; l.streak = Math.max(1, l.streak + 1);
  lambState.data.totalPrayers += 1;
  emit();
  try {
    const j = await post('pray', { id: l.id, index: l.index });
    Object.assign(l, { xp: j.data.xp, streak: j.data.streak, prayedToday: true });
    lambState.data.userStreak = j.data.userStreak;
    emit();
    const lv = levelOf(l.xp);
    return lv.lv > lvBefore ? `🎉 長大了！變成「${lv.name}」` : '謝謝你為他禱告 💖';
  } catch (err) {
    if (err.message && err.message.includes('今天已經')) { l.prayedToday = true; emit(); return err.message; }
    Object.assign(l, { xp: before.xp, streak: before.streak, prayedToday: before.prayedToday });
    lambState.data.totalPrayers = before.total; lambState.data.userStreak = before.us;
    emit();
    return `沒有送出：${err.message}`;
  }
}
