// Wordblocks: Twist — cube state, 3D rendering, and twist mechanics

const MIN_WORD_LEN = 3;

const LETTER_FREQ = {
  E: 8, A: 6, I: 6, O: 5, U: 3,
  N: 8, R: 8, T: 8, S: 8, L: 6, D: 6,
  G: 5, C: 5, M: 4, P: 4, F: 4, H: 4, B: 3, W: 3, Y: 3, V: 2,
  K: 3, J: 2, X: 2, Q: 2, Z: 2
};
const LETTER_POOL = Object.entries(LETTER_FREQ).flatMap(([l, c]) => Array(c).fill(l));
const RARE_LETTERS = new Set(["Q", "Z", "X", "J", "K", "V"]);
const DOUBLE_PAIRS = ["EE", "TT", "OO", "FF", "LL", "SS", "PP", "MM", "NN", "RR"];

// 1. ORIGINAL WORDBLOCKS BASE SCORING SYSTEM
const BASE_SCORING = { 3: 3, 4: 6, 5: 8, 6: 12, 7: 16, 8: 20 };

function randomLetter() {
  return LETTER_POOL[Math.floor(Math.random() * LETTER_POOL.length)];
}

function randomDoubleLetter() {
  return DOUBLE_PAIRS[Math.floor(Math.random() * DOUBLE_PAIRS.length)];
}

//Cube State
const PHYSICAL = ['U', 'D', 'F', 'R', 'B', 'L'];
let N = 5;
let faces = {};
let tileMeta = {}; 
let score = 0;
let activePowerupMode = null;

let powerups = {
  lockTile: 3,
  lockWord: 2,
  freezeSlice: 2,
  freezeFace: 1,
  reshuffle: 1
};

function getPowerupDuration() {
  return Math.min(5, Math.max(3, N - 2));
}

function generateTile() {
  const rand = Math.random();
  if (rand < 0.03) {
    return { val: '?', meta: { lockedTurns: 0, wild: true, double: false, userChoice: null } };
  } else if (rand < 0.08) {
    return { val: randomDoubleLetter(), meta: { lockedTurns: 0, wild: false, double: true, userChoice: null } };
  }
  return { val: randomLetter(), meta: { lockedTurns: 0, wild: false, double: false, userChoice: null } };
}

function initFaces(n) {
  faces = {};
  tileMeta = {};
  PHYSICAL.forEach(f => {
    faces[f] = Array.from({ length: n }, () => Array(n));
    tileMeta[f] = Array.from({ length: n }, () => Array(n));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const t = generateTile();
        faces[f][r][c] = t.val;
        tileMeta[f][r][c] = t.meta;
      }
    }
  });
}

//Orientation
let belt = ['F', 'R', 'B', 'L'];
let spinSteps = 0;

function logical() {
  return { front: belt[0], right: belt[1], back: belt[2], left: belt[3], up: 'U', down: 'D' };
}

function rotateView() {
  belt = [belt[1], belt[2], belt[3], belt[0]];
  spinSteps += 1;
  render();
}

// Selection  
let rowLayer = 0;
let colLayer = 0;

// Rotates a 3D grid slice in-place to update physical cube states  
function rotateFaceInPlace(key, dir) {
  const m = faces[key];
  const meta = tileMeta[key];
  const n = m.length;
  const resM = Array.from({ length: n }, () => Array(n));
  const resMeta = Array.from({ length: n }, () => Array(n));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const targetI = dir === 1 ? j : n - 1 - j;
      const targetJ = dir === 1 ? n - 1 - i : i;

      if (meta[targetI][targetJ].lockedTurns > 0) {
        resM[targetI][targetJ] = m[targetI][targetJ];
        resMeta[targetI][targetJ] = meta[targetI][targetJ];
      } else {
        resM[targetI][targetJ] = m[i][j];
        resMeta[targetI][targetJ] = meta[i][j];
      }
    }
  }
  faces[key] = resM;
  tileMeta[key] = resMeta;
}

