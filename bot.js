// ─────────────────────────────────────────────────────────────
//  SOUNDVAULT DISCORD BOT
//  Firebase Realtime DB + Grok AI 검증 + 슬래시 명령어
// ─────────────────────────────────────────────────────────────
//
//  설치:
//    npm install discord.js firebase-admin node-fetch
//
//  실행:
//    node bot.js
//
// ─────────────────────────────────────────────────────────────

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// ── CONFIG ──────────────────────────────────────────────────
const BOT_TOKEN  = 'MTUwODk4NDY2ODgwMjc3NzIzOA.GX7lEf.o_XijYszcxJywhkBP3Q0zo6lWzHSBSiNwJX6Mc';
const GROK_KEY   = 'xai-3vNlcT7QQPBXgcU9YWU55ifUbMKEhH5mfRpJ543MdjzuztidPq2jIluev0RaGb10oSJ8opytI76Vg0Vu';
const CLIENT_ID  = '1508984668802777238'; // 토큰에서 추출한 봇 ID

// Firebase Admin SDK 초기화 (서비스 계정 JSON 없이 databaseURL로 초기화)
admin.initializeApp({
  credential: admin.credential.applicationDefault(), // GOOGLE_APPLICATION_CREDENTIALS 환경변수 또는
  databaseURL: 'https://study-2347b-default-rtdb.asia-southeast1.firebasedatabase.app'
});
// ▶ 서비스 계정 JSON이 있다면 위 대신:
// admin.initializeApp({
//   credential: admin.credential.cert(require('./serviceAccountKey.json')),
//   databaseURL: 'https://study-2347b-default-rtdb.asia-southeast1.firebasedatabase.app'
// });

const db = admin.database();
const songsRef = db.ref('songs');

// ── YOUTUBE URL VALIDATOR ───────────────────────────────────
function isValidYT(url) {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{11}/.test(url);
}

function extractYTId(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('v') || u.pathname.slice(1);
  } catch { return null; }
}

// ── GROK AI VALIDATION ──────────────────────────────────────
async function validateWithGrok(url) {
  const prompt = `다음 YouTube URL이 음악/노래 영상인지 판단해줘: "${url}"
응답은 반드시 JSON 형식으로만: {"isMusic": true/false, "summary": "한 줄 요약 (40자 이내)", "title": "추정 제목"}
판단 기준: 뮤직비디오, 음원, 커버, 라이브 공연이면 true. 그 외는 false.`;

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200
      })
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 파싱 실패');
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('[Grok]', e.message);
    return { isMusic: true, title: `YT:${extractYTId(url)}`, summary: 'AI 검증 없이 저장됨' };
  }
}

// ── SLASH COMMAND DEFINITIONS ───────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('유튜브 음악 링크를 저장합니다')
    .addStringOption(opt =>
      opt.setName('url')
        .setDescription('YouTube URL')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('label')
        .setDescription('분류 레이블 (선택)')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('list')
    .setDescription('저장된 음악 목록을 봅니다')
    .addIntegerOption(opt =>
      opt.setName('page')
        .setDescription('페이지 번호 (기본: 1)')
        .setRequired(false)
        .setMinValue(1)),

  new SlashCommandBuilder()
    .setName('search')
    .setDescription('음악 목록에서 검색합니다')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('검색어 (제목, 요약, 레이블)')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('저장된 음악을 삭제합니다')
    .addStringOption(opt =>
      opt.setName('id')
        .setDescription('삭제할 트랙 ID (/list 에서 확인)')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('random')
    .setDescription('저장된 음악 중 무작위로 하나를 추천합니다'),

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('특정 트랙 상세 정보를 봅니다')
    .addStringOption(opt =>
      opt.setName('id')
        .setDescription('트랙 ID')
        .setRequired(true)),
].map(c => c.toJSON());

// ── REGISTER SLASH COMMANDS ─────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('[Commands] 슬래시 명령어 등록 완료');
  } catch (e) {
    console.error('[Commands] 등록 실패:', e.message);
  }
}

// ── FIREBASE HELPERS ─────────────────────────────────────────
async function getAllSongs() {
  const snap = await songsRef.orderByChild('createdAt').once('value');
  const data = snap.val();
  if (!data) return [];
  return Object.entries(data)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function addSong(url, title, summary, label) {
  const ref = await songsRef.push({
    url, title, summary,
    label: label || null,
    createdAt: Date.now()
  });
  return ref.key;
}

async function deleteSong(id) {
  await db.ref(`songs/${id}`).remove();
}

async function getSong(id) {
  const snap = await db.ref(`songs/${id}`).once('value');
  return snap.val() ? { id, ...snap.val() } : null;
}

// ── EMBED BUILDER HELPERS ────────────────────────────────────
function makeListEmbed(songs, page = 1) {
  const PER_PAGE = 8;
  const total = songs.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const start = (page - 1) * PER_PAGE;
  const slice = songs.slice(start, start + PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(0xe8ff47)
    .setTitle('SOUNDVAULT — TRACK LIST')
    .setDescription(`총 **${total}**개 트랙  |  페이지 ${page} / ${totalPages}`)
    .setFooter({ text: `SOUNDVAULT  •  /add /search /random /delete` })
    .setTimestamp();

  if (slice.length === 0) {
    embed.addFields({ name: '비어 있음', value: '저장된 트랙이 없습니다.' });
    return embed;
  }

  slice.forEach((s, i) => {
    const idx = start + i + 1;
    const date = new Date(s.createdAt).toLocaleDateString('ko-KR');
    const label = s.label ? `  [${s.label}]` : '';
    embed.addFields({
      name: `${String(idx).padStart(2, '0')}.  ${s.title || 'Unknown'}${label}`,
      value: `${s.summary || '요약 없음'}\n\`${s.id}\`  •  ${date}  •  [링크](${s.url})`,
      inline: false
    });
  });

  return embed;
}

function makeTrackEmbed(s, title = 'TRACK INFO') {
  const date = new Date(s.createdAt).toLocaleString('ko-KR');
  return new EmbedBuilder()
    .setColor(0xe8ff47)
    .setTitle(title)
    .addFields(
      { name: 'Title', value: s.title || 'Unknown', inline: false },
      { name: 'Summary', value: s.summary || '없음', inline: false },
      { name: 'URL', value: s.url, inline: false },
      { name: 'Label', value: s.label || '-', inline: true },
      { name: 'ID', value: `\`${s.id}\``, inline: true },
      { name: 'Saved', value: date, inline: true }
    )
    .setFooter({ text: 'SOUNDVAULT' })
    .setTimestamp();
}

// ── CLIENT ──────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`[Bot] ${client.user.tag} 온라인`);
  client.user.setActivity('soundvault | /add /list', { type: 2 }); // LISTENING
});

