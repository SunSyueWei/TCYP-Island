// 召會生活人數統計看板：讀「青少年聚會人數統計_總表」的週報表（經 Apps Script），用圖表呈現
// 資料只在服事者登入後即時讀取，不存進網站或公開的程式碼

// ---------- 計算 ----------
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
export const fmt = (x) => (x == null ? '—' : Number.isInteger(x) ? String(x) : x.toFixed(1));

// 範圍：all（總計）、care:<照顧區>、unit:<小區>
export function scopeSeries(m, scope) {
  const recorded = m.total ? m.total.weeks.map((v) => v != null) : m.weeks.map(() => true);
  let rows;
  if (scope === 'all') rows = m.total ? [m.total] : m.units;
  else if (scope.startsWith('care:')) rows = m.units.filter((u) => u.care === scope.slice(5));
  else rows = m.units.filter((u) => u.name === scope.slice(5));
  const add = (get) => {
    const vals = rows.map(get).filter((v) => v != null);
    return vals.length ? round1(sum(vals)) : null;
  };
  const baseOk = m.hasBase && rows.every((u) => u.base != null);
  return {
    weeks: m.weeks.map((_, i) => (recorded[i] ? add((u) => u.weeks[i]) ?? 0 : null)),
    months: m.months.map((_, i) => add((u) => u.months[i])),
    avg: add((u) => u.avg),
    base: baseOk ? add((u) => u.base) : null,
    target: baseOk && rows.every((u) => u.target != null) ? add((u) => u.target) : null,
  };
}

// 最近有點名的週、近四週平均、前四週平均
export function recent(series) {
  const idx = [];
  series.weeks.forEach((v, i) => { if (v != null) idx.push(i); });
  const last = idx.at(-1) ?? -1;
  const avgOf = (ids) => (ids.length ? round1(sum(ids.map((i) => series.weeks[i])) / ids.length) : null);
  return {
    last,
    latest: last >= 0 ? series.weeks[last] : null,
    prev: idx.length > 1 ? series.weeks[idx.at(-2)] : null,
    avg4: avgOf(idx.slice(-4)),
    prev4: avgOf(idx.slice(-8, -4)),
    max: idx.length ? Math.max(...idx.map((i) => series.weeks[i])) : null,
  };
}

// 燈號（和試算表的「達目標／過基數／未達基數」一致）
export function status(v, base, target) {
  if (v == null || base == null) return null;
  if (target != null && v >= target) return { key: 'good', icon: '●', label: '達目標' };
  if (v >= base) return { key: 'warn', icon: '▲', label: '過基數' };
  return { key: 'bad', icon: '▼', label: '未達基數' };
}

const pct = (a, b) => (a == null || !b ? null : Math.round(((a - b) / b) * 100));

export function summarize(m, series) {
  const r = recent(series);
  const st = status(r.avg4, series.base, series.target);
  const trend = pct(r.avg4, r.prev4);
  let light, head;
  if (st) {
    light = st.key;
    head = { good: '綠燈：達到目標', warn: '黃燈：過基數、還沒達目標', bad: '紅燈：低於基數' }[st.key];
  } else if (trend != null) {
    light = trend >= 10 ? 'good' : trend <= -10 ? 'bad' : 'warn';
    head = { good: '綠燈：比前四週成長', warn: '黃燈：和前四週差不多', bad: '紅燈：比前四週減少' }[light];
  } else return { light: 'warn', head: '資料還不夠', body: '點名的週數太少，還無法判斷趨勢。', advice: '' };
  const parts = [`近四週平均 ${fmt(r.avg4)} 人`];
  if (series.target != null) parts.push(`目標 ${fmt(series.target)}、基數 ${fmt(series.base)}`);
  if (trend != null) parts.push(`比前四週 ${trend >= 0 ? '+' : ''}${trend}%`);
  const advice = {
    good: '保持下去！可以把這裏的作法分享給其他小區。',
    warn: series.target != null ? `再多 ${fmt(round1(Math.max(0, series.target - r.avg4)))} 人就達標，可以優先關心最近沒來的同伴。` : '持續邀約同伴一起參加。',
    bad: m.key === 'gospel' ? '宜安排福音出訪的配搭，帶著同伴一起出去。' : '宜優先關心留人與家聚會跟進。',
  }[light];
  return { light, head, body: parts.join('，') + '。', advice };
}