function twistRow(direction) {
  const { front, right, back, left, up, down } = logical();
  const k = rowLayer;

  const order = direction === 1 ? [left, front, right, back] : [right, back, left, front];
  const nextOrder = direction === 1 ? [front, right, back, left] : [front, left, back, right];

  const tempFaces = {};
  const tempMeta = {};

  [front, right, back, left].forEach(f => {
    tempFaces[f] = faces[f][k].slice();
    tempMeta[f] = tileMeta[f][k].slice();
  });

  for (let idx = 0; idx < 4; idx++) {
    const src = order[idx];
    const dest = nextOrder[idx];
    for (let c = 0; c < N; c++) {
      if (tileMeta[dest][k][c].lockedTurns <= 0) {
        faces[dest][k][c] = tempFaces[src][c];
        tileMeta[dest][k][c] = tempMeta[src][c];
      }
    }
  }

  if (k === 0) rotateFaceInPlace(up, direction);
  if (k === N - 1) rotateFaceInPlace(down, -direction);
  afterTwist();
}

function twistCol(direction) {
  const { front, up, back, down, left, right } = logical();
  const k = colLayer;
  const bc = N - 1 - k;

  const fM = faces[front].map(r => r[k]);
  const uM = faces[up].map(r => r[k]);
  const bM = faces[back].map(r => r[bc]);
  const dM = faces[down].map(r => r[k]);

  const fMeta = tileMeta[front].map(r => r[k]);
  const uMeta = tileMeta[up].map(r => r[k]);
  const bMeta = tileMeta[back].map(r => r[bc]);
  const dMeta = tileMeta[down].map(r => r[k]);

  const shift = (face, colIdx, sourceVals, sourceMetas) => {
    for (let r = 0; r < N; r++) {
      if (tileMeta[face][r][colIdx].lockedTurns <= 0) {
        faces[face][r][colIdx] = sourceVals[r];
        tileMeta[face][r][colIdx] = sourceMetas[r];
      }
    }
  };

  if (direction === 1) {
    shift(up, k, fM, fMeta);
    shift(back, bc, uM, uMeta);
    shift(down, k, bM, bMeta);
    shift(front, k, dM, dMeta);
  } else {
    shift(front, k, uM, uMeta);
    shift(up, k, bM, bMeta);
    shift(back, bc, dM, dMeta);
    shift(down, k, fM, fMeta);
  }

  if (k === 0) rotateFaceInPlace(left, direction);
  if (k === N - 1) rotateFaceInPlace(right, -direction);
  afterTwist();
}

function afterTwist() {
  PHYSICAL.forEach(f => {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (tileMeta[f][r][c].lockedTurns > 0) {
          tileMeta[f][r][c].lockedTurns--;
        }
      }
    }
  });

  // Automatically switch focus to face containing a ready word
  const ready = findFaceWords();
  if (ready.length > 0) {
    focusFace(ready[0].face);
  } else {
    render();
  }
}

// Word Matching & Wildcards  
function testSliceWithWildcards(faceKey, sliceCoords) {
  const letters = sliceCoords.map(([r, c]) => faces[faceKey][r][c]);
  const metas = sliceCoords.map(([r, c]) => tileMeta[faceKey][r][c]);

  let wildIndexes = [];
  metas.forEach((m, idx) => {
    if (m.wild && !m.userChoice) wildIndexes.push(idx);
  });

  const buildStr = (charMap) => letters.map((ch, idx) => charMap[idx] || (metas[idx].wild && metas[idx].userChoice ? metas[idx].userChoice : ch)).join("").toLowerCase();

  if (wildIndexes.length === 0) {
    const candidate = buildStr({});
    if (candidate.length >= MIN_WORD_LEN && typeof WORD_SET !== "undefined" && WORD_SET.has(candidate)) {
      return { word: candidate, wildAssignments: {} };
    }
    return null;
  }

  const ALPHABET = "etaoinshrdlcumwfgypbvkjxqz".toUpperCase().split("");
  for (let a = 0; a < ALPHABET.length; a++) {
    const map = {};
    wildIndexes.forEach(idx => map[idx] = ALPHABET[a]);
    const candidate = buildStr(map);
    if (candidate.length >= MIN_WORD_LEN && typeof WORD_SET !== "undefined" && WORD_SET.has(candidate)) {
      return { word: candidate, wildAssignments: map };
    }
  }

  return null;
}

