const SIZE = 4;
const BEST_KEY = "bestScore2048";

const $ = (sel) => document.querySelector(sel);
const scoreEl = $("#score");
const bestEl = $("#best");
const tilesEl = $("#tiles");
const overlayEl = $("#overlay");
const overlayTitleEl = $("#overlayTitle");
const overlaySubEl = $("#overlaySub");
const newGameBtn = $("#newGameBtn");
const restartBtn = $("#restartBtn");
const keepGoingBtn = $("#keepGoingBtn");

const btnUp = $("#btnUp");
const btnRight = $("#btnRight");
const btnDown = $("#btnDown");
const btnLeft = $("#btnLeft");
const rulesToggle = $("#rulesToggle");
const rulesPanel = $("#rulesPanel");

let grid;
let score = 0;
let best = 0;
let nextId = 1;
let won = false;
let allowAfterWin = false;
let animLock = false;
let loseOverlayTimer = null;

const MOVE_MS_KEYBOARD = 210;
const MOVE_MS_BUTTON = 160;
const RULES_OPEN_KEY = "rulesOpen2048";

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
}

function getEmptyCells(g) {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!g[r][c]) out.push([r, c]);
    }
  }
  return out;
}

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function spawnTile(g, forceValue) {
  const empties = getEmptyCells(g);
  if (empties.length === 0) return null;
  const [r, c] = empties[randInt(empties.length)];
  const value = forceValue ?? (Math.random() < 0.9 ? 2 : 4);
  const tile = { id: nextId++, value, r, c, isNew: true, mergedThisTurn: false, isMerge: false };
  g[r][c] = tile;
  return tile;
}

function loadBest() {
  const v = Number(localStorage.getItem(BEST_KEY) || "0");
  return Number.isFinite(v) ? v : 0;
}

function saveBest(v) {
  localStorage.setItem(BEST_KEY, String(v));
}

function resetGame() {
  if (loseOverlayTimer) {
    clearTimeout(loseOverlayTimer);
    loseOverlayTimer = null;
  }
  grid = emptyGrid();
  score = 0;
  won = false;
  allowAfterWin = false;
  overlayEl.hidden = true;
  overlayEl.classList.remove("is-visible");
  spawnTile(grid, 2);
  spawnTile(grid, 2);
  updateScore(0);
  render();
}

function updateScore(delta) {
  score += delta;
  if (score > best) {
    best = score;
    saveBest(best);
  }
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

function posTransform(r, c) {
  const step = "calc(var(--cellSize) + var(--gap))";
  const x = `calc(var(--gap) + (${c} * ${step}))`;
  const y = `calc(var(--gap) + (${r} * ${step}))`;
  return `translate(${x}, ${y})`;
}

function listTiles(g) {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = g[r][c];
      if (t) out.push(t);
    }
  }
  return out;
}

function render() {
  const existing = new Map(Array.from(tilesEl.children).map((el) => [Number(el.dataset.id), el]));
  const used = new Set();
  const tiles = listTiles(grid);

  for (const t of tiles) {
    let el = existing.get(t.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "tile";
      el.dataset.id = String(t.id);
      tilesEl.appendChild(el);
    }

    used.add(t.id);
    el.dataset.v = String(t.value);
    el.classList.toggle("big", t.value >= 128);

    const num = el.firstChild?.nodeType === Node.ELEMENT_NODE ? el.firstChild : null;
    if (!num) {
      const n = document.createElement("div");
      n.className = "num";
      el.appendChild(n);
    }
    el.querySelector(".num").textContent = String(t.value);

    const tf = posTransform(t.r, t.c);
    el.style.setProperty("--t", tf);
    el.style.transform = tf;

    el.classList.remove("pop", "merge");
    if (t.isNew) el.classList.add("pop");
    if (t.isMerge) el.classList.add("merge");

    t.isNew = false;
    t.isMerge = false;
  }

  for (const [id, el] of existing) {
    if (!used.has(id)) el.remove();
  }
}

function showOverlay(kind) {
  if (loseOverlayTimer) {
    clearTimeout(loseOverlayTimer);
    loseOverlayTimer = null;
  }

  overlayEl.hidden = false;
  overlayEl.classList.remove("is-visible");
  if (kind === "win") {
    overlayTitleEl.textContent = "You hit 2048!";
    overlaySubEl.textContent = "Nice. You can keep going, or restart.";
    keepGoingBtn.hidden = false;
  } else {
    overlayTitleEl.textContent = "No moves left.";
    overlaySubEl.textContent = "Restart and try a different strategy.";
    keepGoingBtn.hidden = true;
  }

  requestAnimationFrame(() => {
    overlayEl.classList.add("is-visible");
  });
}

function scheduleLoseOverlay() {
  if (loseOverlayTimer) return;
  loseOverlayTimer = setTimeout(() => {
    loseOverlayTimer = null;
    if (!canMove(grid)) showOverlay("lose");
  }, 3000);
}

function setMoveSpeed(source) {
  const ms = source === "button" ? MOVE_MS_BUTTON : MOVE_MS_KEYBOARD;
  document.documentElement.style.setProperty("--moveMs", `${ms}ms`);
  return ms;
}

