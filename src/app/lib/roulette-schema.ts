import type { Timestamp } from "firebase/firestore";

/** Firestore: events/{eventId}/rouletteSettings/main（論理パスは roulette/settings/main に相当） */
export type RouletteControlMode = "admin" | "participant";

export type RouletteSettings = {
  enabled: boolean;
  name: string;
  controlMode: RouletteControlMode;
  spinDurationMs: number;
  preventSameConsecutive: boolean;
  removeWinnerAfterSpin: boolean;
  updatedAt?: Timestamp;
};

export type RouletteStatus = "idle" | "spinning" | "finished";

export type RouletteState = {
  status: RouletteStatus;
  currentRotation: number;
  winnerItemId: string | null;
  winnerItemLabel: string | null;
  winnerItemName: string | null;
  startedAt: Timestamp | null;
  finishedAt: Timestamp | null;
  updatedAt?: Timestamp;
  /** 直近の当選候補（連続防止用）。finished 後に更新 */
  lastResultItemId: string | null;
  spinNonce: number;
  spinStartedBy: "admin" | "participant" | null;
};

export type RouletteItem = {
  label: string;
  name: string;
  weight: number;
  order: number;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type RouletteHistoryEntry = {
  itemId: string;
  label: string;
  name: string;
  spunBy: "admin" | "participant";
  createdAt?: Timestamp;
};

export const DEFAULT_ROULETTE_SETTINGS: RouletteSettings = {
  enabled: true,
  name: "豪華景品ルーレット",
  controlMode: "admin",
  spinDurationMs: 3000,
  preventSameConsecutive: true,
  removeWinnerAfterSpin: false,
};

export const DEFAULT_ROULETTE_STATE: RouletteState = {
  status: "idle",
  currentRotation: 0,
  winnerItemId: null,
  winnerItemLabel: null,
  winnerItemName: null,
  startedAt: null,
  finishedAt: null,
  lastResultItemId: null,
  spinNonce: 0,
  spinStartedBy: null,
};

export const ROULETTE_SEGMENT_COLORS = [
  "#FDE68A",
  "#DDD6FE",
  "#BBF7D0",
  "#FECACA",
  "#DBEAFE",
  "#FED7AA",
  "#A7F3D0",
  "#FBCFE8",
  "#C7D2FE",
  "#FDE047",
  "#99F6E4",
  "#FCA5A5",
];

export const INITIAL_ROULETTE_ITEMS_SEED: Omit<RouletteItem, "createdAt" | "updatedAt">[] = [
  { label: "1等", name: "ワイヤレスイヤホン", weight: 1, order: 1, active: true },
  { label: "2等", name: "Amazonギフト券 5,000円分", weight: 1, order: 2, active: true },
  { label: "3等", name: "お菓子詰め合わせ", weight: 2, order: 3, active: true },
  { label: "4等", name: "カフェチケット", weight: 3, order: 4, active: true },
  { label: "5等", name: "オリジナルグッズ", weight: 3, order: 5, active: true },
  { label: "6等", name: "ステッカーセット", weight: 3, order: 6, active: true },
  { label: "参加賞", name: "ドリンクチケット", weight: 5, order: 7, active: true },
  { label: "ハズレ", name: "残念！また次回！", weight: 1, order: 8, active: true },
];

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(parts: (string | number)[]): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

export function deterministicWeightedPick(
  items: { id: string; weight: number; active: boolean }[],
  seed: number,
  excludeItemId: string | null,
): string | null {
  let pool = items.filter((i) => i.active !== false && i.weight > 0);
  if (excludeItemId) {
    const filtered = pool.filter((i) => i.id !== excludeItemId);
    if (filtered.length > 0) pool = filtered;
  }
  if (pool.length === 0) return null;
  const total = pool.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return null;
  const rng = mulberry32(seed);
  let r = rng() * total;
  for (const item of pool) {
    r -= item.weight;
    if (r <= 0) return item.id;
  }
  return pool[pool.length - 1].id;
}

/** 当選セグメントの中心が上向きポインターに来る回転角（deg）。CSS rotate にそのまま渡す */
export function computeFinalRotationDeg(winnerIndex: number, segmentCount: number, fullSpins: number): number {
  if (segmentCount <= 0) return 0;
  const seg = 360 / segmentCount;
  const align = -(winnerIndex + 0.5) * seg;
  return fullSpins * 360 + align;
}

function positiveMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** ルーレット演出：逆回転させず、現在の累積角から時計回りに進めて stored と同じ向き（mod 360）で止める */
export function clockwiseRotationToMatchStoredAngle(
  currentVisualDeg: number,
  storedRotationDeg: number,
): number {
  const targetMod = positiveMod(storedRotationDeg, 360);
  const curMod = positiveMod(currentVisualDeg, 360);
  let delta = (targetMod - curMod + 360) % 360;
  if (delta < 1e-6) return currentVisualDeg;
  return currentVisualDeg + delta;
}

/**
 * finalize が保存する角度と同じ停止向きになり、かつ current から時計回りに最低 minFullSpins 周する累積終端角。
 * （current + extraSpins*360 + 一周以内の差分、と整合）
 */
export function clockwiseEndRotationForSpin(
  currentVisualDeg: number,
  storedFinalDeg: number,
  minFullSpins: number,
): number {
  let end = clockwiseRotationToMatchStoredAngle(currentVisualDeg, storedFinalDeg);
  const minEnd = currentVisualDeg + minFullSpins * 360;
  while (end < minEnd - 1e-6) {
    end += 360;
  }
  return end;
}

/** メイン回転：easeOutCubic（減速して止まる演出） */
export const ROULETTE_SPIN_TRANSITION_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";

export function normalizeRouletteSettings(data: unknown): RouletteSettings {
  if (!data || typeof data !== "object") return { ...DEFAULT_ROULETTE_SETTINGS };
  const o = data as Record<string, unknown>;
  const mode = o.controlMode === "participant" ? "participant" : "admin";
  let spinMs = typeof o.spinDurationMs === "number" ? o.spinDurationMs : DEFAULT_ROULETTE_SETTINGS.spinDurationMs;
  const allowed = [3000, 5000, 7000];
  if (!allowed.includes(spinMs)) {
    spinMs = allowed.reduce((best, x) =>
      Math.abs(x - spinMs) < Math.abs(best - spinMs) ? x : best,
    3000);
  }
  return {
    enabled: o.enabled !== false,
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : DEFAULT_ROULETTE_SETTINGS.name,
    controlMode: mode,
    spinDurationMs: spinMs,
    preventSameConsecutive: o.preventSameConsecutive !== false,
    removeWinnerAfterSpin: o.removeWinnerAfterSpin === true,
    updatedAt: o.updatedAt as Timestamp | undefined,
  };
}

export function normalizeRouletteState(data: unknown): RouletteState {
  if (!data || typeof data !== "object") return { ...DEFAULT_ROULETTE_STATE };
  const o = data as Record<string, unknown>;
  const statusRaw = o.status;
  const status: RouletteStatus =
    statusRaw === "spinning" || statusRaw === "finished" ? statusRaw : "idle";
  const sb = o.spinStartedBy;
  const spinStartedBy =
    sb === "admin" || sb === "participant" ? sb : null;
  return {
    status,
    currentRotation: typeof o.currentRotation === "number" ? o.currentRotation : 0,
    winnerItemId: typeof o.winnerItemId === "string" ? o.winnerItemId : null,
    winnerItemLabel: typeof o.winnerItemLabel === "string" ? o.winnerItemLabel : null,
    winnerItemName: typeof o.winnerItemName === "string" ? o.winnerItemName : null,
    startedAt: (o.startedAt as Timestamp | null) ?? null,
    finishedAt: (o.finishedAt as Timestamp | null) ?? null,
    updatedAt: o.updatedAt as Timestamp | undefined,
    lastResultItemId: typeof o.lastResultItemId === "string" ? o.lastResultItemId : null,
    spinNonce: typeof o.spinNonce === "number" ? o.spinNonce : 0,
    spinStartedBy,
  };
}

export function normalizeRouletteItem(data: unknown): RouletteItem | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  return {
    label: typeof o.label === "string" ? o.label : "",
    name: typeof o.name === "string" ? o.name : "",
    weight: typeof o.weight === "number" && o.weight >= 0 ? o.weight : 1,
    order: typeof o.order === "number" ? o.order : 0,
    active: o.active !== false,
    createdAt: o.createdAt as Timestamp | undefined,
    updatedAt: o.updatedAt as Timestamp | undefined,
  };
}