function findFaceWords() {
  const words = [];
  PHYSICAL.forEach(faceKey => {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        for (let len = N - c; len >= MIN_WORD_LEN; len--) {
          const coords = Array.from({ length: len }, (_, i) => [r, c + i]);
          const res = testSliceWithWildcards(faceKey, coords);
          if (res) {
            words.push({ word: res.word, face: faceKey, type: "row", coords, wildAssignments: res.wildAssignments });
            break;
          }
        }
      }
    }
    for (let c = 0; c < N; c++) {
      for (let r = 0; r < N; r++) {
        for (let len = N - r; len >= MIN_WORD_LEN; len--) {
          const coords = Array.from({ length: len }, (_, i) => [r + i, c]);
          const res = testSliceWithWildcards(faceKey, coords);
          if (res) {
            words.push({ word: res.word, face: faceKey, type: "col", coords, wildAssignments: res.wildAssignments });
            break;
          }
        }
      }
    }
  });
  return words;
}

// Orient the camera/belt to bring targetFace into view
function focusFace(targetFace) {
  // 1. If word is on side faces (F, R, B, L), rotate the belt until it is front-facing
  if (['F', 'R', 'B', 'L'].includes(targetFace)) {
    while (belt[0] !== targetFace) {
      rotateView();
    }
  } 
  // 2. If word is on Top (U) or Bottom (D) face
  else if (targetFace === 'U' || targetFace === 'D') {
    // Re-render to highlight target on top/bottom face
    render();
  }
}

// 2. UPDATED SCORING & MULTIPLIERS  
// Calculates score including tile intersections (crosses)
function calculateWordScore(wordObj) {
  const upper = wordObj.word.toUpperCase();
  const len = upper.length;
  let basePoints = LENGTH_BONUS[len] !== undefined ? LENGTH_BONUS[len] : len * 2;
  let multiplier = 1;

  const foundWords = findBoardWords();
  let crossCount = 0;
  let doubleTileCount = 0;
  const intersectingWords = new Set();

  // 1. Rare Letters (x2 multiplier, silent tag)
  const hasRare = upper.split("").some((char) => RARE_LETTERS.has(char));
  if (hasRare) multiplier *= 2;

  // 2. Tile-by-tile analysis for Double Tiles and Crosses
  wordObj.coords.forEach(([r, c]) => {
    const tileVal = board[r][c];
    if (tileVal && tileVal.length > 1) {
      doubleTileCount++;
      multiplier *= 2;
    }

    // Identify intersections on the same coordinates
    const matches = foundWords.filter(w => 
      w.coords.some(([wr, wc]) => wr === r && wc === c)
    );

    if (matches.length > 1) {
      crossCount++;
      matches.forEach(m => {
        if (m.word.toLowerCase() !== wordObj.word.toLowerCase()) {
          intersectingWords.add(m.word.toUpperCase());
        }
      });
    }
  });

  // 3. Apply Cross Multipliers (2^crossCount)
  if (crossCount > 0) {
    multiplier *= Math.pow(2, crossCount);
  }

  return {
    points: basePoints * multiplier,
    basePoints,
    multiplier,
    crossCount,
    doubleTileCount,
    intersectingWords: Array.from(intersectingWords)
  };
}

// 3. SUBMIT WORD PROCESSOR
function submitWord() {
  const readyWords = findFaceWords();
  if (readyWords.length === 0) return;

  // Clear the first detected word
  const target = readyWords[0];
  const { face, coords, word, wildAssignments } = target;

  // Calculate score using base scoring scale
  const len = word.length;
  const basePoints = BASE_SCORING[len] || len * 2;
  
  // Apply rare letter multiplier
  const hasRare = word.toUpperCase().split("").some(char => RARE_LETTERS.has(char));
  const multiplier = hasRare ? 2 : 1;
  const totalPoints = basePoints * multiplier;

  // Clear tiles by replacing cleared letters with new random tiles
  coords.forEach(([r, c]) => {
    const newTile = generateTile();
    faces[face][r][c] = newTile.val;
    tileMeta[face][r][c] = newTile.meta;
  });

  score += totalPoints;

  // Log word to wordLog element
  const wordLogEl = document.getElementById("wordLog");
  if (wordLogEl) {
    const li = document.createElement("li");
    li.innerHTML = `<b>${word.toUpperCase()}</b> (${face} face) — <b>+${totalPoints} pts</b>${multiplier > 1 ? " 🔥" : ""}`;
    wordLogEl.prepend(li);
  }

  // Re-render and highlight next word if available
  const remaining = findFaceWords();
  if (remaining.length > 0) {
    focusFace(remaining[0].face);
  } else {
    render({ face, coords });
  }
}

