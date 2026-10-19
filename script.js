"use strict";

const DIFFICULTIES = {
  beginner: { label: "초급", columns: 9, rows: 9, mines: 10 },
  intermediate: { label: "중급", columns: 16, rows: 16, mines: 40 },
  expert: { label: "고급", columns: 30, rows: 16, mines: 99 },
};
const RECORDS_KEY = "minesweeper.records.v1";

const boardElement = document.querySelector("#board");
const mineCounterElement = document.querySelector("#mine-counter");
const timerElement = document.querySelector("#timer");
const restartButton = document.querySelector("#restart-button");
const faceIcon = document.querySelector("#face-icon");
const messageElement = document.querySelector("#game-message");
const soundToggle = document.querySelector("#sound-toggle");
const soundIcon = document.querySelector("#sound-icon");
const soundLabel = document.querySelector("#sound-label");
const difficultyButtons = [...document.querySelectorAll(".difficulty-button")];

let selectedDifficulty = "beginner";
let game;
let timerInterval = null;
let audioContext = null;
let soundEnabled = true;
let storageErrorMessage = "";
let bestTimes = readBestTimes();

function readBestTimes() {
  try {
    const saved = window.localStorage.getItem(RECORDS_KEY);
    if (!saved) return {};

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("저장된 기록의 형식이 올바르지 않습니다.");
    }

    return Object.fromEntries(
      Object.entries(DIFFICULTIES)
        .filter(([key]) => Number.isInteger(parsed[key]) && parsed[key] >= 0)
        .map(([key]) => [key, parsed[key]]),
    );
  } catch (error) {
    showStorageError("최고 기록을 불러오지 못했습니다.", error);
    return {};
  }
}

function showStorageError(message, error) {
  console.error(message, error);
  storageErrorMessage = `${message} 브라우저 저장소 설정을 확인해 주세요.`;
  messageElement.textContent = storageErrorMessage;
}

function saveBestTimes() {
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(bestTimes));
    return true;
  } catch (error) {
    showStorageError("최고 기록을 저장하지 못했습니다.", error);
    return false;
  }
}

function renderRecords() {
  for (const key of Object.keys(DIFFICULTIES)) {
    const recordElement = document.querySelector(`#record-${key}`);
    recordElement.textContent = bestTimes[key] === undefined
      ? "--:--"
      : formatRecord(bestTimes[key]);
  }
}

function formatRecord(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function setFace(state) {
  const labels = {
    idle: "대기 중",
    playing: "게임 진행 중",
    pressed: "칸을 누르는 중",
    won: "승리",
    lost: "패배",
  };
  faceIcon.setAttribute("class", `face-icon face-${state}`);
  faceIcon.setAttribute("aria-label", labels[state]);
  restartButton.setAttribute("aria-label", `다시 시작: ${labels[state]}`);
}

function renderSevenSegment(element, value, accessibleLabel) {
  const digitSegments = {
    "0": ["a", "b", "c", "d", "e", "f"],
    "1": ["b", "c"],
    "2": ["a", "b", "g", "e", "d"],
    "3": ["a", "b", "g", "c", "d"],
    "4": ["f", "g", "b", "c"],
    "5": ["a", "f", "g", "c", "d"],
    "6": ["a", "f", "g", "e", "c", "d"],
    "7": ["a", "b", "c"],
    "8": ["a", "b", "c", "d", "e", "f", "g"],
    "9": ["a", "b", "c", "d", "f", "g"],
    "-": ["g"],
  };
  const fragment = document.createDocumentFragment();

  for (const character of String(value)) {
    const digit = document.createElement("span");
    digit.className = "digit";
    digit.setAttribute("aria-hidden", "true");
    for (const segmentName of ["a", "b", "c", "d", "e", "f", "g"]) {
      const segment = document.createElement("span");
      segment.className = `segment segment-${segmentName}`;
      if (digitSegments[character]?.includes(segmentName)) {
        segment.classList.add("is-lit");
      }
      digit.append(segment);
    }
    fragment.append(digit);
  }

  element.replaceChildren(fragment);
  element.setAttribute("aria-label", accessibleLabel);
}

function counterValue(value) {
  return value < 0
    ? `-${String(Math.abs(value)).padStart(2, "0")}`
    : String(value).padStart(3, "0");
}

function createEmptyGame() {
  const settings = DIFFICULTIES[selectedDifficulty];
  return {
    columns: settings.columns,
    rows: settings.rows,
    mineCount: settings.mines,
    cells: Array.from({ length: settings.rows * settings.columns }, (_, index) => ({
      index,
      mine: false,
      adjacentMines: 0,
      revealed: false,
      flagged: false,
    })),
    flags: 0,
    revealedSafeCells: 0,
    started: false,
    ended: false,
    outcome: null,
    explodedCell: null,
    elapsedSeconds: 0,
  };
}

function startNewGame() {
  stopTimer();
  game = createEmptyGame();
  boardElement.replaceChildren();
  boardElement.style.setProperty("--columns", game.columns);
  boardElement.setAttribute("aria-label", `${DIFFICULTIES[selectedDifficulty].label} 지뢰찾기 격자`);

  const fragment = document.createDocumentFragment();
  for (const cell of game.cells) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.dataset.index = String(cell.index);
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", `${cell.index + 1}번 칸, 닫힘`);
    button.addEventListener("click", () => revealCell(cell.index));
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      toggleFlag(cell.index);
    });
    fragment.append(button);
  }
  boardElement.append(fragment);

  renderSevenSegment(timerElement, counterValue(0), "경과 시간 0초");
  renderSevenSegment(mineCounterElement, counterValue(game.mineCount), `남은 지뢰 ${game.mineCount}개`);
  setFace("idle");
  messageElement.textContent = storageErrorMessage || "칸을 열어 게임을 시작하세요.";
  renderRecords();
}

