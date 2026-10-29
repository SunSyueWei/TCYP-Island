// Firebase 專案設定（島民帳號與雲端儲存）
// 這組設定本來就會公開在網頁上，安全性由 firestore.rules 把關。
// 改成 null 可以關閉帳號功能（島民只存在使用者自己的裝置）。
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCgcfCK3ehP2VumR6osITBkR8fQmy_pcuY',
  authDomain: 'tcyp-island.firebaseapp.com',
  projectId: 'tcyp-island',
  storageBucket: 'tcyp-island.firebasestorage.app',
  messagingSenderId: '149206435777',
  appId: '1:149206435777:web:3488bae4ddf37bfd439140',
};
