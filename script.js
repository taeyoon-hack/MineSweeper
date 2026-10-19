"use strict";

const DIFFICULTIES = {
  beginner: { label: "초급", rows: 9, columns: 9, mines: 10 },
  intermediate: { label: "중급", rows: 16, columns: 16, mines: 40 },
  expert: { label: "고급", rows: 16, columns: 30, mines: 99 },
};
const CONFETTI_COLORS = ["#b6e36a", "#ffd166", "#ff8276", "#77c9d4", "#c7a0ff"];

const boardElement = document.querySelector("#board");
const mineCountElement = document.querySelector("#mine-count");
const timerElement = document.querySelector("#timer");
const statusElement = document.querySelector("#game-status");
const resetButton = document.querySelector("#reset-button");
const difficultyElement = document.querySelector("#difficulty");
const bestRecordElement = document.querySelector("#best-record");
const modeSummaryElement = document.querySelector("#mode-summary");
const confettiLayerElement = document.querySelector("#confetti-layer");

let difficulty = DIFFICULTIES[difficultyElement.value];
let cells = [];
let flagsPlaced = 0;
let elapsedSeconds = 0;
let timerId = null;
let gameStarted = false;
let gameOver = false;

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateCounters() {
  mineCountElement.textContent = String(difficulty.mines - flagsPlaced).padStart(3, "0");
  timerElement.textContent = formatTime(elapsedSeconds);
}

function getBestRecord() {
  const storedRecord = window.localStorage.getItem(`minesweeper-best-${difficultyElement.value}`);

  if (storedRecord === null) {
    return null;
  }

  const bestTime = Number(storedRecord);
  return Number.isSafeInteger(bestTime) && bestTime >= 0 ? bestTime : null;
}

function updateBestRecord() {
  try {
    const bestTime = getBestRecord();
    bestRecordElement.textContent = `최고 기록 · ${bestTime === null ? "--:--" : formatTime(bestTime)}`;
  } catch (error) {
    bestRecordElement.textContent = "최고 기록 · 불러오기 실패";
    statusElement.textContent = "최고 기록을 불러오지 못했습니다.";
    console.error("최고 기록을 불러오지 못했습니다.", error);
  }
}

function updateModeDisplay() {
  boardElement.style.setProperty("--columns", difficulty.columns);
  boardElement.setAttribute(
    "aria-label",
    `${difficulty.rows}행 ${difficulty.columns}열 ${difficulty.label} 지뢰찾기 보드`,
  );
  modeSummaryElement.innerHTML =
    `${difficulty.rows} × ${difficulty.columns} <span aria-hidden="true">·</span> ${difficulty.mines} MINES`;
  updateCounters();
  updateBestRecord();
}

function updateCellLabel(cell) {
  const button = cell.element;

  if (cell.flagged) {
    button.setAttribute("aria-label", `행 ${cell.row + 1}, 열 ${cell.column + 1}, 깃발 표시됨`);
  } else if (!cell.revealed) {
    button.setAttribute("aria-label", `행 ${cell.row + 1}, 열 ${cell.column + 1}, 닫힘`);
  } else if (cell.mine) {
    button.setAttribute("aria-label", `행 ${cell.row + 1}, 열 ${cell.column + 1}, 지뢰`);
  } else if (cell.adjacentMines > 0) {
    button.setAttribute(
      "aria-label",
      `행 ${cell.row + 1}, 열 ${cell.column + 1}, 주변 지뢰 ${cell.adjacentMines}개`,
    );
  } else {
    button.setAttribute("aria-label", `행 ${cell.row + 1}, 열 ${cell.column + 1}, 빈 칸`);
  }
}

