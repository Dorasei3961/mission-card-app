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
  type Timestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Copy,
  GripVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
} from "lucide-react";
import { db } from "../../../lib/firebase";
import { resolveEventFeatures } from "../../../lib/event-features";
import {
  normalizeQuizSettingsFromFirestore,
  normalizeQuizStateFromFirestore,
  type NormalizedQuizState,
  type QuizProgressMode,
  type QuizSettings,
} from "../../../lib/quiz-run-state";
import { normalizeQuizFromFirestore, type QuizDoc, type QuizStatus } from "../../../lib/quiz-schema";

type Props = { eventId: string };
type AdminQuizTab = "create" | "run" | "results";
type ListFilterStatus = "all" | "active" | "closed" | "unasked" | "draft" | "private";
type SortMode = "order" | "latest";
type OrderMode = "fixed" | "random";
type AdminDraftStatus = "draft" | "unasked" | "private";
type ResultOrder = "latest" | "question";

type AdminQuiz = QuizDoc & {
  explanation: string;
  adminStatus: AdminDraftStatus;
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

function stateBadge(
  q: AdminQuiz,
  run: NormalizedQuizState,
): { id: ListFilterStatus; label: string; cls: string } {
  const isCurrent = run.currentQuestionId === q.id;
  if (isCurrent && run.status === "question") {
    return { id: "active", label: "出題中", cls: "bg-violet-100 text-violet-700 ring-violet-200" };
  }
  if (isCurrent && run.status === "answer") {
    return { id: "active", label: "答え表示中", cls: "bg-violet-100 text-violet-800 ring-violet-300" };
  }
  if (isCurrent && run.status === "paused") {
    return { id: "active", label: "一時停止", cls: "bg-amber-100 text-amber-800 ring-amber-200" };
  }
  if (q.status === "active" && !isCurrent) {
    return { id: "active", label: "出題中", cls: "bg-violet-100 text-violet-700 ring-violet-200" };
  }
  if (q.status === "closed") {
    return { id: "closed", label: "出題済み", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" };
  }
  if (q.adminStatus === "private") {
    return { id: "private", label: "非公開", cls: "bg-red-100 text-red-700 ring-red-200" };
  }
  if (q.adminStatus === "draft") {
    return { id: "draft", label: "下書き", cls: "bg-amber-100 text-amber-700 ring-amber-200" };
  }
  return { id: "unasked", label: "未出題", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" };
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

export function QuizAdminPanel({ eventId }: Props) {
  const [quizzes, setQuizzes] = useState<AdminQuiz[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [quizEnabled, setQuizEnabled] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminQuizTab>("create");
  const [listFilterStatus, setListFilterStatus] = useState<ListFilterStatus>("all");
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [searchText, setSearchText] = useState("");
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [resultOrder, setResultOrder] = useState<ResultOrder>("latest");
  const [manualAccordionOpen, setManualAccordionOpen] = useState(true);
  const [autoAccordionOpen, setAutoAccordionOpen] = useState(true);

  const [runState, setRunState] = useState<NormalizedQuizState>(() => normalizeQuizStateFromFirestore(undefined));
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
  const [draftStatus, setDraftStatus] = useState<AdminDraftStatus>("draft");

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
        setRunState(normalizeQuizStateFromFirestore(undefined));
        setQuizSettings({ progressMode: "manual" });
        return;
      }
      const data = snap.data() as {
        features?: unknown;
        quizState?: Record<string, unknown>;
        quizSettings?: Record<string, unknown>;
      };
      setQuizEnabled(resolveEventFeatures(data.features).quiz);
      setRunState(normalizeQuizStateFromFirestore(data.quizState));
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
        const adminStatusRaw = raw.adminStatus;
        const adminStatus: AdminDraftStatus =
          adminStatusRaw === "private" || adminStatusRaw === "unasked" || adminStatusRaw === "draft"
            ? adminStatusRaw
            : "draft";
        const explanationText = typeof raw.explanation === "string" ? raw.explanation : "";
        const order = typeof raw.order === "number" && Number.isFinite(raw.order) ? Math.floor(raw.order) : idx + 1;
        return { ...q, explanation: explanationText, adminStatus, order };
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
      const badge = stateBadge(q, runState);
      if (listFilterStatus !== "all" && badge.id !== listFilterStatus) return false;
      if (!norm) return true;
      const c = q.choices.join(" ").toLowerCase();
      return q.question.toLowerCase().includes(norm) || c.includes(norm);
    });
  }, [quizzesWithStats, sortMode, listFilterStatus, searchText, runState]);

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
    const startMs = broadcastQuiz.activatedAt.toMillis();
    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const left = Math.max(0, total - elapsed);
      const ratio = Math.max(0, Math.min(100, Math.round((left / total) * 100)));
      setCurrentProgress({ ratio, secondsLeft: left, total });
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [broadcastQuiz, runState.status, runState.timeLimitSeconds]);

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
    setDraftStatus("draft");
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
    setDraftStatus(quiz.adminStatus);
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
        adminStatus: draftStatus,
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
        adminStatus: "draft",
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

  const activateQuiz = async (quiz: AdminQuiz, opts?: { fromAuto?: boolean }) => {
    if (!quizEnabled) return;
    if (!opts?.fromAuto && busy) return;
    if (!opts?.fromAuto) setBusy(true);
    setMessage("");
    try {
      const presentable = [...quizzes]
        .filter((q) => q.adminStatus !== "private" && q.status !== "closed")
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
        { status: "active", adminStatus: "unasked", activatedAt: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true },
      );
      await batch.commit();
      const tl = quiz.timeLimit ?? runStateRef.current.timeLimitSeconds;
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
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage(opts?.fromAuto ? "" : "問題を提出しました。");
      setSelectedQuizId(quiz.id);
    } catch (e) {
      console.error(e);
      setMessage("出題開始に失敗しました。");
    } finally {
      if (!opts?.fromAuto) setBusy(false);
    }
  };

  const manualPresentQuestion = async () => {
    if (busy || !quizEnabled) return;
    const rs = runStateRef.current;
    if (rs.status !== "stopped") {
      setMessage("いまは「問題提出」できません。");
      return;
    }
    if (rs.betweenStartedAt) {
      setMessage("次の問題までの待機中です。");
      return;
    }
    const orderMode = settingOrderMode;
    const source = [...quizzesRef.current]
      .filter((q) => q.status !== "closed" && q.adminStatus !== "private")
      .sort(orderMode === "random" ? () => Math.random() - 0.5 : sortByOrder);
    if (!source.length) {
      setMessage("出題できる問題がありません。");
      return;
    }
    await activateQuiz(source[0]);
  };

  const manualShowAnswer = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: {
            status: "answer",
            answerStartedAt: serverTimestamp(),
          },
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
    }
  };

  const manualPrepareNext = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = runStateRef.current.currentQuestionId;
      if (id) {
        await setDoc(doc(db, "events", eventId, "quizzes", id), { status: "closed", updatedAt: serverTimestamp() }, { merge: true });
      }
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: {
            status: "stopped",
            currentQuestionId: null,
            remainingSeconds: null,
            answerStartedAt: null,
            pausedFrom: null,
            betweenStartedAt: null,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("次の問題に進む準備ができました。");
    } catch (e) {
      console.error(e);
      setMessage("更新に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const pauseLive = async () => {
    if (busy) return;
    const rs = runStateRef.current;
    if (rs.status !== "question" && rs.status !== "answer") return;
    setBusy(true);
    try {
      const pausedFrom: "question" | "answer" = rs.status === "answer" ? "answer" : "question";
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: { status: "paused", pausedFrom },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("一時停止しました。");
    } catch (e) {
      console.error(e);
      setMessage("一時停止に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const resumeLive = async () => {
    if (busy) return;
    const rs = runStateRef.current;
    if (rs.status !== "paused") return;
    setBusy(true);
    try {
      const target = rs.pausedFrom ?? "question";
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: { status: target, pausedFrom: null },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("再開しました。");
    } catch (e) {
      console.error(e);
      setMessage("再開に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const setProgressMode = async (mode: QuizProgressMode) => {
    if (busy) return;
    setBusy(true);
    try {
      await setDoc(
        doc(db, "events", eventId),
        {
          quizSettings: { progressMode: mode },
          quizState: { autoAdvanceRunning: false },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage(`進行モードを${mode === "auto" ? "自動進行" : "運営手動進行"}にしました。`);
    } catch (e) {
      console.error(e);
      setMessage("保存に失敗しました。");
    } finally {
      setBusy(false);
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
    try {
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
    }
  };

  const stopAutoAdvance = async () => {
    if (busy) return;
    autoLoopCancelRef.current = true;
    setBusy(true);
    try {
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: { autoAdvanceRunning: false },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("自動進行を停止しました。");
    } catch (e) {
      console.error(e);
      setMessage("停止に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const startAutoAdvance = async () => {
    if (busy || !quizEnabled) return;
    autoLoopCancelRef.current = false;
    setBusy(true);
    try {
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: { autoAdvanceRunning: true },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      const snap = await getDoc(doc(db, "events", eventId));
      let rs = normalizeQuizStateFromFirestore(snap.data()?.quizState as Record<string, unknown>);
      if (rs.status === "finished") {
        await setDoc(
          doc(db, "events", eventId),
          { quizState: { status: "stopped" }, updatedAt: serverTimestamp() },
          { merge: true },
        );
        const snap2 = await getDoc(doc(db, "events", eventId));
        rs = normalizeQuizStateFromFirestore(snap2.data()?.quizState as Record<string, unknown>);
      }
      if (rs.status === "stopped" && !rs.betweenStartedAt) {
        const orderMode = settingOrderMode;
        const source = [...quizzesRef.current]
          .filter((q) => q.status !== "closed" && q.adminStatus !== "private")
          .sort(orderMode === "random" ? () => Math.random() - 0.5 : sortByOrder);
        if (source.length) await activateQuiz(source[0], { fromAuto: true });
      }
    } catch (e) {
      console.error(e);
      setMessage("自動進行の開始に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const resumeAutoAdvance = async () => {
    if (busy) return;
    autoLoopCancelRef.current = false;
    setBusy(true);
    try {
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: { autoAdvanceRunning: true },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("自動進行を再開しました。");
    } catch (e) {
      console.error(e);
      setMessage("再開に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const mapAdminQuizFromDoc = (d: { id: string; data: () => Record<string, unknown> }, idx: number): AdminQuiz => {
    const raw = d.data();
    const q = normalizeQuizFromFirestore(d.id, raw);
    const adminStatusRaw = raw.adminStatus;
    const adminStatus: AdminDraftStatus =
      adminStatusRaw === "private" || adminStatusRaw === "unasked" || adminStatusRaw === "draft"
        ? adminStatusRaw
        : "draft";
    const explanationText = typeof raw.explanation === "string" ? raw.explanation : "";
    const order = typeof raw.order === "number" && Number.isFinite(raw.order) ? Math.floor(raw.order) : idx + 1;
    return { ...q, explanation: explanationText, adminStatus, order };
  };

  useEffect(() => {
    if (!runState.autoAdvanceRunning || quizSettings.progressMode !== "auto") return;
    const tick = async () => {
      if (autoLoopCancelRef.current || busy) return;
      const snap = await getDoc(doc(db, "events", eventId));
      if (!snap.exists()) return;
      const rs = normalizeQuizStateFromFirestore(snap.data()?.quizState as Record<string, unknown>);
      if (!rs.autoAdvanceRunning) return;
      const now = Date.now();
      if (rs.status === "question" && rs.currentQuestionId) {
        const qd = await getDoc(doc(db, "events", eventId, "quizzes", rs.currentQuestionId));
        const act = qd.data()?.activatedAt as Timestamp | undefined;
        const tl =
          typeof qd.data()?.timeLimit === "number" && (qd.data()?.timeLimit as number) > 0
            ? Math.floor(qd.data()?.timeLimit as number)
            : rs.timeLimitSeconds;
        if (act && now >= act.toMillis() + tl * 1000) {
          await setDoc(
            doc(db, "events", eventId),
            {
              quizState: { status: "answer", answerStartedAt: serverTimestamp() },
              updatedAt: serverTimestamp(),
            },
            { merge: true },
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
          await setDoc(
            doc(db, "events", eventId),
            {
              quizState: {
                status: "stopped",
                currentQuestionId: null,
                answerStartedAt: null,
                betweenStartedAt: serverTimestamp(),
              },
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
        return;
      }
      if (rs.status === "stopped" && rs.betweenStartedAt && rs.autoAdvanceRunning) {
        if (now >= rs.betweenStartedAt.toMillis() + rs.nextDelaySeconds * 1000) {
          const qsSnap = await getDocs(collection(db, "events", eventId, "quizzes"));
          const items = qsSnap.docs.map((docc, idx) => mapAdminQuizFromDoc(docc, idx));
          const nextSource = items
            .filter((q) => q.status !== "closed" && q.adminStatus !== "private")
            .sort(rs.orderMode === "random" ? () => Math.random() - 0.5 : sortByOrder);
          if (!nextSource.length) {
            if (rs.autoFinishWhenComplete) {
              await setDoc(
                doc(db, "events", eventId),
                {
                  quizState: {
                    status: "finished",
                    autoAdvanceRunning: false,
                    currentQuestionId: null,
                    betweenStartedAt: null,
                  },
                  updatedAt: serverTimestamp(),
                },
                { merge: true },
              );
            } else {
              await setDoc(
                doc(db, "events", eventId),
                {
                  quizState: { autoAdvanceRunning: false, betweenStartedAt: null },
                  updatedAt: serverTimestamp(),
                },
                { merge: true },
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
      const deadline = broadcastQuiz.activatedAt.toMillis() + total * 1000;
      const id = window.setInterval(() => {
        if (Date.now() >= deadline) {
          if (manualRevealSentRef.current === key) return;
          manualRevealSentRef.current = key;
          void setDoc(
            doc(db, "events", eventId),
            {
              quizState: { status: "answer", answerStartedAt: serverTimestamp() },
              updatedAt: serverTimestamp(),
            },
            { merge: true },
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
    broadcastQuiz?.id,
    broadcastQuiz?.activatedAt,
    broadcastQuiz?.timeLimit,
    eventId,
  ]);

  const manualAllDisabled = runState.status === "finished";
  const manualCanPresent = runState.status === "stopped" && !runState.betweenStartedAt;
  const manualCanShowAnswer = runState.status === "question" && !manualAllDisabled;
  const manualCanNext = runState.status === "answer" && !manualAllDisabled;

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
                  <p className="text-sm text-[#6B7280]">問題の作成・編集・並び替えができます。</p>
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
                  <option value="all">すべての状態</option>
                  <option value="active">出題中</option>
                  <option value="closed">出題済み</option>
                  <option value="unasked">未出題</option>
                  <option value="draft">下書き</option>
                  <option value="private">非公開</option>
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
                const badge = stateBadge(q, runState);
                const isLiveQ = runState.currentQuestionId === q.id && runState.status === "question";
                const isAns = runState.currentQuestionId === q.id && runState.status === "answer";
                const activeStyle = isLiveQ
                  ? "border-[#7C3AED] bg-violet-50/80"
                  : isAns
                    ? "border-[#7C3AED] bg-violet-50/80"
                    : q.status === "closed"
                      ? "border-emerald-300 bg-emerald-50/60"
                      : "border-[#E9D5FF] bg-white";
                return (
                  <article
                    key={q.id}
                    className={`relative overflow-hidden rounded-[18px] border p-4 shadow-sm ${activeStyle}`}
                    onClick={() => setSelectedQuizId(q.id)}
                  >
                    {isLiveQ || isAns ? <div className="absolute top-0 left-0 h-full w-1.5 bg-[#7C3AED]" /> : null}
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
                        <p className="mt-2 text-[11px] text-[#6B7280]">正解率 {q.correctRate}%</p>
                        <p className="text-[11px] text-[#6B7280]">回答数 {q.totalAnswers}</p>
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
                        disabled={busy || q.status === "active" || !quizEnabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          void activateQuiz(q);
                        }}
                        className="rounded-lg border border-[#7C3AED] bg-white px-3 py-1.5 text-[#7C3AED] disabled:opacity-50 touch-manipulation"
                      >
                        {q.status === "active" ? "出題中" : "出題する"}
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
              <h3 className="text-sm font-bold text-[#111827]">進行モードについて</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
                <span className="font-semibold text-[#111827]">運営手動進行：</span>
                運営者がボタンを押して、「問題提出 → 答え表示 → 次の問題へ」を手動で操作します。
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
                <span className="font-semibold text-[#111827]">自動進行：</span>
                開始ボタンを押すだけで、問題提出・回答時間・答え表示・次の問題へを自動で行います。
              </p>
            </section>
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">現在の状態について</h3>
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
                  <span className="font-semibold text-[#111827]">一時停止中：</span>出題を一時停止しています
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
            <h2 className="text-lg font-bold text-[#111827]">クイズ進行</h2>

            <div className="flex flex-wrap gap-2">
              <div className="inline-flex rounded-[14px] border border-[#E9D5FF] bg-white p-1 shadow-sm">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setProgressMode("manual")}
                  className={`rounded-[12px] px-4 py-2 text-xs font-bold touch-manipulation sm:text-sm ${
                    quizSettings.progressMode === "manual" ? "bg-[#7C3AED] text-white" : "bg-white text-[#111827]"
                  }`}
                >
                  運営手動進行
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setProgressMode("auto")}
                  className={`rounded-[12px] px-4 py-2 text-xs font-bold touch-manipulation sm:text-sm ${
                    quizSettings.progressMode === "auto" ? "bg-[#7C3AED] text-white" : "bg-white text-[#111827]"
                  }`}
                >
                  自動進行
                </button>
              </div>
              {runState.status === "question" || runState.status === "answer" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pauseLive()}
                  className="rounded-[14px] border border-[#E9D5FF] bg-white px-4 py-2 text-xs font-bold text-[#111827] shadow-sm touch-manipulation"
                >
                  一時停止
                </button>
              ) : null}
              {runState.status === "paused" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void resumeLive()}
                  className="rounded-[14px] border border-[#7C3AED] bg-violet-50 px-4 py-2 text-xs font-bold text-[#7C3AED] touch-manipulation"
                >
                  再開
                </button>
              ) : null}
            </div>

            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-[#111827]">現在の状態</p>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {runState.status === "stopped" ? <CircleDot className="h-8 w-8 text-zinc-400" strokeWidth={2} aria-hidden /> : null}
                    {runState.status === "question" ? <Play className="h-8 w-8 text-amber-500" strokeWidth={2} aria-hidden /> : null}
                    {runState.status === "answer" ? <BookOpen className="h-8 w-8 text-[#7C3AED]" strokeWidth={2} aria-hidden /> : null}
                    {runState.status === "paused" ? <Pause className="h-8 w-8 text-orange-500" strokeWidth={2} aria-hidden /> : null}
                    {runState.status === "finished" ? <CheckCircle2 className="h-8 w-8 text-[#7C3AED]" strokeWidth={2} aria-hidden /> : null}
                    <p className="text-xl font-bold text-[#111827]">
                      {runState.status === "stopped" && "停止中"}
                      {runState.status === "question" && "出題中（回答受付中）"}
                      {runState.status === "answer" && "答え表示中"}
                      {runState.status === "paused" && "一時停止中"}
                      {runState.status === "finished" && "終了"}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-[#6B7280]">
                    {runState.status === "stopped" && "参加者には表示されていません"}
                    {runState.status === "question" && `第${broadcastQuiz?.order ?? "-"}問を出題中`}
                    {runState.status === "answer" && "正解と解説を表示中"}
                    {runState.status === "paused" && "出題を一時停止しています"}
                    {runState.status === "finished" && "すべての問題が終了しました"}
                  </p>
                  {runState.status === "question" ? (
                    <p className="mt-2 text-sm font-semibold text-[#7C3AED]">残り時間: {currentProgress.secondsLeft}秒</p>
                  ) : null}
                </div>
                <div className="grid min-w-[200px] shrink-0 grid-cols-2 gap-2">
                  <div className="rounded-[14px] border border-[#E9D5FF] bg-violet-50/50 p-3 text-center shadow-sm">
                    <p className="text-[11px] font-semibold text-[#6B7280]">回答数</p>
                    <p className="text-lg font-bold tabular-nums text-[#111827]">{currentAnswerStats.total}</p>
                  </div>
                  <div className="rounded-[14px] border border-[#E9D5FF] bg-violet-50/50 p-3 text-center shadow-sm">
                    <p className="text-[11px] font-semibold text-[#6B7280]">正解率</p>
                    <p className="text-lg font-bold tabular-nums text-[#111827]">{currentAnswerStats.correctRate}%</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">現在の問題</h3>
              {broadcastQuiz ? (
                <div className="mt-3 rounded-[18px] border border-[#E9D5FF] bg-violet-50/40 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-[#111827]">第{broadcastQuiz.order}問</p>
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
                      {runState.status === "question" ? "出題中" : runState.status === "answer" ? "答え表示中" : runState.status === "paused" ? "停止中" : "—"}
                    </span>
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
                  問題作成タブで問題を作成し、クイズ進行から開始してください。
                </div>
              )}
            </section>

            {quizSettings.progressMode === "manual" ? (
              <section className="rounded-[18px] border border-[#E9D5FF] bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setManualAccordionOpen((o) => !o)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left touch-manipulation"
                >
                  <span>
                    <span className="text-sm font-bold text-[#111827]">運営手動進行</span>
                    <span className="mt-0.5 block text-xs text-[#6B7280]">ボタンを押して、クイズを手動で進めます。</span>
                  </span>
                  <ChevronRight className={`h-4 w-4 shrink-0 text-[#6B7280] transition ${manualAccordionOpen ? "rotate-90" : ""}`} strokeWidth={2} aria-hidden />
                </button>
                {manualAccordionOpen ? (
                  <div className="space-y-4 border-t border-[#E9D5FF] px-4 pb-4 pt-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        disabled={busy || !manualCanPresent || manualAllDisabled}
                        onClick={() => void manualPresentQuestion()}
                        className="flex min-h-[88px] flex-col rounded-[14px] border border-[#E9D5FF] bg-white p-3 text-left shadow-sm disabled:opacity-45 touch-manipulation"
                      >
                        <span className="text-xs font-bold text-[#7C3AED]">1</span>
                        <p className="mt-1 text-sm font-bold text-[#111827]">問題提出</p>
                        <p className="mt-1 text-[11px] leading-snug text-[#6B7280]">参加者に問題を表示</p>
                      </button>
                      <button
                        type="button"
                        disabled={busy || !manualCanShowAnswer || manualAllDisabled}
                        onClick={() => void manualShowAnswer()}
                        className="flex min-h-[88px] flex-col rounded-[14px] border border-[#E9D5FF] bg-white p-3 text-left shadow-sm disabled:opacity-45 touch-manipulation"
                      >
                        <span className="text-xs font-bold text-[#7C3AED]">2</span>
                        <p className="mt-1 text-sm font-bold text-[#111827]">答えを表示</p>
                        <p className="mt-1 text-[11px] leading-snug text-[#6B7280]">答えと解説を表示</p>
                      </button>
                      <button
                        type="button"
                        disabled={busy || !manualCanNext || manualAllDisabled}
                        onClick={() => void manualPrepareNext()}
                        className="flex min-h-[88px] flex-col rounded-[14px] border border-[#E9D5FF] bg-white p-3 text-left shadow-sm disabled:opacity-45 touch-manipulation"
                      >
                        <span className="text-xs font-bold text-[#7C3AED]">3</span>
                        <p className="mt-1 text-sm font-bold text-[#111827]">次の問題へ</p>
                        <p className="mt-1 text-[11px] leading-snug text-[#6B7280]">次の問題に進む</p>
                      </button>
                    </div>
                    <div className="rounded-[14px] border border-[#E9D5FF] bg-zinc-50/80 p-3">
                      <p className="text-xs font-semibold text-[#111827]">回答時間（問題提出から答え表示まで）</p>
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
                      <p className="mt-2 text-[11px] text-[#6B7280]">この時間は参加者が回答できる時間です。</p>
                      <label className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[#E9D5FF] bg-white px-3 py-2 text-xs font-semibold text-[#111827]">
                        <span>時間終了後に自動で答えを表示する</span>
                        <input
                          type="checkbox"
                          checked={settingAutoReveal}
                          onChange={(e) => void setDoc(
                            doc(db, "events", eventId),
                            { quizState: { autoRevealAnswer: e.target.checked }, updatedAt: serverTimestamp() },
                            { merge: true },
                          )}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveBroadcastSettings()}
                        className="mt-3 min-h-[44px] w-full rounded-[14px] bg-[#7C3AED] text-sm font-bold text-white shadow-sm disabled:opacity-50 touch-manipulation"
                      >
                        手動進行の時間設定を保存
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {quizSettings.progressMode === "auto" ? (
              <section className="rounded-[18px] border border-[#E9D5FF] bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setAutoAccordionOpen((o) => !o)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left touch-manipulation"
                >
                  <span>
                    <span className="text-sm font-bold text-[#111827]">自動進行</span>
                    <span className="mt-0.5 block text-xs text-[#6B7280]">
                      開始すると、問題提出・回答時間・答え表示・次の問題へを自動で行います。
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
                        className="min-h-[48px] flex-1 rounded-[14px] bg-[#7C3AED] px-4 text-sm font-bold text-white shadow-sm disabled:opacity-45 touch-manipulation"
                      >
                        自動進行を開始
                      </button>
                      <button
                        type="button"
                        disabled={busy || !runState.autoAdvanceRunning}
                        onClick={() => void stopAutoAdvance()}
                        className="min-h-[48px] rounded-[14px] border border-[#E9D5FF] bg-white px-4 text-sm font-bold text-[#111827] touch-manipulation disabled:opacity-45"
                      >
                        停止
                      </button>
                      <button
                        type="button"
                        disabled={busy || !runState.autoAdvanceRunning}
                        onClick={() => void pauseLive()}
                        className="min-h-[48px] rounded-[14px] border border-[#E9D5FF] bg-white px-4 text-sm font-bold text-[#111827] touch-manipulation disabled:opacity-45"
                      >
                        一時停止
                      </button>
                      <button
                        type="button"
                        disabled={busy || !runState.autoAdvanceRunning}
                        onClick={() => void resumeAutoAdvance()}
                        className="min-h-[48px] rounded-[14px] border border-[#E9D5FF] bg-white px-4 text-sm font-bold text-[#111827] touch-manipulation disabled:opacity-45"
                      >
                        再開
                      </button>
                    </div>
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
                    <p className="text-center text-[11px] text-[#6B7280]">自動進行の流れ：問題提出 → 回答時間 → 答え表示 → 次の問題へ</p>
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
            ) : null}
          </div>

          <aside className="order-last space-y-3 lg:order-none">
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">進行モードについて</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
                <span className="font-semibold text-[#111827]">運営手動進行：</span>
                運営者がボタンを押して、「問題提出 → 答え表示 → 次の問題へ」を手動で操作します。
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
                <span className="font-semibold text-[#111827]">自動進行：</span>
                開始ボタンを押すだけで、問題提出・回答時間・答え表示・次の問題へを自動で行います。
              </p>
            </section>
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">現在の状態について</h3>
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
                  <span className="font-semibold text-[#111827]">一時停止中：</span>出題を一時停止しています
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
          <li>クイズ進行タブで進行モードを選ぶ</li>
          <li>手動または自動でクイズを進める</li>
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
                  <label className="block text-xs font-semibold text-zinc-600">ステータス</label>
                  <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as AdminDraftStatus)} className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
                    <option value="draft">下書き</option><option value="unasked">未出題</option><option value="private">非公開</option>
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
