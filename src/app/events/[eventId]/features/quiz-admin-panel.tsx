"use client";

/* eslint-disable react-hooks/set-state-in-effect -- Firestore listeners and form sync update UI from external state */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  ChevronRight,
  CircleDot,
  Copy,
  GripVertical,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { db } from "../../../lib/firebase";
import { resolveEventFeatures } from "../../../lib/event-features";
import {
  buildQuizRunStateMirror,
  mergeQuizStatePatch,
  normalizeEventQuizState,
  normalizeQuizSettingsFromFirestore,
  type NormalizedQuizState,
  type QuizSettings,
} from "../../../lib/quiz-run-state";
import { normalizeQuizFromFirestore, type QuizDoc, type QuizStatus } from "../../../lib/quiz-schema";

type Props = { eventId: string };
type AdminQuizTab = "create" | "run" | "results";
type ListFilterStatus = "all" | "public" | "private";
type SortMode = "order" | "latest";
type OrderMode = "fixed" | "random";
/** 問題バンクの公開状態（Firestore `adminStatus` と対応） */
type BankVisibility = "public" | "private";
type ResultOrder = "latest" | "question";

type AdminQuiz = QuizDoc & {
  explanation: string;
  bankVisibility: BankVisibility;
  order: number;
};

type AnswerStats = Record<string, { total: number; correct: number }>;
type ParticipantAnswer = {
  id: string;
  quizId: string;
  quizQuestion: string;
  participantName: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  answeredAt: Timestamp | null;
};

function normalizeBankVisibility(raw: unknown): BankVisibility {
  if (raw === "private" || raw === "draft") return "private";
  return "public";
}

function isBankPublished(q: AdminQuiz): boolean {
  return q.bankVisibility === "public";
}

