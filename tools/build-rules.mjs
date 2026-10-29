// 由 avatar.js 的選項產生 firestore.rules，確保前端選項和後端白名單一致
// 用法：npm run build:rules
import { writeFileSync } from 'node:fs';
import { OPTIONS } from '../avatar-data.js';

const list = (xs) => `[${xs.map((x) => `'${x}'`).join(', ')}]`;
const ids = (k) => OPTIONS[k].map(([id]) => id);
const FIELDS = ['v', 'name', 'gender', 'skin', 'hair', 'hairColor', 'hat', 'hatColor', 'top', 'topColor', 'bottom', 'bottomColor', 'shoes', 'acc', 'accColor', 'hidden'];

const rules = `rules_version = '2';
// 台中青少年 TCYP：島民資料（此檔由 tools/build-rules.mjs 產生，請改產生器再重建）
//
// islanders/{publicId}  公開的島民外觀與暱稱。publicId 是隨機碼，不是帳號 UID。
// claims/{publicId}     publicId 屬於哪個帳號（不公開）
// owners/{uid}          我的 publicId、上次更新時間（只有本人讀得到；用來限制更新頻率）
// reports/{uid_pid}     檢舉（只有管理員讀得到）
// admins/{uid}          管理員名單（在 Firebase 主控台手動新增）
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function path(col, id) { return /databases/$(database)/documents/$(col)/$(id); }
    function isAdmin() { return signedIn() && exists(path('admins', request.auth.uid)); }
    function owns(pid) { return signedIn() && exists(path('claims', pid)) && get(path('claims', pid)).data.uid == request.auth.uid; }
    function ownsAfter(pid) { return signedIn() && getAfter(path('claims', pid)).data.uid == request.auth.uid; }
    // 同一批寫入有更新 owners/{uid}.updatedAt（那裏限制了更新頻率）
    function stamped() { return getAfter(path('owners', request.auth.uid)).data.updatedAt == request.time; }
    function isPid(v) { return v is string && v.matches('^[A-Za-z0-9]{20}$'); }

    function validIslander(d) {
      return d.keys().hasOnly(${list(FIELDS)})
        && d.keys().hasAll(${list(FIELDS)})
        && d.v == 1
        && d.name is string && d.name.size() <= 8
        && d.gender in ${list(ids('gender'))}
        && d.skin in ${list(OPTIONS.skin)}
        && d.hairColor in ${list(OPTIONS.hairColor)}
        && d.hair in ${list(ids('hair'))}
        && d.hat in ${list(ids('hat'))}
        && d.top in ${list(ids('top'))}
        && d.bottom in ${list(ids('bottom'))}
        && d.hatColor in cloth() && d.topColor in cloth() && d.bottomColor in cloth() && d.shoes in cloth() && d.accColor in cloth()
        && d.acc is list && d.acc.size() <= ${OPTIONS.acc.length} && d.acc.hasOnly(${list(ids('acc'))})
        && d.hidden is bool;
    }
    function cloth() { return ${list(OPTIONS.cloth)}; }

    match /islanders/{pid} {
      // 被管理員隱藏的島民，只有本人和管理員讀得到
      allow get: if resource.data.get('hidden', true) == false || isAdmin() || owns(pid) || (signedIn() && pid == request.auth.uid);
      allow list: if request.query.limit <= 300 && (resource.data.hidden == false || isAdmin());
      allow create: if isPid(pid) && ownsAfter(pid) && stamped() && validIslander(request.resource.data) && request.resource.data.hidden == false;
      allow update: if (ownsAfter(pid) && stamped() && validIslander(request.resource.data) && request.resource.data.hidden == resource.data.hidden)
        || (isAdmin() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['hidden']) && request.resource.data.hidden is bool);
      // 第二個條件：刪除舊版（文件 ID = UID）的資料
      allow delete: if owns(pid) || (signedIn() && pid == request.auth.uid);
    }

    match /claims/{pid} {
      allow read: if false;
      allow create: if signedIn() && isPid(pid)
        && request.resource.data.keys().hasOnly(['uid']) && request.resource.data.uid == request.auth.uid
        && getAfter(path('owners', request.auth.uid)).data.publicId == pid;
      allow delete: if signedIn() && resource.data.uid == request.auth.uid;
    }

    match /owners/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
      allow create: if signedIn() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['publicId', 'updatedAt'])
        && isPid(request.resource.data.publicId)
        && request.resource.data.updatedAt == request.time;
      // 每 10 秒最多更新一次島民
      allow update: if signedIn() && request.auth.uid == uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['updatedAt'])
        && request.resource.data.updatedAt == request.time
        && request.time > resource.data.updatedAt + duration.value(10, 's');
      allow delete: if signedIn() && request.auth.uid == uid;
    }

    match /reports/{rid} {
      allow create: if signedIn()
        && rid == request.auth.uid + '_' + request.resource.data.target
        && request.resource.data.keys().hasOnly(['target', 'reason', 'reporter', 'createdAt'])
        && isPid(request.resource.data.target)
        && request.resource.data.reason in ['name', 'impersonation', 'bullying', 'other']
        && request.resource.data.reporter == request.auth.uid
        && request.resource.data.createdAt == request.time;
      allow read, delete: if isAdmin();
    }

    match /admins/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
    }
  }
}
`;
writeFileSync(new URL('../firestore.rules', import.meta.url), rules);
console.log('firestore.rules written');
