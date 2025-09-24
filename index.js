const express = require('express');
const cors = require('cors');
const app = express();


app.use(cors());


// 동물 데이터 (필요 시 계속 확장 가능)
const animals = {
  dog: {
    sound: '멍멍',
    // 위키미디어는 파일 설명 페이지가 아니라 실제 이미지 URL을 사용해야 브라우저에서 보입니다.
    img: 'https://m.health.chosun.com/site/data/img_dir/2025/04/08/2025040803041_0.jpg'
  },
  cat: {
    sound: '야옹',
    img: 'https://i.namu.wiki/i/d1A_wD4kuLHmOOFqJdVlOXVt1TWA9NfNt_HA0CS0Y_N0zayUAX8olMuv7odG2FiDLDQZIRBqbPQwBSArXfEJlQ.webp'
  },
  pig: {
    sound: '꿀꿀',
    img: null // 이미지가 없으면 프런트에서 이미지 없이 처리
  }
};


app.get('/', (req, res) => {
  res.send('Hello World');
});


// 기존 소리 API
app.get('/sound/:name', (req, res) => {
  const { name } = req.params;
  const a = animals[name];
  if (a) {
    res.json({ sound: a.sound, img: a.img });
  } else {
    res.json({ sound: '알 수 없음' });
  }
});


// 퀴즈용: 이미지 보고 동물이름 맞추기
app.get('/quiz/image', (req, res) => {
  // 이미지가 있는 동물만 문제로 사용 (원하면 pig 제외/포함 선택 가능)
  const pool = Object.entries(animals).filter(([_, v]) => !!v.img);
  // 최소 2종 이상일 때만 퀴즈 제공
  if (pool.length < 2) {
    return res.status(400).json({ error: '이미지 있는 동물이 2개 이상 필요합니다.' });
  }


  // 정답 선택
  const answerIndex = Math.floor(Math.random() * pool.length);
  const [answerKey, answerVal] = pool[answerIndex];


  // 보기(옵션) 구성: 풀에서 3~4지선다
  const names = pool.map(([k]) => k);
  shuffle(names);


  const optCount = Math.min(4, names.length); // 최대 4지선다
  let options = unique([answerKey, ...names]).slice(0, optCount);
  if (!options.includes(answerKey)) options[0] = answerKey; // 정답 보장
  shuffle(options);


  res.json({
    questionType: 'image',
    img: answerVal.img,
    options,        // ['dog','cat',...]
    answer: answerKey // 클라 검증용(학습용 예제라 클라에 내려도 무방)
  });
});


function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function unique(arr) {
  return Array.from(new Set(arr));
}


app.listen(3001, () => {
  console.log('Server listening on http://localhost:3001');
});



