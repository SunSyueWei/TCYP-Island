/**
 * 台中青少年 TCYP：服事者專區 API（Google Apps Script）
 *
 * 部署的人（必須能看到青少年服事文件資料夾）把這支程式部署成網頁應用程式：
 *   執行身分：我　／　誰可以存取：所有人
 * 網站送來 Firebase 登入憑證 → 這裏向 Google 驗證 → 確認 Email 在資料夾的共用名單中 → 才回傳 Drive 資料。
 *
 * 指令碼屬性（專案設定 → 指令碼屬性），內部資訊都放這裏，不放進公開的 GitHub：
 *   ROOT_FOLDER_ID     青少年服事文件資料夾的 ID（必填）
 *   FIREBASE_API_KEY   網站 firebase-config.js 裏的 apiKey（必填）
 *   ANNOUNCE_DOC_ID    「服事者公告」Google 文件的 ID（選填）
 *   EXTRA_STAFF        額外允許的 Email，逗號分隔（選填）
 *   BLOCKED_STAFF      就算在共用名單也不允許的 Email，逗號分隔（選填）
 *   STATS_SHEET_ID     「青少年聚會人數統計_總表」的檔案 ID（選填；填了才有召會生活統計島的圖表）
 *                      Google 試算表或上傳的 Excel（.xlsx）都可以；Excel 會自動轉成一份 Google 試算表副本來讀，
 *                      副本放在部署者的「我的雲端硬碟」，原檔更新時才重新轉換（舊副本會移到垃圾桶）
 */
var CACHE_SECONDS = 300; // Drive 資料最多 5 分鐘更新一次
var props = PropertiesService.getScriptProperties();

function doPost(e) {
  var staffOk = false;
  try {
    var req = JSON.parse(e.postData.contents);
    var email = verifyFirebaseToken_(String(req.idToken || ''));
    if (!email) return json_({ ok: false, error: 'unauthenticated' });
    if (!isStaff_(email)) return json_({ ok: false, error: 'forbidden' });
    staffOk = true;
    if (req.action === 'whoami') return json_({ ok: true, email: email });
    if (req.action === 'dashboard') return json_({ ok: true, email: email, data: dashboard_(req.force === true) });
    if (req.action === 'chlife') return json_({ ok: true, email: email, data: chlife_(req.force === true) });
    return json_({ ok: false, error: 'bad-request' });
  } catch (err) {
    console.error(err);
    // 錯誤原因只給已確認的服事者看（方便除錯）；驗證前的錯誤不回傳細節
    var out = { ok: false, error: 'server' };
    if (staffOk) out.detail = String((err && err.message) || err).replace(/key=[^&\s]+/g, 'key=…').slice(0, 300);
    return json_(out);
  }
}

