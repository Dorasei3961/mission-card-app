import type { Timestamp } from "firebase/firestore";

/** 参加者・運営で共有する進行状態（Firestore `events/{eventId}.quizState`） */
export type QuizRunStatus = "stopped" | "question" | "answer" | "paused" | "finished";

/** 旧クライアントが書き込む値との互換 */
export type QuizRunStatusRaw = QuizRunStatus | "live" | "result" | "ready";

export type QuizProgressMode = "manual" | "auto";

export type NormalizedQuizState = {
  status: QuizRunStatus;
  /** 一時停止直前の状態（再開用） */
  pausedFrom: "question" | "answer" | null;
  currentQuestionId: string | null;
  currentQuestionIndex: number;
  startedAt: Timestamp | null;
  remainingSeconds: number | null;
  timeLimitSeconds: number;
  answerDisplaySeconds: number;
  nextDelaySeconds: number;
  autoRevealAnswer: boolean;
  /** 自動進行で最後の問題のあとイベントを終了扱いにする */
  autoFinishWhenComplete: boolean;
  /** 旧: 自動で次の問題へ — 互換のため保持。新UIでは主に自動進行ループ内で利用 */
  autoNext: boolean;
  showCountdown: boolean;
  orderMode: "fixed" | "random";
  /** 自動進行セッションが動作中 */
  autoAdvanceRunning: boolean;
  /** 答え表示フェーズ開始（自動進行のタイマー用） */
  answerStartedAt: Timestamp | null;
  /** 次の問題までの待機開始 */
  betweenStartedAt: Timestamp | null;
};

export type QuizSettings = {
  progressMode: QuizProgressMode;
};

const DEFAULT_STATE: NormalizedQuizState = {
  status: "stopped",
  pausedFrom: null,
  currentQuestionId: null,
  currentQuestionIndex: -1,
  startedAt: null,
  remainingSeconds: null,
  timeLimitSeconds: 20,
  answerDisplaySeconds: 5,
  nextDelaySeconds: 3,
  autoRevealAnswer: false,
  autoFinishWhenComplete: true,
  autoNext: false,
  showCountdown: true,
  orderMode: "fixed",
  autoAdvanceRunning: false,
  answerStartedAt: null,
  betweenStartedAt: null,
};

export function normalizeRunStatus(raw: unknown): QuizRunStatus {
  if (raw === "live") return "question";
  if (raw === "result") return "answer";
  if (raw === "ready") return "stopped";
  if (raw === "question" || raw === "answer" || raw === "paused" || raw === "finished" || raw === "stopped") {
    return raw;
  }
  return "stopped";
}

export function normalizeQuizStateFromFirestore(raw: Record<string, unknown> | undefined): NormalizedQuizState {
  if (!raw) return { ...DEFAULT_STATE };
  const status = normalizeRunStatus(raw.status);
  const pf = raw.pausedFrom;
  const pausedFrom = pf === "answer" || pf === "question" ? pf : null;
  const curId = typeof raw.currentQuestionId === "string" && raw.currentQuestionId ? raw.currentQuestionId : null;
  const cqi =
    typeof raw.currentQuestionIndex === "number" && Number.isFinite(raw.currentQuestionIndex)
      ? Math.floor(raw.currentQuestionIndex)
      : -1;
  const tl =
    typeof raw.timeLimitSeconds === "number" && raw.timeLimitSeconds > 0 ? Math.floor(raw.timeLimitSeconds) : 20;
  const ads =
    typeof raw.answerDisplaySeconds === "number" && raw.answerDisplaySeconds > 0
      ? Math.floor(raw.answerDisplaySeconds)
      : 5;
  const nds =
    typeof raw.nextDelaySeconds === "number" && raw.nextDelaySeconds >= 0 ? Math.floor(raw.nextDelaySeconds) : 3;
  return {
    status,
    pausedFrom,
    currentQuestionId: curId,
    currentQuestionIndex: cqi,
    startedAt: (raw.startedAt as Timestamp | null) ?? null,
    remainingSeconds: typeof raw.remainingSeconds === "number" ? raw.remainingSeconds : null,
    timeLimitSeconds: tl,
    answerDisplaySeconds: ads,
    nextDelaySeconds: nds,
    autoRevealAnswer: raw.autoRevealAnswer === true,
    autoFinishWhenComplete: raw.autoFinishWhenComplete !== false,
    autoNext: raw.autoNext === true,
    showCountdown: raw.showCountdown !== false,
    orderMode: raw.orderMode === "random" ? "random" : "fixed",
    autoAdvanceRunning: raw.autoAdvanceRunning === true,
    answerStartedAt: (raw.answerStartedAt as Timestamp | null) ?? null,
    betweenStartedAt: (raw.betweenStartedAt as Timestamp | null) ?? null,
  };
}

export function normalizeQuizSettingsFromFirestore(raw: Record<string, unknown> | undefined): QuizSettings {
  const pm = raw?.progressMode;
  return {
    progressMode: pm === "auto" ? "auto" : "manual",
  };
}
