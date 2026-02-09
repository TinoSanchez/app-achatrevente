import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// REMPLACEZ CES VALEURS PAR CELLES DE VOTRE CONSOLE FIREBASE
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

let app = null;
let db = null;
let storage = null;
let auth = null;
let authAvailable = false;

try {
  if (firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('YOUR_API_KEY')) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    auth = getAuth(app);
    authAvailable = true;
  }
} catch (e) {
  console.warn('Firebase init failed:', e);
}

const provider = authAvailable ? new GoogleAuthProvider() : null;

async function signInWithGoogle() {
  if (!authAvailable) throw new Error('Firebase not configured');
  return signInWithPopup(auth, provider);
}

async function signOutUser() {
  if (!authAvailable) throw new Error('Firebase not configured');
  return fbSignOut(auth);
}

function onAuthChange(cb) {
  if (!authAvailable) return () => {};
  return onAuthStateChanged(auth, cb);
}

async function createUserEmail(email, password) {
  if (!authAvailable) throw new Error('Firebase not configured');
  return createUserWithEmailAndPassword(auth, email, password);
}

async function signInEmail(email, password) {
  if (!authAvailable) throw new Error('Firebase not configured');
  return signInWithEmailAndPassword(auth, email, password);
}

async function uploadImage(file, userId) {
  if (!authAvailable || !storage) throw new Error('Firebase Storage not configured');
  const timestamp = Date.now();
  const filename = `${userId}/${timestamp}_${file.name}`;
  const storageRef = ref(storage, `produits/${filename}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export { db, auth, storage, authAvailable, signInWithGoogle, signOutUser, onAuthChange, createUserEmail, signInEmail, uploadImage };