// ---------- 畫面 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.appendChild(e);
  return e;
}
// 刻度分 4 格，每格是 1、2、2.5、5 的倍數（人數少時不會出現 1.3 這種刻度）
function niceMax(v) {
  if (!v || v < 4) return 4;
  const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= raw);
  return step * 4;
}

// 每週折線：基數、目標用參考線並直接標示；十字線＋提示框，鍵盤左右鍵也能看
function lineChart(host, labels, values, { base, target, tip }) {
  host.textContent = '';
  const W = Math.max(280, host.clientWidth), H = 220, L = 34, R = 46, T = 14, B = 26;
  const n = labels.length;
  const top = niceMax(Math.max(...values.filter((v) => v != null), target ?? 0, base ?? 0) * 1.08);
  const x = (i) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'cl-svg', role: 'img', tabindex: '0', 'aria-label': '每週人數折線圖，可以用左右鍵查看每一週' }, host);
  for (let k = 0; k <= 4; k++) {
    const v = (top / 4) * k;
    svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: k ? 'cl-grid' : 'cl-axis' }, svg);
    svgEl('text', { x: L - 6, y: y(v) + 4, class: 'cl-tick', 'text-anchor': 'end' }, svg).textContent = fmt(round1(v));
  }
  const step = Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 48)));
  labels.forEach((lb, i) => { if (i % step === 0 || i === n - 1) svgEl('text', { x: x(i), y: H - 8, class: 'cl-tick', 'text-anchor': 'middle' }, svg).textContent = lb; });
  // 目標和基數很接近時，目標的標籤往上、基數往下，避免重疊
  const close = base != null && target != null && Math.abs(y(base) - y(target)) < 13;
  const ref = (v, cls, label, dy) => {
    if (v == null) return;
    svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: cls }, svg);
    svgEl('text', { x: W - R + 4, y: y(v) + 4 + dy, class: 'cl-ref-label' }, svg).textContent = `${label} ${fmt(v)}`;
  };
  ref(base, 'cl-ref base', '基數', close ? 6 : 0);
  ref(target, 'cl-ref target', '目標', close ? -6 : 0);
  let d = '', pen = false;
  values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
  svgEl('path', { d, class: 'cl-line' }, svg);
  const lastI = values.findLastIndex((v) => v != null);
  if (lastI >= 0) {
    svgEl('circle', { cx: x(lastI), cy: y(values[lastI]), r: 4.5, class: 'cl-dot' }, svg);
    svgEl('text', { x: x(lastI), y: y(values[lastI]) - 10, class: 'cl-val', 'text-anchor': 'middle' }, svg).textContent = fmt(values[lastI]);
  }
  const cross = svgEl('line', { y1: T, y2: H - B, class: 'cl-cross', visibility: 'hidden' }, svg);
  const hot = svgEl('circle', { r: 5, class: 'cl-dot hot', visibility: 'hidden' }, svg);
  const show = (i) => {
    if (values[i] == null) { tip.hide(); cross.setAttribute('visibility', 'hidden'); hot.setAttribute('visibility', 'hidden'); return; }
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    hot.setAttribute('cx', x(i)); hot.setAttribute('cy', y(values[i])); hot.setAttribute('visibility', 'visible');
    const rows = [[fmt(values[i]) + ' 人', '出席', 'line']];
    if (target != null) rows.push([fmt(target), '目標', 'target']);
    if (base != null) rows.push([fmt(base), '基數', 'base']);
    tip.show(svg, x(i), y(values[i]), `${labels[i]} 那週（主日）`, rows);
  };
  let cur = lastI;
  const near = (cx) => Math.max(0, Math.min(n - 1, Math.round(((cx - L) / (W - L - R)) * (n - 1))));
  svg.addEventListener('pointermove', (e) => { const r = svg.getBoundingClientRect(); cur = near(((e.clientX - r.left) / r.width) * W); show(cur); });
  svg.addEventListener('pointerleave', () => { tip.hide(); cross.setAttribute('visibility', 'hidden'); hot.setAttribute('visibility', 'hidden'); });
  svg.addEventListener('focus', () => show(cur));
  svg.addEventListener('blur', () => tip.hide());
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    do { cur = Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowLeft' ? -1 : 1))); } while (values[cur] == null && cur > 0 && cur < n - 1);
    show(cur);
  });
}

