// 捏臉：建立／修改「我的島民」
import * as THREE from 'three';
import { OPTIONS, DEFAULT_AVATAR, avatarGeometry, avatarMaterial, randomAvatar, sanitize } from './avatar.js';

const TABS = [
  ['body', '身體', [['gender', '性別'], ['skin', '膚色', 'skin']]],
  ['hair', '頭髮', [['hair', '髮型'], ['hairColor', '髮色', 'hairColor']]],
  ['hat', '帽子', [['hat', '帽子'], ['hatColor', '帽子顏色', 'cloth']]],
  ['top', '上衣', [['top', '款式'], ['topColor', '顏色', 'cloth']]],
  ['bottom', '褲裙', [['bottom', '款式'], ['bottomColor', '顏色', 'cloth'], ['shoes', '鞋子', 'cloth']]],
  ['acc', '配件', [['acc', '配件（可多選）'], ['accColor', '配件顏色', 'cloth']]],
];

export function createCreator({ initial, onSave, account }) {
  let user = null;
  let busy = false;
  let hiddenByAdmin = false;
  let admin = false;
  let adminView = false;
  let cfg = sanitize(initial || DEFAULT_AVATAR);
  let tab = 'body';

  const el = document.createElement('div');
  el.className = 'creator';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '我的島民');
  el.hidden = true;
  el.innerHTML = `
    <div class="cr-card">
      <button class="cr-close" aria-label="關閉">✕</button>
      <div class="cr-stage"><canvas class="cr-canvas" aria-label="島民預覽"></canvas>
        <div class="cr-stage-btns"><button data-act="random">🎲 隨機</button><button data-act="reset">↺ 重設</button></div></div>
      <div class="cr-side">
        <h2>👤 我的島民</h2>
        <label class="cr-name">暱稱 <input maxlength="8" placeholder="最多 8 個字" autocomplete="off"></label>
        <div class="cr-tabs" role="tablist"></div>
        <div class="cr-opts"></div>
        <div class="cr-account"></div>
        <p class="cr-status" role="status"></p>
        <button class="btn-primary cr-save">放到島上 →</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  const nameInput = el.querySelector('.cr-name input');
  const tabsEl = el.querySelector('.cr-tabs');
  const optsEl = el.querySelector('.cr-opts');
  const accEl = el.querySelector('.cr-account');
  const statusEl = el.querySelector('.cr-status');
  const nameWarn = '暱稱會公開顯示在網站上，所有人都看得到。請不要用真實姓名、學校或班級。';

  const privacyLink = '<a href="privacy.html" target="_blank" rel="noopener">隱私說明</a>';
  function renderAccount() {
    if (adminView) return renderAdmin();
    if (!account.enabled) {
      accEl.innerHTML = `<p class="cr-note">目前島民只存在這台裝置；帳號系統開通後，大家捏的島民都會出現在島上。<br>${nameWarn}</p>`;
      return;
    }
    if (user) {
      accEl.innerHTML = `${hiddenByAdmin ? '<p class="cr-warn">你的島民目前被管理員暫時隱藏，其他人看不到。如有疑問請私訊 IG @tc_yp。</p>' : ''}
        <p class="cr-note">✅ 已用 Google 登入，你的島民會出現在大家的島上。<br>${nameWarn}　${privacyLink}</p>
        <div class="cr-acc-btns"><button data-act="signout">登出</button><button data-act="delete">刪除我的島民與帳號</button>${admin ? '<button data-act="admin">🛡️ 管理檢舉</button>' : ''}</div>
        <details class="cr-uid"><summary>我的帳號 ID（設定管理員時用）</summary><code>${user.uid}</code></details>`;
      return;
    }
    const iab = account.inAppBrowser();
    accEl.innerHTML = `<p class="cr-note">用 Google 帳號登入，你的島民就會出現在大家的島上，換手機也找得回來。不登入的話，島民只存在這台裝置。<br>${nameWarn}　${privacyLink}</p>
      ${iab && iab !== 'line' ? '<p class="cr-warn">Instagram／Facebook 裏的瀏覽器不能用 Google 登入：請點右上角「⋯」，選「用瀏覽器開啟」後再登入。</p>' : ''}
      <button class="cr-google" data-act="signin"><span>G</span>用 Google 登入</button>`;
  }
  const REASON = Object.fromEntries(account.reasons || []);
  async function renderAdmin() {
    accEl.innerHTML = '<p class="cr-note">讀取檢舉中…</p>';
    try {
      const list = await account.adminReports();
      accEl.innerHTML = `<div class="cr-admin"><div class="cr-acc-btns"><button data-act="admin-back">← 回到我的島民</button></div>
        ${list.length ? list.map((r) => `<div class="cr-report" data-pid="${r.pid}" data-ids="${r.ids.join(',')}">
          <b class="cr-rname"></b><small>${r.count} 次檢舉：${Object.entries(r.reasons).map(([k, n]) => `${REASON[k] || k}×${n}`).join('、')}${r.hidden ? '（已隱藏）' : ''}</small>
          <div class="cr-acc-btns">${r.hidden === null ? '' : `<button data-act="${r.hidden ? 'unhide' : 'hide'}">${r.hidden ? '恢復顯示' : '隱藏'}</button>`}<button data-act="clear">清除檢舉</button></div></div>`).join('')
        : '<p class="cr-note">目前沒有檢舉。</p>'}</div>`;
      // 暱稱用 textContent 放入，避免被當成 HTML
      accEl.querySelectorAll('.cr-report').forEach((row, i) => { row.querySelector('.cr-rname').textContent = list[i].name || '（無暱稱）'; });
    } catch (err) {
      console.error(err);
      accEl.innerHTML = '<p class="cr-warn">讀取失敗，請確認你在管理員名單中。</p><div class="cr-acc-btns"><button data-act="admin-back">← 返回</button></div>';
    }
  }
  const setStatus = (msg) => { statusEl.textContent = msg || ''; };

  // ---------- 預覽 ----------
  const canvas = el.querySelector('.cr-canvas');
  let renderer = null, scene, camera, figure, raf = 0, drag = null, spin = 0.5;
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
    figure = new THREE.Mesh(avatarGeometry(cfg), avatarMaterial);
    scene.add(figure);
    canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (drag != null) { figure.rotation.y += (e.clientX - drag) * 0.015; drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => { drag = null; });
  }
  function loop() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (drag == null) figure.rotation.y += 0.008 * spin;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  function refreshFigure() {
    if (!figure) return;
    figure.geometry.dispose();
    figure.geometry = avatarGeometry(cfg);
  }

  // ---------- 選項 ----------
  function renderTabs() {
    tabsEl.innerHTML = TABS.map(([id, label]) => `<button role="tab" data-tab="${id}" aria-selected="${id === tab}">${label}</button>`).join('');
    const [, , groups] = TABS.find(([id]) => id === tab);
    optsEl.innerHTML = groups.map(([key, label, palette]) => {
      if (palette) {
        return `<div class="cr-group"><b>${label}</b><div class="cr-swatches">${OPTIONS[palette].map((c) =>
          `<button class="sw ${cfg[key] === c ? 'on' : ''}" data-key="${key}" data-val="${c}" style="--c:${c}" aria-label="${label} ${c}"></button>`).join('')}</div></div>`;
      }
      const multi = key === 'acc';
      return `<div class="cr-group"><b>${label}</b><div class="cr-chips">${OPTIONS[key].map(([v, l]) => {
        const on = multi ? cfg.acc.includes(v) : cfg[key] === v;
        return `<button class="${on ? 'on' : ''}" data-key="${key}" data-val="${v}" aria-pressed="${on}">${l}</button>`;
      }).join('')}</div></div>`;
    }).join('');
  }
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.classList.contains('cr-close')) return close();
    if (t.dataset.tab) { tab = t.dataset.tab; renderTabs(); return; }
    if (busy) return;
    if (t.dataset.act === 'signin') {
      busy = true; setStatus('登入中…');
      account.signIn().then(() => setStatus('')).catch((err) => {
        setStatus(err.message === 'in-app' ? '請改用 Safari 或 Chrome 開啟本網站再登入。'
          : err.code === 'auth/popup-blocked' ? '登入視窗被瀏覽器擋住了，請允許彈出式視窗後再試一次。'
            : err.code === 'auth/popup-closed-by-user' ? '' : '登入失敗，請稍後再試。');
      }).finally(() => { busy = false; });
      return;
    }
    if (t.dataset.act === 'signout') { account.signOut(); return; }
    if (t.dataset.act === 'admin') { adminView = true; renderAccount(); return; }
    if (t.dataset.act === 'admin-back') { adminView = false; renderAccount(); return; }
    if (['hide', 'unhide', 'clear'].includes(t.dataset.act)) {
      const row = t.closest('.cr-report');
      busy = true;
      const job = t.dataset.act === 'clear' ? account.adminClear(row.dataset.ids.split(',')) : account.adminSetHidden(row.dataset.pid, t.dataset.act === 'hide');
      job.then(() => renderAdmin()).catch(() => setStatus('操作失敗，請稍後再試。')).finally(() => { busy = false; });
      return;
    }
    if (t.dataset.act === 'delete') {
      if (!confirm('確定要刪除你的島民和帳號資料嗎？\n\n・島民會從資料庫刪除，Google 登入紀錄也會一併刪除\n・已經開著網站的人，要等重新整理後才看不到\n・別人截圖或已存下的畫面無法收回')) return;
      busy = true; setStatus('刪除中…');
      account.deleteMine().then(() => { setStatus('已刪除。'); }).catch((err) => {
        setStatus(err.code === 'auth/popup-closed-by-user' ? '島民已刪除；帳號登入紀錄需要重新驗證才能刪除，請再按一次。' : '刪除失敗，請稍後再試。');
      }).finally(() => { busy = false; });
      return;
    }
    if (t.dataset.act === 'random') { cfg = { ...randomAvatar(), name: cfg.name }; }
    else if (t.dataset.act === 'reset') { cfg = { ...DEFAULT_AVATAR, name: cfg.name }; }
    else if (t.classList.contains('cr-save')) {
      cfg.name = sanitize({ ...cfg, name: nameInput.value }).name;
      busy = true; setStatus('儲存中…');
      Promise.resolve(onSave(cfg)).then(() => { setStatus(''); close(); })
        .catch((err) => setStatus(err.code === 'too-fast' ? '存得太快了，請等 10 秒再按一次。' : '上傳到雲端失敗，請稍後再試一次。'))
        .finally(() => { busy = false; });
      return;
    } else if (t.dataset.key) {
      const { key, val } = t.dataset;
      if (key === 'acc') cfg.acc = cfg.acc.includes(val) ? cfg.acc.filter((x) => x !== val) : [...cfg.acc, val];
      else {
        cfg[key] = val;
        // 換性別時給一組常見的預設，之後一樣可以自由改
        if (key === 'gender') Object.assign(cfg, val === 'f' ? { hair: 'long', bottom: 'skirt' } : { hair: 'short', bottom: 'pants' });
      }
    } else return;
    cfg = sanitize(cfg);
    renderTabs();
    refreshFigure();
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });

  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    el.hidden = false;
    nameInput.value = cfg.name || '';
    setStatus('');
    adminView = false;
    renderAccount();
    renderTabs();
    if (!renderer) initPreview(); else refreshFigure();
    cancelAnimationFrame(raf); loop();
    el.querySelector('.cr-close').focus();
  }
  function close() {
    el.hidden = true;
    cancelAnimationFrame(raf);
    lastFocus?.focus?.();
  }
  function setUser(u) { user = u; hiddenByAdmin = false; admin = false; adminView = false; if (!el.hidden) renderAccount(); }
  function setHidden(v) { hiddenByAdmin = !!v; if (!el.hidden) renderAccount(); }
  function setAdmin(v) { admin = !!v; if (!el.hidden) renderAccount(); }
  function setAvatar(a) { cfg = sanitize(a || DEFAULT_AVATAR); if (!el.hidden) { nameInput.value = cfg.name; renderTabs(); refreshFigure(); } }
  return { open, close, setUser, setAvatar, setHidden, setAdmin };
}
