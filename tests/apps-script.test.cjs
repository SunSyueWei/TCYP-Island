// 服事者專區 Apps Script 測試：用模擬的 Google 服務驗證權限判斷與資料整理。用法：node tests/apps-script.test.cjs
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const code = fs.readFileSync(require('path').join(__dirname, '../apps-script/Code.gs'), 'utf8');
let convN = 0, xlsxModified = 'T1', v3CopyFails = false;
function makeEnv({ users = {}, perms = [], props = {}, tree = {}, sheets = {} } = {}) {
  const calls = [];
  const resp = (code, obj) => ({ getResponseCode: () => code, getContentText: () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
  const route = (url, opts) => {
    calls.push(url);
    if (url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      const tok = JSON.parse(opts.payload).idToken;
      return users[tok] ? resp(200, { users: [users[tok]] }) : resp(400, { error: { message: 'INVALID_ID_TOKEN' } });
    }
    const m = url.match(/drive\/v3\/files\/([^/?]+)\/permissions/);
    if (m) return resp(200, { permissions: perms });
    const q = decodeURIComponent((url.match(/q=([^&]+)/) || [])[1] || '');
    const pm = q.match(/'([^']+)' in parents/);
    if (pm) return resp(200, { files: tree[pm[1]] || [] });
    const cp = url.match(/files\/([^/?]+)\/copy/);
    if (cp && v3CopyFails && url.includes('/drive/v3/')) return resp(400, { error: { message: 'conversion not supported' } });
    if (cp) { const nid = 'CONV' + (++convN); sheets[nid] = sheets[cp[1]]; return resp(200, { id: nid }); }
    if (/files\/NOPE\b/.test(url)) return resp(404, { error: { message: 'File not found' } });
    if (/files\/(SHEET|XLSX)\?/.test(url)) {
      const id = url.match(/files\/(\w+)\?/)[1];
      return resp(200, { id, name: id === 'XLSX' ? '總表.xlsx' : '總表', mimeType: id === 'XLSX' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.google-apps.spreadsheet', modifiedTime: xlsxModified, webViewLink: 'https://docs.google.com/spreadsheets/d/' + id + '/edit' });
    }
    if (opts && opts.method === 'patch') return resp(200, {});
    const ex = url.match(/files\/([^/?]+)\/export/);
    if (ex) return resp(200, '﻿本週請為期初特會禱告\n第二行');
    const meta = url.match(/files\/([^/?]+)\?/);
    if (meta) return resp(200, { name: '服事者公告', modifiedTime: '2026-10-29T01:00:00Z', webViewLink: 'https://docs.google.com/document/d/x' });
    return resp(404, 'nope');
  };
  const store = {};
  const ctx = {
    console, JSON, Date, Object, String, encodeURIComponent,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => store[k] ?? null, put: (k, v) => { store[k] = v; } }) },
    UrlFetchApp: { fetch: route, fetchAll: (reqs) => reqs.map((r) => route(r.url, r)) },
    ScriptApp: { getOAuthToken: () => 'tok' },
    DriveApp: { getRootFolder: () => ({}) },
    SpreadsheetApp: { openById: (id) => { calls.push('sheet:' + id); return { getName: () => '2026青少年聚會人數統計_總表', getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit', getSheetByName: (n) => { const book = sheets[id] || sheets; return book[n] ? { getDataRange: () => ({ getDisplayValues: () => book[n] }) } : null; } }; } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, calls, post: (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } }) };
}
const F = 'application/vnd.google-apps.folder';
// 和真的週報表同樣的版面（第 2 列是主日日期、第 3 列是標題）
const lordSheet = [
  ['主 日', '', '2026 年　台中青少年　主日', '', '', '', '', '達目標'],
  ['主日', '', '', '', '', '', '', '1/4', '1/11', '1/18'],
  ['照顧區', '青少年小區', '基數', '目標', '1月', '2月', '全年平均', '12/29', '1/5', '1/12'],
  ['南一', '大新', '9', '10', '9.0', '8.3', '10.6', '9', '8', ''],
  ['', '向上', '6', '8', '6.5', '', '6.4', '5', '5', ''],
  ['南二', '復興', '11', '13', '9.0', '6.8', '8.0', '7', '1,2', ''],
  ['', '總　計', '26', '31', '24.5', '15.1', '25.0', '21', '25', ''],
  ['', '較上週', '', '', '', '', '', '', '+4', ''],
];
const gospelSheet = [
  ['福音出訪'], ['', '', '', '', '', '1/4', '1/11'],
  ['照顧區', '青少年小區', '1月', '2月', '全年平均', '12/29', '1/5'],
  ['南一', '大新', '0.3', '', '0.1', '0', '1'],
  ['', '總　計', '0.3', '', '0.1', '0', '1'],
];
const env = makeEnv({
  users: { good: { email: 'Staff@Gmail.com', emailVerified: true }, teen: { email: 'teen@gmail.com', emailVerified: true }, unv: { email: 'staff@gmail.com', emailVerified: false }, extra: { email: 'helper@gmail.com', emailVerified: true }, blocked: { email: 'left@gmail.com', emailVerified: true } },
  perms: [{ type: 'user', emailAddress: 'staff@gmail.com' }, { type: 'user', emailAddress: 'left@gmail.com' }, { type: 'anyone' }],
  props: { ROOT_FOLDER_ID: 'ROOT', FIREBASE_API_KEY: 'k', ANNOUNCE_DOC_ID: 'DOC', EXTRA_STAFF: 'helper@gmail.com', BLOCKED_STAFF: 'left@gmail.com', STATS_SHEET_ID: 'SHEET' },
  sheets: { '主日_週報表': lordSheet, '福音出訪_週報表': gospelSheet },
  tree: {
    ROOT: [{ id: 'A', name: '23_主日人數統計', mimeType: F, webViewLink: 'https://drive.google.com/drive/folders/A' }, { id: 'B', name: '11_行事曆', mimeType: F, webViewLink: 'https://drive.google.com/drive/folders/B' }, { id: 'r1', name: 'root doc', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-10-01T00:00:00Z', webViewLink: 'https://docs.google.com/document/d/r1' }],
    A: [{ id: 'a1', name: '2026青少年小排人數統計', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-10-28T00:00:00Z', webViewLink: 'https://docs.google.com/spreadsheets/d/a1' }, { id: 'A2', name: 'sub', mimeType: F, webViewLink: 'x' }],
    B: [{ id: 'b1', name: '2027寒假特會規劃', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-10-27T00:00:00Z', webViewLink: 'https://docs.google.com/spreadsheets/d/b1' }],
    A2: [{ id: 'deep', name: '深層檔案', mimeType: 'application/pdf', modifiedTime: '2026-10-29T00:00:00Z', webViewLink: 'https://drive.google.com/file/d/deep' }],
  },
});
const results = [];
const t = (name, fn) => { try { fn(); results.push('PASS ' + name); } catch (e) { results.push('FAIL ' + name + ' :: ' + e.message); } };
t('假 token → unauthenticated', () => assert.deepEqual(env.post({ action: 'whoami', idToken: 'fake' }), { ok: false, error: 'unauthenticated' }));
t('沒有 token → unauthenticated', () => assert.equal(env.post({ action: 'whoami' }).error, 'unauthenticated'));
t('Email 未驗證 → unauthenticated', () => assert.equal(env.post({ action: 'whoami', idToken: 'unv' }).error, 'unauthenticated'));
t('不在共用名單 → forbidden', () => assert.equal(env.post({ action: 'whoami', idToken: 'teen' }).error, 'forbidden'));
t('共用名單內（大小寫不同）→ ok', () => assert.deepEqual(env.post({ action: 'whoami', idToken: 'good' }), { ok: true, email: 'staff@gmail.com' }));
t('EXTRA_STAFF → ok', () => assert.equal(env.post({ action: 'whoami', idToken: 'extra' }).ok, true));
t('BLOCKED_STAFF 就算在名單也擋', () => assert.equal(env.post({ action: 'whoami', idToken: 'blocked' }).error, 'forbidden'));
t('forbidden 時不回傳任何資料', () => { const r = env.post({ action: 'dashboard', idToken: 'teen' }); assert.equal(r.data, undefined); });
t('未知 action → bad-request', () => assert.equal(env.post({ action: 'x', idToken: 'good' }).error, 'bad-request'));
let d;
t('dashboard 結構', () => { d = env.post({ action: 'dashboard', idToken: 'good' }).data; assert.ok(d && d.recent && d.folders && d.stats && d.plans && d.announce); });
t('三層資料夾都讀到、依時間排序', () => assert.deepEqual(d.recent.map((f) => f.name), ['深層檔案', '2026青少年小排人數統計', '2027寒假特會規劃', 'root doc']));
t('資料夾名稱標示', () => assert.equal(d.recent[1].folder, '23_主日人數統計'));
t('統計／規劃分類', () => { assert.deepEqual(d.stats.map((f) => f.name), ['2026青少年小排人數統計']); assert.deepEqual(d.plans.map((f) => f.name), ['2027寒假特會規劃']); });
t('公告去掉 BOM', () => assert.equal(d.announce.text, '本週請為期初特會禱告\n第二行'));
t('快取：第二次不再呼叫 Drive', () => { const n = env.calls.length; env.post({ action: 'dashboard', idToken: 'good' }); const driveCalls = env.calls.slice(n).filter((u) => u.includes('drive/v3')); assert.equal(driveCalls.length, 0); });
let c;
t('chlife：非服事者拿不到', () => assert.equal(env.post({ action: 'chlife', idToken: 'teen' }).data, undefined));
t('chlife 結構', () => { c = env.post({ action: 'chlife', idToken: 'good' }).data; assert.equal(c.meetings.length, 5); assert.ok(c.url.startsWith('https://docs.google.com/')); });
t('週次用主日日期、月份標題', () => { const m = c.meetings[0]; assert.deepEqual(m.weeks, ['1/4', '1/11', '1/18']); assert.deepEqual(m.months, ['1月', '2月']); });
t('小區、照顧區往下填、數字轉換', () => { const u = c.meetings[0].units; assert.deepEqual(u.map((x) => [x.care, x.name, x.base, x.target]), [['南一', '大新', 9, 10], ['南一', '向上', 6, 8], ['南二', '復興', 11, 13]]); assert.deepEqual(u[2].weeks, [7, 12, null]); assert.equal(u[1].months[1], null); });
t('總計列、不含「較上週」', () => { const m = c.meetings[0]; assert.deepEqual(m.total.weeks, [21, 25, null]); assert.equal(m.units.length, 3); });
t('沒有基數欄的聚會', () => { const g = c.meetings[3]; assert.equal(g.hasBase, false); assert.equal(g.units[0].base, null); assert.deepEqual(g.weeks, ['1/4', '1/11']); });
t('缺少的分頁標成 missing', () => assert.equal(c.meetings[1].missing, true));
t('chlife 快取', () => { const n = env.calls.length; env.post({ action: 'chlife', idToken: 'good' }); assert.equal(env.calls.slice(n).filter((u) => u.startsWith('sheet:')).length, 0); });
// Excel 檔：自動轉成 Google 試算表副本，原檔沒變就沿用
const xenv = makeEnv({ users: { good: { email: 'staff@gmail.com', emailVerified: true } }, perms: [{ type: 'user', emailAddress: 'staff@gmail.com' }],
  props: { ROOT_FOLDER_ID: 'ROOT', FIREBASE_API_KEY: 'k', STATS_SHEET_ID: 'XLSX' }, sheets: { XLSX: { '主日_週報表': lordSheet } } });
let xc;
t('Excel：轉換後可以讀', () => { xc = xenv.post({ action: 'chlife', idToken: 'good' }).data; assert.equal(xc.meetings[0].units.length, 3); assert.equal(xc.title, '總表'); assert.ok(xc.url.includes('/XLSX/')); });
t('Excel：原檔沒變不重新轉換', () => { const n = xenv.calls.length; xenv.post({ action: 'chlife', idToken: 'good', force: true }); assert.equal(xenv.calls.slice(n).filter((u) => u.includes('/copy')).length, 0); });
t('Excel：原檔更新才重新轉換、舊副本丟垃圾桶', () => { xlsxModified = 'T2'; const n = xenv.calls.length; xenv.post({ action: 'chlife', idToken: 'good', force: true }); const c2 = xenv.calls.slice(n); assert.equal(c2.filter((u) => u.includes('/copy')).length, 1); assert.ok(c2.some((u) => /files\/CONV1$/.test(u))); });
t('v3 轉換失敗時改用 v2', () => { v3CopyFails = true; xlsxModified = 'T3'; const n = xenv.calls.length; const r = xenv.post({ action: 'chlife', idToken: 'good', force: true }); v3CopyFails = false; assert.equal(r.ok, true); assert.ok(xenv.calls.slice(n).some((u) => u.includes('/drive/v2/files/XLSX/copy?convert=true'))); });
const benv = makeEnv({ users: { good: { email: 'staff@gmail.com', emailVerified: true } }, perms: [{ type: 'user', emailAddress: 'staff@gmail.com' }], props: { ROOT_FOLDER_ID: 'ROOT', FIREBASE_API_KEY: 'k', STATS_SHEET_ID: 'NOPE' } });
t('服事者遇到錯誤會看到原因', () => { const r = benv.post({ action: 'chlife', idToken: 'good' }); assert.equal(r.error, 'server'); assert.ok(/Drive 404/.test(r.detail)); });
t('驗證前的錯誤不回傳細節', () => assert.equal(benv.ctx.doPost({ postData: { contents: '{bad' } }).detail, undefined));
t('testStats 可以在編輯器執行', () => { const logs = []; const orig = xenv.ctx.console; xenv.ctx.console = { log: (m) => logs.push(m), error() {} }; xenv.ctx.testStats(); xenv.ctx.console = orig; assert.ok(logs.some((l) => l.includes('✅ 主日：3 個小區'))); assert.ok(logs.some((l) => l.includes('⚠️ 小排'))); });
t('壞 JSON → server 錯誤', () => assert.equal(env.ctx.doPost({ postData: { contents: '{bad' } }).error, 'server'));
console.log(results.join('\n'));
console.log(results.filter((r) => r.startsWith('PASS')).length + '/' + results.length);