// 4. WORD CLEAR LOG LABELER
function logWord(word, scoreDetails, isCombo = false, isHot = false) {
  const { 
    points, 
    multiplier, 
    crossCount, 
    doubleTileCount, 
    intersectingWords 
  } = scoreDetails;

  // Single-word label hierarchy
  let label = "";
  if (crossCount === 1) label = "CROSS!";
  else if (crossCount === 2) label = "DOUBLE-CROSS!";
  else if (crossCount >= 3) label = "MULTI-CROSS!";
  else if (doubleTileCount > 0) label = "MULTIPLIER!";
  else if (isCombo) label = "COMBO!";
  else if (isHot) label = "HOT-ZONE!";

  // Format dual-word intersection display
  let wordDisplay = `<b>${word.toUpperCase()}</b>`;
  if (intersectingWords.length > 0) {
    wordDisplay += ` <small style="color: #94a3b8;">(cross: ${intersectingWords.join(" × ")})</small>`;
  }

  const tagPrefix = label 
    ? `<span style="color: #fcc200; font-weight: bold; margin-right: 4px;">[${label}]</span>` 
    : "";

  // Append fire emoji for any x2+ multiplier or combo
  const fireEmoji = (multiplier > 1 || isCombo || isHot) ? " 🔥" : "";

  const li = document.createElement("li");
  li.innerHTML = `${tagPrefix}${wordDisplay} — <b>+${points} pts</b>${fireEmoji}`;
  
  wordLogEl.prepend(li);
}

// Targeted Power-Up Handling  
function setPowerupMode(type) {
  if (powerups[type] <= 0) return;

  if (type === 'reshuffle') {
    initFaces(N);
    powerups.reshuffle--;
    render();
    return;
  }

  if (type === 'freezeFace') {
    const turns = getPowerupDuration();
    const { front } = logical();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        tileMeta[front][r][c].lockedTurns = turns;
      }
    }
    powerups.freezeFace--;
    render();
    return;
  }

  activePowerupMode = activePowerupMode === type ? null : type;
  render();
}

function handleTileClick(faceKey, r, c) {
  const turns = getPowerupDuration();

  if (activePowerupMode) {
    if (activePowerupMode === 'lockTile') {
      tileMeta[faceKey][r][c].lockedTurns = turns;
      powerups.lockTile--;
    } else if (activePowerupMode === 'freezeSlice') {
      const isRow = confirm("Click OK to freeze this ROW slice, or CANCEL to freeze the COLUMN slice:");
      if (isRow) {
        for (let col = 0; col < N; col++) tileMeta[faceKey][r][col].lockedTurns = turns;
      } else {
        for (let row = 0; row < N; row++) tileMeta[faceKey][row][c].lockedTurns = turns;
      }
      powerups.freezeSlice--;
    } else if (activePowerupMode === 'lockWord') {
      const ready = findFaceWords().filter(w => w.face === faceKey);
      if (ready.length > 0) {
        ready[0].coords.forEach(([wr, wc]) => tileMeta[faceKey][wr][wc].lockedTurns = turns);
        powerups.lockWord--;
      } else {
        alert("No complete word found on this face to lock!");
        return;
      }
    }
    activePowerupMode = null;
    render();
    return;
  }

  const meta = tileMeta[faceKey][r][c];
  if (meta.wild) {
    const input = prompt("Assign letter for Wildcard tile (A-Z, or cancel to reset to auto):");
    if (input !== null) {
      const clean = input.trim().toUpperCase();
      meta.userChoice = (clean.length === 1 && clean >= 'A' && clean <= 'Z') ? clean : null;
      render();
    }
  }
}