function getNeighbors(index) {
  const row = Math.floor(index / game.columns);
  const column = index % game.columns;
  const neighbors = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const neighborRow = row + rowOffset;
      const neighborColumn = column + columnOffset;
      if (
        neighborRow >= 0
        && neighborRow < game.rows
        && neighborColumn >= 0
        && neighborColumn < game.columns
      ) {
        neighbors.push(neighborRow * game.columns + neighborColumn);
      }
    }
  }

  return neighbors;
}

function placeMines(firstIndex) {
  const excluded = new Set([firstIndex, ...getNeighbors(firstIndex)]);
  const available = game.cells.filter((cell) => !excluded.has(cell.index));

  for (let index = available.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [available[index], available[swapIndex]] = [available[swapIndex], available[index]];
  }

  for (const cell of available.slice(0, game.mineCount)) {
    cell.mine = true;
  }

  for (const cell of game.cells) {
    if (!cell.mine) {
      cell.adjacentMines = getNeighbors(cell.index)
        .filter((neighborIndex) => game.cells[neighborIndex].mine).length;
    }
  }
}

function revealCell(index) {
  const cell = game.cells[index];
  if (game.ended || cell.revealed || cell.flagged) return;

  if (!game.started) {
    placeMines(index);
    game.started = true;
    setFace("playing");
    startTimer();
  }

  if (cell.mine) {
    game.explodedCell = index;
    finishGame("lost");
    playSound("explosion");
    renderBoard();
    return;
  }

  revealSafeArea(index);
  playSound("click");

  if (game.revealedSafeCells === game.cells.length - game.mineCount) {
    finishGame("won");
  }
  renderBoard();
}

function revealSafeArea(startIndex) {
  const pending = [startIndex];
  const visited = new Set();

  while (pending.length > 0) {
    const index = pending.pop();
    if (visited.has(index)) continue;
    visited.add(index);

    const cell = game.cells[index];
    if (cell.revealed || cell.flagged || cell.mine) continue;

    cell.revealed = true;
    game.revealedSafeCells += 1;
    if (cell.adjacentMines === 0) {
      pending.push(...getNeighbors(index));
    }
  }
}

function toggleFlag(index) {
  const cell = game.cells[index];
  if (game.ended || cell.revealed) return;

  cell.flagged = !cell.flagged;
  game.flags += cell.flagged ? 1 : -1;
  const remainingMines = game.mineCount - game.flags;
  renderSevenSegment(mineCounterElement, counterValue(remainingMines), `남은 지뢰 ${remainingMines}개`);
  playSound("flag");
  renderBoard();
}