function canMove(g) {
  if (getEmptyCells(g).length > 0) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = g[r][c].value;
      if (r + 1 < SIZE && g[r + 1][c].value === v) return true;
      if (c + 1 < SIZE && g[r][c + 1].value === v) return true;
    }
  }
  return false;
}

function traversal(dir) {
  const rows = [...Array(SIZE).keys()];
  const cols = [...Array(SIZE).keys()];
  if (dir === "down") rows.reverse();
  if (dir === "right") cols.reverse();

  const positions = [];
  for (const r of rows) for (const c of cols) positions.push([r, c]);
  return positions;
}

function deltaFor(dir) {
  if (dir === "up") return [-1, 0];
  if (dir === "down") return [1, 0];
  if (dir === "left") return [0, -1];
  return [0, 1];
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function clearMergeFlags(g) {
  for (const t of listTiles(g)) t.mergedThisTurn = false;
}

function move(dir, source = "keyboard") {
  if (animLock) return;
  if (won && !allowAfterWin) return;

  // If you're already dead, let the lose message appear after a delay,
  // even if the player keeps pressing keys/buttons.
  if (!canMove(grid)) {
    scheduleLoseOverlay();
    return;
  }

  animLock = true;
  const moveMs = setMoveSpeed(source);
  clearMergeFlags(grid);

  const [dr, dc] = deltaFor(dir);
  const oldGrid = grid;
  const newGrid = emptyGrid();

  let moved = false;
  let gained = 0;

  const order = traversal(dir);
  for (const [r0, c0] of order) {
    const tile = oldGrid[r0][c0];
    if (!tile) continue;

    let r = r0;
    let c = c0;
    let nr = r + dr;
    let nc = c + dc;

    while (inBounds(nr, nc) && !newGrid[nr][nc]) {
      r = nr;
      c = nc;
      nr = r + dr;
      nc = c + dc;
    }

    if (inBounds(nr, nc) && newGrid[nr][nc]) {
      const target = newGrid[nr][nc];
      if (target.value === tile.value && !target.mergedThisTurn) {
        const mergedValue = target.value * 2;
        const merged = {
          id: nextId++,
          value: mergedValue,
          r: nr,
          c: nc,
          isNew: false,
          mergedThisTurn: true,
          isMerge: true,
        };
        newGrid[nr][nc] = merged;
        gained += mergedValue;
        moved = true;
        if (mergedValue === 2048) won = true;
        continue;
      }
    }

    const destR = inBounds(nr, nc) && newGrid[nr][nc] ? r : r;
    const destC = inBounds(nr, nc) && newGrid[nr][nc] ? c : c;

    if (destR !== r0 || destC !== c0) moved = true;
    tile.r = destR;
    tile.c = destC;
    newGrid[destR][destC] = tile;
  }

  if (!moved) {
    animLock = false;
    return;
  }

  grid = newGrid;
  spawnTile(grid);
  updateScore(gained);
  render();

  if (won && !allowAfterWin) showOverlay("win");
  else if (!canMove(grid)) scheduleLoseOverlay();

  setTimeout(() => {
    animLock = false;
  }, moveMs + 40);
}

function onKeyDown(e) {
  const k = e.key;
  if (k === "ArrowUp") {
    e.preventDefault();
    move("up", "keyboard");
  } else if (k === "ArrowRight") {
    e.preventDefault();
    move("right", "keyboard");
  } else if (k === "ArrowDown") {
    e.preventDefault();
    move("down", "keyboard");
  } else if (k === "ArrowLeft") {
    e.preventDefault();
    move("left", "keyboard");
  }
}

function wire() {
  window.addEventListener("keydown", onKeyDown, { passive: false });

  btnUp.addEventListener("click", () => move("up", "button"));
  btnRight.addEventListener("click", () => move("right", "button"));
  btnDown.addEventListener("click", () => move("down", "button"));
  btnLeft.addEventListener("click", () => move("left", "button"));

  newGameBtn.addEventListener("click", resetGame);
  restartBtn.addEventListener("click", resetGame);
  keepGoingBtn.addEventListener("click", () => {
    allowAfterWin = true;
    overlayEl.hidden = true;
    overlayEl.classList.remove("is-visible");
  });

  if (rulesToggle && rulesPanel) {
    const open = localStorage.getItem(RULES_OPEN_KEY) === "1";
    rulesToggle.setAttribute("aria-expanded", open ? "true" : "false");
    rulesPanel.hidden = !open;

    rulesToggle.addEventListener("click", () => {
      const isOpen = rulesToggle.getAttribute("aria-expanded") === "true";
      const next = !isOpen;
      rulesToggle.setAttribute("aria-expanded", next ? "true" : "false");
      rulesPanel.hidden = !next;
      localStorage.setItem(RULES_OPEN_KEY, next ? "1" : "0");
    });
  }
}

function init() {
  best = loadBest();
  bestEl.textContent = String(best);
  wire();
  resetGame();
}

init();