function doGet() { return json_({ ok: true, service: 'tcyp-staff' }); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 用 Google 的 Identity Toolkit 驗證 Firebase ID token（會檢查簽章、期限、所屬專案）
function verifyFirebaseToken_(idToken) {
  if (!idToken || idToken.length > 4096) return null;
  var key = props.getProperty('FIREBASE_API_KEY');
  var res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;
  var users = JSON.parse(res.getContentText()).users || [];
  var u = users[0];
  if (!u || !u.email || u.emailVerified !== true) return null;
  return String(u.email).toLowerCase();
}

// 服事者 = 資料夾共用名單（擁有者、編輯者、檢視者）＋ EXTRA_STAFF － BLOCKED_STAFF
function isStaff_(email) {
  var cache = CacheService.getScriptCache();
  var list = cache.get('staff');
  if (!list) {
    var perms = driveGet_('files/' + props.getProperty('ROOT_FOLDER_ID') + '/permissions', { fields: 'permissions(emailAddress,type)', pageSize: 100 }).permissions || [];
    var emails = perms.filter(function (p) { return p.type === 'user' && p.emailAddress; }).map(function (p) { return p.emailAddress.toLowerCase(); });
    emails = emails.concat(splitList_(props.getProperty('EXTRA_STAFF')));
    list = JSON.stringify(emails);
    cache.put('staff', list, 600);
  }
  return JSON.parse(list).indexOf(email) >= 0 && splitList_(props.getProperty('BLOCKED_STAFF')).indexOf(email) < 0;
}

function splitList_(s) { return String(s || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(String); }

function driveGet_(path, params) {
  var res = UrlFetchApp.fetch(driveUrl_(path, params), { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Drive ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}
function driveUrl_(path, params) {
  var q = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  return 'https://www.googleapis.com/drive/v3/' + path + (q ? '?' + q : '');
}

var FOLDER = 'application/vnd.google-apps.folder';
var FILE_FIELDS = 'files(id,name,mimeType,modifiedTime,webViewLink,parents)';

// 一次平行讀很多資料夾的內容
function listChildren_(folderIds) {
  var token = ScriptApp.getOAuthToken();
  var reqs = folderIds.map(function (id) {
    return { url: driveUrl_('files', { q: "'" + id + "' in parents and trashed = false", fields: FILE_FIELDS, pageSize: 200, orderBy: 'modifiedTime desc' }), headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  });
  var out = [];
  UrlFetchApp.fetchAll(reqs).forEach(function (r, i) {
    if (r.getResponseCode() !== 200) return;
    (JSON.parse(r.getContentText()).files || []).forEach(function (f) { f.parentId = folderIds[i]; out.push(f); });
  });
  return out;
}

function dashboard_(force) {
  var cache = CacheService.getScriptCache();
  if (!force) { var hit = cache.get('dashboard'); if (hit) return JSON.parse(hit); }
  DriveApp.getRootFolder(); // 讓 Apps Script 申請 Drive 讀取權限

  var root = props.getProperty('ROOT_FOLDER_ID');
  var names = {};
  var level1 = listChildren_([root]);
  var folders = level1.filter(function (f) { return f.mimeType === FOLDER; });
  folders.forEach(function (f) { names[f.id] = f.name; });
  var level2 = listChildren_(folders.map(function (f) { return f.id; }).slice(0, 80));
  var sub = level2.filter(function (f) { return f.mimeType === FOLDER; }).slice(0, 120);
  sub.forEach(function (f) { names[f.id] = f.name; });
  var level3 = listChildren_(sub.map(function (f) { return f.id; }));

  var files = level1.concat(level2, level3).filter(function (f) { return f.mimeType !== FOLDER; });
  files.sort(function (a, b) { return a.modifiedTime < b.modifiedTime ? 1 : -1; });
  var slim = function (f) { return { name: f.name, url: f.webViewLink, mime: f.mimeType, updated: f.modifiedTime, folder: names[f.parentId] || '' }; };

  var data = {
    generatedAt: new Date().toISOString(),
    announce: announce_(),
    folders: folders.sort(function (a, b) { return a.name < b.name ? -1 : 1; }).map(function (f) { return { name: f.name, url: f.webViewLink }; }),
    recent: files.slice(0, 40).map(slim),
    stats: files.filter(function (f) { return /統計|人數|報表/.test(f.name); }).slice(0, 15).map(slim),
    plans: files.filter(function (f) { return /行事曆|規劃|規畫|計畫/.test(f.name); }).slice(0, 15).map(slim),
  };
  var s = JSON.stringify(data);
  if (s.length < 95000) cache.put('dashboard', s, CACHE_SECONDS);
  return data;
}

// 「服事者公告」文件：在 Google 文件裏改，網站最多 5 分鐘後就會更新
function announce_() {
  var id = props.getProperty('ANNOUNCE_DOC_ID');
  if (!id) return null;
  var meta = driveGet_('files/' + id, { fields: 'name,modifiedTime,webViewLink' });
  var res = UrlFetchApp.fetch(driveUrl_('files/' + id + '/export', { mimeType: 'text/plain' }), { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  var text = res.getResponseCode() === 200 ? res.getContentText().replace(/^﻿/, '').slice(0, 6000) : '';
  return { title: meta.name, updated: meta.modifiedTime, url: meta.webViewLink, text: text };
}

// ---------- 召會生活人數統計（讀「青少年聚會人數統計_總表」各聚會的週報表）----------
var MEETINGS = [
  { key: 'lord', label: '主日', sheet: '主日_週報表' },
  { key: 'group', label: '小排', sheet: '小排_週報表' },
  { key: 'home', label: '家聚會', sheet: '家聚會_週報表' },
  { key: 'gospel', label: '福音出訪', sheet: '福音出訪_週報表' },
  { key: 'prayer', label: '禱告', sheet: '禱告_週報表' },
];

function chlife_(force) {
  var id = props.getProperty('STATS_SHEET_ID');
  if (!id) return null;
  var cache = CacheService.getScriptCache();
  if (!force) { var hit = cache.get('chlife'); if (hit) return JSON.parse(hit); }
  var ss = openStats_(id);
  var data = {
    generatedAt: new Date().toISOString(),
    title: ss.title,
    url: ss.url,
    meetings: MEETINGS.map(function (m) {
      var sh = ss.book.getSheetByName(m.sheet);
      var parsed = sh ? parseReport_(sh.getDataRange().getDisplayValues()) : null;
      return parsed ? Object.assign({ key: m.key, label: m.label }, parsed) : { key: m.key, label: m.label, missing: true };
    }),
  };
  var s = JSON.stringify(data);
  if (s.length < 95000) cache.put('chlife', s, CACHE_SECONDS);
  return data;
}

var SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
function openStats_(id) {
  var meta = driveGet_('files/' + id, { fields: 'id,name,mimeType,modifiedTime,webViewLink', supportsAllDrives: true });
  if (meta.mimeType === SHEET_MIME) return { book: SpreadsheetApp.openById(id), title: meta.name, url: meta.webViewLink };
  // Excel：原檔沒變就沿用上次轉好的副本
  var conv = JSON.parse(props.getProperty('STATS_CONVERTED') || 'null');
  var book = null;
  if (conv && conv.src === id && conv.modified === meta.modifiedTime) {
    try { book = SpreadsheetApp.openById(conv.id); } catch (e) { book = null; }
  }
  if (!book) {
    var newId = convertToSheet_(id, '（網站自動轉換，請勿編輯）' + meta.name.replace(/\.xlsx?$/i, ''));
    if (conv && conv.id) {
      UrlFetchApp.fetch(driveUrl_('files/' + conv.id, {}), { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ trashed: true }), headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    }
    props.setProperty('STATS_CONVERTED', JSON.stringify({ src: id, modified: meta.modifiedTime, id: newId }));
    book = SpreadsheetApp.openById(newId);
  }
  // 連結指向原檔，大家照常在原檔更新
  return { book: book, title: meta.name.replace(/\.xlsx?$/i, ''), url: meta.webViewLink };
}

// Excel → Google 試算表：依序試三種方法，全部失敗才回報錯誤
function convertToSheet_(id, name) {
  var auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  var errors = [];
  var tryFetch = function (label, url, opts) {
    var res = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true, headers: auth }, opts));
    if (res.getResponseCode() === 200) return JSON.parse(res.getContentText()).id;
    errors.push(label + ' ' + res.getResponseCode() + ' ' + res.getContentText().replace(/\s+/g, ' ').slice(0, 120));
    return null;
  };
  // 1. Drive v3 複製並轉換
  var newId = tryFetch('v3copy', driveUrl_('files/' + id + '/copy', { fields: 'id', supportsAllDrives: true }),
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ name: name, mimeType: SHEET_MIME }) });
  // 2. Drive v2 複製（convert=true）
  if (!newId) newId = tryFetch('v2copy', 'https://www.googleapis.com/drive/v2/files/' + id + '/copy?convert=true&supportsAllDrives=true&fields=id',
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ title: name }) });
  // 3. 下載原檔再上傳成 Google 試算表
  if (!newId) {
    var dl = UrlFetchApp.fetch(driveUrl_('files/' + id, { alt: 'media', supportsAllDrives: true }), { headers: auth, muteHttpExceptions: true });
    if (dl.getResponseCode() !== 200) errors.push('download ' + dl.getResponseCode());
    else {
      var boundary = 'tcyp' + Date.now();
      var head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: name, mimeType: SHEET_MIME })
        + '\r\n--' + boundary + '\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n';
      var body = Utilities.newBlob(head).getBytes().concat(dl.getContent()).concat(Utilities.newBlob('\r\n--' + boundary + '--').getBytes());
      newId = tryFetch('upload', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'post', contentType: 'multipart/related; boundary=' + boundary, payload: body });
    }
  }
  if (!newId) throw new Error('Excel 轉換失敗：' + errors.join('｜'));
  return newId;
}