// ── INTERACTION HANDLER ──────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ─── /ADD ─────────────────────────────────────────────────
  if (commandName === 'add') {
    await interaction.deferReply();

    const url   = interaction.options.getString('url');
    const label = interaction.options.getString('label');

    if (!isValidYT(url)) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('오류 — 유효하지 않은 URL')
          .setDescription('올바른 YouTube URL을 입력해주세요.\n예: `https://www.youtube.com/watch?v=XXXXXXXXXXX`')]
      });
    }

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe8ff47)
        .setTitle('Grok AI 검증 중...')
        .setDescription('음악 여부를 확인하고 있습니다. 잠시만 기다려주세요.')]
    });

    const result = await validateWithGrok(url);

    if (!result.isMusic) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('저장 거부 — 음악이 아님')
          .setDescription(`Grok AI가 이 링크를 음악 영상으로 판단하지 않았습니다.\n\n**분석:** ${result.summary || '-'}`)]
      });
    }

    const id = await addSong(url, result.title, result.summary, label);

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x47ffb2)
        .setTitle('저장 완료')
        .addFields(
          { name: 'Title', value: result.title || 'Unknown', inline: false },
          { name: 'Summary', value: result.summary || '-', inline: false },
          { name: 'URL', value: url, inline: false },
          { name: 'Label', value: label || '-', inline: true },
          { name: 'ID', value: `\`${id}\``, inline: true }
        )
        .setFooter({ text: 'SOUNDVAULT  •  트랙이 저장되었습니다' })
        .setTimestamp()]
    });
  }

  // ─── /LIST ────────────────────────────────────────────────
  if (commandName === 'list') {
    await interaction.deferReply();
    const page = interaction.options.getInteger('page') || 1;
    const songs = await getAllSongs();
    return interaction.editReply({ embeds: [makeListEmbed(songs, page)] });
  }

  // ─── /SEARCH ──────────────────────────────────────────────
  if (commandName === 'search') {
    await interaction.deferReply();
    const query = interaction.options.getString('query').toLowerCase();
    const songs = await getAllSongs();
    const filtered = songs.filter(s =>
      (s.title || '').toLowerCase().includes(query) ||
      (s.summary || '').toLowerCase().includes(query) ||
      (s.label || '').toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x6a6a72)
          .setTitle('검색 결과 없음')
          .setDescription(`"${query}"에 해당하는 트랙을 찾을 수 없습니다.`)]
      });
    }

    return interaction.editReply({
      embeds: [makeListEmbed(filtered, 1)
        .setTitle(`검색 결과 — "${query}"`)
        .setDescription(`**${filtered.length}**개 결과`)]
    });
  }

  // ─── /DELETE ──────────────────────────────────────────────
  if (commandName === 'delete') {
    await interaction.deferReply();
    const id = interaction.options.getString('id');
    const song = await getSong(id);

    if (!song) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('오류')
          .setDescription(`ID \`${id}\` 를 가진 트랙을 찾을 수 없습니다.`)]
      });
    }

    await deleteSong(id);

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b35)
        .setTitle('삭제 완료')
        .setDescription(`**${song.title || 'Unknown'}** 트랙이 삭제되었습니다.`)
        .addFields({ name: '삭제된 ID', value: `\`${id}\``, inline: true })
        .setTimestamp()]
    });
  }

  // ─── /RANDOM ──────────────────────────────────────────────
  if (commandName === 'random') {
    await interaction.deferReply();
    const songs = await getAllSongs();

    if (songs.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x6a6a72)
          .setTitle('목록이 비어 있습니다')
          .setDescription('/add 로 트랙을 먼저 추가해주세요.')]
      });
    }

    const pick = songs[Math.floor(Math.random() * songs.length)];
    return interaction.editReply({
      embeds: [makeTrackEmbed(pick, 'RANDOM PICK')]
    });
  }

  // ─── /INFO ────────────────────────────────────────────────
  if (commandName === 'info') {
    await interaction.deferReply();
    const id = interaction.options.getString('id');
    const song = await getSong(id);

    if (!song) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('오류')
          .setDescription(`ID \`${id}\` 를 가진 트랙을 찾을 수 없습니다.`)]
      });
    }

    return interaction.editReply({ embeds: [makeTrackEmbed(song)] });
  }
});

// ── LAUNCH ──────────────────────────────────────────────────
(async () => {
  await registerCommands();
  await client.login(BOT_TOKEN);
})();
