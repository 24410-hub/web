// js/app.js
import { db } from "./firebase-config.js";
import { auth } from "./auth.js";
import {
  ref, set, get, push, remove, onValue, off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─── State ────────────────────────────────────────────────────
let currentUser   = null;
let currentPlaylistId   = null;
let currentPlaylistSongs = [];
let ytPlayer      = null;
let playerIndex   = 0;
let playerPlaying = false;
let statusInterval = null;

// ─── YouTube IFrame API ──────────────────────────────────────
const ytScript = document.createElement("script");
ytScript.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(ytScript);

window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player("youtubePlayer", {
    height: "100%", width: "100%",
    playerVars: { autoplay: 0, controls: 1, modestbranding: 1, rel: 0 },
    events: {
      onStateChange: onPlayerStateChange
    }
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
window.showView = (name) => {
  ["homeView","playlistsView","addView","playlistDetailView"].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove("active");
    el.classList.add("hidden");
  });
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  const viewMap = { home: "homeView", playlists: "playlistsView", add: "addView" };
  const navMap  = { home: 0, playlists: 1, add: 2 };
  const viewId  = viewMap[name];
  if (viewId) {
    document.getElementById(viewId).classList.add("active");
    document.getElementById(viewId).classList.remove("hidden");
    const navItems = document.querySelectorAll(".nav-item");
    if (navMap[name] !== undefined) navItems[navMap[name]].classList.add("active");
  }

  if (name === "playlists") loadAllPlaylists();
  if (name === "add")       loadPlaylistSelectOptions();
  if (name === "home")      { loadStats(); loadRecentPlaylists(); }
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

// ─── Load Playlists (all) ─────────────────────────────────────
async function loadAllPlaylists() {
  if (!currentUser) return;
  const container = document.getElementById("playlistsContainer");
  container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">불러오는 중...</div>';
  const snap = await get(ref(db, `playlists/${currentUser.uid}`));
  container.innerHTML = "";
  if (!snap.exists() || !Object.keys(snap.val()).length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><p>아직 플레이리스트가 없어요. 만들어볼까요?</p></div>`;
    return;
  }
  Object.entries(snap.val()).forEach(([id, pl]) => {
    const count = pl.songs ? Object.keys(pl.songs).length : 0;
    const card  = document.createElement("div");
    card.className = "playlist-card";
    card.innerHTML = `
      <div class="playlist-card-icon">🎵</div>
      <div class="playlist-card-name">${escHtml(pl.name)}</div>
      <div class="playlist-card-count">${count}곡</div>
    `;
    card.onclick = () => openPlaylist(id, pl.name);
    container.appendChild(card);
  });
}

// ─── Load Recent Playlists (home) ────────────────────────────
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
    const card  = document.createElement("div");
    card.className = "playlist-card";
    card.innerHTML = `
      <div class="playlist-card-icon">🎵</div>
      <div class="playlist-card-name">${escHtml(pl.name)}</div>
      <div class="playlist-card-count">${count}곡</div>
    `;
    card.onclick = () => openPlaylist(id, pl.name);
    container.appendChild(card);
  });
}

// ─── Playlist Select (add song) ───────────────────────────────
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
  document.getElementById("createPlaylistMsg").textContent = "";
};
window.closeCreatePlaylistModal = () => {
  document.getElementById("createPlaylistModal").classList.add("hidden");
};
window.createPlaylist = async () => {
  if (!currentUser) return;
  const name = document.getElementById("newPlaylistName").value.trim();
  const msg  = document.getElementById("createPlaylistMsg");
  if (!name) { msg.textContent = "이름을 입력해주세요."; return; }
  const newRef = push(ref(db, `playlists/${currentUser.uid}`));
  await set(newRef, { name, createdAt: Date.now(), songs: {} });
  closeCreatePlaylistModal();
  loadAllPlaylists();
  loadPlaylistSelectOptions();
  loadStats();
};

// ─── Open Playlist Detail ─────────────────────────────────────
window.openPlaylist = async (id, name) => {
  currentPlaylistId = id;
  document.getElementById("detailPlaylistName").textContent = name;
  // switch view manually
  ["homeView","playlistsView","addView"].forEach(v => {
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
  if (!confirm("이 노래를 플레이리스트에서 삭제할까요?")) return;
  await remove(ref(db, `playlists/${currentUser.uid}/${currentPlaylistId}/songs/${songId}`));
  await renderSongsInPlaylist(currentPlaylistId);
  loadStats();
};

// ─── Delete Playlist ─────────────────────────────────────────
window.deleteCurrentPlaylist = async () => {
  if (!currentPlaylistId) return;
  if (!confirm("플레이리스트 전체를 삭제할까요?")) return;
  await remove(ref(db, `playlists/${currentUser.uid}/${currentPlaylistId}`));
  currentPlaylistId = null;
  showView("playlists");
  loadStats();
};

// ─── Add Song ────────────────────────────────────────────────
// YouTube URL → video ID
function extractYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return m ? m[1] : null;
}

// Auto-preview on URL input (debounced)
document.getElementById("songUrl")?.addEventListener("input", debounce(async (e) => {
  const url = e.target.value.trim();
  const vid = extractYouTubeId(url);
  const preview = document.getElementById("songPreview");
  if (!vid) { preview.classList.add("hidden"); return; }
  const info = await fetchYouTubeInfo(vid);
  if (info) {
    preview.innerHTML = `
      <img src="${info.thumbnail}" alt="" />
      <div class="song-preview-info">
        <div class="song-preview-title">${escHtml(info.title)}</div>
        <div class="song-preview-channel">${escHtml(info.channel)}</div>
      </div>
      <span class="song-preview-badge">✓ 노래 확인됨</span>
    `;
    preview.classList.remove("hidden");
  } else {
    preview.classList.add("hidden");
  }
}, 600));

async function fetchYouTubeInfo(videoId) {
  // Use oEmbed to get basic title info (no API key needed)
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

window.addSongToPlaylist = async () => {
  if (!currentUser) return;
  const url        = document.getElementById("songUrl").value.trim();
  const playlistId = document.getElementById("playlistSelect").value;
  const msgEl      = document.getElementById("addSongMsg");

  if (!url)        { msgEl.style.color = "var(--accent-red)"; msgEl.textContent = "URL을 입력해주세요."; return; }
  if (!playlistId) { msgEl.style.color = "var(--accent-red)"; msgEl.textContent = "플레이리스트를 선택해주세요."; return; }

  const videoId = extractYouTubeId(url);
  if (!videoId) { msgEl.style.color = "var(--accent-red)"; msgEl.textContent = "유효한 YouTube URL이 아닙니다."; return; }

  msgEl.style.color = "var(--text-muted)";
  msgEl.textContent = "노래 정보를 확인하는 중...";

  const info = await fetchYouTubeInfo(videoId);
  if (!info) {
    msgEl.style.color = "var(--accent-red)";
    msgEl.textContent = "유효하지 않은 영상이거나 접근할 수 없습니다.";
    return;
  }

  // xAI verification — check if this is actually a music video
  const isMusic = await verifyIsMusicWithAI(info.title, info.channel);
  if (!isMusic) {
    msgEl.style.color = "var(--accent-red)";
    msgEl.textContent = `"${info.title}"은(는) 음악이 아닌 것으로 확인되어 추가되지 않았습니다.`;
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

  msgEl.style.color = "var(--accent-green)";
  msgEl.textContent = `✅ "${info.title}" 추가 완료!`;
  document.getElementById("songUrl").value = "";
  document.getElementById("songPreview").classList.add("hidden");
  loadStats();
  setTimeout(() => { msgEl.textContent = ""; }, 3000);
};

// ─── xAI Music Verification ──────────────────────────────────
async function verifyIsMusicWithAI(title, channel) {
  try {
    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer xai-3vNlcT7QQPBXgcU9YWU55ifUbMKEhH5mfRpJ543MdjzuztidPq2jIluev0RaGb10oSJ8opytI76Vg0Vu"
      },
      body: JSON.stringify({
        model: "grok-beta",
        messages: [{
          role: "user",
          content: `Is this a music song/track? Title: "${title}", Channel: "${channel}". Respond with ONLY "YES" or "NO".`
        }],
        max_tokens: 5
      })
    });
    const d = await r.json();
    const answer = d.choices?.[0]?.message?.content?.trim().toUpperCase();
    return answer === "YES";
  } catch {
    // If xAI API fails, allow it through (fail open)
    return true;
  }
}

// ─── Player Controls ─────────────────────────────────────────
window.playSongAt = (idx) => {
  if (!ytPlayer || !currentPlaylistSongs.length) return;
  playerIndex = idx;
  const song = currentPlaylistSongs[idx];
  document.getElementById("playerSection").classList.remove("hidden");
  ytPlayer.loadVideoById(song.videoId);
  document.getElementById("nowPlayingTitle").textContent = song.title;
  // Highlight
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
  const next = (playerIndex + 1) % currentPlaylistSongs.length;
  playSongAt(next);
};

window.playerPrev = () => {
  if (!currentPlaylistSongs.length) return;
  const prev = (playerIndex - 1 + currentPlaylistSongs.length) % currentPlaylistSongs.length;
  playSongAt(prev);
};

// ─── Helpers ────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