function renderBoard() {
  for (const cell of game.cells) {
    const button = boardElement.children[cell.index];
    button.className = "cell";
    button.removeAttribute("data-number");
    button.textContent = "";
    button.disabled = game.ended;

    if (cell.revealed) {
      button.classList.add("is-open");
      if (cell.mine) {
        button.classList.add("is-mine");
        button.textContent = "💣";
        button.setAttribute("aria-label", `${cell.index + 1}번 칸, 지뢰`);
      } else {
        if (cell.adjacentMines > 0) {
          button.dataset.number = String(cell.adjacentMines);
          button.textContent = String(cell.adjacentMines);
        }
        button.setAttribute("aria-label", cell.adjacentMines
          ? `${cell.index + 1}번 칸, 주변 지뢰 ${cell.adjacentMines}개`
          : `${cell.index + 1}번 칸, 빈 칸`);
      }
    } else if (game.ended && cell.mine) {
      button.classList.add("is-open", "is-mine");
      button.textContent = "💣";
      button.setAttribute("aria-label", `${cell.index + 1}번 칸, 지뢰`);
    } else if (game.ended && cell.flagged && !cell.mine) {
      button.classList.add("is-wrong-flag");
      button.textContent = "❌";
      button.setAttribute("aria-label", `${cell.index + 1}번 칸, 잘못 놓은 깃발`);
    } else if (cell.flagged) {
      button.textContent = "🚩";
      button.setAttribute("aria-label", `${cell.index + 1}번 칸, 깃발`);
    } else {
      button.setAttribute("aria-label", `${cell.index + 1}번 칸, 닫힘`);
    }

    if (cell.index === game.explodedCell) {
      button.classList.add("is-exploded");
    }
  }
}

function startTimer() {
  stopTimer();
  timerInterval = window.setInterval(() => {
    game.elapsedSeconds += 1;
    renderSevenSegment(timerElement, counterValue(game.elapsedSeconds), `경과 시간 ${game.elapsedSeconds}초`);
  }, 1000);
}

function stopTimer() {
  if (timerInterval !== null) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
}

function finishGame(outcome) {
  game.ended = true;
  game.outcome = outcome;
  stopTimer();

  if (outcome === "won") {
    setFace("won");
    messageElement.textContent = `승리! ${game.elapsedSeconds}초 만에 안전한 칸을 모두 열었습니다.`;
    playSound("win");
    if (bestTimes[selectedDifficulty] === undefined || game.elapsedSeconds < bestTimes[selectedDifficulty]) {
      bestTimes[selectedDifficulty] = game.elapsedSeconds;
      const saved = saveBestTimes();
      renderRecords();
      messageElement.textContent += saved
        ? " 새로운 최고 기록!"
        : ` ${storageErrorMessage}`;
    }
  } else {
    setFace("lost");
    messageElement.textContent = "지뢰를 밟았습니다. 다시 도전해 보세요!";
  }
}

function getAudioContext() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    messageElement.textContent = "이 브라우저는 효과음을 지원하지 않습니다.";
    return null;
  }
  if (!audioContext) audioContext = new AudioContextConstructor();
  if (audioContext.state === "suspended") {
    audioContext.resume().catch((error) => {
      console.error("효과음을 재생하지 못했습니다.", error);
      messageElement.textContent = "효과음을 재생하지 못했습니다. 브라우저 설정을 확인해 주세요.";
    });
  }
  return audioContext;
}

function playTone(frequency, duration, type = "square", volume = 0.035, delay = 0) {
  const context = getAudioContext();
  if (!context || !soundEnabled) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = context.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(volume, startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
}

function playSound(kind) {
  if (!soundEnabled) return;
  if (kind === "click") playTone(520, 0.045, "square", 0.018);
  if (kind === "flag") playTone(740, 0.07, "square", 0.025);
  if (kind === "explosion") {
    playTone(110, 0.22, "sawtooth", 0.06);
    playTone(65, 0.35, "square", 0.04, 0.12);
  }
  if (kind === "win") {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      playTone(frequency, 0.12, "square", 0.035, index * 0.11);
    });
  }
}

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedDifficulty = button.dataset.difficulty;
    difficultyButtons.forEach((item) => {
      const isSelected = item === button;
      item.classList.toggle("is-active", isSelected);
      item.setAttribute("aria-pressed", String(isSelected));
    });
    startNewGame();
  });
});

boardElement.addEventListener("pointerdown", (event) => {
  if (event.isPrimary && event.button === 0 && event.target.closest(".cell") && !game.ended) {
    setFace("pressed");
  }
});

function restoreFaceAfterPress() {
  if (game.ended) return;
  setFace(game.started ? "playing" : "idle");
}

boardElement.addEventListener("pointerup", restoreFaceAfterPress);
boardElement.addEventListener("pointercancel", restoreFaceAfterPress);
window.addEventListener("pointerup", restoreFaceAfterPress);
window.addEventListener("pointercancel", restoreFaceAfterPress);

restartButton.addEventListener("click", startNewGame);

soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  soundIcon.textContent = soundEnabled ? "🔊" : "🔇";
  soundLabel.textContent = soundEnabled ? "사운드 켜짐" : "사운드 꺼짐";
  if (soundEnabled) playSound("click");
});

renderRecords();
startNewGame();
