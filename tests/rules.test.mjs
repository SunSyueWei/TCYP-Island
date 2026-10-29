// Firestore 規則測試：在本機模擬器上驗證正常使用、攻擊與異常資料。
// 用法：cd tests && npm install && npm test（需要 Java）
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, limit, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { randomAvatar, seeded, sanitize } from '../avatar-data.js';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-tcyp', firestore: { rules: RULES, host: '127.0.0.1', port: 8089 } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const pidOf = (s) => (s + 'xxxxxxxxxxxxxxxxxxxx').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 20);
const avatar = (over = {}) => ({ ...sanitize(randomAvatar(seeded(7))), name: '小明', hidden: false, ...over });
const db = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

// 網站實際用的建立流程：一批寫入 owners + claims + islanders
function createBatch(d, uid, pid, data = avatar()) {
  const b = writeBatch(d);
  b.set(doc(d, 'owners', uid), { publicId: pid, updatedAt: serverTimestamp() });
  b.set(doc(d, 'claims', pid), { uid });
  b.set(doc(d, 'islanders', pid), data);
  return b.commit();
}
async function seed(fn) { await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore())); }
async function seedIslander(uid, pid, data = avatar(), updatedAt = Timestamp.fromMillis(Date.now() - 60000)) {
  await seed(async (d) => {
    await setDoc(doc(d, 'owners', uid), { publicId: pid, updatedAt });
    await setDoc(doc(d, 'claims', pid), { uid });
    await setDoc(doc(d, 'islanders', pid), data);
  });
}
const visibleQuery = (d, n = 300) => query(collection(d, 'islanders'), where('hidden', '==', false), limit(n));

test('建立：正常流程成功', async () => { await assertSucceeds(createBatch(db('alice'), 'alice', pidOf('alicepid'))); });

test('建立：網站隨機產生的 40 種外觀都能通過驗證', async () => {
  const r = seeded(99);
  for (let i = 0; i < 40; i++) {
    const a = { ...sanitize(randomAvatar(r)), name: '測試' + i, hidden: false };
    await assertSucceeds(createBatch(db('u' + i), 'u' + i, pidOf('p' + i + 'abc'), a));
  }
});

test('建立：沒登入、或少了 claims／owners 都會被擋', async () => {
  await assertFails(createBatch(db(null), 'anon', pidOf('anon')));
  await assertFails(setDoc(doc(db('bob'), 'islanders', pidOf('bobpid')), avatar()));
});

test('建立：publicId 不能用 UID 長度或怪字元', async () => {
  await assertFails(createBatch(db('alice'), 'alice', 'alice-uid-28-chars-xxxxxxxxx'));
});

test('驗證：不合法的欄位全部擋下', async () => {
  const bad = [
    { acc: ['x'.repeat(5000)] }, { acc: ['glasses', { a: 1 }] }, { acc: ['glasses', 'bow', 'headphones', 'backpack', 'scarf', 'glasses'] },
    { name: '一二三四五六七八九' }, { skin: '#000000' }, { hat: 'crown' }, { hair: 'mohawk' }, { topColor: '#ffffff' },
    { hidden: true }, { extra: 'x' }, { v: 2 }, { gender: 'x' },
  ];
  for (const [i, over] of bad.entries()) await assertFails(createBatch(db('e' + i), 'e' + i, pidOf('err' + i), avatar(over)));
  const missing = avatar(); delete missing.shoes;
  await assertFails(createBatch(db('m1'), 'm1', pidOf('miss'), missing));
});

test('暱稱 8 個中文字可以存', async () => { await assertSucceeds(createBatch(db('c8'), 'c8', pidOf('c8pid'), avatar({ name: '一二三四五六七八' }))); });

test('搶別人的 publicId：無法認領、也無法改別人的島民', async () => {
  const victim = pidOf('victimpid');
  await seedIslander('victim', victim);
  await assertFails(createBatch(db('mallory'), 'mallory', victim, avatar({ name: '冒充' })));
  const d = db('mallory');
  const b = writeBatch(d);
  b.set(doc(d, 'owners', 'mallory'), { publicId: victim, updatedAt: serverTimestamp() });
  b.set(doc(d, 'islanders', victim), avatar({ name: '冒充' }), { merge: true });
  await assertFails(b.commit());
  await assertFails(deleteDoc(doc(d, 'islanders', victim)));
});

test('更新：10 秒內不能再更新，超過可以；不能自己解除隱藏', async () => {
  const pid = pidOf('ratepid');
  await seedIslander('rate', pid, avatar(), Timestamp.now());
  const d = db('rate');
  const upd = (data) => { const b = writeBatch(d); b.update(doc(d, 'owners', 'rate'), { updatedAt: serverTimestamp() }); b.set(doc(d, 'islanders', pid), data, { merge: true }); return b.commit(); };
  await assertFails(upd({ name: '太快' }));
  await seedIslander('rate', pid, avatar(), Timestamp.fromMillis(Date.now() - 60000));
  await assertSucceeds(upd({ name: '可以' }));
  // 沒帶 owners 時間戳就直接改 → 擋下（避免繞過頻率限制）
  await assertFails(setDoc(doc(d, 'islanders', pid), { name: '繞過' }, { merge: true }));
  await seedIslander('rate', pid, avatar({ hidden: true }), Timestamp.fromMillis(Date.now() - 60000));
  await assertFails(upd({ hidden: false }));
  await assertSucceeds(upd({ name: '仍隱藏' }));
});

