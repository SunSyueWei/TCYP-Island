// 服事者專區：身分確認與 Drive 即時資料（透過 apps-script/Code.gs）
import { STAFF_API } from './staff-config.js';
import { idToken } from './store.js';
import { panelSummary } from './chlife.js';

export const staffEnabled = !!STAFF_API;
export const state = { status: 'idle', data: null, error: null, email: null };

async function call(action, extra = {}) {
  const token = await idToken();
  if (!token) return { ok: false, error: 'unauthenticated' };
  // text/plain：避免 CORS 預檢（Apps Script 不處理 OPTIONS）
  const res = await fetch(STAFF_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, idToken: token, ...extra }) });
  return res.json();
}

// 是否為服事者（不是的話不會顯示任何入口）
export async function checkStaff() {
  if (!staffEnabled) return false;
  try {
    const r = await call('whoami');
    state.email = r.ok ? r.email : null;
    return r.ok === true;
  } catch (err) { console.error('服事者驗證失敗', err); return false; }
}

export async function loadDashboard(force = false) {
  state.status = 'loading';
  try {
    const r = await call('dashboard', { force });
    if (!r.ok) throw new Error(r.error);
    state.data = r.data; state.status = 'ready'; state.error = null;
  } catch (err) {
    state.status = 'error'; state.error = err.message;
  }
  return state;
}
// 召會生活人數統計（試算表），和 Drive 檔案清單分開讀
export const chlifeState = { status: 'idle', data: null, error: null };
export async function loadChlife(force = false) {
  chlifeState.status = 'loading';
  try {
    const r = await call('chlife', { force });
    if (!r.ok) throw new Error(r.detail ? `${r.error}：${r.detail}` : r.error);
    chlifeState.data = r.data; chlifeState.status = 'ready'; chlifeState.error = null;
  } catch (err) {
    chlifeState.status = 'error'; chlifeState.error = err.message;
  }
  return chlifeState;
}
export function reset() {
  Object.assign(state, { status: 'idle', data: null, error: null, email: null });
  Object.assign(chlifeState, { status: 'idle', data: null, error: null });
  tab = 'home';
}

