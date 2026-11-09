// 操練本藏寶圖：每週交一次操練本（神人生活操練表＋申言稿兩張照片），就拼上一塊地圖。
// 18 塊拼完出現復興大樓；服事者看過簽名的那塊會變成金色。每 6 塊得到一把國度的鑰匙。
// 照片和進度存在代禱網的後端（Apps Script），照片只有本人和服事者看得到。
import { post } from './prayer.js';

const COLS = 6, ROWS = 3, CELL = 100, TOTAL = COLS * ROWS;
const MAX_EDGE = 1600;   // 照片長邊壓到這個像素，夠看清楚字又不會太大
// 拼的順序：從四周慢慢拼到中間的大樓，最後一塊是招牌「神愛世人」
const ORDER = [0, 17, 5, 12, 6, 11, 1, 16, 4, 13, 7, 10, 15, 14, 9, 8, 2, 3];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 拼圖形狀 ----------
// 每條內部邊的凸起方向固定（用簡單的雜湊），每個人看到的拼圖形狀都一樣
const bumpDir = (k) => (((k * 2654435761) >>> 0) % 2 ? 1 : -1);
const hDir = (r, c) => (r <= 0 || r >= ROWS ? 0 : bumpDir(r * 31 + c + 1));        // 第 r 條橫線（列與列之間），+1 往下凸
const vDir = (r, c) => (c <= 0 || c >= COLS ? 0 : bumpDir(r * 17 + c * 7 + 101));   // 第 c 條直線，+1 往右凸

function edge(x1, y1, x2, y2, h) {
  if (!h) return `L${x2} ${y2}`;
  const tx = x2 - x1, ty = y2 - y1;
  const nx = ty / CELL, ny = -tx / CELL;   // 前進方向的左手邊
  const p = (s, k) => `${(x1 + tx * s + nx * k * CELL).toFixed(1)} ${(y1 + ty * s + ny * k * CELL).toFixed(1)}`;
  return `L${p(0.36, 0)} C${p(0.28, h * 0.26)} ${p(0.72, h * 0.26)} ${p(0.64, 0)} L${x2} ${y2}`;
}
function piecePath(i) {
  const r = Math.floor(i / COLS), c = i % COLS;
  const x0 = c * CELL, y0 = r * CELL, x1 = x0 + CELL, y1 = y0 + CELL;
  // 沿著邊走時「左手邊」：上邊左→右朝上、右邊上→下朝右、下邊右→左朝下、左邊下→上朝左。
  // 同一條線兩側的拼圖要一凸一凹，凸起的實際方向才會一致
  return `M${x0} ${y0} ${edge(x0, y0, x1, y0, -hDir(r, c))} ${edge(x1, y0, x1, y1, vDir(r, c + 1))} ${edge(x1, y1, x0, y1, hDir(r + 1, c))} ${edge(x0, y1, x0, y0, -vDir(r, c))} Z`;
}
const PATHS = Array.from({ length: TOTAL }, (_, i) => piecePath(i));

export function mapSvg(pieces, { next = false } = {}) {
  const at = {};
  pieces.forEach((p) => { if (p.n >= 1 && p.n <= TOTAL) at[ORDER[p.n - 1]] = p; });
  const nextCell = next && pieces.length < TOTAL ? ORDER[pieces.length] : -1;
  const done = pieces.length >= TOTAL;
  const cells = PATHS.map((d, i) => {
    const p = at[i];
    const r = Math.floor(i / COLS), c = i % COLS;
    const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
    if (p) {
      return `<g class="pm-piece${p.gold ? ' gold' : ''}"><title>第 ${p.n} 塊（${esc(p.week)} 那週）${p.gold ? '・服事者已簽名' : ''}</title>
        <image href="treasure.svg" width="600" height="300" clip-path="url(#pm-c${i})"/>
        <path d="${d}" class="pm-edge"/>${p.gold ? `<text x="${cx + 30}" y="${cy - 26}" class="pm-star">✦</text>` : ''}</g>`;
    }
    return `<g class="pm-fog${i === nextCell ? ' next' : ''}"><path d="${d}"/>
      <text x="${cx}" y="${cy + 8}">${i === nextCell ? '？' : ''}</text></g>`;
  }).join('');
  return `<svg class="pm-map${done ? ' done' : ''}" viewBox="-14 -14 628 328" role="img" aria-label="藏寶圖：已拼 ${pieces.length} / ${TOTAL} 塊">
    <defs>${PATHS.map((d, i) => `<clipPath id="pm-c${i}"><path d="${d}"/></clipPath>`).join('')}</defs>
    <rect x="-10" y="-10" width="620" height="320" rx="14" class="pm-paper"/>
    ${cells}</svg>`;
}

