// 島民資料的存取
// - 沒設定 Firebase：「我的島民」只存在這台裝置的瀏覽器裏（訪客草稿）
// - 設定好 Firebase：用 Google 帳號登入，島民存到雲端，大家都看得到
//
// 雲端資料（規則見 firestore.rules）：
//   islanders/{publicId}  公開：外觀＋暱稱＋hidden。publicId 是隨機碼，和帳號 UID 無關
//   claims/{publicId}     不公開：publicId 屬於哪個帳號
//   owners/{uid}          只有本人：我的 publicId、上次更新時間
//   reports/{uid_pid}     只有管理員：檢舉
import { FIREBASE_CONFIG } from './firebase-config.js';
import { sanitize } from './avatar-data.js';

const GUEST_KEY = 'tcyp-avatar-v2:guest';
const userKey = (uid) => `tcyp-avatar-v2:u:${uid}`;
const OTHERS_KEY = 'tcyp-islanders-cache-v2';
const OTHERS_TTL = 10 * 60 * 1000; // 其他人的島民最多 10 分鐘才向雲端重新讀一次
const MAX_ISLANDERS = 300;         // 必須和 firestore.rules 的 list 上限一致

export const cloudEnabled = !!FIREBASE_CONFIG;

// ---------- 本機 ----------
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無痕模式等 */ } };

// 舊版（v1）的快取可能混著別的帳號的資料，直接清掉，不當成任何人的草稿
try { localStorage.removeItem('tcyp-avatar-v1'); } catch { /* ignore */ }

// 訪客草稿（沒登入時捏的）；帳號的快取依 UID 分開存
export function loadDraft(uid = null) { const a = read(uid ? userKey(uid) : GUEST_KEY); return a ? sanitize(a) : null; }
export function saveDraft(avatar, uid = null) { write(uid ? userKey(uid) : GUEST_KEY, avatar ? sanitize(avatar) : null); }

// ---------- 雲端（延遲載入 Firebase，沒用到就不下載）----------
let fbPromise = null;
function fb() {
  if (!cloudEnabled) return Promise.resolve(null);
  fbPromise ||= import('./vendor/firebase.js').then((m) => {
    const app = m.initializeApp(FIREBASE_CONFIG);
    return { m, auth: m.getAuth(app), db: m.getFirestore(app) };
  }).catch((err) => { console.error('Firebase 載入失敗', err); return null; });
  return fbPromise;
}

let currentUser = null;
const uidNow = () => currentUser?.uid || null;

export function onUser(cb) {
  // 等主程式的宣告都跑完再通知（避免同步呼叫時用到還沒宣告的變數）
  if (!cloudEnabled) { queueMicrotask(() => cb(null)); return; }
  fb().then((f) => {
    if (!f) return cb(null);
    f.m.onAuthStateChanged(f.auth, (u) => { currentUser = u; cb(u ? { uid: u.uid } : null); });
  });
}

// LINE、IG、FB 的內建瀏覽器不能用 Google 登入
export function inAppBrowser() {
  const ua = navigator.userAgent;
  if (/\bLine\//i.test(ua)) return 'line';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  return null;
}

export async function signIn() {
  const app = inAppBrowser();
  if (app === 'line') {
    // LINE 支援這個參數，會改用手機預設瀏覽器打開
    const u = new URL(location.href);
    u.searchParams.set('openExternalBrowser', '1');
    location.href = u.toString();
    return { redirected: true };
  }
  if (app) throw new Error('in-app');
  const f = await fb();
  if (!f) throw new Error('unavailable');
  const provider = new f.m.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await f.m.signInWithPopup(f.auth, provider);
  return { redirected: false };
}

export async function signOutUser() {
  const f = await fb();
  if (f) await f.m.signOut(f.auth);
}

// 隨機的公開 ID（20 碼英數）
function newPublicId() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return [...bytes].map((b) => abc[b % abc.length]).join('');
}

// 讀我的島民：{ publicId, avatar, hidden } 或 null；legacy 表示還是舊版（文件 ID = UID）的資料
export async function loadMyIslander() {
  const f = await fb();
  const uid = uidNow();
  if (!f || !uid) return null;
  const { m, db } = f;
  const owner = await m.getDoc(m.doc(db, 'owners', uid));
  if (owner.exists()) {
    const publicId = owner.data().publicId;
    const snap = await m.getDoc(m.doc(db, 'islanders', publicId));
    if (!snap.exists()) return null;
    const data = snap.data();
    const avatar = sanitize(data);
    if (uidNow() === uid) saveDraft(avatar, uid);
    return { publicId, avatar, hidden: data.hidden === true };
  }
  const legacy = await m.getDoc(m.doc(db, 'islanders', uid));
  if (legacy.exists()) return { publicId: null, avatar: sanitize(legacy.data()), hidden: false, legacy: true };
  return null;
}