// 月平均長條：只標最新一個月和最高的月份，其餘看提示框或表格
function barChart(host, labels, values, { tip }) {
  host.textContent = '';
  const pts = labels.map((lb, i) => [lb, values[i]]).filter(([, v]) => v != null);
  if (!pts.length) { host.innerHTML = '<p class="hint">還沒有資料。</p>'; return; }
  const W = Math.max(280, host.clientWidth), H = 190, L = 34, R = 8, T = 18, B = 26;
  const top = niceMax(Math.max(...pts.map(([, v]) => v)) * 1.1);
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const slot = (W - L - R) / pts.length;
  const bw = Math.min(36, slot - 2);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'cl-svg', role: 'img', 'aria-label': '各月平均長條圖' }, host);
  for (let k = 0; k <= 4; k++) {
    const v = (top / 4) * k;
    svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: k ? 'cl-grid' : 'cl-axis' }, svg);
    svgEl('text', { x: L - 6, y: y(v) + 4, class: 'cl-tick', 'text-anchor': 'end' }, svg).textContent = fmt(round1(v));
  }
  const maxV = Math.max(...pts.map(([, v]) => v));
  pts.forEach(([lb, v], i) => {
    const cx = L + slot * (i + 0.5);
    const h = Math.max(1, y(0) - y(v));
    const r = Math.min(4, bw / 2, h);
    const x0 = cx - bw / 2, y0 = y(v);
    const g = svgEl('g', { class: 'cl-bar', tabindex: '0', role: 'img', 'aria-label': `${lb} 平均 ${fmt(v)} 人` }, svg);
    svgEl('path', { d: `M${x0},${y(0)}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y(0)}Z` }, g);
    svgEl('rect', { x: cx - slot / 2, y: T, width: slot, height: H - T - B, fill: 'transparent' }, g); // 比長條大的感應區
    const on = () => tip.show(svg, cx, y0, lb, [[fmt(v) + ' 人', '月平均', 'bar']]);
    g.addEventListener('pointerenter', on); g.addEventListener('focus', on);
    g.addEventListener('pointerleave', () => tip.hide()); g.addEventListener('blur', () => tip.hide());
    svgEl('text', { x: cx, y: H - 8, class: 'cl-tick', 'text-anchor': 'middle' }, svg).textContent = lb.replace('月', '') + (slot > 30 ? '月' : '');
    if (i === pts.length - 1 || v === maxV) svgEl('text', { x: cx, y: y0 - 5, class: 'cl-val', 'text-anchor': 'middle' }, svg).textContent = fmt(v);
  });
}

