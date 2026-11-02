// 代禱牆（福音港灣）：登記邀約的福音朋友、一同代禱、跟進「答應前來 → 進小排 → 受浸」
// 資料存在青少年代禱網的 Google 試算表（經 Apps Script），網站和公開的程式碼裏沒有任何姓名。
// 姓名一律由後端決定要不要遮罩：沒登入或別人的登記 → 林○華；自己的登記、服事者 → 完整姓名。
import { PRAYER_API } from './prayer-config.js';
import { SCHOOLS, YOUTH_DISTRICTS, YOUTH_AREAS } from './prayer-data.js';

// 必須與代禱網 apps-script/Code.gs 的 ALLOWED_TAGS 一致，後端只接受這些值
const TAGS = ['還在邀約中', '已經答應', '需要接送', '需要陪伴', '家長還在考慮', '第一次接觸'];
const NOTE_MAX = 30;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 資料 ----------
export const state = { status: 'idle', rows: [], viewer: null, error: null, loadedAt: 0 };
let auth = { idToken: async () => null, signIn: async () => {}, signedIn: () => false };
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());
export const onChange = (f) => listeners.add(f);

async function post(action, extra = {}) {
  const idToken = await auth.idToken();
  if (!idToken) throw Object.assign(new Error('請先用 Google 帳號登入'), { code: 'signin' });
  // text/plain：避免 CORS 預檢（Apps Script 不處理 OPTIONS）
  const res = await fetch(PRAYER_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, idToken, ...extra }) });
  const j = await res.json();
  if (!j.ok) throw Object.assign(new Error(j.error || '失敗'), { code: j.auth === false ? 'signin' : 'server' });
  return j;
}

// 登入時用 listAuth（自己的登記是完整姓名），沒登入用公開的 list（全部遮罩）
export async function load() {
  state.status = 'loading'; emit();
  try {
    const pub = async () => {
      const res = await fetch(PRAYER_API + '?action=list');
      const r = await res.json();
      if (!r.ok) throw new Error(r.error || '讀取失敗');
      return r;
    };
    let j;
    if (auth.signedIn()) {
      // 後端還沒更新（不認得 listAuth）時退回公開名單，至少看得到遮罩後的代禱牆
      try { j = await post('listAuth'); } catch (err) { if (err.code === 'signin') throw err; j = await pub(); }
    } else j = await pub();
    state.rows = (j.data || []).filter((r) => r && r.id && r.id !== 'id').sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    state.viewer = j.viewer || null;
    state.status = 'ready'; state.error = null; state.loadedAt = Date.now();
  } catch (err) {
    state.status = 'error'; state.error = err.message;
  }
  emit();
  return state;
}

export function stats(rows = state.rows) {
  let friends = 0, coming = 0, inGroup = 0, bapt = 0;
  for (const r of rows) for (const f of r.friends || []) { friends++; if (f.c) coming++; if (f.g && f.g.n) inGroup++; if (f.b) bapt++; }
  return { entries: rows.length, friends, coming, inGroup, bapt };
}

// 福音港灣面板上的摘要（只有數字，沒有任何名字）
export function summaryHtml() {
  if (state.status !== 'ready' && !state.rows.length) return `<p class="hint">${state.status === 'error' ? '代禱牆暫時讀不到，請稍後再試。' : '正在讀取代禱牆…'}</p>`;
  const s = stats();
  return `<div class="pr-funnel mini">${funnelRows(s)}</div>`;
}
function funnelRows(s) {
  const max = Math.max(1, s.friends);
  return [['🙏', '邀約的福音朋友', s.friends], ['✋', '答應前來', s.coming], ['🏠', '進入小排', s.inGroup], ['💧', '受浸', s.bapt]]
    .map(([em, label, n]) => `<div class="pr-frow"><span class="pr-flabel">${em} ${label}</span><span class="pr-ftrack"><i style="width:${(n / max) * 100}%"></i></span><b>${n}</b></div>`).join('');
}