// 儲存我的島民（先寫雲端，成功後才更新本機快取）
export async function saveMine(avatar) {
  const a = sanitize(avatar);
  const f = await fb();
  const uid = uidNow();
  if (!f || !uid) { saveDraft(a); return { where: 'local' }; }
  const { m, db } = f;
  const owner = await m.getDoc(m.doc(db, 'owners', uid));
  const batch = m.writeBatch(db);
  let publicId;
  if (owner.exists()) {
    publicId = owner.data().publicId;
    batch.update(m.doc(db, 'owners', uid), { updatedAt: m.serverTimestamp() });
    // merge：不送 hidden，保留管理員設定的狀態
    batch.set(m.doc(db, 'islanders', publicId), a, { merge: true });
  } else {
    publicId = newPublicId();
    batch.set(m.doc(db, 'owners', uid), { publicId, updatedAt: m.serverTimestamp() });
    batch.set(m.doc(db, 'claims', publicId), { uid });
    batch.set(m.doc(db, 'islanders', publicId), { ...a, hidden: false });
    batch.delete(m.doc(db, 'islanders', uid)); // 舊版資料搬家
  }
  try {
    await batch.commit();
  } catch (err) {
    if (err.code === 'permission-denied' && owner.exists()) throw Object.assign(new Error('too-fast'), { code: 'too-fast' });
    throw err;
  }
  if (uidNow() === uid) saveDraft(a, uid);
  invalidateOthers();
  return { where: 'cloud', publicId };
}

// 刪除我的島民與帳號。雲端成功後才清本機；登入太久需要重新驗證時會再跳一次 Google 視窗
export async function deleteMine() {
  const f = await fb();
  const uid = uidNow();
  if (!f || !uid) { saveDraft(null); return { where: 'local' }; }
  const { m, db, auth } = f;
  const owner = await m.getDoc(m.doc(db, 'owners', uid));
  const batch = m.writeBatch(db);
  if (owner.exists()) {
    const pid = owner.data().publicId;
    batch.delete(m.doc(db, 'islanders', pid));
    batch.delete(m.doc(db, 'claims', pid));
    batch.delete(m.doc(db, 'owners', uid));
  }
  batch.delete(m.doc(db, 'islanders', uid)); // 舊版資料（不存在也沒關係）
  await batch.commit();
  saveDraft(null, uid);
  invalidateOthers();
  // 也刪除 Google 登入紀錄（Firebase Authentication 裏的 Email、名稱、大頭貼網址）
  try {
    await m.deleteUser(auth.currentUser);
  } catch (err) {
    if (err.code !== 'auth/requires-recent-login') throw err;
    await m.reauthenticateWithPopup(auth.currentUser, new m.GoogleAuthProvider());
    await m.deleteUser(auth.currentUser);
  }
  return { where: 'cloud' };
}

// ---------- 其他人的島民 ----------
function invalidateOthers() { write(OTHERS_KEY, null); }

// 回傳 [{ pid, avatar }]；10 分鐘內重複打開網站會用快取，不再讀雲端
export async function loadOthers({ force = false } = {}) {
  if (!cloudEnabled) return [];
  const cached = read(OTHERS_KEY);
  if (!force && cached && Date.now() - cached.t < OTHERS_TTL && Array.isArray(cached.list)) {
    return cached.list.map((x) => ({ pid: x.pid, avatar: sanitize(x.avatar) }));
  }
  const f = await fb();
  if (!f) return [];
  const { m, db } = f;
  const snap = await m.getDocs(m.query(m.collection(db, 'islanders'), m.where('hidden', '==', false), m.limit(MAX_ISLANDERS)));
  const list = snap.docs.map((d) => ({ pid: d.id, avatar: sanitize(d.data()) }));
  write(OTHERS_KEY, { t: Date.now(), list });
  return list;
}

// ---------- 檢舉與管理 ----------
export const REPORT_REASONS = [['name', '不當暱稱'], ['impersonation', '冒充他人'], ['bullying', '霸凌或攻擊'], ['other', '其他']];

export async function report(pid, reason) {
  const f = await fb();
  const uid = uidNow();
  if (!f || !uid) throw Object.assign(new Error('signin'), { code: 'signin' });
  const { m, db } = f;
  await m.setDoc(m.doc(db, 'reports', `${uid}_${pid}`), { target: pid, reason, reporter: uid, createdAt: m.serverTimestamp() });
}

export async function isAdmin() {
  const f = await fb();
  const uid = uidNow();
  if (!f || !uid) return false;
  try { return (await f.m.getDoc(f.m.doc(f.db, 'admins', uid))).exists(); } catch { return false; }
}

// 管理員：被檢舉的島民（依被檢舉次數排序）
export async function adminReports() {
  const f = await fb();
  const { m, db } = f;
  const snap = await m.getDocs(m.query(m.collection(db, 'reports'), m.limit(200)));
  const byTarget = new Map();
  for (const d of snap.docs) {
    const r = d.data();
    const e = byTarget.get(r.target) || { pid: r.target, reasons: {}, ids: [] };
    e.reasons[r.reason] = (e.reasons[r.reason] || 0) + 1;
    e.ids.push(d.id);
    byTarget.set(r.target, e);
  }
  const out = [];
  for (const e of byTarget.values()) {
    const s = await m.getDoc(m.doc(db, 'islanders', e.pid));
    out.push({ ...e, name: s.exists() ? sanitize(s.data()).name : '（已刪除）', hidden: s.exists() ? s.data().hidden === true : null, count: e.ids.length });
  }
  return out.sort((a, b) => b.count - a.count);
}

export async function adminSetHidden(pid, hidden) {
  const f = await fb();
  await f.m.updateDoc(f.m.doc(f.db, 'islanders', pid), { hidden });
  invalidateOthers();
}

export async function adminClearReports(ids) {
  const f = await fb();
  const batch = f.m.writeBatch(f.db);
  ids.forEach((id) => batch.delete(f.m.doc(f.db, 'reports', id)));
  await batch.commit();
}

export function myUid() { return uidNow(); }

// 給服事者專區用：目前登入者的 Firebase ID token（約一小時有效，SDK 會自動更新）
export async function idToken() { return currentUser ? currentUser.getIdToken() : null; }
