// 服事者專區 Apps Script 測試：用模擬的 Google 服務驗證權限判斷與資料整理。用法：node tests/apps-script.test.cjs
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const code = fs.readFileSync(require('path').join(__dirname, '../apps-script/Code.gs'), 'utf8');
function makeEnv({ users = {}, perms = [], props = {}, tree = {} } = {}) {
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
    const ex = url.match(/files\/([^/?]+)\/export/);
    if (ex) return resp(200, '﻿本週請為期初特會禱告\n第二行');
    const meta = url.match(/files\/([^/?]+)\?/);
    if (meta) return resp(200, { name: '服事者公告', modifiedTime: '2026-10-29T01:00:00Z', webViewLink: 'https://docs.google.com/document/d/x' });
    return resp(404, 'nope');
  };
  const store = {};
  const ctx = {
    console, JSON, Date, Object, String, encodeURIComponent,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    CacheService: { getScriptCache: () => ({ get: (k) => store[k] ?? null, put: (k, v) => { store[k] = v; } }) },
    UrlFetchApp: { fetch: route, fetchAll: (reqs) => reqs.map((r) => route(r.url, r)) },
    ScriptApp: { getOAuthToken: () => 'tok' },
    DriveApp: { getRootFolder: () => ({}) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, calls, post: (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } }) };
}
const F = 'application/vnd.google-apps.folder';
const env = makeEnv({
  users: { good: { email: 'Staff@Gmail.com', emailVerified: true }, teen: { email: 'teen@gmail.com', emailVerified: true }, unv: { email: 'staff@gmail.com', emailVerified: false }, extra: { email: 'helper@gmail.com', emailVerified: true }, blocked: { email: 'left@gmail.com', emailVerified: true } },
  perms: [{ type: 'user', emailAddress: 'staff@gmail.com' }, { type: 'user', emailAddress: 'left@gmail.com' }, { type: 'anyone' }],
  props: { ROOT_FOLDER_ID: 'ROOT', FIREBASE_API_KEY: 'k', ANNOUNCE_DOC_ID: 'DOC', EXTRA_STAFF: 'helper@gmail.com', BLOCKED_STAFF: 'left@gmail.com' },
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
t('壞 JSON → server 錯誤', () => assert.equal(env.ctx.doPost({ postData: { contents: '{bad' } }).error, 'server'));
console.log(results.join('\n'));
console.log(results.filter((r) => r.startsWith('PASS')).length + '/' + results.length);