test('讀取：訪客只能用 hidden==false 且最多 300 筆查詢', async () => {
  await seedIslander('a', pidOf('apid'));
  await seedIslander('h', pidOf('hpid'), avatar({ hidden: true }));
  const d = db(null);
  const snap = await assertSucceeds(getDocs(visibleQuery(d)));
  assert.equal(snap.size, 1);
  await assertFails(getDocs(visibleQuery(d, 301)));
  await assertFails(getDocs(query(collection(d, 'islanders'), limit(10))));
  await assertSucceeds(getDoc(doc(d, 'islanders', pidOf('apid'))));
  await assertFails(getDoc(doc(d, 'islanders', pidOf('hpid'))));
  await assertSucceeds(getDoc(doc(db('h'), 'islanders', pidOf('hpid'))));
});

test('私人資料：claims 誰都讀不到，owners 只有本人', async () => {
  await seedIslander('a', pidOf('apid'));
  await assertFails(getDoc(doc(db(null), 'claims', pidOf('apid'))));
  await assertFails(getDoc(doc(db('a'), 'claims', pidOf('apid'))));
  await assertFails(getDoc(doc(db('b'), 'owners', 'a')));
  await assertSucceeds(getDoc(doc(db('a'), 'owners', 'a')));
  await assertFails(getDocs(query(collection(db('b'), 'owners'), limit(5))));
});

test('管理員：只能改 hidden；一般人不行', async () => {
  const pid = pidOf('target');
  await seedIslander('t', pid);
  await seed((d) => setDoc(doc(d, 'admins', 'boss'), { note: 'admin' }));
  await assertSucceeds(updateDoc(doc(db('boss'), 'islanders', pid), { hidden: true }));
  await assertFails(updateDoc(doc(db('boss'), 'islanders', pid), { name: '改名' }));
  await assertFails(updateDoc(doc(db('rando'), 'islanders', pid), { hidden: true }));
  await assertSucceeds(getDocs(query(collection(db('boss'), 'islanders'), limit(50))));
  await assertSucceeds(getDoc(doc(db('boss'), 'admins', 'boss')));
  await assertFails(getDoc(doc(db('rando'), 'admins', 'boss')));
});

test('檢舉：登入者可送出，只有管理員看得到', async () => {
  const pid = pidOf('target');
  await seed((d) => setDoc(doc(d, 'admins', 'boss'), { note: 'admin' }));
  const rep = (uid, data) => setDoc(doc(db(uid), 'reports', `${uid}_${pid}`), { target: pid, reason: 'name', reporter: uid, createdAt: serverTimestamp(), ...data });
  await assertSucceeds(rep('carol', {}));
  await assertFails(rep('dave', { reason: 'spam' }));
  await assertFails(rep('erin', { reporter: 'someone' }));
  await assertFails(setDoc(doc(db(null), 'reports', `x_${pid}`), { target: pid, reason: 'name', reporter: 'x', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db('carol'), 'reports', `fake_${pid}`), { target: pid, reason: 'name', reporter: 'carol', createdAt: serverTimestamp() }));
  await assertFails(getDocs(query(collection(db('carol'), 'reports'), limit(5))));
  const s = await assertSucceeds(getDocs(query(collection(db('boss'), 'reports'), limit(5))));
  assert.equal(s.size, 1);
  await assertSucceeds(deleteDoc(doc(db('boss'), 'reports', `carol_${pid}`)));
});

test('刪除：本人可整批刪除；別人不行', async () => {
  const pid = pidOf('delpid');
  await seedIslander('del', pid);
  await assertFails(deleteDoc(doc(db('other'), 'islanders', pid)));
  const d = db('del');
  const b = writeBatch(d);
  b.delete(doc(d, 'islanders', pid)); b.delete(doc(d, 'claims', pid)); b.delete(doc(d, 'owners', 'del'));
  await assertSucceeds(b.commit());
});

test('舊版資料（文件 ID = UID）：本人讀得到、刪得掉，訪客列表看不到', async () => {
  const legacy = avatar(); delete legacy.hidden;
  await seed((d) => setDoc(doc(d, 'islanders', 'legacyUid'), { ...legacy, updatedAt: Timestamp.now() }));
  await assertSucceeds(getDoc(doc(db('legacyUid'), 'islanders', 'legacyUid')));
  const s = await getDocs(visibleQuery(db(null)));
  assert.equal(s.size, 0);
  await assertSucceeds(deleteDoc(doc(db('legacyUid'), 'islanders', 'legacyUid')));
});
