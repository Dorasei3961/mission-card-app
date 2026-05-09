import type { Timestamp } from "firebase/firestore";

export type QuizStatus = "draft" | "active" | "closed";

export type QuizFields = {
  question: string;
  choices: string[];
  correctIndex: number;
  points: number;
  timeLimit: number | null;
  status: QuizStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  activatedAt: Timestamp | null;
};

export type QuizDoc = QuizFields & { id: string };

const MAX_CHOICES = 4;

export function normalizeQuizFromFirestore(id: string, raw: Record<string, unknown>): QuizDoc {
  const choicesRaw = raw.choices;
  const choices = Array.isArray(choicesRaw)
    ? choicesRaw.map((c) => String(c ?? "").trim()).slice(0, MAX_CHOICES)
    : ["", "", "", ""];
  while (choices.length < MAX_CHOICES) choices.push("");
  const correctIndex = Math.min(
    MAX_CHOICES - 1,
    Math.max(0, Math.floor(Number(raw.correctIndex ?? 0))),
  );
  const points = typeof raw.points === "number" && Number.isFinite(raw.points) ? Math.max(0, raw.points) : 0;
  const tl = raw.timeLimit;
  const timeLimit =
    tl === null || tl === undefined
      ? null
      : typeof tl === "number" && Number.isFinite(tl) && tl > 0
        ? Math.floor(tl)
        : null;
  let status: QuizStatus = "draft";
  if (raw.status === "active" || raw.status === "closed" || raw.status === "draft") {
    status = raw.status;
  }
  return {
    id,
    question: String(raw.question ?? "").trim(),
    choices,
    correctIndex,
    points,
    timeLimit,
    status,
    createdAt: raw.createdAt as Timestamp | null,
    updatedAt: raw.updatedAt as Timestamp | null,
    activatedAt: raw.activatedAt as Timestamp | null,
  };
}
