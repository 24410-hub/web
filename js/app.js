// js/app.js
import { db } from "./firebase-config.js";
import { auth } from "./auth.js";
import {
  ref, set, get, push, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─── Apps Script 프록시 URL ───────────────────────────────────
// Code.gs 배포 후 여기에 붙여넣기
// 예) "https://script.google.com/macros/s/XXXXXXXXXX/exec"
const GAS_PROXY_URL = "여기에_배포된_Apps_Script_URL_붙여넣기";

// ─── State ────────────────────────────────────────────────────
let currentUser         = null;
let currentPlaylistId   = null;
let currentPlaylistSongs = [];
let ytPlayer            = null;
let playerIndex         = 0;
let playerPlaying       = false;
let communityDetailUid  = null;
let communityDetailPlid = null;
let lastAIJudgeText     = "";
let ttsAudio            = null;

// ─── YouTube IFrame API ──────────────────────────────────────
const ytScript = document.createElement("script");
ytScript.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(ytScript);

window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player("youtubePlayer", {
    height: "100%", width: "100%",
    playerVars: { autoplay: 0, controls: 1, modestbranding: 1, rel: 0 },
    events: { onStateChange: onPlayerStateChange }
  });
};

function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.ENDED) playerNext();
  if (e.data === YT.PlayerState.PLAYING) {
    playerPlaying = true;
    document.getElementById("playPauseBtn").textContent = "⏸";
  }
  if (e.data === YT.PlayerState.PAUSED) {
    playerPlaying = false;
    document.getElementById("playPauseBtn").textContent = "▶";
  }
}

// ─── App Init ────────────────────────────────────────────────
window.addEventListener("userLoggedIn", (e) => {
  currentUser = e.detail;
  loadStats();
  loadRecentPlaylists();
  loadPlaylistSelectOptions();
});

// ─── View Routing ────────────────────────────────────────────
const VIEW_IDS = ["homeView","playlistsView","addView","playlistDetailView","communityView","communityDetailView"];
const NAV_MAP  = { home: 0, playlists: 1, add: 2, community: 3 };

window.showView = (name) => {
  VIEW_IDS.forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove("active");
    el.classList.add("hidden");
  });
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  const viewMap = {
    home: "homeView", playlists: "playlistsView",
    add: "addView", community: "communityView"
  };
  const viewId = viewMap[name];
  if (viewId) {
    document.getElementById(viewId).classList.add("active");
    document.getElementById(viewId).classList.remove("hidden");
    const navItems = document.querySelectorAll(".nav-item");
    if (NAV_MAP[name] !== undefined) navItems[NAV_MAP[name]].classList.add("active");
  }

  if (name === "playlists")  loadAllPlaylists();
  if (name === "add")        loadPlaylistSelectOptions();
  if (name === "home")       { loadStats(); loadRecentPlaylists(); }
  if (name === "community")  loadCommunityPlaylists();
};

// ─── Stats ───────────────────────────────────────────────────
async function loadStats() {
  if (!currentUser) return;
  const snap = await get(ref(db, `playlists/${currentUser.uid}`));
  let plCount = 0, songCount = 0;
  if (snap.exists()) {
    const data = snap.val();
    plCount = Object.keys(data).length;
    Object.values(data).forEach(pl => {
      if (pl.songs) songCount += Object.keys(pl.songs).length;
    });
  }
  document.getElementById("statPlaylists").textContent = plCount;
  document.getElementById("statSongs").textContent = songCount;
}

