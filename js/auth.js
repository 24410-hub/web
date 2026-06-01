// js/auth.js
import {
  auth
} from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { db } from "./firebase-config.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Auth State Listener ──────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("authModal").classList.remove("active");
    document.getElementById("authModal").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    updateUserUI(user);
    // trigger app init
    window.dispatchEvent(new CustomEvent("userLoggedIn", { detail: user }));
  } else {
    document.getElementById("authModal").classList.add("active");
    document.getElementById("authModal").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
  }
});

function updateUserUI(user) {
  const name = user.displayName || user.email?.split("@")[0] || "User";
  document.getElementById("userName").textContent = name;
  document.getElementById("welcomeName").textContent = name;
  document.getElementById("userAvatar").textContent = name.charAt(0).toUpperCase();
  // Check Discord link for tag
  const tagEl = document.getElementById("userTag");
  if (user.providerData?.some(p => p.providerId === "discord.com")) {
    tagEl.textContent = "Discord 연동";
  } else {
    tagEl.textContent = user.email || "";
  }
}

// ── Switch Tab ───────────────────────────────────────────────
window.switchAuthTab = (tab) => {
  document.getElementById("loginForm").classList.toggle("hidden", tab !== "login");
  document.getElementById("registerForm").classList.toggle("hidden", tab !== "register");
  document.getElementById("loginTab").classList.toggle("active", tab === "login");
  document.getElementById("registerTab").classList.toggle("active", tab === "register");
};

// ── Register ────────────────────────────────────────────────
window.registerUser = async () => {
  const username = document.getElementById("regUsername").value.trim();
  const email    = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const errEl    = document.getElementById("registerError");

  if (!username || !email || !password) {
    errEl.textContent = "모든 필드를 입력해주세요."; return;
  }
  if (password.length < 8) {
    errEl.textContent = "비밀번호는 8자 이상이어야 합니다."; return;
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: username });
    // Save user to DB
    await set(ref(db, `users/${cred.user.uid}`), {
      username,
      email,
      createdAt: Date.now(),
      discordId: null
    });
    errEl.textContent = "";
  } catch (e) {
    errEl.textContent = firebaseErrorMsg(e.code);
  }
};

// ── Login ────────────────────────────────────────────────────
window.loginUser = async () => {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl    = document.getElementById("loginError");
  if (!email || !password) { errEl.textContent = "이메일과 비밀번호를 입력하세요."; return; }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    errEl.textContent = "";
  } catch (e) {
    errEl.textContent = firebaseErrorMsg(e.code);
  }
};

// ── Discord Login (OAuth via Discord — popup redirect) ───────
window.loginWithDiscord = () => {
  // Discord OAuth — redirect to Discord's OAuth page
  // The bot shares the same Firebase UID via a link token stored in DB
  const CLIENT_ID = "1508984668802777238"; // from bot token prefix
  const REDIRECT  = encodeURIComponent(window.location.origin + window.location.pathname);
  const SCOPE     = "identify+email";
  // Note: You need to set up a tiny redirect handler (discord-callback.html)
  window.location.href =
    `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT}&response_type=token&scope=${SCOPE}`;
};

// ── Logout ───────────────────────────────────────────────────
window.logoutUser = async () => {
  await signOut(auth);
};

// ── Error messages ───────────────────────────────────────────
function firebaseErrorMsg(code) {
  const map = {
    "auth/email-already-in-use":     "이미 사용 중인 이메일입니다.",
    "auth/invalid-email":            "유효하지 않은 이메일 형식입니다.",
    "auth/weak-password":            "비밀번호가 너무 약합니다.",
    "auth/user-not-found":           "등록된 계정이 없습니다.",
    "auth/wrong-password":           "비밀번호가 틀렸습니다.",
    "auth/too-many-requests":        "잠시 후 다시 시도해주세요.",
    "auth/invalid-credential":       "이메일 또는 비밀번호가 올바르지 않습니다.",
  };
  return map[code] || `오류가 발생했습니다 (${code})`;
}

export { auth };
