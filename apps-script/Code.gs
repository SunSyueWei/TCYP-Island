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
 */
var CACHE_SECONDS = 300; // Drive 資料最多 5 分鐘更新一次
var props = PropertiesService.getScriptProperties();

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var email = verifyFirebaseToken_(String(req.idToken || ''));
    if (!email) return json_({ ok: false, error: 'unauthenticated' });
    if (!isStaff_(email)) return json_({ ok: false, error: 'forbidden' });
    if (req.action === 'whoami') return json_({ ok: true, email: email });
    if (req.action === 'dashboard') return json_({ ok: true, email: email, data: dashboard_(req.force === true) });
    return json_({ ok: false, error: 'bad-request' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
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
