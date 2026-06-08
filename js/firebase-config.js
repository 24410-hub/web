// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCPx_DWK6umYdIOEK26OA1kGIZ0dP26FxM",
  authDomain: "study-2347b.firebaseapp.com",
  databaseURL: "https://study-2347b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "study-2347b",
  storageBucket: "study-2347b.firebasestorage.app",
  messagingSenderId: "536095687706",
  appId: "1:536095687706:web:159e2bdf660bfe5191bda3",
  measurementId: "G-D6C4N6WGFF"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
