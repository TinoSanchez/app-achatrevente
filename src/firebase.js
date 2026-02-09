import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Configuration Firebase - Credentials officiels
const firebaseConfig = {
  apiKey: "AIzaSyCkP0F9Si4gq-yiBsd30nxngrUHznJCJKM",
  authDomain: "appachatrevente.firebaseapp.com",
  projectId: "appachatrevente",
  storageBucket: "appachatrevente.firebasestorage.app",
  messagingSenderId: "227840779045",
  appId: "1:227840779045:web:55a92a581214e72d90f0cc",
  measurementId: "G-VBY1C2CC9R"
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

// Modo offline - localStorage pour l'auth
const LOCAL_USERS_KEY = 'local_app_users';
const LOCAL_SESSION_KEY = 'local_app_session';

function getLocalUsers() {
  try {
    const users = localStorage.getItem(LOCAL_USERS_KEY);
    return users ? JSON.parse(users) : {};
  } catch (e) {
    return {};
  }
}

function saveLocalUsers(users) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn('Cannot save users to localStorage:', e);
  }
}

function getLocalSession() {
  try {
    const session = localStorage.getItem(LOCAL_SESSION_KEY);
    return session ? JSON.parse(session) : null;
  } catch (e) {
    return null;
  }
}

function setLocalSession(user) {
  try {
    if (user) {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    }
  } catch (e) {
    console.warn('Cannot save session to localStorage:', e);
  }
}

// Local auth functions (offline mode)
async function createUserEmailLocal(email, password) {
  if (!email || !password) throw new Error('Email et mot de passe requis');
  
  const users = getLocalUsers();
  if (users[email]) {
    const err = new Error('User already exists');
    err.code = 'auth/email-already-in-use';
    throw err;
  }
  
  if (password.length < 6) {
    const err = new Error('Password too short');
    err.code = 'auth/weak-password';
    throw err;
  }
  
  const userId = 'user_' + Date.now();
  users[email] = {
    uid: userId,
    email: email,
    password: password,
    displayName: email.split('@')[0],
    createdAt: new Date().toISOString()
  };
  
  saveLocalUsers(users);
  
  const user = { uid: userId, email: email, displayName: email.split('@')[0] };
  setLocalSession(user);
  
  return { user };
}

async function signInEmailLocal(email, password) {
  if (!email || !password) throw new Error('Email et mot de passe requis');
  
  const users = getLocalUsers();
  const userData = users[email];
  
  if (!userData) {
    const err = new Error('User not found');
    err.code = 'auth/user-not-found';
    throw err;
  }
  
  if (userData.password !== password) {
    const err = new Error('Wrong password');
    err.code = 'auth/wrong-password';
    throw err;
  }
  
  const user = {
    uid: userData.uid,
    email: userData.email,
    displayName: userData.displayName
  };
  
  setLocalSession(user);
  return { user };
}

function signOutUserLocal() {
  setLocalSession(null);
  return Promise.resolve();
}

function onAuthChangeLocal(cb) {
  // Call immediately with current session
  const session = getLocalSession();
  cb(session);
  
  // Return cleanup function
  return () => {};
}

async function signInWithGoogle() {
  if (!authAvailable) throw new Error('Firebase not configured');
  return signInWithPopup(auth, provider);
}

async function signOutUser() {
  if (!authAvailable) return signOutUserLocal();
  return fbSignOut(auth);
}

function onAuthChange(cb) {
  if (!authAvailable) return onAuthChangeLocal(cb);
  return onAuthStateChanged(auth, cb);
}

async function createUserEmail(email, password) {
  if (!authAvailable) return createUserEmailLocal(email, password);
  return createUserWithEmailAndPassword(auth, email, password);
}

async function signInEmail(email, password) {
  if (!authAvailable) return signInEmailLocal(email, password);
  return signInWithEmailAndPassword(auth, email, password);
}

async function uploadImage(file, userId) {
  // Convertir l'image en base64 pour la stocker dans Firestore
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

export { db, auth, storage, authAvailable, signInWithGoogle, signOutUser, onAuthChange, createUserEmail, signInEmail, uploadImage };