// 週報表 → { months, weeks, units: [{ care, name, base, target, months, avg, weeks }], total }
// 依標題文字找欄位，欄位順序或週數變動都不影響；照顧區服事者姓名等其他欄位不會送出
function parseReport_(v) {
  var h = -1;
  for (var r = 0; r < Math.min(v.length, 10); r++) if (String(v[r][0]).trim() === '照顧區') { h = r; break; }
  if (h < 0) return null;
  var head = v[h].map(function (x) { return String(x).trim(); });
  var above = h > 0 ? v[h - 1].map(function (x) { return String(x).trim(); }) : [];
  var nameCol = head.indexOf('青少年小區');
  var baseCol = head.indexOf('基數');
  var targetCol = head.indexOf('目標');
  var avgCol = head.indexOf('全年平均');
  if (nameCol < 0 || avgCol < 0) return null;
  var monthCols = [], weekCols = [], weeks = [];
  head.forEach(function (x, j) {
    if (/^\d{1,2}月$/.test(x)) monthCols.push(j);
    else if (j > avgCol && /^\d{1,2}\/\d{1,2}$/.test(x)) {
      weekCols.push(j);
      weeks.push(/^\d{1,2}\/\d{1,2}$/.test(above[j] || '') ? above[j] : x); // 上一列是該週主日日期
    }
  });
  var num = function (x) {
    var s = String(x == null ? '' : x).replace(/,/g, '').trim();
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  };
  var pick = function (row) {
    return {
      base: baseCol >= 0 ? num(row[baseCol]) : null,
      target: targetCol >= 0 ? num(row[targetCol]) : null,
      months: monthCols.map(function (j) { return num(row[j]); }),
      avg: num(row[avgCol]),
      weeks: weekCols.map(function (j) { return num(row[j]); }),
    };
  };
  var units = [], total = null, care = '';
  for (var i = h + 1; i < v.length; i++) {
    var row = v[i];
    var name = String(row[nameCol] || '').trim();
    if (String(row[0] || '').trim()) care = String(row[0]).trim();
    if (!name) continue;
    if (/總\s*計|合\s*計/.test(name.replace(/　/g, ''))) { total = pick(row); break; }
    var u = pick(row);
    u.care = care;
    u.name = name;
    units.push(u);
  }
  return { months: monthCols.map(function (j) { return head[j]; }), weeks: weeks, units: units, total: total, hasBase: baseCol >= 0 };
}

