// esbuild 打包入口：只帶網站需要的 Firebase 功能（Auth + Firestore Lite）
// 重建：npm run build:firebase
export { initializeApp } from 'firebase/app';
export { getAuth, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup, onAuthStateChanged, signOut, deleteUser } from 'firebase/auth';
export {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, limit, writeBatch, serverTimestamp,
} from 'firebase/firestore/lite';
