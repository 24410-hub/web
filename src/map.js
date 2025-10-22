export function generateMap(width = 80, height = 24) {
  const map = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "#")
  );

  // 랜덤 방 생성
  for (let i = 0; i < 6; i++) {
    const w = 6 + Math.floor(Math.random() * 6);
    const h = 4 + Math.floor(Math.random() * 4);
    const x = 2 + Math.floor(Math.random() * (width - w - 2));
    const y = 2 + Math.floor(Math.random() * (height - h - 2));

    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        map[yy][xx] = ".";
      }
    }
  }

  return map;
}