// ─── Load My Playlists ───────────────────────────────────────
async function loadAllPlaylists() {
  if (!currentUser) return;
  const container = document.getElementById("playlistsContainer");
  container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">불러오는 중...</div>';
  const snap = await get(ref(db, `playlists/${currentUser.uid}`));
  container.innerHTML = "";
  if (!snap.exists() || !Object.keys(snap.val()).length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><p>아직 플레이리스트가 없어요.</p></div>`;
    return;
  }
  Object.entries(snap.val()).forEach(([id, pl]) => {
    const count = pl.songs ? Object.keys(pl.songs).length : 0;
    const card = document.createElement("div");
    card.className = "playlist-card";
    card.innerHTML = `
      <div class="playlist-card-icon">🎵</div>
      <div class="playlist-card-name">${escHtml(pl.name)}</div>
      <div class="playlist-card-count">${count}곡</div>
      <div class="playlist-card-owner" style="margin-top:4px;font-size:11px;color:var(--accent);">${pl.isPublic ? "🌐 공개" : "🔒 비공개"}</div>
    `;
    card.onclick = () => openPlaylist(id, pl.name, pl.isPublic);
    container.appendChild(card);
  });
}

async function loadRecentPlaylists() {
  if (!currentUser) return;
  const container = document.getElementById("recentPlaylists");
  container.innerHTML = "";
  const snap = await get(ref(db, `playlists/${currentUser.uid}`));
  if (!snap.exists()) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎵</div><p>플레이리스트를 만들어 노래를 추가해보세요!</p></div>`;
    return;
  }
  const entries = Object.entries(snap.val()).slice(-4).reverse();
  entries.forEach(([id, pl]) => {
    const count = pl.songs ? Object.keys(pl.songs).length : 0;
    const card = document.createElement("div");
    card.className = "playlist-card";
    card.innerHTML = `
      <div class="playlist-card-icon">🎵</div>
      <div class="playlist-card-name">${escHtml(pl.name)}</div>
      <div class="playlist-card-count">${count}곡</div>
    `;
    card.onclick = () => openPlaylist(id, pl.name, pl.isPublic);
    container.appendChild(card);
  });
}

async function loadPlaylistSelectOptions() {
  if (!currentUser) return;
  const sel = document.getElementById("playlistSelect");
  sel.innerHTML = '<option value="">-- 플레이리스트 선택 --</option>';
  const snap = await get(ref(db, `playlists/${currentUser.uid}`));
  if (snap.exists()) {
    Object.entries(snap.val()).forEach(([id, pl]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = pl.name;
      sel.appendChild(opt);
    });
  }
}

// ─── Create Playlist ─────────────────────────────────────────
window.openCreatePlaylistModal = () => {
  document.getElementById("createPlaylistModal").classList.remove("hidden");
  document.getElementById("newPlaylistName").value = "";
  const msg = document.getElementById("createPlaylistMsg");
  msg.textContent = "";
  msg.style.color = "";
};
window.closeCreatePlaylistModal = () => {
  document.getElementById("createPlaylistModal").classList.add("hidden");
};
window.createPlaylist = async () => {
  if (!currentUser) return;
  const name = document.getElementById("newPlaylistName").value.trim();
  const msg  = document.getElementById("createPlaylistMsg");
  if (!name) {
    msg.style.color = "var(--accent-red)";
    msg.textContent = "이름을 입력해주세요.";
    return;
  }

  // AI 플리 이름 검수
  msg.style.color = "var(--text-muted)";
  msg.textContent = "🤖 이름 검사 중...";

  const nameCheck = await checkPlaylistName(name);

  if (nameCheck.blocked) {
    msg.style.color = "var(--accent-red)";
    msg.textContent = `⛔ ${nameCheck.reason}`;
    return;
  }

  const newRef = push(ref(db, `playlists/${currentUser.uid}`));
  await set(newRef, { name, createdAt: Date.now(), isPublic: false, songs: {}, likes: 0 });
  closeCreatePlaylistModal();
  loadAllPlaylists();
  loadPlaylistSelectOptions();
  loadStats();
};

