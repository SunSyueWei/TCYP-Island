// 島民名單：右側抽屜列出所有真實島民，點暱稱可以轉著看他的模型，也能飛過去找他
import * as THREE from 'three';
import { avatarGeometry, avatarMaterial } from './avatar.js';

const TAGS_KEY = 'tcyp-name-tags';

export function createPeople({ list, mine, onFind, onOpen }) {
  const el = document.createElement('aside');
  el.className = 'people';
  el.id = 'people';
  el.setAttribute('aria-label', '島民名單');
  el.hidden = true;
  el.innerHTML = `
    <div class="pp-head">
      <b>👥 島民名單 <span class="pp-count"></span></b>
      <button class="pp-close" aria-label="關閉島民名單">✕</button>
    </div>
    <div class="pp-view" hidden>
      <canvas class="pp-canvas" aria-label="島民模型預覽，可以拖曳旋轉"></canvas>
      <b class="pp-name"></b>
      <div class="pp-acts"><button data-act="find">📍 在島上找</button><button data-act="back">← 名單</button></div>
    </div>
    <div class="pp-tools">
      <input class="pp-search" type="search" placeholder="搜尋暱稱" aria-label="搜尋暱稱" maxlength="8">
      <label class="pp-toggle"><input type="checkbox" class="pp-tags"> 島上顯示暱稱</label>
    </div>
    <ul class="pp-list" role="list"></ul>
    <p class="pp-empty" hidden></p>`;
  document.body.appendChild(el);

  const $ = (s) => el.querySelector(s);
  const listEl = $('.pp-list'), emptyEl = $('.pp-empty'), search = $('.pp-search'), view = $('.pp-view');
  const tagsBox = $('.pp-tags');
  let tagsOn = true;
  try { tagsOn = localStorage.getItem(TAGS_KEY) !== 'off'; } catch { /* ignore */ }
  tagsBox.checked = tagsOn;
  tagsBox.addEventListener('change', () => {
    tagsOn = tagsBox.checked;
    try { localStorage.setItem(TAGS_KEY, tagsOn ? 'on' : 'off'); } catch { /* ignore */ }
  });

  let current = null; // 正在看的島民

  function entries() {
    const out = list().filter((p) => p.name).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    const me = mine();
    if (me) out.unshift(me);
    return out;
  }

  function render() {
    const all = entries();
    $('.pp-count').textContent = all.length ? `${all.length} 位` : '';
    const q = search.value.trim().toLowerCase();
    const shown = q ? all.filter((p) => (p.name || '').toLowerCase().includes(q)) : all;
    listEl.innerHTML = '';
    for (const p of shown) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'pp-item' + (p.mine ? ' me' : '') + (p === current ? ' on' : '');
      const dot = document.createElement('span');
      dot.className = 'pp-dot';
      dot.style.background = p.cfg?.topColor || '#ccc';
      b.append(dot, document.createTextNode(p.mine ? `${p.name || '我'}（我）` : p.name)); // 暱稱一律當純文字
      b.addEventListener('click', () => show(p));
      li.appendChild(b);
      listEl.appendChild(li);
    }
    emptyEl.hidden = shown.length > 0;
    emptyEl.textContent = all.length
      ? '找不到這個暱稱。'
      : '還沒有其他人建立島民。按「👤 我的島民」用 Google 登入，捏一個自己的島民吧！';
  }
  search.addEventListener('input', render);

  // ---------- 模型預覽（打開時才建立，關閉就停止繪製）----------
  const canvas = $('.pp-canvas');
  let renderer = null, scene, camera, figure, raf = 0, drag = null;
  function initPreview() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    camera.position.set(0, 0.75, 3.1);
    camera.lookAt(0, 0.55, 0);
    scene.add(new THREE.HemisphereLight('#fff3dc', '#8fb6a8', 1.6));
    const d = new THREE.DirectionalLight('#fff0d0', 2); d.position.set(2, 3, 2); scene.add(d);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 6), new THREE.MeshStandardMaterial({ color: '#a3d06f', flatShading: true }));
    base.position.y = -0.04; scene.add(base);
    figure = new THREE.Mesh(new THREE.BufferGeometry(), avatarMaterial);
    scene.add(figure);
    canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (drag != null) { figure.rotation.y += (e.clientX - drag) * 0.015; drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('pointercancel', () => { drag = null; });
  }
  function loop() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (drag == null) figure.rotation.y += 0.01;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  function stopPreview() { cancelAnimationFrame(raf); raf = 0; }

  function show(p) {
    current = p;
    if (!renderer) {
      try { initPreview(); } catch (err) { console.error(err); }
    }
    if (figure) {
      figure.geometry.dispose();
      figure.geometry = avatarGeometry(p.cfg);
      figure.rotation.y = 0;
    }
    $('.pp-name').textContent = p.mine ? `${p.name || '我'}（我）` : p.name;
    view.hidden = false;
    if (renderer && !raf) loop();
    render();
    $('.pp-acts [data-act="find"]').focus({ preventScroll: true });
  }
  function back() {
    current = null;
    view.hidden = true;
    stopPreview();
    render();
  }
  $('.pp-acts').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'back') return back();
    if (b.dataset.act === 'find' && current) {
      if (!current.mesh.parent) { back(); return; }
      onFind(current);
    }
  });

  function open() {
    onOpen?.();
    el.hidden = false;
    document.body.classList.add('people-open');
    render();
    if (current && renderer && !raf) loop();
    search.focus({ preventScroll: true });
  }
  function close() {
    el.hidden = true;
    document.body.classList.remove('people-open');
    stopPreview();
  }
  $('.pp-close').addEventListener('click', close);
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // 名單有變動時更新（例如有人刪除島民或被隱藏）
  function refresh() {
    if (el.hidden) return;
    if (current && !current.mesh.parent && !current.mine) back();
    else render();
  }

  return { open, close, refresh, isOpen: () => !el.hidden, tagsOn: () => tagsOn };
}