// 3. END GAME SCORE POP-UP MODAL  
function triggerGameOverModal() {
  let modal = document.getElementById('gameOverModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'gameOverModal';
    modal.className = 'game-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="game-modal-card">
      <h2>Game Over!</h2>
      <p>Final Score</p>
      <div class="modal-score">${score}</div>
      <button id="modalPlayAgainBtn">Play Again</button>
    </div>
  `;

  modal.style.display = 'flex';

  document.getElementById('modalPlayAgainBtn').onclick = () => {
    modal.style.display = 'none';
    resetGame();
  };
}

function updatePowerupUI() {
  document.getElementById('cntLockTile').textContent = powerups.lockTile;
  document.getElementById('cntLockWord').textContent = powerups.lockWord;
  document.getElementById('cntFreezeSlice').textContent = powerups.freezeSlice;
  document.getElementById('cntFreezeFace').textContent = powerups.freezeFace;
  document.getElementById('cntReshuffle').textContent = powerups.reshuffle;

  document.getElementById('btnLockTile').disabled = powerups.lockTile <= 0;
  document.getElementById('btnLockWord').disabled = powerups.lockWord <= 0;
  document.getElementById('btnFreezeSlice').disabled = powerups.freezeSlice <= 0;
  document.getElementById('btnFreezeFace').disabled = powerups.freezeFace <= 0;
  document.getElementById('btnReshuffle').disabled = powerups.reshuffle <= 0;

  document.getElementById('btnLockTile').classList.toggle('active-mode', activePowerupMode === 'lockTile');
  document.getElementById('btnLockWord').classList.toggle('active-mode', activePowerupMode === 'lockWord');
  document.getElementById('btnFreezeSlice').classList.toggle('active-mode', activePowerupMode === 'freezeSlice');
}

// Rendering  
function buildSizeToggle() {
  const el = document.getElementById('sizeToggle');
  el.innerHTML = '';
  for (let n = 5; n <= 8; n++) {
    const b = document.createElement('button');
    b.textContent = n + '×' + n + '×' + n;
    if (n === N) b.classList.add('active');
    b.onclick = () => { N = n; resetGame(); };
    el.appendChild(b);
  }
}

function render(justCleared) {
  buildSizeToggle();
  updatePowerupUI();

  const cubeEl = document.getElementById('cube');
  cubeEl.style.setProperty('--spin', (spinSteps * -90) + 'deg');

  // In render():
  const half = 160; // Upgraded from 90 to match the 320px face depth
  const placements = {
    F: `rotateY(0deg) translateZ(${half}px)`,
    B: `rotateY(180deg) translateZ(${half}px)`,
    R: `rotateY(90deg) translateZ(${half}px)`,
    L: `rotateY(-90deg) translateZ(${half}px)`,
    U: `rotateX(90deg) translateZ(${half}px)`,
    D: `rotateX(-90deg) translateZ(${half}px)`,
  };

  const ready = document.getElementById('assistToggle').checked ? findFaceWords() : [];
  const readyByFace = {};
  ready.forEach(w => {
    readyByFace[w.face] = readyByFace[w.face] || new Set();
    w.coords.forEach(([r, c]) => readyByFace[w.face].add(`${r},${c}`));
  });

  const { front, right, back, left, up, down } = logical();

  PHYSICAL.forEach(faceKey => {
    const el = document.getElementById('face' + faceKey);
    el.style.transform = placements[faceKey];
    el.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    el.style.gridTemplateRows = `repeat(${N}, 1fr)`;

    el.innerHTML = '';
    const m = faces[faceKey];
    const meta = tileMeta[faceKey];
    const readySet = readyByFace[faceKey];
    const role = faceKey === front ? 'front' : faceKey === right ? 'right' : faceKey === back ? 'back'
      : faceKey === left ? 'left' : faceKey === up ? 'up' : 'down';

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.fontSize = Math.max(14, Math.floor(380 / N * 0.4)) + 'px';

        cell.textContent = meta[i][j].wild ? (meta[i][j].userChoice ? meta[i][j].userChoice : '?') : m[i][j];
        cell.onclick = () => handleTileClick(faceKey, i, j);

        if (['front', 'right', 'back', 'left'].includes(role) && i === rowLayer) cell.classList.add('selected');
        if (role === 'front' && j === colLayer) cell.classList.add('selected');
        if (role === 'up' && j === colLayer) cell.classList.add('selected');
        if (role === 'down' && j === colLayer) cell.classList.add('selected');
        if (role === 'back' && j === (N - 1 - colLayer)) cell.classList.add('selected');

        if (meta[i][j].lockedTurns > 0) cell.classList.add('is-locked');
        if (meta[i][j].wild) cell.classList.add('is-wild');
        if (meta[i][j].double) cell.classList.add('is-double');

        if (readySet && readySet.has(`${i},${j}`)) cell.classList.add('ready');
        if (justCleared && justCleared.face === faceKey &&
          justCleared.coords.some(([r, c]) => r === i && c === j)) cell.classList.add('cleared');

        el.appendChild(cell);
      }
    }
  });

  const statusEl = document.getElementById('status');
  statusEl.innerHTML = activePowerupMode 
    ? `<b style="color:#ef4444;">SELECT TARGET FOR: ${activePowerupMode.toUpperCase()}</b>`
    : `<span>size <b>${N}×${N}×${N}</b></span><span>front <b>${front}</b></span><span>row <b>${rowLayer + 1}</b>/${N}</span><span>col <b>${colLayer + 1}</b>/${N}</span>`;

  document.getElementById('score').textContent = score;

  const readyLabel = document.getElementById('readyLabel');
  if (ready.length > 0) {
    readyLabel.textContent = `Ready: ${ready[0].word.toUpperCase()} (${ready[0].face} face) — press Enter`;
    readyLabel.classList.add('active');
  } else if (document.getElementById('assistToggle').checked) {
    readyLabel.textContent = 'No word ready.';
    readyLabel.classList.remove('active');
  } else {
    readyLabel.textContent = 'Press Enter to check for a ready word.';
    readyLabel.classList.remove('active');
  }
}

// Controls  
document.getElementById('rotateBtn').addEventListener('click', rotateView);
document.getElementById('assistToggle').addEventListener('change', () => render());
document.getElementById('restartBtn').addEventListener('click', resetGame);

// End Game Modal Trigger
const endBtn = document.getElementById('endGameBtn') || document.createElement('button');
endBtn.id = 'endGameBtn';
endBtn.textContent = 'End Game';
endBtn.onclick = triggerGameOverModal;
if (!document.getElementById('endGameBtn')) document.querySelector('.controls')?.appendChild(endBtn);

document.getElementById('btnLockTile').addEventListener('click', () => setPowerupMode('lockTile'));
document.getElementById('btnLockWord').addEventListener('click', () => setPowerupMode('lockWord'));
document.getElementById('btnFreezeSlice').addEventListener('click', () => setPowerupMode('freezeSlice'));
document.getElementById('btnFreezeFace').addEventListener('click', () => setPowerupMode('freezeFace'));
document.getElementById('btnReshuffle').addEventListener('click', () => setPowerupMode('reshuffle'));

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    rotateView();
    return;
  }
  if (e.key === 'Enter') { 
    e.preventDefault();
    submitWord(); 
    return; 
  }

  switch (e.key) {
    case 'ArrowUp': rowLayer = (rowLayer - 1 + N) % N; render(); break;
    case 'ArrowDown': rowLayer = (rowLayer + 1) % N; render(); break;
    case 'ArrowLeft': twistRow(1); break;
    case 'ArrowRight': twistRow(-1); break;
    case 'a': case 'A': colLayer = (colLayer - 1 + N) % N; render(); break;
    case 'd': case 'D': colLayer = (colLayer + 1) % N; render(); break;
    case 'w': case 'W': twistCol(-1); break;
    case 's': case 'S': twistCol(1); break;
    default: return;
  }
  e.preventDefault();
});

// Init  
function resetGame() {
  score = 0;
  rowLayer = 0;
  colLayer = 0;
  belt = ['F', 'R', 'B', 'L'];
  spinSteps = 0;
  activePowerupMode = null;
  powerups = { lockTile: 3, lockWord: 2, freezeSlice: 2, freezeFace: 1, reshuffle: 1 };
  document.getElementById('wordLog').innerHTML = '';
  initFaces(N);
  render();
}

resetGame();