// ─── AI 프록시 공통 호출 ─────────────────────────────────────
// GAS가 반환하는 { httpStatus, content, finishReason } 또는 { error }
async function callProxy(payload) {
  let res;
  try {
    res = await fetch(GAS_PROXY_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });
  } catch (err) {
    return { ok: false, errorType: "network",
      message: "⚠️ [네트워크 오류] Apps Script 서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요." };
  }

  // GAS는 항상 200 반환 — 내부 httpStatus로 OpenAI 오류 구분
  let data;
  try { data = await res.json(); } catch {
    return { ok: false, errorType: "parse",
      message: "⚠️ [응답 오류] 프록시 응답을 읽지 못했습니다." };
  }

  // 프록시 자체 오류
  if (data.error) {
    return { ok: false, errorType: "proxy",
      message: `⚠️ [프록시 오류] ${data.error.message || JSON.stringify(data.error)}` };
  }

  // OpenAI HTTP 오류 세분화
  const status = data.httpStatus;
  if (status !== 200) {
    const code    = data.error?.code    || "";
    const errType = data.error?.type    || "";
    if (status === 401 || code === "invalid_api_key") {
      return { ok: false, errorType: "auth",
        message: "⚠️ [API 키 오류] API 키가 유효하지 않거나 만료되었습니다." };
    }
    if (status === 429) {
      if (code === "insufficient_quota") {
        return { ok: false, errorType: "quota",
          message: "⚠️ [한도 초과] API 사용 한도를 초과했습니다. OpenAI 계정을 확인해주세요." };
      }
      return { ok: false, errorType: "ratelimit",
        message: "⚠️ [요청 과다] 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." };
    }
    if (status === 500) return { ok: false, errorType: "server",
      message: "⚠️ [서버 오류] OpenAI 내부 오류입니다. 잠시 후 다시 시도해주세요." };
    if (status === 503) return { ok: false, errorType: "server",
      message: "⚠️ [서비스 점검] OpenAI 서비스가 일시적으로 중단되었습니다." };
    return { ok: false, errorType: "unknown",
      message: `⚠️ [알 수 없는 오류] HTTP ${status}` };
  }

  // 응답 내용 없음
  if (!data.content) {
    const fin = data.finishReason || "";
    if (fin === "length")         return { ok: false, errorType: "length",
      message: "⚠️ [응답 생성 실패] 응답이 길이 제한으로 잘렸습니다." };
    if (fin === "content_filter") return { ok: false, errorType: "filter",
      message: "⚠️ [응답 생성 실패] 콘텐츠 필터에 의해 응답이 차단되었습니다." };
    return { ok: false, errorType: "empty",
      message: "⚠️ [응답 생성 실패] AI가 답변을 생성하지 못했습니다. 다시 시도해주세요." };
  }

  return { ok: true, content: data.content };
}