// ---------- 畫面 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https:\/\/(docs|drive)\.google\.com\//.test(u || '') ? u : '#');
const ICON = { document: '📝', spreadsheet: '📊', presentation: '📽️', form: '📋', pdf: '📕', image: '🖼️', video: '🎬', folder: '📁' };
function icon(mime = '') {
  if (mime.includes('folder')) return ICON.folder;
  for (const k of ['document', 'spreadsheet', 'presentation', 'form']) if (mime.includes(k)) return ICON[k];
  if (mime.includes('pdf')) return ICON.pdf;
  if (mime.startsWith('image/')) return ICON.image;
  if (mime.startsWith('video/')) return ICON.video;
  if (/word|msword/.test(mime)) return ICON.document;
  if (/sheet|excel/.test(mime)) return ICON.spreadsheet;
  if (/presentation|powerpoint/.test(mime)) return ICON.presentation;
  return '📄';
}
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${Math.max(1, m)} 分鐘前`;
  if (m < 1440) return `${Math.round(m / 60)} 小時前`;
  if (m < 43200) return `${Math.round(m / 1440)} 天前`;
  return new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}
// 待刪、暫存與系統雜檔不列出（只是不顯示，雲端原檔不動）
const JUNK = /待刪|暫存|^~\$|^\.|\.(tmp|bak)$|^(desktop\.ini|thumbs\.db)$/i;
const clean = (files) => (files || []).filter((f) => !JUNK.test(String(f.name || '').trim()));
const fileList = (files) => (files?.length
  ? `<ul class="list">${files.map((f) => `<li data-name="${esc(String(f.name || '').toLowerCase())}"><a class="st-file" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer"><span>${icon(f.mime)}</span><span><b>${esc(f.name)}</b><small>${f.folder ? esc(f.folder) + '・' : ''}${ago(f.updated)}更新</small></span></a></li>`).join('')}</ul>`
  : '<p class="hint">沒有找到檔案。</p>');

const sec = (title, inner) => `<section class="p-sec">${title ? `<h3>${title}</h3>` : ''}${inner}</section>`;
function hero(d, sub) { return `<div class="p-hero" style="--c:${d.tint}"><div class="em">${d.emoji}</div><h2>${d.name}</h2><p>${sub}</p></div>`; }
function wrap(d, sub, body) {
  const s = state;
  const top = `<div class="st-bar"><span>🔐 ${esc(s.email || '')}</span><button data-staff="refresh">↻ 重新整理</button></div>`;
  if (s.status === 'loading' && !s.data) return hero(d, sub) + sec('', '<p class="hint">正在從 Google Drive 讀取…</p>');
  if (s.status === 'error' && !s.data) return hero(d, sub) + sec('', `<p class="cr-warn">讀取失敗（${esc(s.error)}）。請稍後按重新整理。</p>`) + top;
  if (!s.data) return hero(d, sub) + sec('', '<p class="hint">尚未載入。</p>');
  return hero(d, sub) + top + body(s.data) + sec('', `<p class="hint">資料來自青少年服事文件 Google Drive，最多 5 分鐘更新一次（上次更新：${ago(s.data.generatedAt)}）。只有資料夾共用名單裏的人看得到這裏。</p>`);
}

// 服事工作台：一個入口、三個分頁。其他四座島只當風景（alias），點了也打開工作台
let tab = 'home';
export function setTab(t) { if (['home', 'files', 'stats'].includes(t)) tab = t; }
const TABS = [['home', '🏠 首頁'], ['files', '🗂️ 資料'], ['stats', '📊 統計']];
const tabsHtml = () => `<div class="st-tabs" role="tablist">${TABS.map(([k, label]) => `<button data-staff-tab="${k}" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}">${label}</button>`).join('')}</div>`;

function chlifeBlock() {
  const c = chlifeState;
  const body = c.status === 'error' && !c.data ? `<p class="cr-warn">讀取失敗（${esc(c.error)}）。</p>`
    : !c.data ? (c.status === 'ready' ? '<p class="hint">目前還沒有人數統計資料。</p>' : '<p class="hint">正在讀取人數統計…</p>')
      : panelSummary(c.data);
  return sec('📈 主日人數（全體）', body + '<button class="btn-primary st-open" data-open="chlife">📈 打開統計看板</button>');
}

// 只在畫面上過濾（不重畫，輸入框才不會失去焦點）
export function filterFiles(root, q) {
  const k = String(q || '').trim().toLowerCase();
  let shown = 0;
  root.querySelectorAll('.st-search-list li[data-name]').forEach((li) => { const hit = !k || li.dataset.name.includes(k); li.hidden = !hit; if (hit) shown++; });
  const none = root.querySelector('.st-nomatch');
  if (none) none.hidden = shown > 0;
}

function hubBody(d) {
  const recent = clean(d.recent);
  if (tab === 'files') {
    return sec('', '<input type="search" class="st-q" data-staff="q" placeholder="搜尋檔案或資料夾名稱" aria-label="搜尋檔案或資料夾"><p class="st-nomatch hint" hidden>沒有符合的檔案或資料夾。</p>')
      + `<div class="st-search-list">`
      + sec('🕘 最近更新', fileList(recent))
      + sec(`📁 資料夾（${clean(d.folders).length}）`, fileList(clean(d.folders).map((f) => ({ ...f, mime: 'folder', updated: d.generatedAt }))).replace(/<small>[^<]*<\/small>/g, ''))
      + '</div>';
  }
  if (tab === 'stats') return chlifeBlock() + sec('📊 統計報表', fileList(clean(d.stats))) + sec('📅 行事曆與規劃', fileList(clean(d.plans)));
  return (d.announce
    ? sec(`📢 ${esc(d.announce.title)}`, `<div class="st-announce">${esc(d.announce.text).replace(/\n/g, '<br>')}</div><p class="hint">${ago(d.announce.updated)}更新・<a href="${esc(safeUrl(d.announce.url))}" target="_blank" rel="noopener noreferrer">在 Google 文件編輯</a></p>`)
    : sec('📢 公告', '<p class="hint">目前沒有公告。</p>'))
    + chlifeBlock()
    + sec('🕘 最近更新的 5 個檔案', fileList(recent.slice(0, 5)));
}

const scenery = (id, name, emoji, tint, angle) => ({ id, name, short: name, emoji, tint, angle, staff: true, alias: 'st-hub', render: () => '' });
export const STAFF_ISLANDS = [
  {
    id: 'st-hub', name: '服事工作台', short: '服事工作台', emoji: '🗝️', tint: '#e5ddff', center: true, staff: true,
    render: () => wrap(STAFF_ISLANDS[0], '公告、資料與人數統計都在這裏', (d) => tabsHtml() + hubBody(d)),
  },
  scenery('st-files', '檔案港', '🗂️', '#dbeefc', 90),
  scenery('st-folders', '資料夾島', '📁', '#fff0c2', 180),
  scenery('st-stats', '統計瞭望台', '📊', '#dff3e4', 0),
  scenery('st-chlife', '召會生活統計島', '📈', '#dcecfb', 270),
];
