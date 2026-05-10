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
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  History,
  Play,
  Plus,
  StopCircle,
  Users,
} from "lucide-react";
import { db } from "../../../lib/firebase";
import { resolveEventFeatures } from "../../../lib/event-features";
import { normalizeQuizFromFirestore, type QuizDoc, type QuizStatus } from "../../../lib/quiz-schema";

type Props = { eventId: string };

type AdminQuizTab = "list" | "broadcast" | "results";

function sortQuizzes(a: QuizDoc, b: QuizDoc): number {
  const ta = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
  const tb = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
  return tb - ta;
}

export function QuizAdminPanel({ eventId }: Props) {
  const [quizzes, setQuizzes] = useState<QuizDoc[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [quizEnabled, setQuizEnabled] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminQuizTab>("list");
  const [orderMode, setOrderMode] = useState<"random" | "sequential">("sequential");

  const [qText, setQText] = useState("");
  const [c0, setC0] = useState("");
  const [c1, setC1] = useState("");
  const [c2, setC2] = useState("");
  const [c3, setC3] = useState("");
  const [correctIndex, setCorrectIndex] = useState(0);
  const [points, setPoints] = useState("10");
  const [timeLimit, setTimeLimit] = useState("");
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);

  const [broadcastTimeLimit, setBroadcastTimeLimit] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        setQuizEnabled(false);
        return;
      }
      const data = snap.data() as { features?: unknown; quizOrderMode?: unknown };
      setQuizEnabled(resolveEventFeatures(data.features).quiz);
      const mode = data.quizOrderMode;
      if (mode === "random" || mode === "sequential") setOrderMode(mode);
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const coll = collection(db, "events", eventId, "quizzes");
    const unsub = onSnapshot(coll, (snap) => {
      const list = snap.docs.map((d) =>
        normalizeQuizFromFirestore(d.id, d.data() as Record<string, unknown>),
      );
      list.sort(sortQuizzes);
      setQuizzes(list);
    });
    return () => unsub();
  }, [eventId]);

  const activeQuiz = useMemo(() => quizzes.find((q) => q.status === "active") ?? null, [quizzes]);

  useEffect(() => {
    if (!activeQuiz?.timeLimit) {
      setBroadcastTimeLimit("");
      return;
    }
    setBroadcastTimeLimit(String(activeQuiz.timeLimit));
  }, [activeQuiz?.id, activeQuiz?.timeLimit]);

  const [answerStats, setAnswerStats] = useState({ total: 0, correct: 0 });

  useEffect(() => {
    if (!activeQuiz) {
      setAnswerStats({ total: 0, correct: 0 });
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, "events", eventId, "quizAnswers"), where("quizId", "==", activeQuiz.id)),
      (snap) => {
        let correct = 0;
        snap.docs.forEach((d) => {
          const v = d.data() as { isCorrect?: boolean };
          if (v.isCorrect === true) correct += 1;
        });
        setAnswerStats({ total: snap.size, correct });
      },
    );
    return () => unsub();
  }, [eventId, activeQuiz?.id]);

  const ratePct =
    answerStats.total > 0 ? Math.round((answerStats.correct / answerStats.total) * 100) : 0;

  const historyQuizzes = useMemo(
    () => quizzes.filter((q) => q.status === "closed").sort(sortQuizzes),
    [quizzes],
  );

  const draftQuizzes = useMemo(
    () => quizzes.filter((q) => q.status === "draft").sort(sortQuizzes),
    [quizzes],
  );

  const resetForm = () => {
    setQText("");
    setC0("");
    setC1("");
    setC2("");
    setC3("");
    setCorrectIndex(0);
    setPoints("10");
    setTimeLimit("");
    setEditingQuizId(null);
  };

  const fillFormFromQuiz = (q: QuizDoc) => {
    setQText(q.question);
    const ch = q.choices.length >= 4 ? q.choices : [...q.choices, "", "", "", ""].slice(0, 4);
    setC0(ch[0] ?? "");
    setC1(ch[1] ?? "");
    setC2(ch[2] ?? "");
    setC3(ch[3] ?? "");
    setCorrectIndex(Math.min(3, Math.max(0, q.correctIndex)));
    setPoints(String(q.points));
    setTimeLimit(q.timeLimit != null ? String(q.timeLimit) : "");
  };

  const enableQuizFeature = async () => {
    setBusy(true);
    setMessage("");
    try {
      const ref = doc(db, "events", eventId);
      const ev = await getDoc(ref);
      const f = resolveEventFeatures(ev.exists() ? ev.data()?.features : undefined);
      await setDoc(
        ref,
        {
          features: {
            mission: f.mission,
            quiz: true,
            bingo: f.bingo,
            roulette: f.roulette,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("クイズ機能を有効にしました。");
    } catch (e) {
      console.error(e);
      setMessage("設定の更新に失敗しました（イベント作成者のアカウントでログインしているか確認してください）。");
    } finally {
      setBusy(false);
    }
  };

  const persistQuiz = async () => {
    if (!qText.trim()) {
      setMessage("問題文を入力してください。");
      return;
    }
    const choices = [c0, c1, c2, c3].map((s) => s.trim());
    if (choices.some((s) => !s)) {
      setMessage("選択肢4つすべて入力してください。");
      return;
    }
    const pts = Number(points);
    if (!Number.isFinite(pts) || pts < 0) {
      setMessage("ポイントは0以上の数値にしてください。");
      return;
    }
    const tlRaw = timeLimit.trim();
    const tl = tlRaw === "" ? null : Number(tlRaw);
    if (tl !== null && (!Number.isFinite(tl) || tl <= 0)) {
      setMessage("制限時間は空欄か、1秒以上の数値にしてください。");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      if (editingQuizId) {
        await setDoc(
          doc(db, "events", eventId, "quizzes", editingQuizId),
          {
            question: qText.trim(),
            choices,
            correctIndex,
            points: Math.floor(pts),
            timeLimit: tl === null ? null : Math.floor(tl),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        resetForm();
        setMessage("問題を更新しました。");
        return;
      }
      const id = crypto.randomUUID();
      await setDoc(doc(db, "events", eventId, "quizzes", id), {
        question: qText.trim(),
        choices,
        correctIndex,
        points: Math.floor(pts),
        timeLimit: tl === null ? null : Math.floor(tl),
        status: "draft" as QuizStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        activatedAt: null,
      });
      resetForm();
      setMessage("クイズを作成しました（下書き）。");
    } catch (e) {
      console.error(e);
      setMessage("保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const closeOthersAndActivate = async (quizId: string) => {
    setBusy(true);
    setMessage("");
    try {
      const batch = writeBatch(db);
      const others = quizzes.filter((q) => q.status === "active");
      for (const q of others) {
        batch.set(
          doc(db, "events", eventId, "quizzes", q.id),
          { status: "closed" as QuizStatus, updatedAt: serverTimestamp() },
          { merge: true },
        );
      }
      batch.set(
        doc(db, "events", eventId, "quizzes", quizId),
        {
          status: "active" as QuizStatus,
          activatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await batch.commit();
      setMessage("出題を開始しました。");
    } catch (e) {
      console.error(e);
      setMessage("出題の更新に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const closeQuiz = async (quizId: string) => {
    setBusy(true);
    setMessage("");
    try {
      await setDoc(
        doc(db, "events", eventId, "quizzes", quizId),
        { status: "closed" as QuizStatus, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setMessage("クイズを終了しました。");
    } catch (e) {
      console.error(e);
      setMessage("終了処理に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const removeDraft = async (quizId: string) => {
    if (!confirm("この下書きを削除しますか？")) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, "events", eventId, "quizzes", quizId));
      if (editingQuizId === quizId) resetForm();
      setMessage("削除しました。");
    } catch (e) {
      console.error(e);
      setMessage("削除に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const saveBroadcastSettings = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (activeQuiz) {
        const tlRaw = broadcastTimeLimit.trim();
        const tl = tlRaw === "" ? null : Number(tlRaw);
        if (tl !== null && (!Number.isFinite(tl) || tl <= 0)) {
          setMessage("制限時間は空欄か、1秒以上の数値にしてください。");
          return;
        }
        await setDoc(
          doc(db, "events", eventId, "quizzes", activeQuiz.id),
          {
            timeLimit: tl === null ? null : Math.floor(tl),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
      await setDoc(
        doc(db, "events", eventId),
        {
          quizOrderMode: orderMode,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("出題設定を保存しました。");
    } catch (e) {
      console.error(e);
      setMessage("保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const enableSection = (
    <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900">
          <CircleDot className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} aria-hidden />
          クイズ機能
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            quizEnabled ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {quizEnabled ? "有効" : "無効"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-600">
        有効にすると参加者のクイズ回答ページからライブクイズに参加できます。
      </p>
      {!quizEnabled ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enableQuizFeature()}
          className="mt-3 w-full rounded-xl bg-[#7C3AED] py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50 touch-manipulation"
        >
          クイズ機能を有効にする
        </button>
      ) : (
        <p className="mt-3 text-xs font-semibold text-emerald-700">クイズ機能は有効です。</p>
      )}
    </section>
  );

  const quizFormSection = (
    <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
          <Plus className="h-4 w-4 text-[#7C3AED]" strokeWidth={2} aria-hidden />
          {editingQuizId ? "問題を編集" : "新しい問題を追加"}
        </h3>
        {editingQuizId ? (
          <button
            type="button"
            onClick={() => resetForm()}
            className="text-[11px] font-bold text-zinc-500 underline touch-manipulation"
          >
            編集をやめる
          </button>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        <label className="block text-[11px] font-semibold text-zinc-600">問題文</label>
        <textarea
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          placeholder="問題を入力"
        />
        {[setC0, setC1, setC2, setC3].map((setter, i) => (
          <div key={i}>
            <label className="block text-[11px] font-semibold text-zinc-600">選択肢 {i + 1}</label>
            <input
              value={[c0, c1, c2, c3][i]}
              onChange={(e) => setter(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
        ))}
        <div>
          <label className="block text-[11px] font-semibold text-zinc-600">正解</label>
          <select
            value={correctIndex}
            onChange={(e) => setCorrectIndex(Number(e.target.value))}
            className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          >
            {[0, 1, 2, 3].map((i) => (
              <option key={i} value={i}>
                選択肢 {i + 1}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-600">ポイント</label>
            <input
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-zinc-600">制限時間（秒・任意）</label>
            <input
              type="number"
              min={1}
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)}
              placeholder="なし"
              className="mt-0.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void persistQuiz()}
          className="w-full rounded-[14px] bg-[#7C3AED] py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50 touch-manipulation"
        >
          {editingQuizId ? "保存" : "下書きとして保存"}
        </button>
      </div>
    </section>
  );

  const activeQuizSection =
    activeQuiz ? (
      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-900">
            <Play className="h-4 w-4" strokeWidth={2} aria-hidden />
            出題中
          </h3>
          <button
            type="button"
            disabled={busy}
            onClick={() => void closeQuiz(activeQuiz.id)}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-red-600 ring-1 ring-red-200 touch-manipulation disabled:opacity-50"
          >
            <StopCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            終了
          </button>
        </div>
        <p className="mt-2 text-sm font-semibold text-zinc-900">{activeQuiz.question}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white px-2 py-2 text-center shadow-sm ring-1 ring-emerald-100">
            <Users className="mx-auto h-4 w-4 text-emerald-600" strokeWidth={2} aria-hidden />
            <p className="mt-1 text-[10px] font-semibold text-zinc-500">回答数</p>
            <p className="text-lg font-bold tabular-nums text-zinc-900">{answerStats.total}</p>
          </div>
          <div className="rounded-xl bg-white px-2 py-2 text-center shadow-sm ring-1 ring-emerald-100">
            <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" strokeWidth={2} aria-hidden />
            <p className="mt-1 text-[10px] font-semibold text-zinc-500">正解数</p>
            <p className="text-lg font-bold tabular-nums text-zinc-900">{answerStats.correct}</p>
          </div>
          <div className="rounded-xl bg-white px-2 py-2 text-center shadow-sm ring-1 ring-emerald-100">
            <BarChart3 className="mx-auto h-4 w-4 text-emerald-600" strokeWidth={2} aria-hidden />
            <p className="mt-1 text-[10px] font-semibold text-zinc-500">正解率</p>
            <p className="text-lg font-bold tabular-nums text-zinc-900">{ratePct}%</p>
          </div>
        </div>
      </section>
    ) : (
      <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-xs text-zinc-600">
        現在出題中のクイズはありません。下書きから「出題開始」を押してください。
      </p>
    );

  const draftList = (opts: { showEdit: boolean }) =>
    draftQuizzes.length > 0 ? (
      <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
          <ClipboardList className="h-4 w-4 text-[#7C3AED]" strokeWidth={2} aria-hidden />
          下書き一覧
        </h3>
        <ul className="mt-3 space-y-2">
          {draftQuizzes.map((q) => (
            <li
              key={q.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 line-clamp-2">{q.question}</p>
                <p className="mt-1 text-[11px] text-zinc-500">形式：4択 · {q.points} pt</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void closeOthersAndActivate(q.id)}
                  className="rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 touch-manipulation"
                >
                  出題開始
                </button>
                {opts.showEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditingQuizId(q.id);
                      fillFormFromQuiz(q);
                      setAdminTab("list");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#7C3AED] ring-1 ring-violet-200 touch-manipulation disabled:opacity-50"
                  >
                    編集
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeDraft(q.id)}
                  className="rounded-lg bg-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-700 touch-manipulation disabled:opacity-50"
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const closedList =
    historyQuizzes.length > 0 ? (
      <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-zinc-900">過去の問題（終了済み）</h3>
        <ul className="mt-3 space-y-2">
          {historyQuizzes.map((q) => (
            <li key={q.id} className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2">
              <p className="text-xs font-semibold text-zinc-900 line-clamp-2">{q.question}</p>
              <p className="mt-1 text-[11px] text-zinc-500">形式：4択 · {q.points} pt（編集不可）</p>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const tabBtn = (id: AdminQuizTab, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={adminTab === id}
      onClick={() => setAdminTab(id)}
      className={`min-w-0 flex-1 rounded-xl py-2 text-[11px] font-bold transition touch-manipulation sm:text-xs ${
        adminTab === id ? "bg-[#7C3AED] text-white shadow-sm" : "text-zinc-600 hover:bg-violet-50"
      }`}
    >
      {label}
    </button>
  );

  const broadcastSettings = (
    <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-zinc-900">ライブ出題オプション</h3>
      <div className="mt-3 space-y-3 text-xs">
        <div>
          <p className="font-semibold text-zinc-600">ステータス</p>
          <p className="mt-1 font-bold text-zinc-900">{activeQuiz ? "出題中" : "停止中"}</p>
        </div>
        <div>
          <label className="font-semibold text-zinc-600">制限時間（秒・出題中のみ）</label>
          <input
            type="number"
            min={1}
            disabled={!activeQuiz}
            value={broadcastTimeLimit}
            onChange={(e) => setBroadcastTimeLimit(e.target.value)}
            placeholder="例：20"
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm disabled:bg-zinc-100"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            現在出題中の問題に適用されます（秒）。未入力で無制限に近い動作になります。
          </p>
        </div>
        <div>
          <label className="font-semibold text-zinc-600">出題順</label>
          <select
            value={orderMode}
            onChange={(e) => setOrderMode(e.target.value as "random" | "sequential")}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="sequential">順番固定</option>
            <option value="random">ランダム</option>
          </select>
          <p className="mt-1 text-[11px] text-zinc-500">
            将来の自動出題連携用にイベントに保存されます（現在は手動出題と併用）。
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveBroadcastSettings()}
          className="w-full rounded-[14px] bg-[#7C3AED] py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50 touch-manipulation"
        >
          保存する
        </button>
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="クイズ管理"
        className="flex gap-1 rounded-2xl border border-violet-100 bg-white p-1.5 shadow-sm"
      >
        {tabBtn("list", "問題一覧")}
        {tabBtn("broadcast", "出題設定")}
        {tabBtn("results", "結果一覧")}
      </div>

      {adminTab === "list" ? (
        <>
          {enableSection}
          {quizEnabled ? (
            <>
              {quizFormSection}
              {draftList({ showEdit: true })}
              {closedList}
            </>
          ) : null}
        </>
      ) : null}

      {adminTab === "broadcast" ? (
        <>
          {enableSection}
          {quizEnabled ? (
            <>
              {activeQuizSection}
              {draftList({ showEdit: false })}
              {broadcastSettings}
            </>
          ) : null}
        </>
      ) : null}

      {adminTab === "results" ? (
        <>
          {enableSection}
          {quizEnabled ? (
            <>
              {historyQuizzes.length > 0 ? (
                <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                    <History className="h-4 w-4 text-zinc-500" strokeWidth={2} aria-hidden />
                    問題ごとの結果
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {historyQuizzes.map((q) => (
                      <HistoryQuizRow key={q.id} eventId={eventId} quiz={q} />
                    ))}
                  </ul>
                </section>
              ) : (
                <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-600">
                  終了済みの問題があると、ここに回答数・正解率が表示されます。
                </p>
              )}
            </>
          ) : null}
        </>
      ) : null}

      {message ? (
        <p className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function HistoryQuizRow({ eventId, quiz }: { eventId: string; quiz: QuizDoc }) {
  const [stats, setStats] = useState({ total: 0, correct: 0 });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "events", eventId, "quizAnswers"), where("quizId", "==", quiz.id)),
      (snap) => {
        let correct = 0;
        snap.docs.forEach((d) => {
          const v = d.data() as { isCorrect?: boolean };
          if (v.isCorrect === true) correct += 1;
        });
        setStats({ total: snap.size, correct });
      },
    );
    return () => unsub();
  }, [eventId, quiz.id]);

  const rate = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    <li className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2">
      <p className="text-xs font-semibold text-zinc-900 line-clamp-2">{quiz.question}</p>
      <p className="mt-1 text-[11px] text-zinc-600">
        回答数 {stats.total} · 正解数 {stats.correct} · 正解率 {rate}%
      </p>
    </li>
  );
}