// ─── AI 플리 이름 검수 ────────────────────────────────────────
// 반환값: { blocked: boolean, reason: string }
async function checkPlaylistName(name) {
  const res = await callProxy({ action: "name_check", name });

  if (!res.ok) {
    // 오류 시 검열 건너뜀 — 사용자가 플리를 못 만드는 상황 방지
    return { blocked: false, reason: `[검열 건너뜀] ${res.message}` };
  }

  // JSON 파싱
  let parsed;
  try {
    const clean = res.content.replace(/```json|```/gi, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    return { blocked: false, reason: "[검열 건너뜀] AI 응답 형식을 읽지 못했습니다." };
  }

  if (typeof parsed.blocked !== "boolean") {
    return { blocked: false, reason: "[검열 건너뜀] AI 응답에 판단 결과가 없습니다." };
  }

  return {
    blocked: parsed.blocked,
    reason:  parsed.reason || (parsed.blocked ? "부적절한 이름입니다." : "")
  };
}

// ─── Open Playlist Detail ────────────────────────────────────
window.openPlaylist = async (id, name, isPublic) => {
  currentPlaylistId = id;
  document.getElementById("detailPlaylistName").textContent = name;
  document.getElementById("publicToggle").checked = !!isPublic;

  VIEW_IDS.forEach(v => {
    document.getElementById(v).classList.remove("active");
    document.getElementById(v).classList.add("hidden");
  });
  const detailView = document.getElementById("playlistDetailView");
  detailView.classList.add("active");
  detailView.classList.remove("hidden");
  await renderSongsInPlaylist(id);
};

window.backToPlaylists = () => {
  currentPlaylistId = null;
  currentPlaylistSongs = [];
  if (ytPlayer) ytPlayer.stopVideo();
  document.getElementById("playerSection").classList.add("hidden");
  showView("playlists");
};

// ─── Toggle Public ───────────────────────────────────────────
window.togglePlaylistPublic = async () => {
  if (!currentUser || !currentPlaylistId) return;
  const isPublic = document.getElementById("publicToggle").checked;
  await update(ref(db, `playlists/${currentUser.uid}/${currentPlaylistId}`), { isPublic });

  // 공개 플리 목록에도 동기화
  const snap = await get(ref(db, `playlists/${currentUser.uid}/${currentPlaylistId}`));
  const pl   = snap.val();
  if (isPublic) {
    // 공개 플리 목록에 등록
    const userSnap = await get(ref(db, `users/${currentUser.uid}`));
    const ownerName = userSnap.val()?.username || "Unknown";
    await set(ref(db, `publicPlaylists/${currentUser.uid}_${currentPlaylistId}`), {
      ownerUid:  currentUser.uid,
      ownerName,
      plid:      currentPlaylistId,
      name:      pl.name,
      songCount: pl.songs ? Object.keys(pl.songs).length : 0,
      likes:     pl.likes || 0,
      updatedAt: Date.now()
    });
  } else {
    // 공개 목록에서 제거
    await remove(ref(db, `publicPlaylists/${currentUser.uid}_${currentPlaylistId}`));
  }
};

async function renderSongsInPlaylist(playlistId) {
  const container = document.getElementById("songsListContainer");
  container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px;">불러오는 중...</div>';
  const snap = await get(ref(db, `playlists/${currentUser.uid}/${playlistId}/songs`));
  container.innerHTML = "";
  currentPlaylistSongs = [];
  if (!snap.exists() || !Object.keys(snap.val()).length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎶</div><p>아직 노래가 없어요. 노래를 추가해보세요!</p></div>`;
    return;
  }
  const songs = Object.entries(snap.val());
  currentPlaylistSongs = songs.map(([sid, s]) => ({ sid, ...s }));
  songs.forEach(([sid, song], idx) => {
    const item = document.createElement("div");
    item.className = "song-item";
    item.id = `song-item-${idx}`;
    item.innerHTML = `
      <span class="song-num">${idx + 1}</span>
      <img class="song-thumb" src="${song.thumbnail || 'https://i.ytimg.com/vi/' + song.videoId + '/mqdefault.jpg'}" alt="" onerror="this.style.display='none'" />
      <div class="song-info">
        <div class="song-title" onclick="playSongAt(${idx})">${escHtml(song.title)}</div>
        <div class="song-channel">${escHtml(song.channel || '')}</div>
      </div>
      <button class="song-delete" onclick="deleteSong('${sid}', ${idx})" title="삭제">🗑</button>
    `;
    container.appendChild(item);
  });
}

// ─── Delete Song ─────────────────────────────────────────────
window.deleteSong = async (songId, idx) => {
  if (!currentUser || !currentPlaylistId) return;
  if (!confirm("이 노래를 삭제할까요?")) return;
  await remove(ref(db, `playlists/${currentUser.uid}/${currentPlaylistId}/songs/${songId}`));
  await renderSongsInPlaylist(currentPlaylistId);
  loadStats();
};

// ─── Delete Playlist ─────────────────────────────────────────
window.deleteCurrentPlaylist = async () => {
  if (!currentPlaylistId) return;
  if (!confirm("플레이리스트 전체를 삭제할까요?")) return;
  await remove(ref(db, `playlists/${currentUser.uid}/${currentPlaylistId}`));
  await remove(ref(db, `publicPlaylists/${currentUser.uid}_${currentPlaylistId}`));
  currentPlaylistId = null;
  showView("playlists");
  loadStats();
};

// ─── YouTube Helpers ─────────────────────────────────────────
function extractYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return m ? m[1] : null;
}

async function fetchYouTubeInfo(videoId) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (!r.ok) return null;
    const d = await r.json();
    return {
      title:     d.title,
      channel:   d.author_name,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
    };
  } catch { return null; }
}

// URL 입력시 자동 미리보기 + AI 판단
document.getElementById("songUrl")?.addEventListener("input", debounce(async (e) => {
  const url = e.target.value.trim();
  const vid = extractYouTubeId(url);
  const preview = document.getElementById("songPreview");
  const aiBox   = document.getElementById("aiJudgeBox");
  if (!vid) {
    preview.classList.add("hidden");
    aiBox.classList.add("hidden");
    return;
  }
  const info = await fetchYouTubeInfo(vid);
  if (info) {
    preview.innerHTML = `
      <img src="${info.thumbnail}" alt="" />
      <div class="song-preview-info">
        <div class="song-preview-title">${escHtml(info.title)}</div>
        <div class="song-preview-channel">${escHtml(info.channel)}</div>
      </div>
    `;
    preview.classList.remove("hidden");
    // AI 판단 자동 실행
    await runAIJudge(info.title, info.channel);
  } else {
    preview.classList.add("hidden");
    aiBox.classList.add("hidden");
  }
}, 700));

// ─── ChatGPT AI 음악 판단 ─────────────────────────────────────
async function runAIJudge(title, channel) {
  const aiBox  = document.getElementById("aiJudgeBox");
  const aiText = document.getElementById("aiJudgeText");

  aiBox.classList.remove("hidden");
  aiText.className = "ai-judge-text";
  aiText.textContent = "AI가 판단 중...";

  const res = await callProxy({ action: "music_judge", title, channel });

  if (!res.ok) {
    lastAIJudgeText = res.message;
    aiText.className = "ai-judge-text warn";
    aiText.textContent = res.message;
    return true; // fail open
  }

  const answer = res.content;
  lastAIJudgeText = answer;

  const isMusic = answer.includes("결과: 음악") && !answer.includes("음악 아님");
  const isFail  = answer.includes("판단 불가") || answer.includes("음악 아님");

  aiText.className = "ai-judge-text " + (isFail ? "fail" : "pass");
  aiText.textContent = answer;

  return !isFail && isMusic;
}

// ─── TTS (Web Speech API) ────────────────────────────────────
window.readAIJudgeByTTS = () => {
  const text = lastAIJudgeText;
  if (!text) return;

  const btn = document.getElementById("ttsBtn");

  // 이미 재생 중이면 중지
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    btn.classList.remove("playing");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 1.0;
  utterance.onstart = () => btn.classList.add("playing");
  utterance.onend   = () => btn.classList.remove("playing");
  utterance.onerror = () => btn.classList.remove("playing");
  window.speechSynthesis.speak(utterance);
};

// ─── Add Song ────────────────────────────────────────────────
window.addSongToPlaylist = async () => {
  if (!currentUser) return;
  const url        = document.getElementById("songUrl").value.trim();
  const playlistId = document.getElementById("playlistSelect").value;
  const msgEl      = document.getElementById("addSongMsg");

  if (!url)        { setMsg(msgEl, "URL을 입력해주세요.", false); return; }
  if (!playlistId) { setMsg(msgEl, "플레이리스트를 선택해주세요.", false); return; }

  const videoId = extractYouTubeId(url);
  if (!videoId) { setMsg(msgEl, "유효한 YouTube URL이 아닙니다.", false); return; }

  setMsg(msgEl, "노래 정보를 확인하는 중...", null);

  const info = await fetchYouTubeInfo(videoId);
  if (!info) { setMsg(msgEl, "영상을 불러올 수 없습니다.", false); return; }

  // AI 판단 실행
  const aiText = document.getElementById("aiJudgeText")?.textContent || "";
  const isMusic = !aiText.includes("음악 아님") && !aiText.includes("판단 불가");

  if (!isMusic && aiText) {
    setMsg(msgEl, `AI 판단: 음악이 아니거나 판단 불가 영상입니다. 추가 불가.`, false);
    return;
  }

  const newSongRef = push(ref(db, `playlists/${currentUser.uid}/${playlistId}/songs`));
  await set(newSongRef, {
    videoId,
    title:     info.title,
    channel:   info.channel,
    thumbnail: info.thumbnail,
    url,
    addedAt: Date.now()
  });

  // 공개 플리라면 곡 수 업데이트
  const plSnap = await get(ref(db, `playlists/${currentUser.uid}/${playlistId}`));
  if (plSnap.val()?.isPublic) {
    const songs = plSnap.val()?.songs || {};
    await update(ref(db, `publicPlaylists/${currentUser.uid}_${playlistId}`), {
      songCount: Object.keys(songs).length,
      updatedAt: Date.now()
    });
  }

  setMsg(msgEl, `✅ "${info.title}" 추가 완료!`, true);
  document.getElementById("songUrl").value = "";
  document.getElementById("songPreview").classList.add("hidden");
  document.getElementById("aiJudgeBox").classList.add("hidden");
  lastAIJudgeText = "";
  loadStats();
  setTimeout(() => { msgEl.textContent = ""; }, 3500);
};

function setMsg(el, text, isSuccess) {
  el.textContent = text;
  el.style.color = isSuccess === true
    ? "var(--accent-green)"
    : isSuccess === false
      ? "var(--accent-red)"
      : "var(--text-muted)";
}

// ─── Player Controls ─────────────────────────────────────────
window.playSongAt = (idx) => {
  if (!ytPlayer || !currentPlaylistSongs.length) return;
  playerIndex = idx;
  const song = currentPlaylistSongs[idx];
  document.getElementById("playerSection").classList.remove("hidden");
  ytPlayer.loadVideoById(song.videoId);
  document.getElementById("nowPlayingTitle").textContent = song.title;
  document.querySelectorAll(".song-item").forEach((el, i) => {
    el.classList.toggle("playing", i === idx);
  });
};

window.playerToggle = () => {
  if (!ytPlayer) return;
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
  else ytPlayer.playVideo();
};

window.playerNext = () => {
  if (!currentPlaylistSongs.length) return;
  playSongAt((playerIndex + 1) % currentPlaylistSongs.length);
};

window.playerPrev = () => {
  if (!currentPlaylistSongs.length) return;
  playSongAt((playerIndex - 1 + currentPlaylistSongs.length) % currentPlaylistSongs.length);
};

// ─── Community Playlists ─────────────────────────────────────
async function loadCommunityPlaylists() {
  const container = document.getElementById("communityContainer");
  container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">불러오는 중...</div>';
  const snap = await get(ref(db, "publicPlaylists"));
  container.innerHTML = "";
  if (!snap.exists()) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🌐</div><p>아직 공개된 플레이리스트가 없어요.</p></div>`;
    return;
  }
  const all = Object.entries(snap.val());
  // 좋아요 수로 정렬
  all.sort((a, b) => (b[1].likes || 0) - (a[1].likes || 0));
  all.forEach(([key, pl]) => {
    const card = document.createElement("div");
    card.className = "playlist-card";
    const isOwn = currentUser && pl.ownerUid === currentUser.uid;
    card.innerHTML = `
      <div class="playlist-card-icon">🌐</div>
      <div class="playlist-card-name">${escHtml(pl.name)}</div>
      <div class="playlist-card-count">${pl.songCount || 0}곡</div>
      <div class="playlist-card-owner">${escHtml(pl.ownerName)}${isOwn ? " (나)" : ""}</div>
      <div class="playlist-card-like">❤️ ${pl.likes || 0}</div>
    `;
    card.onclick = () => openCommunityPlaylist(pl.ownerUid, pl.plid, pl.name, pl.ownerName, key);
    container.appendChild(card);
  });
}

window.openCommunityPlaylist = async (ownerUid, plid, name, ownerName, key) => {
  communityDetailUid  = ownerUid;
  communityDetailPlid = plid;

  VIEW_IDS.forEach(v => {
    document.getElementById(v).classList.remove("active");
    document.getElementById(v).classList.add("hidden");
  });
  document.getElementById("communityDetailView").classList.add("active");
  document.getElementById("communityDetailView").classList.remove("hidden");
  document.getElementById("communityDetailName").textContent = name;
  document.getElementById("communityDetailOwner").textContent = `👤 ${ownerName}의 플레이리스트`;

  // 좋아요 상태
  await loadLikeState(key);

  // 노래 목록
  const snap = await get(ref(db, `playlists/${ownerUid}/${plid}/songs`));
  const container = document.getElementById("communityDetailSongs");
  container.innerHTML = "";
  if (!snap.exists()) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎶</div><p>노래가 없습니다.</p></div>`;
    return;
  }
  Object.entries(snap.val()).forEach(([sid, song], idx) => {
    const item = document.createElement("div");
    item.className = "song-item";
    item.innerHTML = `
      <span class="song-num">${idx + 1}</span>
      <img class="song-thumb" src="${song.thumbnail || 'https://i.ytimg.com/vi/' + song.videoId + '/mqdefault.jpg'}" alt="" onerror="this.style.display='none'" />
      <div class="song-info">
        <div class="song-title" onclick="window.open('${song.url}','_blank')">${escHtml(song.title)}</div>
        <div class="song-channel">${escHtml(song.channel || '')}</div>
      </div>
    `;
    container.appendChild(item);
  });
};

window.backToCommunity = () => {
  communityDetailUid  = null;
  communityDetailPlid = null;
  showView("community");
};

// ─── Like System ─────────────────────────────────────────────
async function loadLikeState(key) {
  if (!currentUser) return;
  const likeRef = ref(db, `likes/${currentUser.uid}/${key}`);
  const snap    = await get(likeRef);
  const liked   = snap.exists();

  const btn = document.getElementById("likeBtn");
  btn.classList.toggle("liked", liked);
  btn.dataset.key = key;

  // 좋아요 수 불러오기
  const plSnap = await get(ref(db, `publicPlaylists/${key}/likes`));
  document.getElementById("likeCount").textContent = plSnap.val() || 0;
}

window.toggleLike = async () => {
  if (!currentUser) return;
  const btn = document.getElementById("likeBtn");
  const key = btn.dataset.key;
  if (!key) return;

  const likeRef   = ref(db, `likes/${currentUser.uid}/${key}`);
  const pubRef    = ref(db, `publicPlaylists/${key}`);
  const likeSnap  = await get(likeRef);
  const pubSnap   = await get(pubRef);
  const curLikes  = pubSnap.val()?.likes || 0;

  if (likeSnap.exists()) {
    // 좋아요 취소
    await remove(likeRef);
    await update(pubRef, { likes: Math.max(0, curLikes - 1) });
    // 플리 주인의 likes도 동기화
    if (communityDetailUid && communityDetailPlid) {
      await update(ref(db, `playlists/${communityDetailUid}/${communityDetailPlid}`), { likes: Math.max(0, curLikes - 1) });
    }
    btn.classList.remove("liked");
    document.getElementById("likeCount").textContent = Math.max(0, curLikes - 1);
  } else {
    // 좋아요
    await set(likeRef, true);
    await update(pubRef, { likes: curLikes + 1 });
    if (communityDetailUid && communityDetailPlid) {
      await update(ref(db, `playlists/${communityDetailUid}/${communityDetailPlid}`), { likes: curLikes + 1 });
    }
    btn.classList.add("liked");
    document.getElementById("likeCount").textContent = curLikes + 1;
  }
};

// ─── Helpers ─────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