// ---------- 照片：壓成 JPEG ----------
async function toJpeg(file) {
  let img;
  try { img = await createImageBitmap(file); } catch {
    // 舊瀏覽器沒有 createImageBitmap：用 data URL 讀進 <img>（網站的 CSP 不允許 blob: 圖片）
    const url = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(file); });
    img = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; });
  }
  const w = img.width, h = img.height;
  if (!w || !h) throw new Error('讀不到這張照片');
  const k = Math.min(1, MAX_EDGE / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(img, 0, 0, cv.width, cv.height);
  img.close?.();
  for (const q of [0.82, 0.7, 0.55]) {
    const url = cv.toDataURL('image/jpeg', q);
    if (url.length * 0.75 < 2.5 * 1024 * 1024) return url;
  }
  throw new Error('照片太大了，請換一張');
}

const keysHtml = (n) => [6, 12, 18].map((k, i) => `<span class="pm-key${n >= k ? ' got' : ''}" title="第 ${i + 1} 把鑰匙：拼滿 ${k} 塊">🗝️</span>`).join('');
const fmtWeek = (w) => { const [, m, d] = String(w).split('-'); return m ? `${+m}/${+d} 那週` : ''; };

// ---------- 視窗 ----------
export function createPractice({ signIn, signedIn }) {
  const el = document.createElement('div');
  el.className = 'practice';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '操練本藏寶圖');
  el.innerHTML = `
    <div class="pm-card">
      <button class="pm-close" aria-label="關閉">✕</button>
      <div class="pm-head"><h2>📜 操練本藏寶圖</h2><div class="pm-tabs" role="tablist"></div></div>
      <div class="pm-body"></div>
    </div>`;
  document.body.appendChild(el);
  const body = el.querySelector('.pm-body');
  const tabsEl = el.querySelector('.pm-tabs');

  let tab = 'map';
  let st = { status: 'idle', data: null, error: '' };
  let shots = [null, null];          // 這週要交的兩張（已壓縮的 data URL）
  let sending = false, msg = '';
  let queue = { status: 'idle', rows: [], error: '' };
  const photos = {};                 // 服事者看過的照片快取：sid → [url, url]

  async function load() {
    if (!signedIn()) { st = { status: 'signin', data: null, error: '' }; render(); return; }
    st = { ...st, status: st.data ? 'ready' : 'loading' }; render();
    try { st = { status: 'ready', data: (await post('practice')).data, error: '' }; }
    catch (err) { st = { status: err.code === 'signin' ? 'signin' : 'error', data: st.data, error: err.message }; }
    render();
  }
  async function loadQueue() {
    queue = { ...queue, status: 'loading' }; render();
    try { queue = { status: 'ready', rows: (await post('practiceQueue')).data, error: '' }; }
    catch (err) { queue = { status: 'error', rows: [], error: err.message }; }
    render();
  }

  function renderTabs() {
    const d = st.data;
    const staffTab = d?.staff ? `<button data-tab="sign" aria-selected="${tab === 'sign'}">✒️ 簽名${d.toSign ? `（${d.toSign}）` : ''}</button>` : '';
    tabsEl.innerHTML = staffTab ? `<button data-tab="map" aria-selected="${tab === 'map'}">我的藏寶圖</button>${staffTab}` : '';
  }

  function renderMap() {
    if (st.status === 'signin') {
      return `${mapSvg([])}<div class="pm-intro"><p>每週交一次<b>操練本</b>（神人生活操練表＋申言稿），就能拼上一塊藏寶圖。18 塊拼完，會出現一個大驚喜！</p>
        <button class="pm-go" data-act="signin">用 Google 帳號登入</button></div>`;
    }
    if (!st.data) return st.status === 'error' ? `<p class="pm-err">讀不到藏寶圖：${esc(st.error)}</p><button class="pm-go" data-act="reload">再試一次</button>` : '<p class="pm-wait">打開藏寶圖中……</p>';
    const d = st.data, n = d.pieces.length, gold = d.pieces.filter((p) => p.gold).length;
    const done = n >= d.total;
    let action;
    if (done) {
      action = `<div class="pm-done"><b>🎉 藏寶圖拼完了！</b><p>18 週的操練本都交齊了，這是我們的復興大樓。謝謝你一週一週的操練！</p></div>`;
    } else if (d.doneThisWeek) {
      action = `<div class="pm-wk ok"><b>✅ 這週已經拼好了！</b><p>下週一開始可以拼第 ${n + 1} 塊。記得請服事者在申言稿上簽名，這塊就會變成<b class="pm-gold-t">金色</b>。</p></div>`;
    } else {
      const slot = (k, label) => `<label class="pm-slot${shots[k] ? ' has' : ''}">
          <input type="file" accept="image/*" data-slot="${k}" ${sending ? 'disabled' : ''}>
          <span class="pm-prev">${slotPreview(k, label)}</span>
          <b>${k + 1}. ${label}</b><small>${shots[k] ? '點一下可以重拍' : '點一下拍照或選照片'}</small></label>`;
      action = `<div class="pm-wk"><b>這週要拼第 ${n + 1} 塊</b><p>拍下這週的兩頁操練本，字要拍清楚。</p>
        <div class="pm-slots">${slot(0, '神人生活操練表')}${slot(1, '申言稿')}</div>
        <button class="pm-go" data-act="send" ${shots[0] && shots[1] && !sending ? '' : 'disabled'}>${sending ? '上傳中……' : `🧩 交出這週，拼上第 ${n + 1} 塊`}</button>
        <p class="pm-note">照片只有你和服事者看得到。請服事者在申言稿簽名後，這塊會變成金色。</p></div>`;
    }
    return `${mapSvg(d.pieces, { next: !d.doneThisWeek })}
      <div class="pm-stat"><span>已拼 <b>${n}</b> / ${d.total} 塊</span><span>✦ 金色 <b>${gold}</b> 塊</span><span class="pm-keys" aria-label="已得到 ${Math.floor(n / 6)} 把鑰匙">${keysHtml(n)}</span></div>
      <p class="pm-msg" role="status"${msg ? '' : ' hidden'}>${msg}</p>${action}`;
  }

  function renderSign() {
    if (queue.status === 'loading' && !queue.rows.length) return '<p class="pm-wait">讀取中……</p>';
    if (queue.status === 'error') return `<p class="pm-err">${esc(queue.error)}</p><button class="pm-go" data-act="queue">再試一次</button>`;
    if (!queue.rows.length) return '<p class="pm-wait">目前沒有要簽名的操練本 🙌</p>';
    return `<p class="pm-note">看過照片（或當面看過本子）就按「簽名」，那塊會變成金色。亂拍的照片可以「收回」，那位青少年這週可以重交。</p>
      <ul class="pm-queue">${queue.rows.map((r) => {
        const ph = photos[r.sid];
        return `<li class="${r.gold ? 'gold' : ''}"><div class="pm-q-head"><b>${esc(r.name || r.email)}</b><small>${esc(r.email)}・第 ${r.n} 塊・${fmtWeek(r.week)}</small></div>
          ${ph === 'loading' ? '<p class="pm-wait">照片讀取中……</p>' : Array.isArray(ph) ? `<div class="pm-q-photos">${ph.map((u, k) => `<img src="${u}" alt="${k ? '申言稿' : '神人生活操練表'}" title="點一下放大／縮小">`).join('')}</div>` : ''}
          <div class="pm-q-acts">${Array.isArray(ph) || ph === 'loading' ? '' : `<button data-act="photos" data-sid="${r.sid}">📷 看照片</button>`}
            ${r.gold ? '<span class="pm-signed">✅ 已簽名</span>' : `<button class="pm-sign" data-act="sign" data-sid="${r.sid}">✒️ 簽名</button>`}
            <button class="pm-revoke" data-act="revoke" data-sid="${r.sid}">收回</button></div></li>`;
      }).join('')}</ul>`;
  }

  function render() {
    if (el.hidden) return;
    renderTabs();
    const st0 = body.scrollTop;
    body.innerHTML = tab === 'sign' ? renderSign() : renderMap();
    body.scrollTop = st0;
  }

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    if (tab === 'sign' && queue.status !== 'loading') loadQueue();
    render();
  });

  // 選照片時只更新那一格，不重畫整個畫面：另一格的選照片視窗可能正開著，重畫會讓那次選擇不見
  const SLOT_LABELS = ['神人生活操練表', '申言稿'];
  const slotPreview = (k, label = SLOT_LABELS[k]) => (shots[k] ? `<img src="${shots[k]}" alt="${label}的照片">` : '<span class="pm-cam">📷</span>');
  function setMsg(t) {
    msg = t;
    const m = body.querySelector('.pm-msg');
    if (m) { m.innerHTML = t; m.hidden = !t; }
  }
  function refreshSlot(k, busy = false) {
    const lab = body.querySelector(`input[data-slot="${k}"]`)?.closest('.pm-slot');
    if (lab) {
      lab.classList.toggle('has', !!shots[k]);
      lab.querySelector('.pm-prev').innerHTML = busy ? '<span class="pm-cam">⏳</span>' : slotPreview(k);
      lab.querySelector('small').textContent = busy ? '照片處理中……' : shots[k] ? '點一下可以重拍' : '點一下拍照或選照片';
    }
    const send = body.querySelector('[data-act="send"]');
    if (send) send.disabled = !(shots[0] && shots[1]) || sending;
  }
  body.addEventListener('change', async (e) => {
    const inp = e.target.closest('input[data-slot]');
    if (!inp || !inp.files?.[0]) return;
    const k = +inp.dataset.slot;
    refreshSlot(k, true);
    try { shots[k] = await toJpeg(inp.files[0]); setMsg(''); }
    catch (err) { setMsg(`⚠️ ${esc(err.message || '這張照片讀不到，請換一張')}`); }
    refreshSlot(k);
  });

  body.addEventListener('click', async (e) => {
    const zoom = e.target.closest('.pm-q-photos img');
    if (zoom) { zoom.parentElement.classList.toggle('big'); return; }
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act, sid = b.dataset.sid;
    if (act === 'signin') return signIn().then(load).catch(() => {});
    if (act === 'reload') return load();
    if (act === 'queue') return loadQueue();
    if (act === 'send') {
      sending = true; msg = ''; render();
      try {
        const before = st.data.pieces.length;
        st.data = (await post('practiceUpload', { photos: shots })).data;
        shots = [null, null];
        msg = st.data.pieces.length > before ? `🧩 拼上第 ${st.data.pieces.length} 塊了！` : '';
        if (st.data.pieces.length > before) celebrate(st.data.pieces.length >= st.data.total);
      } catch (err) {
        msg = `⚠️ ${esc(err.message)}`;
        if (/已經交過/.test(err.message)) load();
      }
      sending = false; render();
      return;
    }
    if (act === 'photos') {
      photos[sid] = 'loading'; render();
      try { photos[sid] = await Promise.all([1, 2].map((n) => post('practicePhoto', { sid, n }).then((j) => j.data))); }
      catch (err) { delete photos[sid]; alert(`照片讀不到：${err.message}`); }
      render();
      return;
    }
    if (act === 'sign' || act === 'revoke') {
      const row = queue.rows.find((r) => r.sid === sid);
      if (act === 'revoke' && !confirm(`確定要收回「${row?.name || row?.email || ''}」這週的操練本嗎？那塊地圖會不見，他這週可以重交。`)) return;
      b.disabled = true;
      try {
        await post(act === 'sign' ? 'practiceSign' : 'practiceRevoke', { sid });
        if (st.data?.toSign && row && !row.gold) st.data.toSign--;
        if (act === 'sign' && row) row.gold = true;
        else queue.rows = queue.rows.filter((r) => r.sid !== sid);
      } catch (err) { alert(err.message); }
      render();
    }
  });

  function celebrate(all) {
    const fx = document.createElement('div');
    fx.className = 'pm-fx';
    fx.setAttribute('aria-hidden', 'true');
    fx.innerHTML = Array.from({ length: all ? 36 : 14 }, (_, i) => `<i style="--x:${(Math.random() * 100).toFixed(0)}%;--d:${(Math.random() * 0.6).toFixed(2)}s">${['🧩', '✨', '🗝️', '⭐'][i % 4]}</i>`).join('');
    el.querySelector('.pm-card').appendChild(fx);
    setTimeout(() => fx.remove(), 2600);
  }

  function open() {
    el.hidden = false;
    tab = 'map'; msg = '';
    render();
    load();
    el.querySelector('.pm-close').focus();
  }
  function close() {
    el.hidden = true;
    shots = [null, null];
    sending = false;
  }
  el.querySelector('.pm-close').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) { e.stopImmediatePropagation(); close(); } }, true);

  // 換帳號時清掉上一位的資料
  function userChanged() {
    st = { status: 'idle', data: null, error: '' };
    queue = { status: 'idle', rows: [], error: '' };
    for (const k in photos) delete photos[k];
    shots = [null, null];
    tab = 'map';
    if (!el.hidden) load();
  }
  return { open, close, userChanged };
}