/** 問題作成タブ用：公開／下書きと出題ライフサイクル */
function bankBadge(q: AdminQuiz): { id: ListFilterStatus; label: string; cls: string } {
  if (!isBankPublished(q)) {
    return { id: "private", label: "下書き", cls: "bg-zinc-100 text-zinc-700 ring-zinc-200" };
  }
  if (q.status === "closed") {
    return { id: "public", label: "公開 · 出題済み", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
  }
  return { id: "public", label: "公開", cls: "bg-violet-50 text-violet-800 ring-violet-200" };
}

function sortByOrder(a: AdminQuiz, b: AdminQuiz): number {
  return a.order - b.order || (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);
}

function sortByLatest(a: AdminQuiz, b: AdminQuiz): number {
  return (b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0);
}

function fmtTs(ts: Timestamp | null): string {
  if (!ts) return "-";
  return ts.toDate().toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 主催者向け：停止中 / 出題中 / 答え表示中 / 終了（旧 paused は pausedFrom で寄せる） */
function hostPhaseLabel(status: NormalizedQuizState["status"], pausedFrom: NormalizedQuizState["pausedFrom"]): string {
  if (status === "stopped") return "停止中";
  if (status === "question") return "出題中";
  if (status === "answer") return "答え表示中";
  if (status === "finished") return "終了";
  if (status === "paused") {
    if (pausedFrom === "answer") return "答え表示中";
    if (pausedFrom === "question") return "出題中";
    return "停止中";
  }
  return "停止中";
}

export function QuizAdminPanel({ eventId }: Props) {
  const [quizzes, setQuizzes] = useState<AdminQuiz[]>([]);
  const [busy, setBusy] = useState(false);
  /** 二重押し時にどの操作が走っているか表示用 */
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [quizEnabled, setQuizEnabled] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminQuizTab>("create");
  const [listFilterStatus, setListFilterStatus] = useState<ListFilterStatus>("all");
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [searchText, setSearchText] = useState("");
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [resultOrder, setResultOrder] = useState<ResultOrder>("latest");
  const [manualAccordionOpen, setManualAccordionOpen] = useState(false);
  const [autoAccordionOpen, setAutoAccordionOpen] = useState(false);

  const [runState, setRunState] = useState<NormalizedQuizState>(() => normalizeEventQuizState(undefined));
  const [quizSettings, setQuizSettings] = useState<QuizSettings>({ progressMode: "manual" });
  const [answerStats, setAnswerStats] = useState<AnswerStats>({});
  const [participantAnswers, setParticipantAnswers] = useState<ParticipantAnswer[]>([]);

  const runStateRef = useRef(runState);
  const quizSettingsRef = useRef(quizSettings);
  const quizzesRef = useRef(quizzes);
  const autoLoopCancelRef = useRef(false);

  useEffect(() => {
    runStateRef.current = runState;
    quizSettingsRef.current = quizSettings;
    quizzesRef.current = quizzes;
  }, [runState, quizSettings, quizzes]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [qText, setQText] = useState("");
  const [c0, setC0] = useState("");
  const [c1, setC1] = useState("");
  const [c2, setC2] = useState("");
  const [c3, setC3] = useState("");
  const [correctIndex, setCorrectIndex] = useState(0);
  const [points, setPoints] = useState("10");
  const [timeLimit, setTimeLimit] = useState("20");
  const [explanation, setExplanation] = useState("");
  const [publishVisibility, setPublishVisibility] = useState<BankVisibility>("public");

  const [settingTimeLimit, setSettingTimeLimit] = useState("20");
  const [settingOrderMode, setSettingOrderMode] = useState<OrderMode>("fixed");
  const [settingAutoNext, setSettingAutoNext] = useState(false);
  const [settingShowCountdown, setSettingShowCountdown] = useState(true);
  const [settingAnswerDisplay, setSettingAnswerDisplay] = useState("5");
  const [settingNextDelay, setSettingNextDelay] = useState("3");
  const [settingAutoFinish, setSettingAutoFinish] = useState(true);
  const [settingAutoReveal, setSettingAutoReveal] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        setQuizEnabled(false);
        setRunState(normalizeEventQuizState(undefined));
        setQuizSettings({ progressMode: "manual" });
        return;
      }
      const data = snap.data() as {
        features?: unknown;
        quizState?: Record<string, unknown>;
        quizRunState?: Record<string, unknown>;
        quizSettings?: Record<string, unknown>;
      };
      setQuizEnabled(resolveEventFeatures(data.features).quiz);
      setRunState(normalizeEventQuizState(data));
      setQuizSettings(normalizeQuizSettingsFromFirestore(data.quizSettings));
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    setSettingTimeLimit(String(runState.timeLimitSeconds || 20));
    setSettingOrderMode(runState.orderMode);
    setSettingAutoNext(runState.autoNext);
    setSettingShowCountdown(runState.showCountdown);
    setSettingAnswerDisplay(String(runState.answerDisplaySeconds || 5));
    setSettingNextDelay(String(runState.nextDelaySeconds ?? 3));
    setSettingAutoFinish(runState.autoFinishWhenComplete !== false);
    setSettingAutoReveal(runState.autoRevealAnswer === true);
  }, [
    runState.timeLimitSeconds,
    runState.orderMode,
    runState.autoNext,
    runState.showCountdown,
    runState.answerDisplaySeconds,
    runState.nextDelaySeconds,
    runState.autoFinishWhenComplete,
    runState.autoRevealAnswer,
  ]);

  useEffect(() => {
    const coll = collection(db, "events", eventId, "quizzes");
    const unsub = onSnapshot(coll, (snap) => {
      const list = snap.docs.map((d, idx) => {
        const raw = d.data() as Record<string, unknown>;
        const q = normalizeQuizFromFirestore(d.id, raw);
        const bankVisibility = normalizeBankVisibility(raw.adminStatus);
        const explanationText = typeof raw.explanation === "string" ? raw.explanation : "";
        const order = typeof raw.order === "number" && Number.isFinite(raw.order) ? Math.floor(raw.order) : idx + 1;
        return { ...q, explanation: explanationText, bankVisibility, order };
      });
      setQuizzes(list);
      if (!selectedQuizId && list.length > 0) setSelectedQuizId(list[0].id);
    });
    return () => unsub();
  }, [eventId, selectedQuizId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "events", eventId, "quizAnswers"), (snap) => {
      const stats: AnswerStats = {};
      const rows: ParticipantAnswer[] = [];
      snap.docs.forEach((d) => {
        const raw = d.data() as {
          quizId?: unknown;
          participantName?: unknown;
          selectedIndex?: unknown;
          isCorrect?: unknown;
          answeredAt?: unknown;
        };
        const quizId = typeof raw.quizId === "string" ? raw.quizId : "";
        if (!quizId) return;
        if (!stats[quizId]) stats[quizId] = { total: 0, correct: 0 };
        stats[quizId].total += 1;
        if (raw.isCorrect === true) stats[quizId].correct += 1;
        rows.push({
          id: d.id,
          quizId,
          quizQuestion: "",
          participantName: typeof raw.participantName === "string" ? raw.participantName : "参加者",
          selectedIndex: typeof raw.selectedIndex === "number" ? raw.selectedIndex : null,
          isCorrect: raw.isCorrect === true,
          answeredAt: (raw.answeredAt as Timestamp | null) ?? null,
        });
      });
      setAnswerStats(stats);
      setParticipantAnswers(rows);
    });
    return () => unsub();
  }, [eventId]);

  const quizzesWithStats = useMemo(() => {
    return quizzes.map((q) => {
      const s = answerStats[q.id] ?? { total: 0, correct: 0 };
      return {
        ...q,
        totalAnswers: s.total,
        correctAnswers: s.correct,
        correctRate: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
      };
    });
  }, [quizzes, answerStats]);

  const broadcastQuiz = useMemo(() => {
    if (runState.currentQuestionId) {
      return quizzesWithStats.find((q) => q.id === runState.currentQuestionId) ?? null;
    }
    return quizzesWithStats.find((q) => q.status === "active") ?? null;
  }, [quizzesWithStats, runState.currentQuestionId]);

  const filteredQuizzes = useMemo(() => {
    const norm = searchText.trim().toLowerCase();
    const sorted = [...quizzesWithStats].sort(sortMode === "order" ? sortByOrder : sortByLatest);
    return sorted.filter((q) => {
      const badge = bankBadge(q);
      if (listFilterStatus !== "all" && badge.id !== listFilterStatus) return false;
      if (!norm) return true;
      const c = q.choices.join(" ").toLowerCase();
      return q.question.toLowerCase().includes(norm) || c.includes(norm);
    });
  }, [quizzesWithStats, sortMode, listFilterStatus, searchText]);

  const [currentProgress, setCurrentProgress] = useState({ ratio: 0, secondsLeft: 0, total: 0 });
  useEffect(() => {
    const totalDefault = runState.timeLimitSeconds || 0;
    if (runState.status !== "question" || !broadcastQuiz?.activatedAt) {
      setCurrentProgress({ ratio: 0, secondsLeft: 0, total: totalDefault });
      return;
    }
    const total = broadcastQuiz.timeLimit ?? runState.timeLimitSeconds;
    if (total <= 0) {
      setCurrentProgress({ ratio: 0, secondsLeft: 0, total: 0 });
      return;
    }
    const endMs =
      runState.questionDeadlineAt?.toMillis() ?? broadcastQuiz.activatedAt.toMillis() + total * 1000;
    const tick = () => {
      const leftSec = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
      const ratio = Math.max(0, Math.min(100, Math.round((leftSec / total) * 100)));
      setCurrentProgress({ ratio, secondsLeft: leftSec, total });
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [broadcastQuiz, runState.status, runState.timeLimitSeconds, runState.questionDeadlineAt]);

  const currentAnswerStats = useMemo(() => {
    if (!broadcastQuiz) return { total: 0, correctRate: 0 };
    return { total: broadcastQuiz.totalAnswers, correctRate: broadcastQuiz.correctRate };
  }, [broadcastQuiz]);

  const participantRows = useMemo(() => {
    const quizMap = new Map(quizzesWithStats.map((q) => [q.id, q]));
    const rows = participantAnswers.map((row) => ({
      ...row,
      quizQuestion: quizMap.get(row.quizId)?.question ?? "(削除済みの問題)",
      order: quizMap.get(row.quizId)?.order ?? 9999,
    }));
    if (resultOrder === "question") {
      rows.sort((a, b) => a.order - b.order || ((a.answeredAt?.toMillis?.() ?? 0) - (b.answeredAt?.toMillis?.() ?? 0)));
    } else {
      rows.sort((a, b) => (b.answeredAt?.toMillis?.() ?? 0) - (a.answeredAt?.toMillis?.() ?? 0));
    }
    return rows;
  }, [participantAnswers, quizzesWithStats, resultOrder]);

  const closeModal = () => {
    if (busy) return;
    setModalOpen(false);
    setEditingQuizId(null);
    setQText("");
    setC0("");
    setC1("");
    setC2("");
    setC3("");
    setCorrectIndex(0);
    setPoints("10");
    setTimeLimit("20");
    setExplanation("");
    setPublishVisibility("public");
  };

  const openAddModal = () => {
    closeModal();
    setModalOpen(true);
  };

  const openEditModal = (quiz: AdminQuiz) => {
    setEditingQuizId(quiz.id);
    setQText(quiz.question);
    setC0(quiz.choices[0] ?? "");
    setC1(quiz.choices[1] ?? "");
    setC2(quiz.choices[2] ?? "");
    setC3(quiz.choices[3] ?? "");
    setCorrectIndex(Math.max(0, Math.min(3, quiz.correctIndex)));
    setPoints(String(quiz.points));
    setTimeLimit(quiz.timeLimit != null ? String(quiz.timeLimit) : "20");
    setExplanation(quiz.explanation);
    setPublishVisibility(quiz.bankVisibility);
    setModalOpen(true);
  };

  const enableQuizFeature = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const ref = doc(db, "events", eventId);
      const ev = await getDoc(ref);
      const f = resolveEventFeatures(ev.exists() ? ev.data()?.features : undefined);
      await setDoc(
        ref,
        {
          features: { mission: f.mission, quiz: true, bingo: f.bingo, roulette: f.roulette },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("クイズ機能を有効にしました。");
    } catch (e) {
      console.error(e);
      setMessage("設定の更新に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const persistQuiz = async () => {
    if (busy) return;
    if (!qText.trim()) return setMessage("問題文を入力してください。");
    const choices = [c0, c1, c2, c3].map((v) => v.trim());
    if (choices.some((v) => !v)) return setMessage("選択肢 A〜D をすべて入力してください。");
    const pts = Number(points);
    if (!Number.isFinite(pts) || pts < 0) return setMessage("ポイントは0以上の数値にしてください。");
    const tl = Number(timeLimit);
    if (!Number.isFinite(tl) || tl <= 0) return setMessage("制限時間は1秒以上にしてください。");

    setBusy(true);
    setMessage("");
    try {
      const payload = {
        question: qText.trim(),
        choices,
        correctIndex,
        points: Math.floor(pts),
        timeLimit: Math.floor(tl),
        explanation: explanation.trim(),
        adminStatus: publishVisibility === "public" ? "public" : "private",
        status: "draft" as QuizStatus,
        updatedAt: serverTimestamp(),
      };
      if (editingQuizId) {
        await setDoc(doc(db, "events", eventId, "quizzes", editingQuizId), payload, { merge: true });
        setMessage("問題を更新しました。");
      } else {
        const id = crypto.randomUUID();
        const maxOrder = quizzes.reduce((m, q) => Math.max(m, q.order), 0);
        await setDoc(doc(db, "events", eventId, "quizzes", id), {
          ...payload,
          order: maxOrder + 1,
          createdAt: serverTimestamp(),
          activatedAt: null,
        });
        setMessage("問題を追加しました。");
      }
      closeModal();
    } catch (e) {
      console.error(e);
      setMessage("保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const duplicateQuiz = async (quiz: AdminQuiz) => {
    if (busy) return;
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const maxOrder = quizzes.reduce((m, q) => Math.max(m, q.order), 0);
      await setDoc(doc(db, "events", eventId, "quizzes", id), {
        question: quiz.question,
        choices: quiz.choices,
        correctIndex: quiz.correctIndex,
        points: quiz.points,
        timeLimit: quiz.timeLimit ?? 20,
        explanation: quiz.explanation,
        adminStatus: "public",
        status: "draft" as QuizStatus,
        order: maxOrder + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        activatedAt: null,
      });
      setMessage("問題を複製しました。");
    } catch (e) {
      console.error(e);
      setMessage("複製に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const deleteQuiz = async (quiz: AdminQuiz) => {
    if (busy) return;
    if (!window.confirm("この問題を削除しますか？")) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, "events", eventId, "quizzes", quiz.id));
      setMessage("削除しました。");
    } catch (e) {
      console.error(e);
      setMessage("削除に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const activateQuiz = async (quiz: AdminQuiz, opts?: { fromAuto?: boolean; busyActionLabel?: string }) => {
    if (!quizEnabled) return;
    if (!opts?.fromAuto && busy) return;
    if (!opts?.fromAuto) {
      setBusy(true);
      setBusyAction(opts?.busyActionLabel ?? "公開中…");
    }
    setMessage("");
    try {
      const presentable = [...quizzes]
        .filter((q) => isBankPublished(q) && q.status !== "closed")
        .sort(sortByOrder);
      const qIdx = presentable.findIndex((q) => q.id === quiz.id);
      const currentQuestionIndex = qIdx >= 0 ? qIdx : 0;
      const batch = writeBatch(db);
      quizzes.forEach((q) => {
        if (q.status === "active" && q.id !== quiz.id) {
          batch.set(doc(db, "events", eventId, "quizzes", q.id), { status: "closed", updatedAt: serverTimestamp() }, { merge: true });
        }
      });
      batch.set(
        doc(db, "events", eventId, "quizzes", quiz.id),
        { status: "active", adminStatus: "public", activatedAt: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true },
      );
      await batch.commit();
      const quizSnap = await getDoc(doc(db, "events", eventId, "quizzes", quiz.id));
      const act = quizSnap.data()?.activatedAt as Timestamp | undefined;
      const tl = Math.floor(quiz.timeLimit ?? runStateRef.current.timeLimitSeconds);
      const deadlineAt = act && tl > 0 ? Timestamp.fromMillis(act.toMillis() + tl * 1000) : null;
      const evSnap = await getDoc(doc(db, "events", eventId));
      const mode = normalizeQuizSettingsFromFirestore(evSnap.data()?.quizSettings as Record<string, unknown>).progressMode;
      const prev = normalizeEventQuizState(evSnap.data() as Record<string, unknown>);
      const next = mergeQuizStatePatch(prev, {
        status: "question",
        currentQuestionId: quiz.id,
        currentQuestionIndex,
        timeLimitSeconds: tl,
        questionDeadlineAt: deadlineAt,
        pausedFrom: null,
        answerStartedAt: null,
        betweenStartedAt: null,
      });
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: {
            status: "question",
            currentQuestionId: quiz.id,
            currentQuestionIndex,
            startedAt: serverTimestamp(),
            remainingSeconds: tl,
            timeLimitSeconds: tl,
            questionDeadlineAt: deadlineAt,
            orderMode: settingOrderMode,
            autoNext: settingAutoNext,
            showCountdown: settingShowCountdown,
            answerDisplaySeconds: Math.max(1, Math.floor(Number(settingAnswerDisplay)) || 5),
            nextDelaySeconds: Math.max(0, Math.floor(Number(settingNextDelay)) || 3),
            autoRevealAnswer: settingAutoReveal,
            autoFinishWhenComplete: settingAutoFinish,
            pausedFrom: null,
            answerStartedAt: null,
            betweenStartedAt: null,
          },
          quizRunState: buildQuizRunStateMirror(mode, next),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage(opts?.fromAuto ? "" : "問題を公開しました。");
      setSelectedQuizId(quiz.id);
    } catch (e) {
      console.error(e);
      setMessage("出題開始に失敗しました。");
    } finally {
      if (!opts?.fromAuto) {
        setBusy(false);
        setBusyAction(null);
      }
    }
  };

  const manualPublishQuestion = async () => {
    if (busy || !quizEnabled) return;
    const rs = runStateRef.current;
    if (rs.status !== "stopped") {
      setMessage("「問題公開」は停止中にのみ押せます。");
      return;
    }
    const orderMode = settingOrderMode;
    const source = [...quizzesRef.current]
      .filter((q) => isBankPublished(q) && q.status !== "closed")
      .sort(orderMode === "random" ? () => Math.random() - 0.5 : sortByOrder);
    if (!source.length) {
      setMessage("公開できる問題がありません（下書きのみ、または出題済みです）。");
      return;
    }
    await activateQuiz(source[0]);
  };

  const manualShowAnswer = async () => {
    if (busy) return;
    setBusy(true);
    setBusyAction("答えを表示中…");
    try {
      const evSnap = await getDoc(doc(db, "events", eventId));
      const mode = normalizeQuizSettingsFromFirestore(evSnap.data()?.quizSettings as Record<string, unknown>).progressMode;
      const prev = normalizeEventQuizState(evSnap.data() as Record<string, unknown>);
      const next = mergeQuizStatePatch(prev, {
        status: "answer",
        questionDeadlineAt: null,
      });
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: {
            status: "answer",
            answerStartedAt: serverTimestamp(),
            questionDeadlineAt: null,
          },
          quizRunState: buildQuizRunStateMirror(mode, next),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("答えを表示しました。");
    } catch (e) {
      console.error(e);
      setMessage("更新に失敗しました。");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const manualPublishNext = async () => {
    if (busy || !quizEnabled) return;
    const rs = runStateRef.current;
    if (rs.status !== "answer") {
      setMessage("「次を公開」は答え表示中にのみ押せます。");
      return;
    }
    const curId = rs.currentQuestionId;
    const orderMode = settingOrderMode;
    const list = [...quizzesRef.current]
      .filter((q) => isBankPublished(q) && q.status !== "closed")
      .sort(orderMode === "random" ? () => Math.random() - 0.5 : sortByOrder);
    const idx = curId ? list.findIndex((q) => q.id === curId) : -1;
    const nextQ = idx >= 0 ? list[idx + 1] : null;
    if (!nextQ) {
      setBusy(true);
      setBusyAction("終了処理中…");
      try {
        const evSnap = await getDoc(doc(db, "events", eventId));
        const mode = normalizeQuizSettingsFromFirestore(evSnap.data()?.quizSettings as Record<string, unknown>).progressMode;
        const prev = normalizeEventQuizState(evSnap.data() as Record<string, unknown>);
        const finished = mergeQuizStatePatch(prev, {
          status: "finished",
          currentQuestionId: null,
          autoAdvanceRunning: false,
          betweenStartedAt: null,
          answerStartedAt: null,
          questionDeadlineAt: null,
        });
        await setDoc(
          doc(db, "events", eventId),
          {
            quizState: {
              status: "finished",
              currentQuestionId: null,
              autoAdvanceRunning: false,
              answerStartedAt: null,
              betweenStartedAt: null,
              questionDeadlineAt: null,
            },
            quizRunState: buildQuizRunStateMirror(mode, finished),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        if (curId) {
          await setDoc(doc(db, "events", eventId, "quizzes", curId), { status: "closed", updatedAt: serverTimestamp() }, { merge: true });
        }
        setMessage("最後の問題まで完了しました。");
      } catch (e) {
        console.error(e);
        setMessage("更新に失敗しました。");
      } finally {
        setBusy(false);
        setBusyAction(null);
      }
      return;
    }
    await activateQuiz(nextQ, { busyActionLabel: "次を公開中…" });
  };

  const moveQuizOrder = async (quiz: AdminQuiz, dir: -1 | 1) => {
    if (busy) return;
    const sorted = [...quizzes].sort(sortByOrder);
    const i = sorted.findIndex((q) => q.id === quiz.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    setBusy(true);
    setBusyAction("並び替え中…");
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "events", eventId, "quizzes", a.id), { order: b.order, updatedAt: serverTimestamp() }, { merge: true });
      batch.set(doc(db, "events", eventId, "quizzes", b.id), { order: a.order, updatedAt: serverTimestamp() }, { merge: true });
      await batch.commit();
      setMessage("並び順を更新しました。");
    } catch (e) {
      console.error(e);
      setMessage("並び替えに失敗しました。");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const stopAll = async () => {
    if (busy) return;
    autoLoopCancelRef.current = true;
    setBusy(true);
    setBusyAction("停止中…");
    try {
      const evSnap = await getDoc(doc(db, "events", eventId));
      const prev = normalizeEventQuizState(evSnap.data() as Record<string, unknown>);
      const next = mergeQuizStatePatch(prev, { autoAdvanceRunning: false, betweenStartedAt: null });
      await setDoc(
        doc(db, "events", eventId),
        {
          quizSettings: { progressMode: "manual" },
          quizState: {
            autoAdvanceRunning: false,
            betweenStartedAt: null,
          },
          quizRunState: buildQuizRunStateMirror("manual", next),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("停止しました。手動進行タブで操作を続けられます。");
    } catch (e) {
      console.error(e);
      setMessage("停止に失敗しました。");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const saveBroadcastSettings = async () => {
    if (busy) return;
    const tl = Number(settingTimeLimit);
    if (!Number.isFinite(tl) || tl <= 0) {
      setMessage("制限時間は1秒以上で入力してください。");
      return;
    }
    const ads = Math.max(1, Math.floor(Number(settingAnswerDisplay)) || 5);
    const nd = Math.max(0, Math.floor(Number(settingNextDelay)) || 3);
    setBusy(true);
    setBusyAction("設定を保存中…");
    try {
      const evSnap = await getDoc(doc(db, "events", eventId));
      const mode = normalizeQuizSettingsFromFirestore(evSnap.data()?.quizSettings as Record<string, unknown>).progressMode;
      const prev = normalizeEventQuizState(evSnap.data() as Record<string, unknown>);
      const next = mergeQuizStatePatch(prev, {
        timeLimitSeconds: Math.floor(tl),
        orderMode: settingOrderMode,
        autoNext: settingAutoNext,
        showCountdown: settingShowCountdown,
        answerDisplaySeconds: ads,
        nextDelaySeconds: nd,
        autoFinishWhenComplete: settingAutoFinish,
        autoRevealAnswer: settingAutoReveal,
      });
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: {
            timeLimitSeconds: Math.floor(tl),
            orderMode: settingOrderMode,
            autoNext: settingAutoNext,
            showCountdown: settingShowCountdown,
            answerDisplaySeconds: ads,
            nextDelaySeconds: nd,
            autoFinishWhenComplete: settingAutoFinish,
            autoRevealAnswer: settingAutoReveal,
          },
          quizRunState: buildQuizRunStateMirror(mode, next),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("設定を保存しました。");
    } catch (e) {
      console.error(e);
      setMessage("保存に失敗しました。");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const startAutoAdvance = async () => {
    if (busy || !quizEnabled) return;
    autoLoopCancelRef.current = false;
    setBusy(true);
    setBusyAction("自動開始中…");
    try {
      const evSnap0 = await getDoc(doc(db, "events", eventId));
      const prev0 = normalizeEventQuizState(evSnap0.data() as Record<string, unknown>);
      const primed = mergeQuizStatePatch(prev0, { autoAdvanceRunning: true });
      await setDoc(
        doc(db, "events", eventId),
        {
          quizSettings: { progressMode: "auto" },
          quizState: { autoAdvanceRunning: true },
          quizRunState: buildQuizRunStateMirror("auto", primed),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      const snap = await getDoc(doc(db, "events", eventId));
      let rs = normalizeEventQuizState(snap.data() as Record<string, unknown>);
      if (rs.status === "finished") {
        const prev1 = normalizeEventQuizState(snap.data() as Record<string, unknown>);
        const next1 = mergeQuizStatePatch(prev1, { status: "stopped" });
        await setDoc(
          doc(db, "events", eventId),
          {
            quizState: { status: "stopped" },
            quizRunState: buildQuizRunStateMirror("auto", next1),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        const snap2 = await getDoc(doc(db, "events", eventId));
        rs = normalizeEventQuizState(snap2.data() as Record<string, unknown>);
      }
      if (rs.status === "stopped" && !rs.betweenStartedAt) {
        const orderMode = settingOrderMode;
        const source = [...quizzesRef.current]
          .filter((q) => isBankPublished(q) && q.status !== "closed")
          .sort(orderMode === "random" ? () => Math.random() - 0.5 : sortByOrder);
        if (source.length) await activateQuiz(source[0], { fromAuto: true });
      }
      setMessage("自動進行を開始しました。");
    } catch (e) {
      console.error(e);
      setMessage("自動進行の開始に失敗しました。");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const mapAdminQuizFromDoc = (d: { id: string; data: () => Record<string, unknown> }, idx: number): AdminQuiz => {
    const raw = d.data();
    const q = normalizeQuizFromFirestore(d.id, raw);
    const bankVisibility = normalizeBankVisibility(raw.adminStatus);
    const explanationText = typeof raw.explanation === "string" ? raw.explanation : "";
    const order = typeof raw.order === "number" && Number.isFinite(raw.order) ? Math.floor(raw.order) : idx + 1;
    return { ...q, explanation: explanationText, bankVisibility, order };
  };

  /** Firestore `quizState` の部分更新と `quizRunState` ミラーをまとめて書く */
  const syncQuizRunMirror = async (quizStatePatch: Record<string, unknown>, logicMerge: Partial<NormalizedQuizState>) => {
    const evSnap = await getDoc(doc(db, "events", eventId));
    const mode = normalizeQuizSettingsFromFirestore(evSnap.data()?.quizSettings as Record<string, unknown>).progressMode;
    const prev = normalizeEventQuizState(evSnap.data() as Record<string, unknown>);
    const next = mergeQuizStatePatch(prev, logicMerge);
    await setDoc(
      doc(db, "events", eventId),
      {
        quizState: quizStatePatch,
        quizRunState: buildQuizRunStateMirror(mode, next),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  };

  useEffect(() => {
    if (!runState.autoAdvanceRunning || quizSettings.progressMode !== "auto") return;
    const tick = async () => {
      if (autoLoopCancelRef.current || busy) return;
      const snap = await getDoc(doc(db, "events", eventId));
      if (!snap.exists()) return;
      const rs = normalizeEventQuizState(snap.data() as Record<string, unknown>);
      if (!rs.autoAdvanceRunning) return;
      const now = Date.now();
      if (rs.status === "question" && rs.currentQuestionId) {
        const qd = await getDoc(doc(db, "events", eventId, "quizzes", rs.currentQuestionId));
        const act = qd.data()?.activatedAt as Timestamp | undefined;
        const tl =
          typeof qd.data()?.timeLimit === "number" && (qd.data()?.timeLimit as number) > 0
            ? Math.floor(qd.data()?.timeLimit as number)
            : rs.timeLimitSeconds;
        const endMs = rs.questionDeadlineAt?.toMillis() ?? (act && tl > 0 ? act.toMillis() + tl * 1000 : null);
        if (endMs != null && now >= endMs) {
          await syncQuizRunMirror(
            { status: "answer", answerStartedAt: serverTimestamp(), questionDeadlineAt: null },
            { status: "answer", questionDeadlineAt: null },
          );
        }
        return;
      }
      if (rs.status === "answer" && rs.answerStartedAt) {
        if (now >= rs.answerStartedAt.toMillis() + rs.answerDisplaySeconds * 1000) {
          if (rs.currentQuestionId) {
            await setDoc(
              doc(db, "events", eventId, "quizzes", rs.currentQuestionId),
              { status: "closed", updatedAt: serverTimestamp() },
              { merge: true },
            );
          }
          await syncQuizRunMirror(
            {
              status: "stopped",
              currentQuestionId: null,
              answerStartedAt: null,
              questionDeadlineAt: null,
              betweenStartedAt: serverTimestamp(),
            },
            { status: "stopped", currentQuestionId: null, answerStartedAt: null, questionDeadlineAt: null },
          );
        }
        return;
      }
      if (rs.status === "stopped" && rs.betweenStartedAt && rs.autoAdvanceRunning) {
        if (now >= rs.betweenStartedAt.toMillis() + rs.nextDelaySeconds * 1000) {
          const qsSnap = await getDocs(collection(db, "events", eventId, "quizzes"));
          const items = qsSnap.docs.map((docc, idx) => mapAdminQuizFromDoc(docc, idx));
          const nextSource = items
            .filter((q) => isBankPublished(q) && q.status !== "closed")
            .sort(rs.orderMode === "random" ? () => Math.random() - 0.5 : sortByOrder);
          if (!nextSource.length) {
            if (rs.autoFinishWhenComplete) {
              await syncQuizRunMirror(
                {
                  status: "finished",
                  autoAdvanceRunning: false,
                  currentQuestionId: null,
                  betweenStartedAt: null,
                  questionDeadlineAt: null,
                },
                {
                  status: "finished",
                  autoAdvanceRunning: false,
                  currentQuestionId: null,
                  betweenStartedAt: null,
                  questionDeadlineAt: null,
                },
              );
            } else {
              await syncQuizRunMirror(
                { autoAdvanceRunning: false, betweenStartedAt: null },
                { autoAdvanceRunning: false, betweenStartedAt: null },
              );
            }
            return;
          }
          const next = nextSource[0];
          await activateQuiz(next, { fromAuto: true });
        }
      }
    };
    const id = window.setInterval(() => void tick(), 800);
    return () => clearInterval(id);
  }, [runState.autoAdvanceRunning, quizSettings.progressMode, eventId, busy]);

  const manualRevealSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (quizSettings.progressMode === "manual" && runState.autoRevealAnswer && runState.status === "question" && broadcastQuiz?.activatedAt) {
      const key = `${broadcastQuiz.id}:${broadcastQuiz.activatedAt.toMillis()}`;
      if (manualRevealSentRef.current === key) return undefined;
      const total = broadcastQuiz.timeLimit ?? runState.timeLimitSeconds;
      const deadline =
        runState.questionDeadlineAt?.toMillis() ?? broadcastQuiz.activatedAt.toMillis() + total * 1000;
      const id = window.setInterval(() => {
        if (Date.now() >= deadline) {
          if (manualRevealSentRef.current === key) return;
          manualRevealSentRef.current = key;
          void syncQuizRunMirror(
            { status: "answer", answerStartedAt: serverTimestamp(), questionDeadlineAt: null },
            { status: "answer", questionDeadlineAt: null },
          );
        }
      }, 400);
      return () => clearInterval(id);
    }
    manualRevealSentRef.current = null;
    return undefined;
  }, [
    quizSettings.progressMode,
    runState.autoRevealAnswer,
    runState.status,
    runState.timeLimitSeconds,
    runState.questionDeadlineAt,
    broadcastQuiz?.id,
    broadcastQuiz?.activatedAt,
    broadcastQuiz?.timeLimit,
    eventId,
  ]);

  const manualAllDisabled = runState.status === "finished";
  const manualCanPublishQuestion = runState.status === "stopped" && !manualAllDisabled;
  const manualCanShowAnswer = runState.status === "question" && !manualAllDisabled;
  const manualCanPublishNext = runState.status === "answer" && !manualAllDisabled;

  return (
    <div className="space-y-4 pb-32 text-[#111827]">
      <div className="rounded-[16px] border border-[#E9D5FF] bg-white p-1.5 shadow-sm">
        <div className="grid min-h-[64px] grid-cols-3 gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setAdminTab("create")}
            className={`flex min-h-[64px] flex-col items-center justify-center rounded-[14px] px-1 py-2 text-center touch-manipulation sm:px-2 ${
              adminTab === "create"
                ? "bg-gradient-to-br from-[#7C3AED] to-[#A78BFA] text-white shadow-sm"
                : "bg-white text-[#111827]"
            }`}
          >
            <Pencil className={`h-5 w-5 shrink-0 ${adminTab === "create" ? "text-white" : "text-[#7C3AED]"}`} strokeWidth={2} aria-hidden />
            <span className="mt-1 text-[11px] font-bold leading-tight sm:text-xs">問題作成</span>
            <span className={`mt-0.5 hidden text-[9px] leading-tight sm:block ${adminTab === "create" ? "text-white/90" : "text-[#6B7280]"}`}>
              問題を作成・編集する
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAdminTab("run")}
            className={`flex min-h-[64px] flex-col items-center justify-center rounded-[14px] px-1 py-2 text-center touch-manipulation sm:px-2 ${
              adminTab === "run"
                ? "bg-gradient-to-br from-[#7C3AED] to-[#A78BFA] text-white shadow-sm"
                : "bg-white text-[#111827]"
            }`}
          >
            <Play className={`h-5 w-5 shrink-0 ${adminTab === "run" ? "text-white" : "text-[#7C3AED]"}`} strokeWidth={2} aria-hidden />
            <span className="mt-1 text-[11px] font-bold leading-tight sm:text-xs">クイズ進行</span>
            <span className={`mt-0.5 hidden text-[9px] leading-tight sm:block ${adminTab === "run" ? "text-white/90" : "text-[#6B7280]"}`}>クイズを進める</span>
          </button>
          <button
            type="button"
            onClick={() => setAdminTab("results")}
            className={`flex min-h-[64px] flex-col items-center justify-center rounded-[14px] px-1 py-2 text-center touch-manipulation sm:px-2 ${
              adminTab === "results"
                ? "bg-gradient-to-br from-[#7C3AED] to-[#A78BFA] text-white shadow-sm"
                : "bg-white text-[#111827]"
            }`}
          >
            <BarChart3 className={`h-5 w-5 shrink-0 ${adminTab === "results" ? "text-white" : "text-[#7C3AED]"}`} strokeWidth={2} aria-hidden />
            <span className="mt-1 text-[11px] font-bold leading-tight sm:text-xs">結果一覧</span>
            <span className={`mt-0.5 hidden text-[9px] leading-tight sm:block ${adminTab === "results" ? "text-white/90" : "text-[#6B7280]"}`}>結果を確認する</span>
          </button>
        </div>
      </div>

      {!quizEnabled ? (
        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-zinc-900">クイズ機能が無効です</h2>
          <p className="mt-2 text-sm text-zinc-600">参加者側で使うにはクイズ機能をONにしてください。運営画面の準備は継続できます。</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void enableQuizFeature()}
            className="mt-3 min-h-[48px] rounded-[14px] bg-[#7C3AED] px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            クイズ機能を有効化
          </button>
        </section>
      ) : null}

      {adminTab === "create" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#111827]">問題作成</h2>
                  <p className="text-sm text-[#6B7280]">ここでは問題の作成・編集・並び替えのみ行います。出題や進行は「クイズ進行」タブで行ってください。</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={openAddModal}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-[14px] bg-[#7C3AED] px-4 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> 問題を追加
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <select
                  value={listFilterStatus}
                  onChange={(e) => setListFilterStatus(e.target.value as ListFilterStatus)}
                  className="min-h-[44px] rounded-[14px] border border-[#E9D5FF] bg-white px-3 text-sm text-[#111827]"
                >
                  <option value="all">すべて</option>
                  <option value="public">公開のみ</option>
                  <option value="private">下書きのみ</option>
                </select>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="min-h-[44px] rounded-[14px] border border-[#E9D5FF] bg-white px-3 text-sm text-[#111827]"
                >
                  <option value="order">並び替え（問題順）</option>
                  <option value="latest">並び替え（更新順）</option>
                </select>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="問題を検索"
                    className="min-h-[44px] w-full rounded-[14px] border border-[#E9D5FF] bg-white pl-9 pr-3 text-sm text-[#111827] placeholder:text-[#6B7280]"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3">
              {filteredQuizzes.map((q) => {
                const badge = bankBadge(q);
                const sorted = [...quizzesWithStats].sort(sortByOrder);
                const pos = sorted.findIndex((x) => x.id === q.id);
                const canUp = pos > 0;
                const canDown = pos >= 0 && pos < sorted.length - 1;
                return (
                  <article
                    key={q.id}
                    className={`relative overflow-hidden rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm ${
                      q.status === "closed" ? "border-emerald-200/80 bg-emerald-50/30" : ""
                    }`}
                    onClick={() => setSelectedQuizId(q.id)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 text-xs font-semibold text-[#6B7280]">
                          <GripVertical className="h-4 w-4 text-[#A78BFA]" strokeWidth={2} aria-hidden /> 第{q.order}問
                        </p>
                        <p className="mt-1 text-sm font-bold text-[#111827]">{q.question}</p>
                        <p className="mt-2 text-xs text-[#6B7280]">
                          A {q.choices[0]}　B {q.choices[1]}　C {q.choices[2]}　D {q.choices[3]}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${badge.cls}`}>{badge.label}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); openEditModal(q); }} className="rounded-lg bg-violet-50 px-3 py-1.5 text-[#7C3AED] touch-manipulation">
                        編集
                      </button>
                      <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); void duplicateQuiz(q); }} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-[#111827] touch-manipulation">
                        <Copy className="mr-1 inline h-3.5 w-3.5" />
                        複製
                      </button>
                      <button
                        type="button"
                        disabled={busy || !canUp}
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveQuizOrder(q, -1);
                        }}
                        className="inline-flex items-center gap-0.5 rounded-lg border border-[#E9D5FF] bg-white px-2 py-1.5 text-[#111827] disabled:opacity-40 touch-manipulation"
                        aria-label="上へ並べ替え"
                      >
                        <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        上へ
                      </button>
                      <button
                        type="button"
                        disabled={busy || !canDown}
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveQuizOrder(q, 1);
                        }}
                        className="inline-flex items-center gap-0.5 rounded-lg border border-[#E9D5FF] bg-white px-2 py-1.5 text-[#111827] disabled:opacity-40 touch-manipulation"
                        aria-label="下へ並べ替え"
                      >
                        <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        下へ
                      </button>
                      <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); void deleteQuiz(q); }} className="rounded-lg px-3 py-1.5 font-bold text-red-600 touch-manipulation">
                        削除
                      </button>
                    </div>
                  </article>
                );
              })}
              {!filteredQuizzes.length ? (
                <div className="rounded-[18px] border border-dashed border-[#E9D5FF] bg-white p-8 text-center text-sm text-[#6B7280]">
                  条件に一致する問題がありません。
                </div>
              ) : null}
            </section>
          </div>

          <aside className="order-last space-y-3 lg:order-none">
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">このタブについて</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
                問題の内容・選択肢・公開／下書き・並び順だけを管理します。参加者への出題は「クイズ進行」タブから行います。
              </p>
            </section>
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">公開と下書き</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-[#6B7280]">
                <li>
                  <span className="font-semibold text-[#111827]">公開：</span>クイズ進行で出題できる問題です。
                </li>
                <li>
                  <span className="font-semibold text-[#111827]">下書き：</span>まだ出題に使いません（非公開）。
                </li>
              </ul>
            </section>
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">進行側の状態（参考）</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-[#6B7280]">
                <li>
                  <span className="font-semibold text-[#111827]">停止中：</span>出題していません
                </li>
                <li>
                  <span className="font-semibold text-[#111827]">出題中：</span>参加者が回答中
                </li>
                <li>
                  <span className="font-semibold text-[#111827]">答え表示中：</span>答えと解説を表示中
                </li>
                <li>
                  <span className="font-semibold text-[#111827]">終了：</span>すべての問題が終了しました
                </li>
              </ul>
            </section>
          </aside>
        </div>
      ) : null}

      {adminTab === "run" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <div className="sticky top-2 z-20 space-y-3 rounded-[18px] border border-[#E9D5FF] bg-white/95 p-4 shadow-md backdrop-blur-md lg:top-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-[#111827]">クイズ進行</h2>
                {runState.autoAdvanceRunning && quizSettings.progressMode === "auto" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void stopAll()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 shadow-sm disabled:opacity-50 touch-manipulation"
                  >
                    {busyAction === "停止中…" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    停止
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-sm sm:text-sm ${
                    runState.autoAdvanceRunning && quizSettings.progressMode === "auto"
                      ? "bg-[#7C3AED] text-white ring-2 ring-violet-300/60"
                      : "bg-emerald-600 text-white ring-2 ring-emerald-300/60"
                  }`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-white/90" aria-hidden />
                  {runState.autoAdvanceRunning && quizSettings.progressMode === "auto" ? "自動進行中" : "手動進行中"}
                </span>
                <span className="rounded-full border border-[#E9D5FF] bg-white px-3 py-1.5 text-xs font-bold text-[#111827] shadow-sm">
                  状態：{hostPhaseLabel(runState.status, runState.pausedFrom)}
                </span>
              </div>

              <div className="border-t border-[#E9D5FF] pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-violet-600">現在の状態</p>
                <div className="mt-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-lg font-bold text-[#111827]">
                      第{broadcastQuiz?.order ?? "—"}問{" "}
                      <span className="text-violet-700">{hostPhaseLabel(runState.status, runState.pausedFrom)}</span>
                    </p>
                    {runState.status === "question" ? (
                      <p className="text-sm font-semibold tabular-nums text-[#7C3AED]">残り{currentProgress.secondsLeft}秒</p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#6B7280]">
                    <span>
                      回答数 <strong className="tabular-nums text-[#111827]">{currentAnswerStats.total}</strong>
                    </span>
                    <span>
                      正答率 <strong className="tabular-nums text-[#111827]">{currentAnswerStats.correctRate}%</strong>
                    </span>
                  </div>
                  <p className="mt-4 text-xs font-semibold text-[#6B7280]">問題</p>
                  <p className="mt-1 text-base font-bold leading-snug text-[#111827]">{broadcastQuiz?.question ?? "—"}</p>
                </div>
              </div>
            </div>

            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">出題中の問題</h3>
              {broadcastQuiz ? (
                <div
                  className={`mt-3 rounded-[18px] p-4 shadow-sm ${
                    runState.status === "question"
                      ? "border-2 border-[#7C3AED] bg-violet-50/90 shadow-[0_0_24px_rgba(124,58,237,0.25)]"
                      : "border border-[#E9D5FF] bg-violet-50/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-[#111827]">第{broadcastQuiz.order}問</p>
                    <div className="flex items-center gap-2">
                      {runState.status === "question" ? (
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm">
                          LIVE
                        </span>
                      ) : null}
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
                        {hostPhaseLabel(runState.status, runState.pausedFrom)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#111827]">{broadcastQuiz.question}</p>
                  <p className="mt-2 text-xs text-[#6B7280]">
                    A {broadcastQuiz.choices[0]}　B {broadcastQuiz.choices[1]}　C {broadcastQuiz.choices[2]}　D {broadcastQuiz.choices[3]}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-[#E9D5FF] bg-white p-2 shadow-sm">
                      <p className="text-[11px] text-[#6B7280]">回答者数</p>
                      <p className="text-lg font-bold tabular-nums">{broadcastQuiz.totalAnswers}</p>
                    </div>
                    <div className="rounded-xl border border-[#E9D5FF] bg-white p-2 shadow-sm">
                      <p className="text-[11px] text-[#6B7280]">正解者数</p>
                      <p className="text-lg font-bold tabular-nums">{broadcastQuiz.correctAnswers}</p>
                    </div>
                    <div className="rounded-xl border border-[#E9D5FF] bg-white p-2 shadow-sm">
                      <p className="text-[11px] text-[#6B7280]">正解率</p>
                      <p className="text-lg font-bold tabular-nums">{broadcastQuiz.correctRate}%</p>
                    </div>
                  </div>
                  {runState.status === "question" ? (
                    <div className="mt-3">
                      <p className="text-xs text-[#6B7280]">
                        残り時間 {currentProgress.secondsLeft}秒 / {currentProgress.total}秒
                      </p>
                      <div className="mt-1 h-2 rounded-full bg-zinc-200">
                        <div className="h-2 rounded-full bg-[#7C3AED]" style={{ width: `${currentProgress.ratio}%` }} />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 rounded-[18px] border border-dashed border-[#E9D5FF] bg-zinc-50/80 p-6 text-center text-sm text-[#6B7280]">
                  現在出題中のクイズはありません。
                  <br />
                  下の「運営手動進行」から問題を公開してください。
                </div>
              )}
            </section>

            <section className="rounded-[18px] border border-[#E9D5FF] bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setManualAccordionOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-left touch-manipulation"
              >
                <span>
                  <span className="text-sm font-bold text-[#111827]">運営手動進行</span>
                  <span className="mt-0.5 block text-xs text-[#6B7280]">運営が手動でクイズを進行します</span>
                </span>
                <ChevronRight className={`h-4 w-4 shrink-0 text-[#6B7280] transition ${manualAccordionOpen ? "rotate-90" : ""}`} strokeWidth={2} aria-hidden />
              </button>
              {manualAccordionOpen ? (
                <div className="space-y-4 border-t border-[#E9D5FF] px-4 pb-4 pt-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled={busy || !manualCanPublishQuestion || manualAllDisabled}
                      onClick={() => void manualPublishQuestion()}
                      className="flex min-h-[88px] flex-col rounded-[14px] border border-[#E9D5FF] bg-white p-3 text-left shadow-sm disabled:opacity-45 touch-manipulation"
                    >
                      <span className="text-xs font-bold text-[#7C3AED]">1</span>
                      <p className="mt-1 flex items-center gap-1 text-sm font-bold text-[#111827]">
                        {busyAction === "公開中…" ? <Loader2 className="h-4 w-4 animate-spin text-violet-600" aria-hidden /> : null}
                        問題公開
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-[#6B7280]">参加者に問題を表示し、回答を受け付けます</p>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !manualCanShowAnswer || manualAllDisabled}
                      onClick={() => void manualShowAnswer()}
                      className="flex min-h-[88px] flex-col rounded-[14px] border border-[#E9D5FF] bg-white p-3 text-left shadow-sm disabled:opacity-45 touch-manipulation"
                    >
                      <span className="text-xs font-bold text-[#7C3AED]">2</span>
                      <p className="mt-1 flex items-center gap-1 text-sm font-bold text-[#111827]">
                        {busyAction === "答えを表示中…" ? <Loader2 className="h-4 w-4 animate-spin text-violet-600" aria-hidden /> : null}
                        答え表示
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-[#6B7280]">正解と解説を表示します</p>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !manualCanPublishNext || manualAllDisabled}
                      onClick={() => void manualPublishNext()}
                      className="flex min-h-[88px] flex-col rounded-[14px] border border-[#E9D5FF] bg-white p-3 text-left shadow-sm disabled:opacity-45 touch-manipulation"
                    >
                      <span className="text-xs font-bold text-[#7C3AED]">3</span>
                      <p className="mt-1 flex items-center gap-1 text-sm font-bold text-[#111827]">
                        {busyAction === "次を公開中…" || busyAction === "終了処理中…" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-violet-600" aria-hidden />
                        ) : null}
                        次を公開
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-[#6B7280]">次の問題を公開し、すぐに回答受付を開始します</p>
                    </button>
                  </div>
                  <div className="rounded-[14px] border border-[#E9D5FF] bg-zinc-50/80 p-3">
                    <p className="text-xs font-semibold text-[#111827]">回答時間（問題公開から答え表示まで）</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className="h-10 w-10 rounded-lg border border-[#E9D5FF] bg-white text-lg font-bold touch-manipulation"
                        onClick={() => setSettingTimeLimit((v) => String(Math.max(1, Number(v || "20") - 1)))}
                      >
                        -
                      </button>
                      <span className="min-w-[3rem] text-center text-lg font-bold tabular-nums">{settingTimeLimit}秒</span>
                      <button
                        type="button"
                        className="h-10 w-10 rounded-lg border border-[#E9D5FF] bg-white text-lg font-bold touch-manipulation"
                        onClick={() => setSettingTimeLimit((v) => String(Math.max(1, Number(v || "20") + 1)))}
                      >
                        +
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-[#6B7280]">この時間は参加者が回答できる時間です（サーバー時刻基準で締め切ります）。</p>
                    <label className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[#E9D5FF] bg-white px-3 py-2 text-xs font-semibold text-[#111827]">
                      <span>時間終了後に自動で答え表示へ切り替える</span>
                      <input
                        type="checkbox"
                        checked={settingAutoReveal}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          void (async () => {
                            try {
                              await syncQuizRunMirror({ autoRevealAnswer: checked }, { autoRevealAnswer: checked });
                            } catch (err) {
                              console.error(err);
                              setMessage("設定の更新に失敗しました。");
                            }
                          })();
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveBroadcastSettings()}
                      className="mt-3 min-h-[44px] w-full rounded-[14px] bg-[#7C3AED] text-sm font-bold text-white shadow-sm disabled:opacity-50 touch-manipulation"
                    >
                      {busyAction === "設定を保存中…" ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : null}
                      手動進行の時間設定を保存
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-[18px] border border-[#E9D5FF] bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setAutoAccordionOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-left touch-manipulation"
              >
                <span>
                  <span className="text-sm font-bold text-[#111827]">自動進行</span>
                  <span className="mt-0.5 block text-xs text-[#6B7280]">
                    問題公開 → 回答時間 → 答え表示 → 次を公開、を自動で繰り返します。
                  </span>
                </span>
                <ChevronRight className={`h-4 w-4 shrink-0 text-[#6B7280] transition ${autoAccordionOpen ? "rotate-90" : ""}`} strokeWidth={2} aria-hidden />
              </button>
              {autoAccordionOpen ? (
                <div className="space-y-4 border-t border-[#E9D5FF] px-4 pb-4 pt-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || runState.autoAdvanceRunning}
                      onClick={() => void startAutoAdvance()}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#7C3AED] px-4 text-sm font-bold text-white shadow-sm disabled:opacity-45 touch-manipulation"
                    >
                      {busyAction === "自動開始中…" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      自動開始
                    </button>
                  </div>
                  <p className="text-center text-[11px] text-[#6B7280]">停止は画面上部の「停止」ボタンから行えます（自動を止めて手動待機に戻ります）。</p>
                  <div className="grid gap-3 rounded-[14px] border border-[#E9D5FF] bg-zinc-50/80 p-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold text-[#111827]">1. 回答時間（秒）</p>
                      <input
                        type="number"
                        min={1}
                        value={settingTimeLimit}
                        onChange={(e) => setSettingTimeLimit(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E9D5FF] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#111827]">2. 答え表示時間（秒）</p>
                      <input
                        type="number"
                        min={1}
                        value={settingAnswerDisplay}
                        onChange={(e) => setSettingAnswerDisplay(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E9D5FF] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#111827]">3. 次の問題までの待機（秒）</p>
                      <input
                        type="number"
                        min={0}
                        value={settingNextDelay}
                        onChange={(e) => setSettingNextDelay(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E9D5FF] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#111827]">4. 出題順</p>
                      <select
                        value={settingOrderMode}
                        onChange={(e) => setSettingOrderMode(e.target.value as OrderMode)}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-[#E9D5FF] bg-white px-3 text-sm"
                      >
                        <option value="fixed">作成順</option>
                        <option value="random">ランダム</option>
                      </select>
                    </div>
                    <label className="flex items-center justify-between gap-2 rounded-xl border border-[#E9D5FF] bg-white px-3 py-2 sm:col-span-2">
                      <span className="text-xs font-semibold text-[#111827]">5. 最後まで進んだら自動終了</span>
                      <input type="checkbox" checked={settingAutoFinish} onChange={(e) => setSettingAutoFinish(e.target.checked)} />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveBroadcastSettings()}
                    className="min-h-[44px] w-full rounded-[14px] bg-[#7C3AED] text-sm font-bold text-white disabled:opacity-50 touch-manipulation"
                  >
                    自動進行の設定を保存
                  </button>
                </div>
              ) : null}
            </section>
          </div>

          <aside className="order-last space-y-3 lg:order-none">
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">手動の流れ</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
                <span className="font-semibold text-[#111827]">問題公開</span> → <span className="font-semibold text-[#111827]">答え表示</span> →{" "}
                <span className="font-semibold text-[#111827]">次を公開</span>
                を繰り返します。「次を公開」で次の問題の公開と回答受付が一度に始まります。
              </p>
            </section>
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">自動の流れ</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
                問題公開 → 回答時間 → 答え表示 → 次を公開、をループします。停止は画面上部の「停止」だけです（手動待機に戻ります）。
              </p>
            </section>
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">状態の意味</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-[#6B7280]">
                <li>
                  <span className="font-semibold text-[#111827]">停止中：</span>出題していません
                </li>
                <li>
                  <span className="font-semibold text-[#111827]">出題中：</span>参加者が回答中
                </li>
                <li>
                  <span className="font-semibold text-[#111827]">答え表示中：</span>答えと解説を表示中
                </li>
                <li>
                  <span className="font-semibold text-[#111827]">終了：</span>すべての問題が終了しました
                </li>
              </ul>
            </section>
          </aside>
        </div>
      ) : null}

      {adminTab === "results" ? (
        <div className="space-y-4">
          <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-zinc-900">問題ごとの結果</h3>
              <select value={resultOrder} onChange={(e) => setResultOrder(e.target.value as ResultOrder)} className="min-h-[40px] rounded-xl border border-zinc-200 px-3 text-xs">
                <option value="latest">最新順</option>
                <option value="question">問題順</option>
              </select>
            </div>
            <ul className="mt-3 space-y-2">
              {quizzesWithStats.sort(sortByOrder).map((q) => (
                <li key={q.id} className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2">
                  <p className="text-sm font-semibold text-zinc-900">第{q.order}問 {q.question}</p>
                  <p className="text-xs text-zinc-600">回答数 {q.totalAnswers} / 正解数 {q.correctAnswers} / 正解率 {q.correctRate}%</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-zinc-900">参加者別回答結果</h3>
            <div className="mt-3 space-y-2">
              {participantRows.map((row) => (
                <div key={row.id} className="rounded-xl border border-zinc-200 bg-zinc-50/40 px-3 py-2 text-xs">
                  <p className="font-semibold text-zinc-800">{row.participantName} / {fmtTs(row.answeredAt)}</p>
                  <p className="mt-0.5 text-zinc-600">{row.quizQuestion}</p>
                  <p className={`mt-0.5 font-bold ${row.isCorrect ? "text-emerald-700" : "text-zinc-600"}`}>{row.isCorrect ? "正解" : "不正解"} · 回答 {row.selectedIndex != null ? ["A", "B", "C", "D"][row.selectedIndex] : "-"}</p>
                </div>
              ))}
              {!participantRows.length ? <p className="text-sm text-zinc-500">回答データがまだありません。</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-[#111827]">画面の流れ</h3>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[#6B7280]">
          <li>問題作成タブで問題を作る</li>
          <li>クイズ進行タブで「問題公開」から進行する（または自動開始）</li>
          <li>結果一覧タブで結果を確認</li>
        </ol>
      </section>

      {message ? <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900">{message}</p> : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-xl">
            <h3 className="text-base font-bold text-zinc-900">{editingQuizId ? "問題を編集" : "問題を追加"}</h3>
            <div className="mt-3 space-y-2">
              <label className="block text-xs font-semibold text-zinc-600">問題文</label>
              <textarea value={qText} onChange={(e) => setQText(e.target.value)} rows={3} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
              {([["A", c0, setC0], ["B", c1, setC1], ["C", c2, setC2], ["D", c3, setC3]] as const).map(([label, value, setter]) => (
                <div key={label}><label className="block text-xs font-semibold text-zinc-600">選択肢{label}</label><input value={value} onChange={(e) => setter(e.target.value)} className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" /></div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600">正解</label>
                  <select value={correctIndex} onChange={(e) => setCorrectIndex(Number(e.target.value))} className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
                    <option value={0}>A</option><option value={1}>B</option><option value={2}>C</option><option value={3}>D</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600">公開状態</label>
                  <select value={publishVisibility} onChange={(e) => setPublishVisibility(e.target.value as BankVisibility)} className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
                    <option value="public">公開</option>
                    <option value="private">下書き</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs font-semibold text-zinc-600">ポイント</label><input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-semibold text-zinc-600">制限時間(秒)</label><input type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-semibold text-zinc-600">解説文</label><textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" /></div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy} onClick={closeModal} className="min-h-[44px] flex-1 rounded-[14px] border border-zinc-200 bg-white text-sm font-bold">キャンセル</button>
              <button type="button" disabled={busy} onClick={() => void persistQuiz()} className="min-h-[44px] flex-1 rounded-[14px] bg-[#7C3AED] text-sm font-bold text-white disabled:opacity-50">{busy ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
