"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Copy,
  GripVertical,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { db } from "../../../lib/firebase";
import { resolveEventFeatures } from "../../../lib/event-features";
import { normalizeQuizFromFirestore, type QuizDoc, type QuizStatus } from "../../../lib/quiz-schema";

type Props = { eventId: string };
type AdminQuizTab = "list" | "broadcast" | "results";
type ListFilterStatus = "all" | "active" | "closed" | "unasked" | "draft" | "private";
type SortMode = "order" | "latest";
type OrderMode = "fixed" | "random";
type AdminDraftStatus = "draft" | "unasked" | "private";
type ResultOrder = "latest" | "question";

type QuizState = {
  status: "stopped" | "live" | "paused" | "result";
  currentQuestionId: string | null;
  startedAt: Timestamp | null;
  remainingSeconds: number | null;
  timeLimitSeconds: number;
  orderMode: OrderMode;
  autoNext: boolean;
  showCountdown: boolean;
};

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

const EMPTY_STATE: QuizState = {
  status: "stopped",
  currentQuestionId: null,
  startedAt: null,
  remainingSeconds: null,
  timeLimitSeconds: 20,
  orderMode: "fixed",
  autoNext: false,
  showCountdown: true,
};

function stateBadge(q: AdminQuiz): { id: ListFilterStatus; label: string; cls: string } {
  if (q.status === "active") {
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
  const [adminTab, setAdminTab] = useState<AdminQuizTab>("list");
  const [listFilterStatus, setListFilterStatus] = useState<ListFilterStatus>("all");
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [searchText, setSearchText] = useState("");
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [resultOrder, setResultOrder] = useState<ResultOrder>("latest");
  const [showOptionPanel, setShowOptionPanel] = useState(true);

  const [quizState, setQuizState] = useState<QuizState>(EMPTY_STATE);
  const [participantCount, setParticipantCount] = useState(0);

  const [answerStats, setAnswerStats] = useState<AnswerStats>({});
  const [participantAnswers, setParticipantAnswers] = useState<ParticipantAnswer[]>([]);

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

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        setQuizEnabled(false);
        setQuizState(EMPTY_STATE);
        return;
      }
      const data = snap.data() as {
        features?: unknown;
        quizState?: Partial<QuizState>;
      };
      setQuizEnabled(resolveEventFeatures(data.features).quiz);
      const s = data.quizState ?? {};
      setQuizState({
        status: s.status === "live" || s.status === "paused" || s.status === "result" ? s.status : "stopped",
        currentQuestionId: typeof s.currentQuestionId === "string" ? s.currentQuestionId : null,
        startedAt: (s.startedAt as Timestamp | null) ?? null,
        remainingSeconds: typeof s.remainingSeconds === "number" ? s.remainingSeconds : null,
        timeLimitSeconds: typeof s.timeLimitSeconds === "number" && s.timeLimitSeconds > 0 ? Math.floor(s.timeLimitSeconds) : 20,
        orderMode: s.orderMode === "random" ? "random" : "fixed",
        autoNext: s.autoNext === true,
        showCountdown: s.showCountdown !== false,
      });
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    setSettingTimeLimit(String(quizState.timeLimitSeconds || 20));
    setSettingOrderMode(quizState.orderMode);
    setSettingAutoNext(quizState.autoNext);
    setSettingShowCountdown(quizState.showCountdown);
  }, [quizState.timeLimitSeconds, quizState.orderMode, quizState.autoNext, quizState.showCountdown]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "events", eventId, "participants"), (snap) => {
      setParticipantCount(snap.size);
    });
    return () => unsub();
  }, [eventId]);

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

  const selectedQuiz = useMemo(
    () => quizzesWithStats.find((q) => q.id === selectedQuizId) ?? quizzesWithStats[0] ?? null,
    [quizzesWithStats, selectedQuizId],
  );
  const activeQuiz = useMemo(() => quizzesWithStats.find((q) => q.status === "active") ?? null, [quizzesWithStats]);

  const filteredQuizzes = useMemo(() => {
    const norm = searchText.trim().toLowerCase();
    const sorted = [...quizzesWithStats].sort(sortMode === "order" ? sortByOrder : sortByLatest);
    return sorted.filter((q) => {
      const badge = stateBadge(q);
      if (listFilterStatus !== "all" && badge.id !== listFilterStatus) return false;
      if (!norm) return true;
      const c = q.choices.join(" ").toLowerCase();
      return q.question.toLowerCase().includes(norm) || c.includes(norm);
    });
  }, [quizzesWithStats, sortMode, listFilterStatus, searchText]);

  const avgCorrectRate = useMemo(() => {
    const rows = quizzesWithStats.filter((q) => q.totalAnswers > 0);
    if (!rows.length) return 0;
    const sum = rows.reduce((s, q) => s + q.correctRate, 0);
    return Math.round(sum / rows.length);
  }, [quizzesWithStats]);

  const currentProgress = useMemo(() => {
    if (!activeQuiz) return { ratio: 0, secondsLeft: 0, total: quizState.timeLimitSeconds };
    const total = activeQuiz.timeLimit ?? quizState.timeLimitSeconds;
    if (!activeQuiz.activatedAt || total <= 0) return { ratio: 0, secondsLeft: total, total };
    const elapsed = Math.max(0, Math.floor((Date.now() - activeQuiz.activatedAt.toMillis()) / 1000));
    const left = Math.max(0, total - elapsed);
    const ratio = Math.max(0, Math.min(100, Math.round((left / total) * 100)));
    return { ratio, secondsLeft: left, total };
  }, [activeQuiz, quizState.timeLimitSeconds]);

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

  const activateQuiz = async (quiz: AdminQuiz) => {
    if (busy || !quizEnabled) return;
    setBusy(true);
    setMessage("");
    try {
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
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: {
            status: "live",
            currentQuestionId: quiz.id,
            startedAt: serverTimestamp(),
            remainingSeconds: quiz.timeLimit ?? quizState.timeLimitSeconds,
            timeLimitSeconds: quiz.timeLimit ?? quizState.timeLimitSeconds,
            orderMode: settingOrderMode,
            autoNext: settingAutoNext,
            showCountdown: settingShowCountdown,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("出題を開始しました。");
      setSelectedQuizId(quiz.id);
    } catch (e) {
      console.error(e);
      setMessage("出題開始に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const pauseLive = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setDoc(doc(db, "events", eventId), { quizState: { status: "paused" }, updatedAt: serverTimestamp() }, { merge: true });
      setMessage("一時停止しました。");
    } catch (e) {
      console.error(e);
      setMessage("一時停止に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const startLive = async () => {
    if (busy) return;
    if (activeQuiz) {
      await activateQuiz(activeQuiz);
      return;
    }
    const source = quizzesWithStats
      .filter((q) => q.status !== "closed" && q.adminStatus !== "private")
      .sort(sortByOrder);
    if (!source.length) {
      setMessage("出題できる問題がありません。");
      return;
    }
    await activateQuiz(source[0]);
  };

  const nextQuestion = async () => {
    if (busy) return;
    const source = [...quizzesWithStats]
      .filter((q) => q.adminStatus !== "private")
      .sort(settingOrderMode === "random" ? () => Math.random() - 0.5 : sortByOrder);
    if (!source.length) return;
    const currentIdx = activeQuiz ? source.findIndex((q) => q.id === activeQuiz.id) : -1;
    const next = source[currentIdx + 1] ?? source[0];
    await activateQuiz(next);
  };

  const saveBroadcastSettings = async () => {
    if (busy) return;
    const tl = Number(settingTimeLimit);
    if (!Number.isFinite(tl) || tl <= 0) {
      setMessage("制限時間は1秒以上で入力してください。");
      return;
    }
    setBusy(true);
    try {
      await setDoc(
        doc(db, "events", eventId),
        {
          quizState: {
            ...quizState,
            timeLimitSeconds: Math.floor(tl),
            orderMode: settingOrderMode,
            autoNext: settingAutoNext,
            showCountdown: settingShowCountdown,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("出題オプションを保存しました。");
    } catch (e) {
      console.error(e);
      setMessage("保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (id: AdminQuizTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setAdminTab(id)}
      className={`min-h-[48px] flex-1 rounded-[14px] px-2 text-xs font-bold touch-manipulation sm:text-sm ${
        adminTab === id ? "bg-[#7C3AED] text-white shadow-sm" : "bg-white text-zinc-900"
      }`}
    >
      {label}
    </button>
  );

  const stateTitle =
    quizState.status === "live" ? "出題中" : quizState.status === "paused" ? "一時停止中" : "出題停止中";
  const stateDesc =
    quizState.status === "live"
      ? `第${activeQuiz?.order ?? "-"}問を出題中`
      : quizState.status === "paused"
        ? "出題を一時停止しています"
        : "参加者には表示されていません";

  return (
    <div className="space-y-4 pb-20">
      <div className="rounded-[18px] border border-[#E9D5FF] bg-white p-2 shadow-sm">
        <div className="flex gap-2">{tabBtn("list", "問題一覧")}{tabBtn("broadcast", "出題設定・進行")}{tabBtn("results", "結果一覧")}</div>
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

      {adminTab === "list" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-zinc-900">問題一覧</h2>
                  <p className="text-sm text-zinc-600">問題の作成・編集・並び替えができます。</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={openAddModal}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-[14px] bg-[#7C3AED] px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> 問題を追加
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <select
                  value={listFilterStatus}
                  onChange={(e) => setListFilterStatus(e.target.value as ListFilterStatus)}
                  className="min-h-[44px] rounded-[14px] border border-zinc-200 px-3 text-sm"
                >
                  <option value="all">すべての状態</option>
                  <option value="active">出題中</option>
                  <option value="closed">出題済み</option>
                  <option value="unasked">未出題</option>
                  <option value="draft">下書き</option>
                  <option value="private">非公開</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortMode((v) => (v === "order" ? "latest" : "order"))}
                  className="min-h-[44px] rounded-[14px] border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700"
                >
                  並び替え（{sortMode === "order" ? "問題順" : "更新順"}）
                </button>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="問題を検索"
                    className="min-h-[44px] w-full rounded-[14px] border border-zinc-200 pl-9 pr-3 text-sm"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3">
              {filteredQuizzes.map((q) => {
                const badge = stateBadge(q);
                const activeStyle = q.status === "active" ? "border-violet-300 bg-violet-50/70" : q.status === "closed" ? "border-emerald-300 bg-emerald-50/60" : "border-zinc-200 bg-white";
                return (
                  <article
                    key={q.id}
                    className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${activeStyle}`}
                    onClick={() => setSelectedQuizId(q.id)}
                  >
                    {q.status === "active" ? <div className="absolute left-0 top-0 h-full w-1.5 bg-[#7C3AED]" /> : null}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
                          <GripVertical className="h-4 w-4" /> 第{q.order}問
                        </p>
                        <p className="mt-1 text-sm font-bold text-zinc-900">{q.question}</p>
                        <p className="mt-2 text-xs text-zinc-600">A {q.choices[0]}　B {q.choices[1]}　C {q.choices[2]}　D {q.choices[3]}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${badge.cls}`}>{badge.label}</span>
                        <p className="mt-2 text-[11px] text-zinc-500">正解率 {q.correctRate}%</p>
                        <p className="text-[11px] text-zinc-500">回答数 {q.totalAnswers}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <button type="button" disabled={busy} onClick={() => openEditModal(q)} className="rounded-lg bg-violet-50 px-3 py-1.5 text-[#7C3AED]">編集</button>
                      <button type="button" disabled={busy} onClick={() => void duplicateQuiz(q)} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-zinc-700"><Copy className="mr-1 inline h-3.5 w-3.5" />複製</button>
                      <button
                        type="button"
                        disabled={busy || q.status === "active" || !quizEnabled}
                        onClick={() => void activateQuiz(q)}
                        className="rounded-lg border border-[#7C3AED] bg-white px-3 py-1.5 text-[#7C3AED] disabled:opacity-50"
                      >
                        {q.status === "active" ? "出題中" : "出題する"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => void deleteQuiz(q)} className="rounded-lg bg-red-50 px-3 py-1.5 text-red-600"><Trash2 className="mr-1 inline h-3.5 w-3.5" />削除</button>
                    </div>
                  </article>
                );
              })}
              {!filteredQuizzes.length ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">条件に一致する問題がありません。</div>
              ) : null}
            </section>
          </div>

          <aside className="space-y-3">
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900">一覧の見方</h3>
              <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                <li>出題済み: 出題が終了した問題です</li>
                <li>出題中: 現在ライブで出題中の問題です</li>
                <li>未出題: まだ出題していない問題です</li>
                <li>下書き: 作成中の問題です</li>
                <li>非公開: 一時的に非公開にしている問題です</li>
              </ul>
            </section>
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900">クイック操作</h3>
              <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                <li>出題する: 選択した問題をすぐに出題します</li>
                <li>編集する: 内容を編集します</li>
                <li>複製する: この問題をコピーして新規作成</li>
                <li>並び替え: 並び順や更新順で確認できます</li>
              </ul>
            </section>
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900">問題プレビュー</h3>
              {selectedQuiz ? (
                <div className="mt-2 text-xs text-zinc-700">
                  <p className="font-semibold">第{selectedQuiz.order}問</p>
                  <p className="mt-1 font-bold text-zinc-900">{selectedQuiz.question}</p>
                  <p className="mt-1">A {selectedQuiz.choices[0]}</p>
                  <p>B {selectedQuiz.choices[1]}</p>
                  <p>C {selectedQuiz.choices[2]}</p>
                  <p>D {selectedQuiz.choices[3]}</p>
                  <p className="mt-1 font-semibold text-[#7C3AED]">正解: {["A", "B", "C", "D"][selectedQuiz.correctIndex]} {selectedQuiz.choices[selectedQuiz.correctIndex]}</p>
                </div>
              ) : <p className="mt-2 text-xs text-zinc-500">問題を選択すると表示されます。</p>}
            </section>
          </aside>
        </div>
      ) : null}

      {adminTab === "broadcast" ? (
        <div className="space-y-4">
          <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-zinc-900">現在の状態</p>
                <p className="mt-2 flex items-center gap-2 text-lg font-bold text-zinc-900">
                  {quizState.status === "live" ? <Play className="h-5 w-5 text-emerald-600" /> : quizState.status === "paused" ? <Pause className="h-5 w-5 text-amber-600" /> : <CircleDot className="h-5 w-5 text-zinc-500" />}
                  {stateTitle}
                </p>
                <p className="text-sm text-zinc-600">{stateDesc}</p>
                {quizState.status === "live" ? <p className="mt-1 text-sm font-semibold text-[#7C3AED]">残り時間: {currentProgress.secondsLeft}秒</p> : null}
              </div>
              <div className="grid min-w-[180px] grid-cols-2 gap-2">
                <div className="rounded-[14px] border border-[#E9D5FF] bg-violet-50/50 p-3 text-center"><p className="text-xs text-zinc-500">参加者数</p><p className="text-lg font-bold">{participantCount}</p></div>
                <div className="rounded-[14px] border border-[#E9D5FF] bg-violet-50/50 p-3 text-center"><p className="text-xs text-zinc-500">平均正解率</p><p className="text-lg font-bold">{avgCorrectRate}%</p></div>
              </div>
            </div>
          </section>

          <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-zinc-900">現在出題中の問題</h3>
            {activeQuiz ? (
              <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-zinc-900">第{activeQuiz.order}問</p>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">出題中</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-zinc-900">{activeQuiz.question}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-[#E9D5FF] bg-white p-2"><p className="text-[11px] text-zinc-500">回答者数</p><p className="text-lg font-bold">{activeQuiz.totalAnswers}</p></div>
                  <div className="rounded-xl border border-[#E9D5FF] bg-white p-2"><p className="text-[11px] text-zinc-500">正解者数</p><p className="text-lg font-bold">{activeQuiz.correctAnswers}</p></div>
                  <div className="rounded-xl border border-[#E9D5FF] bg-white p-2"><p className="text-[11px] text-zinc-500">正解率</p><p className="text-lg font-bold">{activeQuiz.correctRate}%</p></div>
                </div>
                <div className="mt-3">
                  <p className="text-xs text-zinc-600">制限時間: {currentProgress.total}秒 / 残り時間: {currentProgress.secondsLeft}秒</p>
                  <div className="mt-1 h-2 rounded-full bg-zinc-200"><div className="h-2 rounded-full bg-[#7C3AED]" style={{ width: `${currentProgress.ratio}%` }} /></div>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-600">
                現在出題中のクイズはありません。問題一覧から「出題する」を押してください。
              </div>
            )}
          </section>

          <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-zinc-900">出題コントロール</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button type="button" disabled={busy || quizState.status !== "stopped"} onClick={() => void startLive()} className="min-h-[58px] rounded-[14px] border border-zinc-200 bg-white px-3 text-left disabled:opacity-50"><Play className="h-4 w-4 text-emerald-600" /><p className="mt-1 text-sm font-bold">出題開始</p><p className="text-[11px] text-zinc-500">次の問題を出題</p></button>
              <button type="button" disabled={busy || quizState.status !== "live"} onClick={() => void pauseLive()} className={`min-h-[58px] rounded-[14px] border px-3 text-left disabled:opacity-50 ${quizState.status === "paused" ? "border-violet-300 bg-violet-100" : "border-zinc-200 bg-white"}`}><Pause className="h-4 w-4 text-[#7C3AED]" /><p className="mt-1 text-sm font-bold">一時停止</p><p className="text-[11px] text-zinc-500">出題を一時停止</p></button>
              <button type="button" disabled={busy || (quizState.status !== "live" && quizState.status !== "result")} onClick={() => void nextQuestion()} className="min-h-[58px] rounded-[14px] border border-zinc-200 bg-white px-3 text-left disabled:opacity-50"><ChevronRight className="h-4 w-4 text-[#7C3AED]" /><p className="mt-1 text-sm font-bold">次の問題へ</p><p className="text-[11px] text-zinc-500">次の問題に進む</p></button>
            </div>
          </section>

          <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
            <button type="button" onClick={() => setShowOptionPanel((v) => !v)} className="flex w-full items-center justify-between"><h3 className="text-sm font-bold text-zinc-900">ライブ出題オプション</h3><span className="text-xs font-semibold text-[#7C3AED]">{showOptionPanel ? "閉じる" : "開く"}</span></button>
            {showOptionPanel ? (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-zinc-600">制限時間（回答時間）</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button type="button" className="h-10 w-10 rounded-lg border border-zinc-200" onClick={() => setSettingTimeLimit((v) => String(Math.max(1, Number(v || "20") - 1)))}>-</button>
                    <input value={settingTimeLimit} onChange={(e) => setSettingTimeLimit(e.target.value)} className="h-10 w-24 rounded-lg border border-zinc-200 px-3 text-center" />
                    <button type="button" className="h-10 w-10 rounded-lg border border-zinc-200" onClick={() => setSettingTimeLimit((v) => String(Math.max(1, Number(v || "20") + 1)))}>+</button>
                    <span className="text-sm text-zinc-600">秒</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-600">出題順</p>
                  <select value={settingOrderMode} onChange={(e) => setSettingOrderMode(e.target.value as OrderMode)} className="mt-1 min-h-[44px] w-full rounded-[14px] border border-zinc-200 px-3 text-sm">
                    <option value="fixed">作成順（固定）</option>
                    <option value="random">ランダム</option>
                  </select>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-sm"><span>自動で次の問題へ</span><input type="checkbox" checked={settingAutoNext} onChange={(e) => setSettingAutoNext(e.target.checked)} /></label>
                <label className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-sm"><span>カウントダウンを表示</span><input type="checkbox" checked={settingShowCountdown} onChange={(e) => setSettingShowCountdown(e.target.checked)} /></label>
                <button type="button" disabled={busy} onClick={() => void saveBroadcastSettings()} className="min-h-[48px] w-full rounded-[14px] bg-[#7C3AED] text-sm font-bold text-white disabled:opacity-50">保存する</button>
              </div>
            ) : null}
          </section>

          <section className="rounded-[18px] border border-violet-200 bg-violet-50/70 p-4 shadow-sm">
            <h3 className="text-sm font-bold text-violet-900">💡 運営のヒント</h3>
            <ul className="mt-2 space-y-1 text-xs text-violet-900/90">
              <li>出題開始を押すと、参加者の画面に問題が表示されます。</li>
              <li>制限時間が終了すると、自動で結果が表示されます。</li>
              <li>一時停止中は、参加者の回答が停止されます。</li>
            </ul>
          </section>
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