// ---------- 在 Apps Script 編輯器裏檢查用 ----------
// 上方函式選單選 testStats → 按「執行」。第一次會要求授權；執行記錄會顯示讀到什麼或錯在哪裏。
// （doPost 只能由網站呼叫，在編輯器直接執行一定會出現 postData 的錯誤，那是正常的）
function testStats() {
  var id = props.getProperty('STATS_SHEET_ID');
  if (!id) { console.log('❌ 還沒設定指令碼屬性 STATS_SHEET_ID'); return; }
  console.log('檔案 ID：' + id);
  var meta = driveGet_('files/' + id, { fields: 'name,mimeType,modifiedTime', supportsAllDrives: true });
  console.log('✅ 讀得到檔案：' + meta.name + '（' + meta.mimeType + '，更新於 ' + meta.modifiedTime + '）');
  var data = chlife_(true);
  data.meetings.forEach(function (m) {
    if (m.missing) { console.log('⚠️ ' + m.label + '：找不到分頁'); return; }
    var last = -1;
    (m.total ? m.total.weeks : []).forEach(function (v, i) { if (v != null) last = i; });
    console.log('✅ ' + m.label + '：' + m.units.length + ' 個小區，最近一週 ' + (m.weeks[last] || '—') + ' 共 ' + (last >= 0 ? m.total.weeks[last] : '—') + ' 人');
  });
  console.log('全部完成，網站上按「重新整理」就看得到。');
}