function spark(values) {
  const vs = values.slice(0, values.findLastIndex((v) => v != null) + 1).slice(-12);
  const ok = vs.filter((v) => v != null);
  if (ok.length < 2) return '';
  const W = 120, H = 34, top = Math.max(...ok) || 1;
  let d = '', pen = false;
  vs.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${((i / (vs.length - 1)) * (W - 6) + 3).toFixed(1)},${(H - 3 - (v / top) * (H - 8)).toFixed(1)}`; pen = true; });
  return `<svg viewBox="0 0 ${W} ${H}" class="cl-spark" aria-hidden="true"><path d="${d}"/></svg>`;
}

function makeTip(root) {
  const el = document.createElement('div');
  el.className = 'cl-tip';
  el.hidden = true;
  root.appendChild(el);
  return {
    show(svg, x, y, title, rows) {
      el.textContent = '';
      const h = document.createElement('div'); h.className = 'cl-tip-h'; h.textContent = title; el.appendChild(h);
      for (const [val, label, key] of rows) {
        const r = document.createElement('div'); r.className = 'cl-tip-r';
        const k = document.createElement('i'); k.className = 'k ' + key;
        const b = document.createElement('b'); b.textContent = val;
        const s = document.createElement('span'); s.textContent = label;
        r.append(k, b, s); el.appendChild(r);
      }
      el.hidden = false;
      const sr = svg.getBoundingClientRect(), rr = root.getBoundingClientRect();
      const scale = sr.width / svg.viewBox.baseVal.width;
      let left = sr.left - rr.left + x * scale + 12, topY = sr.top - rr.top + root.scrollTop + y * scale - el.offsetHeight - 8;
      if (left + el.offsetWidth > rr.width - 8) left = sr.left - rr.left + x * scale - el.offsetWidth - 12;
      if (topY < root.scrollTop + 4) topY = sr.top - rr.top + root.scrollTop + y * scale + 12;
      el.style.left = `${Math.max(4, left)}px`; el.style.top = `${topY}px`;
    },
    hide() { el.hidden = true; },
  };
}

// 服事者會所面板上的摘要（主日總計）
export function panelSummary(data) {
  const m = data?.meetings?.find((x) => x.key === 'lord' && !x.missing);
  if (!m) return '<p class="hint">還沒有統計資料。</p>';
  const s = scopeSeries(m, 'all');
  const r = recent(s);
  const st = status(r.avg4, s.base, s.target);
  return `<div class="cl-tiles mini">
    <div class="cl-tile"><small>上週主日</small><b>${fmt(r.latest)}</b><span>${m.weeks[r.last] || ''}</span></div>
    <div class="cl-tile"><small>近四週平均</small><b>${fmt(r.avg4)}</b>${st ? `<span class="cl-st ${st.key}">${st.icon} ${st.label}</span>` : ''}</div>
    <div class="cl-tile"><small>目標</small><b>${fmt(s.target)}</b><span>基數 ${fmt(s.base)}</span></div>
  </div>`;
}

export function createChlife({ load, getState }) {
  const el = document.createElement('div');
  el.className = 'chlife';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '召會生活人數統計');
  document.body.appendChild(el);
  let meeting = 'lord', scope = 'all', lastFocus = null;
  let tip = null;

  function scopesOf(m) {
    const cares = [...new Set(m.units.map((u) => u.care))];
    return { cares, units: m.units.map((u) => u.name) };
  }

  function render() {
    const st = getState();
    const d = st.data;
    const shell = (inner) => `
      <div class="cl-head">
        <div><b>📈 召會生活人數統計</b><small>${d ? `資料來自「${esc(d.title)}」` : ''}</small></div>
        <div class="cl-head-acts">
          ${d?.url && /^https:\/\/docs\.google\.com\//.test(d.url) ? `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">開啟試算表</a>` : ''}
          <button data-cl="refresh">↻ 重新整理</button>
          <button class="cl-close" data-cl="close" aria-label="關閉統計看板">✕</button>
        </div>
      </div>
      <div class="cl-body">${inner}</div>`;
    if (!d) {
      el.innerHTML = shell(st.status === 'error'
        ? `<p class="cr-warn">讀取失敗（${esc(st.error)}）。請稍後按重新整理。</p>`
        : st.status === 'loading' ? '<p class="hint">正在讀取試算表…</p>'
          : '<p class="hint">還沒有設定統計試算表（Apps Script 指令碼屬性 STATS_SHEET_ID）。</p>');
      return;
    }
    const ms = d.meetings.filter((m) => !m.missing);
    if (!ms.length) { el.innerHTML = shell('<p class="hint">試算表裏沒有找到週報表。</p>'); return; }
    if (!ms.some((m) => m.key === meeting)) meeting = ms[0].key;
    const m = ms.find((x) => x.key === meeting);
    const sc = scopesOf(m);
    if (scope.startsWith('care:') && !sc.cares.includes(scope.slice(5))) scope = 'all';
    if (scope.startsWith('unit:') && !sc.units.includes(scope.slice(5))) scope = 'all';
    const s = scopeSeries(m, scope);
    const r = recent(s);
    const stt = status(r.avg4, s.base, s.target);
    const delta = r.latest != null && r.prev != null ? round1(r.latest - r.prev) : null;
    const sum4 = summarize(m, s);
    const scopeName = scope === 'all' ? '全體' : scope.slice(5);
    const lastLabel = m.weeks[r.last] || '';

    el.innerHTML = shell(`
      <div class="cl-filters">
        <div class="cl-tabs" role="tablist" aria-label="聚會項目">${ms.map((x) => `<button role="tab" data-meeting="${x.key}" aria-selected="${x.key === meeting}">${esc(x.label)}</button>`).join('')}</div>
        <label class="cl-scope">範圍
          <select data-cl="scope">
            <option value="all">全體</option>
            <optgroup label="照顧區">${sc.cares.map((c) => `<option value="care:${esc(c)}">${esc(c)}</option>`).join('')}</optgroup>
            <optgroup label="青少年小區">${sc.units.map((u) => `<option value="unit:${esc(u)}">${esc(u)}</option>`).join('')}</optgroup>
          </select>
        </label>
      </div>
      <div class="cl-tiles">
        <div class="cl-tile"><small>最近一週（${esc(lastLabel)}）</small><b>${fmt(r.latest)}</b><span class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta == null ? '' : `較上週 ${delta > 0 ? '▲ +' : delta < 0 ? '▼ −' : '±'}${fmt(Math.abs(delta))}`}</span></div>
        <div class="cl-tile"><small>近四週平均</small><b>${fmt(r.avg4)}</b>${stt ? `<span class="cl-st ${stt.key}">${stt.icon} ${stt.label}</span>` : '<span></span>'}</div>
        <div class="cl-tile"><small>全年平均</small><b>${fmt(s.avg)}</b><span>今年最高 ${fmt(r.max)}</span></div>
        ${s.target != null ? `<div class="cl-tile"><small>目標／基數</small><b>${fmt(s.target)}</b><span>基數 ${fmt(s.base)}・達成 ${r.avg4 != null ? Math.round((r.avg4 / s.target) * 100) : '—'}%</span></div>` : ''}
      </div>
      <div class="cl-summary ${sum4.light}"><p><span class="cl-light" aria-hidden="true"></span><strong>${sum4.head}</strong>（${esc(scopeName)}・${esc(m.label)}）</p><p>${sum4.body}${sum4.advice ? `<strong>${sum4.advice}</strong>` : ''}</p></div>
      <div class="cl-grid2">
        <section class="cl-card wide"><h3>每週${esc(m.label)}人數 <small>${esc(scopeName)}</small></h3><div class="cl-chart" data-chart="line"></div>
          ${s.target != null ? '<p class="cl-legend"><i class="k line"></i>出席 <i class="k target"></i>目標 <i class="k base"></i>基數</p>' : ''}</section>
        <section class="cl-card"><h3>各月平均 <small>${esc(scopeName)}</small></h3><div class="cl-chart" data-chart="bar"></div></section>
        <section class="cl-card"><h3>五項聚會一覽 <small>${esc(scopeName)}・近 12 週，各自的刻度</small></h3><div class="cl-multi">${ms.map((x) => {
          const xs = scopeSeries(x, scope); const xr = recent(xs);
          return `<button class="cl-mini ${x.key === meeting ? 'on' : ''}" data-meeting="${x.key}"><span>${esc(x.label)}</span><b>${fmt(xr.avg4)}</b><small>近四週平均</small>${spark(xs.weeks)}</button>`;
        }).join('')}</div></section>
        <section class="cl-card wide"><h3>各小區近四週平均 <small>${m.hasBase ? '依達成率排序，直線是目標' : '依人數排序'}</small></h3><div class="cl-rank"></div></section>
      </div>
      <details class="cl-table"><summary>看表格（近 12 週與各月）</summary><div class="cl-table-wrap"></div></details>
      <p class="hint">最多 5 分鐘更新一次（上次讀取：${new Date(d.generatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}）。燈號是提醒，不是評價；人數少的小區僅供參考。</p>`);

    el.querySelector('[data-cl="scope"]').value = scope;
    tip = makeTip(el.querySelector('.cl-body'));
    const labels = m.weeks.slice(0, r.last + 1);
    lineChart(el.querySelector('[data-chart="line"]'), labels, s.weeks.slice(0, r.last + 1), { base: s.base, target: s.target, tip });
    barChart(el.querySelector('[data-chart="bar"]'), m.months, s.months, { tip });
    renderRank(m);
    renderTable(m, s, r);
  }

  function renderRank(m) {
    const host = el.querySelector('.cl-rank');
    const rows = m.units.map((u) => {
      const us = scopeSeries(m, 'unit:' + u.name);
      const ur = recent(us);
      return { u, v: ur.avg4, st: status(ur.avg4, u.base, u.target), rate: u.target ? (ur.avg4 ?? 0) / u.target : null };
    });
    rows.sort((a, b) => (m.hasBase ? (b.rate ?? -1) - (a.rate ?? -1) : (b.v ?? -1) - (a.v ?? -1)));
    const maxV = Math.max(1, ...rows.map((x) => Math.max(x.v ?? 0, x.u.target ?? 0)));
    const inScope = (u) => scope === 'all' || (scope.startsWith('care:') ? u.care === scope.slice(5) : u.name === scope.slice(5));
    host.textContent = '';
    for (const x of rows) {
      const row = document.createElement('button');
      row.className = 'cl-rrow' + (inScope(x.u) ? '' : ' dim');
      row.dataset.unit = x.u.name;
      row.setAttribute('aria-label', `${x.u.name}（${x.u.care}）近四週平均 ${fmt(x.v)}${x.u.target != null ? `，目標 ${fmt(x.u.target)}` : ''}${x.st ? `，${x.st.label}` : ''}`);
      const name = document.createElement('span'); name.className = 'cl-rname'; name.textContent = x.u.name;
      const care = document.createElement('small'); care.textContent = x.u.care; name.appendChild(care);
      const track = document.createElement('span'); track.className = 'cl-track';
      const fill = document.createElement('i'); fill.className = 'cl-fill ' + (x.st ? x.st.key : 'plain'); fill.style.width = `${((x.v ?? 0) / maxV) * 100}%`;
      track.appendChild(fill);
      if (x.u.target != null) { const tk = document.createElement('i'); tk.className = 'cl-target'; tk.style.left = `${(x.u.target / maxV) * 100}%`; track.appendChild(tk); }
      const val = document.createElement('b'); val.textContent = fmt(x.v) + (x.u.target != null ? ` / ${fmt(x.u.target)}` : '');
      row.append(name, track, val);
      if (x.st) { const chip = document.createElement('span'); chip.className = 'cl-st ' + x.st.key; chip.textContent = `${x.st.icon} ${x.st.label}`; row.appendChild(chip); }
      host.appendChild(row);
    }
  }

  function renderTable(m, s, r) {
    const host = el.querySelector('.cl-table-wrap');
    const from = Math.max(0, r.last - 11);
    const wk = m.weeks.slice(from, r.last + 1);
    const vals = s.weeks.slice(from, r.last + 1);
    host.innerHTML = `<table><caption>每週（主日日期）</caption><tr><th>週</th>${wk.map((w) => `<th>${esc(w)}</th>`).join('')}</tr><tr><th>人數</th>${vals.map((v) => `<td>${fmt(v)}</td>`).join('')}</tr></table>
      <table><caption>各月平均</caption><tr><th>月</th>${m.months.map((x) => `<th>${esc(x)}</th>`).join('')}<th>全年</th></tr><tr><th>人數</th>${s.months.map((v) => `<td>${fmt(v)}</td>`).join('')}<td>${fmt(s.avg)}</td></tr></table>`;
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cl === 'close') return close();
    if (b.dataset.cl === 'refresh') { el.classList.add('busy'); await load(true); el.classList.remove('busy'); return render(); }
    if (b.dataset.meeting) { meeting = b.dataset.meeting; render(); el.querySelector(`[role="tab"][data-meeting="${meeting}"]`)?.focus(); return; }
    if (b.dataset.unit) { scope = scope === 'unit:' + b.dataset.unit ? 'all' : 'unit:' + b.dataset.unit; render(); el.querySelector('.cl-body').scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  el.addEventListener('change', (e) => { if (e.target.dataset.cl === 'scope') { scope = e.target.value; render(); } });
  // 重新繪製後焦點可能不在看板裏，所以在 document 上聽 Esc
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });
  let rt = 0;
  addEventListener('resize', () => { if (!el.hidden) { clearTimeout(rt); rt = setTimeout(render, 150); } });

  async function open() {
    lastFocus = document.activeElement;
    el.hidden = false;
    render();
    el.querySelector('.cl-close')?.focus();
    if (getState().status !== 'ready') { await load(false); if (!el.hidden) render(); }
  }
  function close() {
    el.hidden = true;
    tip?.hide();
    lastFocus?.focus?.({ preventScroll: true });
  }
  return { open, close, isOpen: () => !el.hidden };
}
