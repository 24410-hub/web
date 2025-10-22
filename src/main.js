import { generateMap } from "./map.js";

const screen = document.getElementById("game-screen");
const map = generateMap();
let player = { x: 40, y: 12 };

render();

document.addEventListener("keydown", (e) => {
  const moves = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };
  if (!moves[e.key]) return;

  const [dx, dy] = moves[e.key];
  const nx = player.x + dx;
  const ny = player.y + dy;

  if (map[ny] && map[ny][nx] === ".") {
    player.x = nx;
    player.y = ny;
  }
  render();
});

function render() {
  const copy = map.map((row) => [...row]);
  copy[player.y][player.x] = "@";
  screen.innerText = copy.map((r) => r.join("")).join("\n");
}
