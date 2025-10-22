const KEY = "rogue_save";

export function saveGame(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function loadGame() {
  const data = localStorage.getItem(KEY);
  return data ? JSON.parse(data) : null;
}

export function clearSave() {
  localStorage.removeItem(KEY);
}