function createBoard() {
  boardElement.replaceChildren();
  cells = [];

  for (let row = 0; row < difficulty.rows; row += 1) {
    const rowCells = [];

    for (let column = 0; column < difficulty.columns; column += 1) {
      const button = document.createElement("button");
      button.className = "cell";
      button.type = "button";
      button.setAttribute("role", "gridcell");

      const cell = {
        row,
        column,
        element: button,
        mine: false,
        adjacentMines: 0,
        revealed: false,
        flagged: false,
      };

      button.addEventListener("click", () => revealCell(cell));
      button.addEventListener("mousedown", (event) => {
        if (event.buttons === 3) {
          event.preventDefault();
          chordCell(cell);
        }
      });
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        toggleFlag(cell);
      });

      rowCells.push(cell);
      boardElement.append(button);
    }

    cells.push(rowCells);
  }
}

function getNeighbors(row, column) {
  const neighbors = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) {
        continue;
      }

      const neighborRow = row + rowOffset;
      const neighborColumn = column + columnOffset;

      if (
        neighborRow >= 0 &&
        neighborRow < difficulty.rows &&
        neighborColumn >= 0 &&
        neighborColumn < difficulty.columns
      ) {
        neighbors.push(cells[neighborRow][neighborColumn]);
      }
    }
  }

  return neighbors;
}

function placeMines(firstCell) {
  const candidates = cells.flat().filter(
    (cell) => cell.row !== firstCell.row || cell.column !== firstCell.column,
  );

  for (let index = 0; index < difficulty.mines; index += 1) {
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const [mineCell] = candidates.splice(randomIndex, 1);
    mineCell.mine = true;
  }

  for (const cell of cells.flat()) {
    cell.adjacentMines = getNeighbors(cell.row, cell.column).filter(
      (neighbor) => neighbor.mine,
    ).length;
  }
}

function startTimer() {
  if (gameStarted) {
    return;
  }

  gameStarted = true;
  timerId = window.setInterval(() => {
    elapsedSeconds += 1;
    updateCounters();
  }, 1000);
}

function renderCell(cell) {
  const button = cell.element;
  button.classList.toggle("is-open", cell.revealed);
  button.classList.toggle("is-flagged", cell.flagged);
  button.classList.toggle("is-mine", cell.revealed && cell.mine);
  button.textContent = "";
  button.removeAttribute("data-number");

  if (cell.flagged) {
    button.textContent = "🚩";
  } else if (cell.revealed && cell.mine) {
    button.textContent = "✹";
  } else if (cell.revealed && cell.adjacentMines > 0) {
    button.textContent = String(cell.adjacentMines);
    button.dataset.number = String(cell.adjacentMines);
  }

  updateCellLabel(cell);
}

function revealCell(cell) {
  if (gameOver || cell.revealed || cell.flagged) {
    return;
  }

  if (!gameStarted) {
    placeMines(cell);
    startTimer();
  }

  if (cell.mine) {
    cell.revealed = true;
    renderCell(cell);
    cell.element.classList.add("is-exploded");
    finishGame(false, "지뢰를 밟았어요! 다시 도전해보세요.");
    return;
  }

  revealSafeCells(cell);
  checkForWin();
}

function checkForWin() {
  const revealedSafeCount = cells.flat().filter(
    (currentCell) => currentCell.revealed && !currentCell.mine,
  ).length;

  if (revealedSafeCount === difficulty.rows * difficulty.columns - difficulty.mines) {
    finishGame(true, "축하해요! 모든 안전한 칸을 열었어요.");
  }
}

function chordCell(cell) {
  if (gameOver || !cell.revealed || cell.mine || cell.adjacentMines === 0) {
    return;
  }

  const neighbors = getNeighbors(cell.row, cell.column);
  const flaggedNeighbors = neighbors.filter((neighbor) => neighbor.flagged).length;

  if (flaggedNeighbors !== cell.adjacentMines) {
    return;
  }

  const hiddenNeighbors = neighbors.filter((neighbor) => !neighbor.revealed && !neighbor.flagged);
  const hitMine = hiddenNeighbors.find((neighbor) => neighbor.mine);

  for (const neighbor of hiddenNeighbors) {
    if (neighbor.mine) {
      neighbor.revealed = true;
      renderCell(neighbor);
      neighbor.element.classList.add("is-exploded");
    } else {
      revealSafeCells(neighbor);
    }
  }

  if (hitMine) {
    finishGame(false, "지뢰를 밟았어요! 다시 도전해보세요.");
    return;
  }

  checkForWin();
}

