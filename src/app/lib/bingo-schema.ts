import { Timestamp } from "firebase/firestore";

export type BingoSettings = {
  enabled: boolean;
  minNumber: number;
  maxNumber: number;
  gridSize: 3 | 5;
  freeCenter: true;
  bingoPoint: number;
};

export type BingoState = {
  currentNumber: number | null;
  drawnNumbers: number[];
};

export type BingoCellValue = number | "FREE";

export type BingoCardDoc = {
  participantId: string;
  participantName: string;
  gridSize: 3 | 5;
  numbers: BingoCellValue[];
  markedNumbers: number[];
  bingoLines: number;
  reachLines: number;
  bingoAwarded: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export const DEFAULT_BINGO_SETTINGS: BingoSettings = {
  enabled: true,
  minNumber: 1,
  maxNumber: 100,
  gridSize: 3,
  freeCenter: true,
  bingoPoint: 100,
};

export const DEFAULT_BINGO_STATE: BingoState = {
  currentNumber: null,
  drawnNumbers: [],
};

export function centerIndex(gridSize: 3 | 5): number {
  const cells = gridSize * gridSize;
  return Math.floor(cells / 2);
}

function uniqueNumbersInRange(min: number, max: number, count: number): number[] {
  const all: number[] = [];
  for (let n = min; n <= max; n += 1) all.push(n);
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

export function generateBingoCardNumbers(gridSize: 3 | 5, min: number, max: number): BingoCellValue[] {
  const total = gridSize * gridSize;
  const center = centerIndex(gridSize);
  const required = total - 1;
  const rangeCount = Math.max(0, max - min + 1);
  if (rangeCount < required) {
    throw new Error("ビンゴカードを生成できるだけの数字範囲がありません。");
  }
  const picked = uniqueNumbersInRange(min, max, required);
  const numbers: BingoCellValue[] = [];
  let p = 0;
  for (let i = 0; i < total; i += 1) {
    if (i === center) {
      numbers.push("FREE");
      continue;
    }
    numbers.push(picked[p]);
    p += 1;
  }
  return numbers;
}

export function buildBingoLines(gridSize: 3 | 5): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < gridSize; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < gridSize; c += 1) row.push(r * gridSize + c);
    lines.push(row);
  }
  for (let c = 0; c < gridSize; c += 1) {
    const col: number[] = [];
    for (let r = 0; r < gridSize; r += 1) col.push(r * gridSize + c);
    lines.push(col);
  }
  const diag1: number[] = [];
  const diag2: number[] = [];
  for (let i = 0; i < gridSize; i += 1) {
    diag1.push(i * gridSize + i);
    diag2.push(i * gridSize + (gridSize - 1 - i));
  }
  lines.push(diag1, diag2);
  return lines;
}

export function normalizeBingoSettings(raw: unknown): BingoSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_BINGO_SETTINGS;
  const o = raw as Record<string, unknown>;
  const min = typeof o.minNumber === "number" ? Math.floor(o.minNumber) : DEFAULT_BINGO_SETTINGS.minNumber;
  const max = typeof o.maxNumber === "number" ? Math.floor(o.maxNumber) : DEFAULT_BINGO_SETTINGS.maxNumber;
  const gridSize = o.gridSize === 5 ? 5 : 3;
  return {
    enabled: o.enabled !== false,
    minNumber: min,
    maxNumber: max,
    gridSize,
    freeCenter: true,
    bingoPoint: typeof o.bingoPoint === "number" ? Math.max(0, Math.floor(o.bingoPoint)) : 100,
  };
}

export function normalizeBingoState(raw: unknown): BingoState {
  if (!raw || typeof raw !== "object") return DEFAULT_BINGO_STATE;
  const o = raw as Record<string, unknown>;
  const drawnRaw = Array.isArray(o.drawnNumbers) ? o.drawnNumbers : [];
  const drawn = drawnRaw
    .map((v) => (typeof v === "number" ? Math.floor(v) : Number.NaN))
    .filter((v) => Number.isFinite(v));
  return {
    currentNumber: typeof o.currentNumber === "number" ? Math.floor(o.currentNumber) : null,
    drawnNumbers: Array.from(new Set(drawn)),
  };
}