// ---------- 看板 ----------
export function createPrayer({ signIn, idToken, signedIn }) {
  auth = { signIn, idToken, signedIn };
  const el = document.createElement('div');
  el.className = 'prayer';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '代禱牆');
  document.body.appendChild(el);

  let tab = 'wall';
  let q = '', filter = 'all', onlyMine = false;
  let open = null;            // 展開中的福音朋友 { id, idx, type }
  let editing = null;         // 正在編輯的登記 id（新增分頁沿用同一個表單）
  let msg = '', busy = false, lastFocus = null;
  const say = (m) => { msg = m; render(); };

  const isStaff = () => !!state.viewer?.staff;
  const canEdit = (r) => isStaff() || r.mine;

  function visible() {
    const k = q.trim().toLowerCase();
    return state.rows.filter((r) => {
      if (onlyMine && !r.mine) return false;
      const fs = r.friends || [];
      if (filter === 'coming' && !fs.some((f) => f.c)) return false;
      if (filter === 'group' && !fs.some((f) => f.g && f.g.n)) return false;
      if (filter === 'bapt' && !fs.some((f) => f.b)) return false;
      if (filter === 'waiting' && !fs.some((f) => !f.c)) return false;
      if (k) {
        const hay = [r.name, r.group, r.district, ...fs.map((f) => f.n), r.note, ...(r.tags || [])].join(' ').toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });
  }

  const groupOptions = (type, current) => {
    const seen = new Set();
    const groups = type === 'district' ? YOUTH_DISTRICTS.map((g) => [g.area, g.items])
      : SCHOOLS.map((g) => [`${g.level}・${g.area}`, g.items.filter((n) => !seen.has(n) && seen.add(n))]);
    let html = '<option value="">— 請選擇 —</option>' + groups.filter(([, items]) => items.length).map(([label, items]) =>
      `<optgroup label="${esc(label)}">${items.map((n) => `<option value="${esc(n)}"${n === current ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`).join('');
    if (current && !current.startsWith('area:') && !groups.some(([, items]) => items.includes(current))) html += `<option value="${esc(current)}" selected>${esc(current)}（不在清單中）</option>`;
    return html;
  };

  function friendPanel(r, f, i) {
    const gt = open?.type != null ? open.type : (f.g ? f.g.t : '');
    const gn = f.g && f.g.t === gt ? f.g.n : '';
    const opt = (v, label) => `<option value="${v}"${gt === v ? ' selected' : ''}>${label}</option>`;
    const locked = !auth.signedIn();
    return `<div class="pr-fpanel" data-id="${esc(r.id)}" data-idx="${i}">
      <div class="pr-fpanel-head"><b>${esc(f.n)}</b><button class="pr-x" data-act="close-friend" aria-label="關閉">✕</button></div>
      ${locked ? '<p class="pr-lock">用 Google 帳號登入後，就可以更新這位朋友的狀況。<button data-act="signin">登入</button></p>' : ''}
      <div class="pr-frow2"><span>答應前來</span><button class="pr-tog${f.c ? ' on' : ''}" data-act="coming"${locked ? ' disabled' : ''}>${f.c ? '✓ 已答應前來' : '尚未'}</button></div>
      <div class="pr-frow2"><span>進入小排</span><select data-act="gtype"${locked ? ' disabled' : ''}>${opt('', '還沒進')}${opt('district', '社區排')}${opt('campus', '校園排')}</select>
        ${gt ? `<select data-act="gname"${locked ? ' disabled' : ''}>${groupOptions(gt, gn)}</select>` : ''}</div>
      <div class="pr-frow2"><span>受浸</span><button class="pr-tog${f.b ? ' on' : ''}" data-act="bapt"${locked ? ' disabled' : ''}>${f.b ? '✓ 已受浸' : '尚未'}</button></div>
    </div>`;
  }

  function entryHtml(r) {
    const oi = open && open.id === r.id ? open.idx : -1;
    const chips = (r.friends || []).map((f, i) => `<button class="pr-friend${f.c ? ' coming' : ''}${i === oi ? ' open' : ''}" data-act="friend" data-id="${esc(r.id)}" data-idx="${i}" aria-expanded="${i === oi}">${f.c ? '<span class="pr-tick">✓</span>' : ''}${esc(f.n)}${f.g && f.g.n ? `<small>${esc(f.g.n)}</small>` : ''}${f.b ? '<span class="pr-bapt" title="已受浸">浸</span>' : ''}</button>`).join('');
    const staffBits = isStaff() ? `<label class="pr-dist">${esc(r.name)} 屬於<select data-act="district" data-name="${esc(r.name)}"><option value="">未歸類</option>${YOUTH_DISTRICTS.flatMap((g) => g.items).map((n) => `<option${n === r.district ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <button class="pr-small" data-act="owner" data-id="${esc(r.id)}">${r.owned ? '👤 改擁有者' : '👤 指定擁有者'}</button>` : '';
    const actions = canEdit(r) ? `<div class="pr-actions">${staffBits}<button class="pr-small" data-act="edit" data-id="${esc(r.id)}">✏️ 編輯</button><button class="pr-small danger" data-act="delete" data-id="${esc(r.id)}">刪除</button></div>` : '';
    return `<article class="pr-entry${r.mine ? ' mine' : ''}">
      <div class="pr-entry-head"><b>${esc(r.name)}</b>${r.mine ? '<span class="pr-mine">我的</span>' : ''}${isStaff() && !r.owned ? '<span class="pr-noowner" title="這筆是舊網站登記的，還沒指定擁有者">未指定擁有者</span>' : ''}<time>${esc(String(r.timestamp || '').slice(5, 10).replace('-', '/'))}</time></div>
      <div class="pr-friends">${chips}</div>
      ${oi >= 0 ? friendPanel(r, r.friends[oi], oi) : ''}
      ${(r.tags || []).length ? `<div class="pr-tags">${r.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      ${r.note ? `<p class="pr-note">${esc(r.note)}</p>` : ''}
      ${actions}
    </article>`;
  }

  function wallHtml() {
    const rows = visible();
    const s = stats(rows);
    const sections = [['youth', '🏘️ 社區（青少年小區）'], ['campus', '🏫 校園']].map(([type, title]) => {
      const list = rows.filter((r) => (type === 'youth' ? r.type === 'youth' : r.type !== 'youth'));
      if (!list.length) return '';
      const groups = {};
      list.forEach((r) => (groups[r.group] ||= []).push(r));
      return `<h3 class="pr-sec">${title}<small>${Object.keys(groups).length} 個${type === 'youth' ? '小區' : '校園'}・${list.length} 位登記</small></h3>`
        + Object.keys(groups).sort((a, b) => a.localeCompare(b, 'zh-Hant')).map((g) => `<section class="pr-group"><h4>${esc(g)}<small>${groups[g].length} 位登記・${groups[g].reduce((a, r) => a + (r.friends || []).length, 0)} 位朋友</small></h4>${groups[g].map(entryHtml).join('')}</section>`).join('');
    }).join('');
    return `<div class="pr-tiles">${[['登記', s.entries], ['福音朋友', s.friends], ['答應前來', s.coming], ['進小排', s.inGroup], ['受浸', s.bapt]].map(([l, n]) => `<div><small>${l}</small><b>${n}</b></div>`).join('')}</div>
      <div class="pr-filters">
        <input type="search" data-act="q" placeholder="搜尋名字、小區、學校" value="${esc(q)}" aria-label="搜尋">
        <select data-act="filter" aria-label="篩選">${[['all', '全部'], ['waiting', '還沒答應'], ['coming', '已答應前來'], ['group', '已進小排'], ['bapt', '已受浸']].map(([v, l]) => `<option value="${v}"${v === filter ? ' selected' : ''}>${l}</option>`).join('')}</select>
        ${auth.signedIn() ? `<label class="pr-chk"><input type="checkbox" data-act="mine"${onlyMine ? ' checked' : ''}> 只看我的</label>` : ''}
      </div>
      <p class="hint">點福音朋友的名字可以更新狀況。${auth.signedIn() ? '自己登記的朋友會顯示完整姓名，別人的只顯示頭尾兩個字。' : '名字中間的字會遮起來；登入後，自己登記的朋友會顯示完整姓名。'}</p>
      ${sections || `<p class="hint">${rows.length || !state.rows.length ? '還沒有人登記。' : '找不到符合的登記。'}</p>`}`;
  }

  function formHtml() {
    if (!auth.signedIn()) return `<div class="pr-signin"><p>登記代禱名單需要先用 Google 帳號登入。<br>你登記的朋友，只有你自己和服事者看得到完整姓名，其他人只會看到「林○華」。</p><button class="btn-primary" data-act="signin">用 Google 帳號登入</button></div>`;
    const r = editing ? state.rows.find((x) => x.id === editing) : null;
    const type = r ? (r.type === 'youth' ? 'youth' : 'campus') : (formDraft.type || 'youth');
    const friends = r ? r.friends.map((f) => ({ n: f.n, c: f.c })) : (formDraft.friends || [{ n: '', c: false }]);
    const tags = r ? r.tags || [] : formDraft.tags || [];
    return `<form class="pr-form" data-act="form">
      <h3>${r ? '✏️ 編輯登記' : '🙏 新增代禱名單'}</h3>
      <label>你的姓名<input name="name" maxlength="40" required value="${esc(r ? r.name : formDraft.name || '')}" placeholder="例如：陳小明"></label>
      <fieldset><legend>類別</legend>
        <label class="pr-radio"><input type="radio" name="type" value="youth"${type === 'youth' ? ' checked' : ''}> 社區（依你所在的小區）</label>
        <label class="pr-radio"><input type="radio" name="type" value="campus"${type === 'campus' ? ' checked' : ''}> 校園（依你所在的學校）</label>
      </fieldset>
      <label>${type === 'youth' ? '所在小區（不確定的話可以選大區）' : '學校'}
        <select name="group" required>${type === 'youth'
          ? groupOptions('district', r ? r.group : formDraft.group) + `<optgroup label="用大區選">${YOUTH_AREAS.map((a) => `<option value="area:${esc(a.area)}"${formDraft.group === 'area:' + a.area ? ' selected' : ''}>${esc(a.area)}（${esc(a.district)}）</option>`).join('')}</optgroup>`
          : groupOptions('campus', r ? r.group : formDraft.group)}</select></label>
      <fieldset><legend>福音朋友（勾選＝已答應前來）</legend>
        <div class="pr-frows">${friends.map((f, i) => `<div class="pr-frow3"><span>${i + 1}</span><input name="friend" maxlength="20" value="${esc(f.n)}" placeholder="朋友的名字" aria-label="第 ${i + 1} 位朋友的名字"><label class="pr-chk"><input type="checkbox" name="confirmed"${f.c ? ' checked' : ''}> 已答應</label>${friends.length > 1 ? `<button type="button" class="pr-x" data-act="del-friend" data-idx="${i}" aria-label="移除">✕</button>` : ''}</div>`).join('')}</div>
        <button type="button" class="pr-small" data-act="add-friend">＋ 再加一位</button>
        ${r ? '<p class="hint">改名字或順序時，跟進狀況是用名字對應的，名字不變就不會掉。</p>' : ''}
      </fieldset>
      <fieldset><legend>狀況（選填）</legend><div class="pr-tagpick">${TAGS.map((t) => `<label><input type="checkbox" name="tags" value="${esc(t)}"${tags.includes(t) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div></fieldset>
      <label>補充說明（選填，最多 ${NOTE_MAX} 字）<input name="note" maxlength="${NOTE_MAX}" value="${esc(r ? r.note : formDraft.note || '')}" placeholder="例如：週五才有空"></label>
      <p class="hint">請不要填電話、地址、健康或家庭狀況。名字只要寫你認得的稱呼就好。</p>
      <div class="pr-form-acts"><button class="btn-primary" type="submit"${busy ? ' disabled' : ''}>${busy ? '送出中…' : r ? '儲存' : '送出'}</button>${r ? '<button type="button" class="pr-small" data-act="cancel-edit">取消編輯</button>' : ''}</div>
    </form>`;
  }
  let formDraft = {};
  function readForm(form) {
    const fd = new FormData(form);
    const names = [...form.querySelectorAll('input[name="friend"]')].map((x) => x.value.replace(/\//g, ' ').trim());
    const conf = [...form.querySelectorAll('input[name="confirmed"]')].map((x) => x.checked);
    return { name: String(fd.get('name') || '').trim(), type: fd.get('type'), group: String(fd.get('group') || ''), friends: names.map((n, i) => ({ n, c: conf[i] })), tags: fd.getAll('tags'), note: String(fd.get('note') || '').trim().slice(0, NOTE_MAX) };
  }

  function progressHtml() {
    const s = stats();
    const people = [];
    state.rows.forEach((r) => (r.friends || []).forEach((f, i) => people.push({ r, f, i })));
    const stage = (p) => (p.f.b ? '受浸' : p.f.g && p.f.g.n ? '進小排' : p.f.c ? '答應前來' : '邀約中');
    const order = ['受浸', '進小排', '答應前來', '邀約中'];
    const by = Object.fromEntries(order.map((k) => [k, people.filter((p) => stage(p) === k)]));
    return `<div class="pr-funnel">${funnelRows(s)}</div>
      <p class="hint">每位朋友算在他目前走到的那一步（受浸＞進小排＞答應前來＞邀約中）。</p>
      ${order.map((k) => by[k].length ? `<h3 class="pr-sec">${k}<small>${by[k].length} 位</small></h3><div class="pr-plist">${by[k].map((p) => `<span>${esc(p.f.n)}<small>${esc(p.r.group)}${p.f.g && p.f.g.n ? '・' + esc(p.f.g.n) : ''}</small></span>`).join('')}</div>` : '').join('')}
      <button class="pr-small" data-act="copy">📋 複製成文字</button>`;
  }
  function progressText() {
    const lines = ['【代禱牆 跟進進度】'];
    const s = stats();
    lines.push(`邀約 ${s.friends}・答應前來 ${s.coming}・進小排 ${s.inGroup}・受浸 ${s.bapt}`);
    for (const type of ['youth', 'campus']) {
      const groups = {};
      state.rows.filter((r) => (type === 'youth' ? r.type === 'youth' : r.type !== 'youth')).forEach((r) => (r.friends || []).forEach((f) => (groups[r.group] ||= []).push(f)));
      const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      if (!names.length) continue;
      lines.push('', type === 'youth' ? '■ 社區' : '■ 校園');
      names.forEach((g) => lines.push(`・${g}：${groups[g].map((f) => f.n + (f.b ? '（已受浸）' : f.g && f.g.n ? `（${f.g.n}）` : f.c ? '（答應）' : '')).join('、')}`));
    }
    return lines.join('\n');
  }

  // 服事者：完整姓名總覽（畫面印上目前帳號，截圖外流時查得到來源）
  function staffHtml() {
    const noOwner = state.rows.filter((r) => !r.owned).length;
    const when = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    return `<div class="pr-staffnote"><b>🔐 服事者</b>：你看得到全部的完整姓名，也可以在代禱牆分頁編輯、刪除、改小區歸屬、指定擁有者。
      ${noOwner ? `<br>有 <b>${noOwner}</b> 筆是舊網站登記的、還沒有擁有者；到代禱牆按「👤 指定擁有者」填入登記者的 Gmail，他登入後就看得到自己登記的朋友。` : ''}</div>
      <div class="pr-report" data-mark="${esc(state.viewer.email)}・${esc(when)}">
        <table><thead><tr><th>小區／學校</th><th>登記者</th><th>福音朋友</th></tr></thead><tbody>
        ${[...state.rows].sort((a, b) => (a.type + a.group).localeCompare(b.type + b.group, 'zh-Hant')).map((r) => `<tr><td>${esc(r.group)}</td><td>${esc(r.name)}</td><td>${(r.friends || []).map((f) => esc(f.n) + (f.b ? '💧' : f.g && f.g.n ? '🏠' : f.c ? '✋' : '')).join('、')}</td></tr>`).join('')}
        </tbody></table>
        <p class="pr-markline">檢視者：${esc(state.viewer.email)}・${esc(when)}・請勿外傳</p>
      </div>
      <p class="hint">✋ 答應前來　🏠 進小排　💧 受浸</p>`;
  }

  function render() {
    const tabs = [['wall', '🙏 代禱牆'], ['add', editing ? '✏️ 編輯' : '➕ 新增名單'], ['progress', '📈 跟進進度']];
    if (isStaff()) tabs.push(['staff', '🔐 服事者']);
    if (tab === 'staff' && !isStaff()) tab = 'wall';
    const body = state.status === 'error' && !state.rows.length ? `<p class="cr-warn">讀取失敗（${esc(state.error)}）。請稍後按重新整理。</p>`
      : state.status !== 'ready' && !state.rows.length ? '<p class="hint">正在讀取代禱牆…</p>'
        : tab === 'wall' ? wallHtml() : tab === 'add' ? formHtml() : tab === 'progress' ? progressHtml() : staffHtml();
    const focusAct = document.activeElement?.dataset?.act;
    el.innerHTML = `<div class="pr-head"><div><b>🙏 代禱牆</b><small>${auth.signedIn() ? esc(state.viewer?.email || '') + (isStaff() ? '・服事者' : '') : '未登入：名字會遮起來'}</small></div>
        <div class="pr-head-acts">${auth.signedIn() ? '' : '<button data-act="signin">登入</button>'}<button data-act="refresh">↻</button><button class="pr-close" data-act="close" aria-label="關閉代禱牆">✕</button></div></div>
      <div class="pr-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</div>
      <div class="pr-body">${msg ? `<p class="pr-msg" role="status">${esc(msg)}</p>` : ''}${body}</div>`;
    if (focusAct === 'q') { const i = el.querySelector('[data-act="q"]'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
  }

  const findRow = (id) => state.rows.find((r) => r.id === id);
  async function act(fn, okMsg) {
    try { busy = true; await fn(); msg = okMsg || ''; await load(); }
    catch (err) { msg = err.code === 'signin' ? '請先用 Google 帳號登入。' : `沒有成功：${err.message}`; }
    finally { busy = false; render(); }
  }

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],[data-tab]');
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; msg = ''; render(); return; }
    const a = t.dataset.act;
    if (a === 'close') return close();
    if (a === 'refresh') { msg = ''; await load(); return; }
    if (a === 'signin') { try { await auth.signIn(); } catch (err) { say(err.message === 'in-app' ? '請用 Safari 或 Chrome 打開網站再登入（LINE、IG 的內建瀏覽器不能登入 Google）。' : '登入沒有完成，請再試一次。'); } return; }
    if (a === 'friend') { const id = t.dataset.id, idx = +t.dataset.idx; open = open && open.id === id && open.idx === idx ? null : { id, idx }; render(); return; }
    if (a === 'close-friend') { open = null; render(); return; }
    const panel = t.closest('.pr-fpanel');
    if (panel && (a === 'coming' || a === 'bapt')) {
      const r = findRow(panel.dataset.id), idx = +panel.dataset.idx, f = r.friends[idx];
      if (a === 'coming') return act(() => post('toggleConfirmedAuth', { id: r.id, index: idx, value: !f.c }));
      return act(() => post('setBaptizedAuth', { id: r.id, index: idx, value: !f.b }));
    }
    if (a === 'edit') { editing = t.dataset.id; tab = 'add'; msg = ''; render(); return; }
    if (a === 'cancel-edit') { editing = null; tab = 'wall'; render(); return; }
    if (a === 'delete') {
      const r = findRow(t.dataset.id);
      if (!confirm(`確定要刪除「${r.name}」的這筆登記嗎？（服事者可以從試算表還原）`)) return;
      return act(() => post('deleteAuth', { id: r.id }), '已刪除。');
    }
    if (a === 'owner') {
      const email = prompt('把這筆登記指定給哪個 Gmail？（留空＝清除擁有者）\n指定後，那個人登入就看得到自己登記的朋友的完整姓名。', '');
      if (email == null) return;
      return act(() => post('setOwner', { id: t.dataset.id, email: email.trim() }), email.trim() ? '已指定擁有者。' : '已清除擁有者。');
    }
    if (a === 'add-friend' || a === 'del-friend') {
      const form = el.querySelector('.pr-form');
      const d = readForm(form);
      if (a === 'add-friend') d.friends.push({ n: '', c: false }); else d.friends.splice(+t.dataset.idx, 1);
      if (editing) { const r = findRow(editing); Object.assign(r, { name: d.name, type: d.type, group: d.group, tags: d.tags, note: d.note, friends: d.friends.map((f) => ({ ...(r.friends.find((x) => x.n === f.n) || {}), n: f.n, c: f.c })) }); }
      else formDraft = d;
      render();
      el.querySelectorAll('input[name="friend"]')[a === 'add-friend' ? d.friends.length - 1 : 0]?.focus();
      return;
    }
    if (a === 'copy') {
      try { await navigator.clipboard.writeText(progressText()); say('已複製，可以貼到 LINE。'); } catch { say('這個瀏覽器不能自動複製。'); }
    }
  });

  el.addEventListener('change', (e) => {
    const t = e.target, a = t.dataset.act;
    if (a === 'filter') { filter = t.value; render(); return; }
    if (a === 'mine') { onlyMine = t.checked; render(); return; }
    if (t.name === 'type' && t.closest('.pr-form')) {
      const d = readForm(t.closest('.pr-form'));
      d.group = '';
      if (editing) Object.assign(findRow(editing), { type: d.type === 'youth' ? 'youth' : 'campus', group: '' }); else formDraft = d;
      render(); return;
    }
    const panel = t.closest('.pr-fpanel');
    if (panel && a === 'gtype') {
      const r = findRow(panel.dataset.id), idx = +panel.dataset.idx;
      open = { id: r.id, idx, type: t.value };
      if (!t.value) return act(() => post('setFollowupAuth', { id: r.id, index: idx, groupType: '', groupName: '' }));
      render(); return;
    }
    if (panel && a === 'gname' && t.value) {
      const r = findRow(panel.dataset.id), idx = +panel.dataset.idx;
      const type = open?.type || r.friends[idx].g?.t;
      open = { id: r.id, idx };
      return act(() => post('setFollowupAuth', { id: r.id, index: idx, groupType: type, groupName: t.value }));
    }
    if (a === 'district') return act(() => post('setDistrictAuth', { name: t.dataset.name, district: t.value }), '已更新小區歸屬。');
  });

  el.addEventListener('input', (e) => { if (e.target.dataset.act === 'q') { q = e.target.value; render(); } });

  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = readForm(e.target);
    let group = d.group;
    if (group.startsWith('area:')) group = YOUTH_AREAS.find((x) => x.area === group.slice(5))?.district || '';
    const friends = d.friends.filter((f) => f.n);
    if (!d.name) return say('請填你的姓名。');
    if (!group) return say(d.type === 'youth' ? '請選擇所在小區。' : '請選擇學校。');
    if (!friends.length) return say('請至少填一位福音朋友。');
    const record = { type: d.type, group, name: d.name, friends: friends.map((f) => f.n), confirmed: friends.filter((f) => f.c).map((f) => f.n), tags: d.tags, note: d.note };
    if (editing) {
      const id = editing;
      act(async () => { await post('updateAuth', { id, record }); editing = null; tab = 'wall'; }, '已儲存。');
    } else {
      record.id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      act(async () => { await post('addAuth', { record }); formDraft = {}; tab = 'wall'; onlyMine = true; }, '已加入代禱名單，謝謝你！');
    }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });
  onChange(() => { if (!el.hidden) render(); });

  async function openBoard(which) {
    lastFocus = document.activeElement;
    if (which) tab = which;
    el.hidden = false;
    render();
    el.querySelector('.pr-close')?.focus();
    if (state.status !== 'ready' || Date.now() - state.loadedAt > 60000) await load();
  }
  function close() {
    el.hidden = true;
    open = null;
    lastFocus?.focus?.({ preventScroll: true });
  }
  // 登入狀態變了：重新讀（自己的登記會變成完整姓名），編輯中的內容清掉
  function userChanged() {
    editing = null; formDraft = {}; onlyMine = false; open = null;
    state.viewer = null;
    if (state.status !== 'idle') load();
  }
  return { open: openBoard, close, userChanged, isOpen: () => !el.hidden };
}