function revealSafeCells(startCell) {
  const pending = [startCell];

  while (pending.length > 0) {
    const cell = pending.pop();

    if (cell.revealed || cell.flagged || cell.mine) {
      continue;
    }

    cell.revealed = true;
    renderCell(cell);

    if (cell.adjacentMines === 0) {
      pending.push(...getNeighbors(cell.row, cell.column));
    }
  }
}

function toggleFlag(cell) {
  if (gameOver || cell.revealed) {
    return;
  }

  cell.flagged = !cell.flagged;
  flagsPlaced += cell.flagged ? 1 : -1;
  renderCell(cell);
  updateCounters();
}

function finishGame(won, message) {
  gameOver = true;
  window.clearInterval(timerId);
  statusElement.textContent = message;
  statusElement.classList.toggle("is-win", won);
  statusElement.classList.toggle("is-loss", !won);
  resetButton.querySelector("span").textContent = won ? "😎" : "😵";

  if (!won) {
    for (const cell of cells.flat()) {
      if (cell.mine && !cell.flagged) {
        cell.revealed = true;
        renderCell(cell);
      } else if (!cell.mine && cell.flagged) {
        cell.element.classList.add("is-wrong-flag");
        cell.element.textContent = "✕";
      }
    }
    return;
  }

  try {
    const previousBest = getBestRecord();

    if (previousBest === null || elapsedSeconds < previousBest) {
      window.localStorage.setItem(`minesweeper-best-${difficultyElement.value}`, String(elapsedSeconds));
      updateBestRecord();
      statusElement.textContent = `신기록 달성! ${message}`;
      showConfetti();
    }
  } catch (error) {
    statusElement.textContent = `${message} (최고 기록을 저장하지 못했습니다.)`;
    console.error("최고 기록을 저장하지 못했습니다.", error);
  }
}

function showConfetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  confettiLayerElement.replaceChildren();

  for (let index = 0; index < 80; index += 1) {
    const piece = document.createElement("span");
    const size = 5 + Math.random() * 7;
    const delay = Math.random() * 0.8;
    const duration = 2.4 + Math.random() * 1.8;

    piece.className = "confetti-piece";
    piece.style.setProperty("--start-x", `${Math.random() * 100}%`);
    piece.style.setProperty("--piece-size", `${size}px`);
    piece.style.setProperty("--piece-color", CONFETTI_COLORS[index % CONFETTI_COLORS.length]);
    piece.style.setProperty("--fall-delay", `${delay}s`);
    piece.style.setProperty("--fall-duration", `${duration}s`);
    piece.style.setProperty("--drift", `${Math.random() * 180 - 90}px`);
    piece.style.setProperty("--spin", `${Math.random() * 1080 - 540}deg`);
    piece.addEventListener("animationend", () => piece.remove(), { once: true });
    confettiLayerElement.append(piece);
  }
}

function resetGame() {
  window.clearInterval(timerId);
  flagsPlaced = 0;
  elapsedSeconds = 0;
  timerId = null;
  gameStarted = false;
  gameOver = false;
  statusElement.textContent = "칸을 열어 게임을 시작하세요.";
  statusElement.classList.remove("is-win", "is-loss");
  resetButton.querySelector("span").textContent = "🙂";
  updateCounters();
  createBoard();
}

resetButton.addEventListener("click", resetGame);
difficultyElement.addEventListener("change", () => {
  difficulty = DIFFICULTIES[difficultyElement.value];
  resetGame();
  updateModeDisplay();
});

updateModeDisplay();
createBoard();
