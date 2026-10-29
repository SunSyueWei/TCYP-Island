// 服事者專區：身分確認與 Drive 即時資料（透過 apps-script/Code.gs）
import { STAFF_API } from './staff-config.js';
import { idToken } from './store.js';

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
export function reset() { Object.assign(state, { status: 'idle', data: null, error: null, email: null }); }

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
const fileList = (files) => (files?.length
  ? `<ul class="list">${files.map((f) => `<li><a class="st-file" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer"><span>${icon(f.mime)}</span><span><b>${esc(f.name)}</b><small>${f.folder ? esc(f.folder) + '・' : ''}${ago(f.updated)}更新</small></span></a></li>`).join('')}</ul>`
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

export const STAFF_ISLANDS = [
  {
    id: 'st-hub', name: '服事者會所', short: '公告', emoji: '📢', tint: '#e5ddff', center: true, staff: true,
    render: () => wrap(STAFF_ISLANDS[0], '服事者公告與最新動態', (d) =>
      (d.announce
        ? sec(`📢 ${esc(d.announce.title)}`, `<div class="st-announce">${esc(d.announce.text).replace(/\n/g, '<br>')}</div><p class="hint">${ago(d.announce.updated)}更新・<a href="${esc(safeUrl(d.announce.url))}" target="_blank" rel="noopener noreferrer">在 Google 文件編輯</a></p>`)
        : sec('📢 公告', '<p class="hint">還沒有設定公告文件。在 Apps Script 的指令碼屬性填入 ANNOUNCE_DOC_ID，就會顯示那份 Google 文件的內容。</p>'))
      + sec('🕘 最近更新的 5 個檔案', fileList(d.recent.slice(0, 5)))),
  },
  {
    id: 'st-files', name: '檔案港', short: '最新檔案', emoji: '🗂️', tint: '#dbeefc', angle: 90, staff: true,
    render: () => wrap(STAFF_ISLANDS[1], '整個資料夾最近更新的檔案', (d) => sec('最近更新', fileList(d.recent))),
  },
  {
    id: 'st-folders', name: '資料夾島', short: '資料夾', emoji: '📁', tint: '#fff0c2', angle: 210, staff: true,
    render: () => wrap(STAFF_ISLANDS[2], '青少年服事文件的所有資料夾', (d) => sec(`共 ${d.folders.length} 個資料夾`, fileList(d.folders.map((f) => ({ ...f, mime: 'folder', updated: d.generatedAt }))).replace(/<small>[^<]*<\/small>/g, ''))),
  },
  {
    id: 'st-stats', name: '統計瞭望台', short: '統計與規劃', emoji: '📊', tint: '#dff3e4', angle: 330, staff: true,
    render: () => wrap(STAFF_ISLANDS[3], '人數統計、行事曆與年度規劃', (d) => sec('📊 統計報表', fileList(d.stats)) + sec('📅 行事曆與規劃', fileList(d.plans))),
  },
];
