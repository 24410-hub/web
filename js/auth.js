// js/auth.js
import { auth, googleProvider, db } from "./firebase-config.js";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  ref, set, get, update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Google 로그인 ────────────────────────────────────────────
window.loginWithGoogle = async () => {
  const errEl = document.getElementById("loginError");
  try {
    errEl.textContent = "로그인 중...";
    await signInWithPopup(auth, googleProvider);
    errEl.textContent = "";
  } catch (e) {
    errEl.textContent = "로그인 실패: " + (e.message || e.code);
  }
};

// ── Auth State ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById("authModal").classList.remove("active");
    document.getElementById("authModal").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    updateUserUI(user);

    // 유저 프로필 DB에 저장
    const userRef = ref(db, `users/${user.uid}`);
    const snap = await get(userRef);
    if (!snap.exists()) {
      await set(userRef, {
        username: user.displayName || user.email?.split("@")[0] || "User",
        email: user.email || "",
        photoURL: user.photoURL || "",
        createdAt: Date.now(),
        discordId: null
      });
    } else {
      // photoURL 갱신
      await update(userRef, {
        photoURL: user.photoURL || snap.val().photoURL || "",
        username: user.displayName || snap.val().username
      });
    }

    // 디스코드 링크 코드 확인 및 생성
    await ensureLinkCode(user.uid);

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
  document.getElementById("userTag").textContent = "Google";

  const avatarImg = document.getElementById("userAvatar");
  const avatarFallback = document.getElementById("userAvatarFallback");

  if (user.photoURL) {
    avatarImg.src = user.photoURL;
    avatarImg.style.display = "block";
    avatarFallback.classList.remove("show");
  } else {
    avatarImg.style.display = "none";
    avatarFallback.textContent = name.charAt(0).toUpperCase();
    avatarFallback.classList.add("show");
  }
}

// ── 링크 코드 생성 (Discord 봇 연동) ───────────────────────
async function ensureLinkCode(uid) {
  const codeRef = ref(db, `linkCodes/${uid}`);
  const snap = await get(codeRef);

  let code;
  if (snap.exists()) {
    code = snap.val().code;
  } else {
    // 6자리 대문자+숫자 코드 생성
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await set(codeRef, { code, createdAt: Date.now(), uid });
  }

  // 홈화면에 코드 표시
  const banner = document.getElementById("discordLinkBanner");
  const display = document.getElementById("linkCodeDisplay");
  if (banner && display) {
    display.textContent = code;
    banner.style.display = "flex";
    window._linkCode = code;
  }
}

window.copyLinkCode = () => {
  const code = document.getElementById("linkCodeDisplay")?.textContent;
  if (code) {
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.querySelector(".btn-copy");
      if (btn) { btn.textContent = "복사됨!"; setTimeout(() => { btn.textContent = "복사"; }, 1500); }
    });
  }
};

// ── 로그아웃 ─────────────────────────────────────────────────
window.logoutUser = async () => {
  await signOut(auth);
};

export { auth };
