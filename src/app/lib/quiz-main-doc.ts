import { doc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * クイズ進行の拡張状態（スキップ等）
 * Firestore は doc が偶数セグメント必須のため、
 * `events/{eventId}/quiz/state/main` 相当は `events/{eventId}/quiz/main` に保存する。
 */
export function quizMainDocRef(eventId: string) {
  return doc(db, "events", eventId, "quiz", "main");
}

export type QuizMainDocNormalized = {
  /** 現在のランでスキップされた問題ID */
  skippedQuestionIds: string[];
  /** 参加者向けスキップ通知（次の出題でクリア） */
  skipNoticeQuestionId: string | null;
  /** `skipped` のときスキップ直後の補助表示用 */
  status: "idle" | "skipped" | string;
  /** イベント quizState の currentRunId と揃える */
  currentRunId: string | null;
};

export function normalizeQuizMainDoc(raw: Record<string, unknown> | undefined): QuizMainDocNormalized {
  const skippedRaw = raw?.skippedQuestionIds;
  const skippedQuestionIds = Array.isArray(skippedRaw)
    ? skippedRaw.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  const skipNoticeQuestionId =
    typeof raw?.skipNoticeQuestionId === "string" && raw.skipNoticeQuestionId ? raw.skipNoticeQuestionId : null;
  const status = typeof raw?.status === "string" ? raw.status : "idle";
  const currentRunId = typeof raw?.currentRunId === "string" && raw.currentRunId ? raw.currentRunId : null;
  return { skippedQuestionIds, skipNoticeQuestionId, status, currentRunId };
}
