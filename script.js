"use strict";

const ROWS = 9;
const COLUMNS = 9;
const MINE_COUNT = 10;

const boardElement = document.querySelector("#board");
const mineCountElement = document.querySelector("#mine-count");
const timerElement = document.querySelector("#timer");
const statusElement = document.querySelector("#game-status");
const resetButton = document.querySelector("#reset-button");

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
  mineCountElement.textContent = String(MINE_COUNT - flagsPlaced).padStart(2, "0");
  timerElement.textContent = formatTime(elapsedSeconds);
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

  for (let row = 0; row < ROWS; row += 1) {
    const rowCells = [];

    for (let column = 0; column < COLUMNS; column += 1) {
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
        neighborRow < ROWS &&
        neighborColumn >= 0 &&
        neighborColumn < COLUMNS
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

  for (let index = 0; index < MINE_COUNT; index += 1) {
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

  const revealedSafeCount = cells.flat().filter(
    (currentCell) => currentCell.revealed && !currentCell.mine,
  ).length;

  if (revealedSafeCount === ROWS * COLUMNS - MINE_COUNT) {
    finishGame(true, "축하해요! 모든 안전한 칸을 열었어요.");
  }
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

updateCounters();
createBoard();
