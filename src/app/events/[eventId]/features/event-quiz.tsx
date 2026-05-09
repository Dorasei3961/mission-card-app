"use client";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { onAuthStateChanged as authOnAuth, signInAnonymously as authSignIn } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { getEventSession, setEventSession } from "../../../lib/event-session";
import { resolveEventFeatures } from "../../../lib/event-features";
import { normalizeQuizFromFirestore, type QuizDoc } from "../../../lib/quiz-schema";
import { CircleDot, Clock, HelpCircle } from "lucide-react";

type Props = { eventId: string };

export function EventQuiz({ eventId }: Props) {
  const [ready, setReady] = useState(false);
  /** participants / missionProgress のドキュメントID（セッション由来のことがあります） */
  const [participantDocId, setParticipantDocId] = useState("");
  /** Firestore ルール `participantId == auth.uid` 用 */
  const [authUid, setAuthUid] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [canPlay, setCanPlay] = useState(false);
  const [error, setError] = useState("");
  const [quizEnabled, setQuizEnabled] = useState(false);
  const [eventClosed, setEventClosed] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<QuizDoc | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"correct" | "wrong" | "already" | null>(null);
  const [timeUp, setTimeUp] = useState(false);

  useEffect(() => {
    const unsub = authOnAuth(auth, async (user) => {
      if (!user) {
        await authSignIn(auth);
        return;
      }
      try {
        const session = getEventSession();
        const participantKey =
          session && session.eventId === eventId && session.uid ? session.uid : user.uid;
        setParticipantDocId(participantKey);
        setAuthUid(user.uid);

        const eventSnap = await getDoc(doc(db, "events", eventId));
        if (!eventSnap.exists()) {
          setError("イベントが見つかりません。");
          setCanPlay(false);
          setReady(true);
          return;
        }
        const ev = eventSnap.data() as { features?: unknown; status?: string };
        setQuizEnabled(resolveEventFeatures(ev.features).quiz);
        setEventClosed(ev.status === "closed");

        const partSnap = await getDoc(doc(db, "events", eventId, "participants", participantKey));
        if (!partSnap.exists()) {
          setError("このイベントに参加していません。参加画面から入ってください。");
          setCanPlay(false);
          setReady(true);
          return;
        }
        const pdata = partSnap.data() as { name?: string };
        const name = pdata.name?.trim() ?? "";
        setParticipantName(name);
        setCanPlay(true);
        if (!session || session.eventId !== eventId || session.uid !== participantKey) {
          setEventSession({ eventId, participantName: name, uid: participantKey });
        }
      } catch (e) {
        console.error(e);
        setError("読み込みに失敗しました。");
      } finally {
        setReady(true);
      }
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    if (!quizEnabled) {
      setActiveQuiz(null);
      return;
    }
    const coll = collection(db, "events", eventId, "quizzes");
    const unsub = onSnapshot(coll, (snap) => {
      const actives = snap.docs
        .map((d) => normalizeQuizFromFirestore(d.id, d.data() as Record<string, unknown>))
        .filter((q) => q.status === "active");
      setActiveQuiz(actives.sort((a, b) => (b.activatedAt?.toMillis?.() ?? 0) - (a.activatedAt?.toMillis?.() ?? 0))[0] ?? null);
    });
    return () => unsub();
  }, [eventId, quizEnabled]);

  const [existingAnswer, setExistingAnswer] = useState(false);

  useEffect(() => {
    if (!authUid || !activeQuiz) {
      setExistingAnswer(false);
      return;
    }
    const aid = `${activeQuiz.id}_${authUid}`;
    const unsub = onSnapshot(doc(db, "events", eventId, "quizAnswers", aid), (snap) => {
      setExistingAnswer(snap.exists());
      if (snap.exists()) {
        const d = snap.data() as { isCorrect?: boolean };
        setResult(d.isCorrect ? "correct" : "wrong");
        setSelectedIndex(null);
      }
    });
    return () => unsub();
  }, [eventId, authUid, activeQuiz?.id]);

  const deadlineMs = useMemo(() => {
    if (!activeQuiz?.timeLimit || !activeQuiz.activatedAt) return null;
    const start = activeQuiz.activatedAt.toMillis?.() ?? 0;
    return start + activeQuiz.timeLimit * 1000;
  }, [activeQuiz]);

  useEffect(() => {
    if (!deadlineMs || eventClosed) {
      setTimeUp(false);
      return;
    }
    const tick = () => {
      setTimeUp(Date.now() > deadlineMs);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [deadlineMs, eventClosed]);

  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  const secondsLeft = useMemo(() => {
    if (!deadlineMs) return null;
    void nowTick;
    return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
  }, [deadlineMs, nowTick, timeUp]);

  const submitAnswer = async (idx: number) => {
    if (!activeQuiz || !participantDocId || !authUid || !canPlay || eventClosed || timeUp) return;
    if (existingAnswer) return;
    setSubmitting(true);
    setError("");
    try {
      const answerId = `${activeQuiz.id}_${authUid}`;
      const ref = doc(db, "events", eventId, "quizAnswers", answerId);
      const prev = await getDoc(ref);
      if (prev.exists()) {
        setResult("already");
        setSubmitting(false);
        return;
      }
      const isCorrect = idx === activeQuiz.correctIndex;
      await setDoc(ref, {
        quizId: activeQuiz.id,
        participantId: authUid,
        participantName: participantName || "参加者",
        selectedIndex: idx,
        isCorrect,
        answeredAt: serverTimestamp(),
      });

      if (isCorrect && activeQuiz.points > 0) {
        const partRef = doc(db, "events", eventId, "participants", participantDocId);
        await setDoc(
          partRef,
          {
            quizPoints: increment(activeQuiz.points),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        await addDoc(collection(db, "events", eventId, "pointLogs"), {
          uid: authUid,
          participantName: participantName || "参加者",
          type: "quiz",
          quizId: activeQuiz.id,
          quizTitle: activeQuiz.question.slice(0, 80),
          point: activeQuiz.points,
          reason: "クイズ正解",
          createdAt: serverTimestamp(),
          createdBy: authUid,
        });
        const partSnap = await getDoc(partRef);
        const qp = Number(partSnap.data()?.quizPoints ?? 0);
        const progSnap = await getDoc(doc(db, "events", eventId, "missionProgress", participantDocId));
        let missionTotal = 0;
        if (progSnap.exists()) {
          const pv = progSnap.data() as { totalPoints?: number };
          if (typeof pv.totalPoints === "number") missionTotal = pv.totalPoints;
        }
        await setDoc(partRef, { totalPoints: missionTotal + qp }, { merge: true });
        await setDoc(
          doc(db, "users", authUid),
          {
            totalPoints: missionTotal + qp,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      setResult(isCorrect ? "correct" : "wrong");
      setSelectedIndex(idx);
    } catch (e) {
      console.error(e);
      setError("回答の送信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="rounded-2xl border border-violet-100 bg-white p-6 text-center text-sm text-zinc-600 shadow-sm">
        読み込み中…
      </div>
    );
  }

  if (!quizEnabled) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 p-6 text-center shadow-sm">
        <HelpCircle className="mx-auto h-8 w-8 text-zinc-400" strokeWidth={1.5} aria-hidden />
        <p className="mt-3 text-sm font-semibold text-zinc-700">クイズ機能は無効です</p>
        <p className="mt-1 text-xs text-zinc-500">運営が有効にすると表示されます。</p>
      </div>
    );
  }

  if (!canPlay) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50/60 p-4 text-sm text-red-800 shadow-sm">
        {error || "参加できません。"}
      </div>
    );
  }

  if (!activeQuiz) {
    return (
      <div className="rounded-2xl border border-violet-100 bg-white p-6 text-center shadow-sm">
        <CircleDot className="mx-auto h-8 w-8 text-violet-400" strokeWidth={1.5} aria-hidden />
        <p className="mt-3 text-sm font-semibold text-zinc-800">現在、出題中のクイズはありません</p>
        <p className="mt-1 text-xs text-zinc-500">運営が出題を開始するまでお待ちください。</p>
      </div>
    );
  }

  const disabled = !!eventClosed || !!submitting || existingAnswer || timeUp;

  return (
    <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">ライブクイズ</p>
          {deadlineMs ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                timeUp ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-violet-100 text-violet-800"
              }`}
            >
              <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
              {timeUp ? "終了" : `残り ${secondsLeft}s`}
            </span>
          ) : null}
        </div>
        <h2 className="mt-2 text-base font-bold leading-snug text-zinc-900">{activeQuiz.question}</h2>
        <p className="mt-1 text-[11px] text-zinc-500">正解で +{activeQuiz.points} pt</p>
      </div>

      <div className="space-y-2 p-4">
        {eventClosed ? (
          <p className="text-xs font-semibold text-red-600">イベントは終了しているため回答できません。</p>
        ) : null}
        {timeUp && !existingAnswer ? (
          <p className="text-xs font-semibold text-amber-700">時間切れのため回答できません。</p>
        ) : null}

        {activeQuiz.choices.map((label, i) => {
          const isSel = selectedIndex === i;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => void submitAnswer(i)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition touch-manipulation ${
                disabled
                  ? "border-zinc-100 bg-zinc-50 text-zinc-400"
                  : isSel
                    ? "border-violet-400 bg-violet-50 text-violet-900 ring-2 ring-violet-200"
                    : "border-zinc-200 bg-white text-zinc-900 hover:border-violet-200 hover:bg-violet-50/50"
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-xs font-bold text-[#7C3AED]">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">{label}</span>
            </button>
          );
        })}

        {existingAnswer || result ? (
          <div
            className={`mt-3 rounded-xl px-3 py-2 text-center text-sm font-bold ${
              result === "correct"
                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                : result === "wrong"
                  ? "bg-amber-50 text-amber-900 ring-1 ring-amber-100"
                  : "bg-zinc-100 text-zinc-700"
            }`}
          >
            {result === "correct"
              ? `正解！ +${activeQuiz.points} pt`
              : result === "wrong"
                ? "不正解でした"
                : existingAnswer
                  ? "回答済みです"
                  : null}
          </div>
        ) : null}

        {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
