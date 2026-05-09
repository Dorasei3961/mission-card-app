"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../../../lib/firebase";
import { isValidFourDigitAdminPin, filterAdminPinInput } from "../../../lib/admin-pin";
import { ensureDefaultAdminPinIfMissing } from "../../../lib/default-admin-pin";
import { getAdminAccess, setAdminAccess } from "../../../lib/event-session";

type Props = { params: Promise<{ eventId: string }> };

type ParticipantRow = {
  uid: string;
  name: string;
  totalPoints: number;
  completedCount: number;
  updatedAtText: string;
};

type PointLogRow = {
  id: string;
  participantName: string;
  point: number;
  reason: string;
  missionTitle: string;
  type: string;
  createdAtText: string;
};

const formatDateTime = (raw: unknown): string => {
  try {
    if (raw && typeof raw === "object" && "toDate" in (raw as Record<string, unknown>)) {
      const date = (raw as { toDate: () => Date }).toDate();
      return date.toLocaleString("ja-JP");
    }
  } catch {
    // noop
  }
  return "未記録";
};

export default function AdminParticipantsPage({ params }: Props) {
  const [eventId, setEventId] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventStatus, setEventStatus] = useState<"active" | "closed">("active");
  const [currentUid, setCurrentUid] = useState("");
  const [pinSession, setPinSession] = useState(false);
  const [eventResolved, setEventResolved] = useState(false);
  const [eventMissing, setEventMissing] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [gatePinInput, setGatePinInput] = useState("");
  const [gatePinError, setGatePinError] = useState("");
  const [gatePinBusy, setGatePinBusy] = useState(false);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [logs, setLogs] = useState<PointLogRow[]>([]);
  const [deltaMap, setDeltaMap] = useState<Record<string, string>>({});
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busyUid, setBusyUid] = useState("");

  const canManage = pinSession;
  const canEdit = canManage && eventStatus === "active";

  useEffect(() => {
    void params.then((p) => setEventId(p.eventId));
  }, [params]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await signInAnonymously(auth);
        return;
      }
      setCurrentUid(user.uid);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!eventId) return;
    setEventResolved(false);
    setEventMissing(false);
    setPinSession(getAdminAccess(eventId));
    setGatePinInput("");
    setGatePinError("");
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    void ensureDefaultAdminPinIfMissing(eventId);
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      setEventResolved(true);
      if (!snap.exists()) {
        setEventMissing(true);
        setEventTitle("イベントが見つかりません");
        return;
      }
      setEventMissing(false);
      const data = snap.data() as { title?: string; status?: string };
      setEventTitle(String(data.title ?? "イベント"));
      setEventStatus(data.status === "closed" ? "closed" : "active");
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    if (!eventId || !authReady || !eventResolved || eventMissing || !canManage) return;

    const unsubParticipants = onSnapshot(collection(db, "events", eventId, "participants"), (snap) => {
      const rows = snap.docs
        .map((d) => {
          const data = d.data() as {
            name?: string;
            totalPoints?: number;
            completedCount?: number;
            updatedAt?: unknown;
          };
          return {
            uid: d.id,
            name: data.name?.trim() || "未登録ユーザー",
            totalPoints: typeof data.totalPoints === "number" ? data.totalPoints : 0,
            completedCount: typeof data.completedCount === "number" ? data.completedCount : 0,
            updatedAtText: formatDateTime(data.updatedAt),
          } as ParticipantRow;
        })
        .sort((a, b) => b.totalPoints - a.totalPoints);
      setParticipants(rows);
    });

    const unsubLogs = onSnapshot(
      query(collection(db, "events", eventId, "pointLogs"), orderBy("createdAt", "desc")),
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() as {
            participantName?: string;
            point?: number;
            reason?: string;
            missionTitle?: string;
            type?: string;
            createdAt?: unknown;
          };
          return {
            id: d.id,
            participantName: data.participantName?.trim() || "不明",
            point: typeof data.point === "number" ? data.point : 0,
            reason: data.reason?.trim() || "",
            missionTitle: data.missionTitle?.trim() || "",
            type: data.type?.trim() || "",
            createdAtText: formatDateTime(data.createdAt),
          } as PointLogRow;
        });
        setLogs(rows);
      },
    );

    return () => {
      unsubParticipants();
      unsubLogs();
    };
  }, [eventId, authReady, eventResolved, eventMissing, canManage]);

  const verifyGatePin = async () => {
    const entered = filterAdminPinInput(gatePinInput);
    if (!isValidFourDigitAdminPin(entered)) {
      setGatePinError("4桁の数字を入力してください。");
      return;
    }
    if (!eventId) return;
    setGatePinBusy(true);
    setGatePinError("");
    try {
      await ensureDefaultAdminPinIfMissing(eventId);
      const snap = await getDoc(doc(db, "events", eventId));
      if (!snap.exists()) return setGatePinError("イベントが見つかりません。");
      const pinStored = String((snap.data() as { adminPin?: unknown }).adminPin ?? "").trim();
      if (!pinStored) return setGatePinError("このイベントには管理PINが設定されていません。");
      if (entered !== pinStored.trim()) return setGatePinError("PINが違います");
      setAdminAccess(eventId, true);
      setPinSession(true);
      setGatePinInput("");
    } catch (e) {
      console.error(e);
      setGatePinError("確認に失敗しました。");
    } finally {
      setGatePinBusy(false);
    }
  };

  const applyDelta = async (row: ParticipantRow, delta: number, reasonRaw: string) => {
    if (!eventId || !canEdit) return;
    const reason = reasonRaw.trim();
    if (!reason) {
      setMessage("修正理由を入力してください。");
      return;
    }
    setBusyUid(row.uid);
    setMessage("");
    try {
      const nextTotal = row.totalPoints + delta;
      await setDoc(
        doc(db, "events", eventId, "participants", row.uid),
        {
          name: row.name,
          totalPoints: nextTotal,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await setDoc(
        doc(db, "users", row.uid),
        { totalPoints: nextTotal, updatedAt: serverTimestamp() },
        { merge: true },
      );
      await addDoc(collection(db, "events", eventId, "pointLogs"), {
        uid: row.uid,
        participantName: row.name,
        type: "adjust",
        missionId: null,
        missionTitle: "",
        point: delta,
        reason,
        createdAt: serverTimestamp(),
        createdBy: currentUid,
      });
      setMessage(`${row.name} さんのポイントを ${delta >= 0 ? "+" : ""}${delta} 修正しました。`);
    } catch (e) {
      console.error(e);
      setMessage("ポイント修正に失敗しました。");
    } finally {
      setBusyUid("");
    }
  };

  const applyDirect = async (row: ParticipantRow) => {
    const raw = deltaMap[row.uid]?.trim() ?? "";
    const target = Number(raw);
    if (!Number.isFinite(target)) {
      setMessage("直接入力には数値を入力してください。");
      return;
    }
    const delta = target - row.totalPoints;
    if (delta === 0) {
      setMessage("変更がありません。");
      return;
    }
    await applyDelta(row, delta, reasonMap[row.uid] ?? "");
  };

  const removeParticipant = async (row: ParticipantRow) => {
    if (!eventId || !canEdit) return;
    const ok = window.confirm(`${row.name} さんを削除します。よろしいですか？`);
    if (!ok) return;
    setBusyUid(row.uid);
    setMessage("");
    try {
      await addDoc(collection(db, "events", eventId, "pointLogs"), {
        uid: row.uid,
        participantName: row.name,
        type: "delete",
        missionId: null,
        missionTitle: "",
        point: -row.totalPoints,
        reason: "運営による参加者削除",
        createdAt: serverTimestamp(),
        createdBy: currentUid,
      });
      await deleteDoc(doc(db, "events", eventId, "participants", row.uid));
      await deleteDoc(doc(db, "events", eventId, "missionProgress", row.uid));
      setMessage(`${row.name} さんを削除しました。`);
    } catch (e) {
      console.error(e);
      setMessage("参加者削除に失敗しました。");
    } finally {
      setBusyUid("");
    }
  };

  const logContent = useMemo(
    () =>
      logs.map((log) => {
        const titlePart = log.missionTitle ? ` / ${log.missionTitle}` : "";
        const reasonPart = log.reason ? `（${log.reason}）` : "";
        return {
          ...log,
          text: `${log.type}${titlePart}${reasonPart}`,
        };
      }),
    [logs],
  );

  if (!eventId || !authReady || !eventResolved) {
    return (
      <div className="min-h-screen bg-zinc-100 p-4">
        <main className="mx-auto flex max-w-md flex-col items-center justify-center pt-24">
          <p className="text-sm font-semibold text-zinc-600">読み込み中…</p>
        </main>
      </div>
    );
  }

  if (eventMissing) {
    return (
      <div className="min-h-screen bg-zinc-100 p-4">
        <main className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-black text-zinc-900">参加者管理</h1>
          <p className="mt-3 text-sm font-semibold text-red-600">イベントが見つかりません</p>
          <Link href="/events" className="mt-4 inline-flex text-sm font-semibold text-blue-600 underline">
            イベント一覧へ
          </Link>
        </main>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-100 via-sky-100 to-cyan-100 p-4">
        <main className="mx-auto flex w-full max-w-md flex-col gap-4 pt-8">
          <div className="rounded-2xl border-4 border-indigo-300 bg-white p-5 shadow-[0_8px_0_#6366f1]">
            <h1 className="text-xl font-black text-zinc-900">参加者管理</h1>
            <p className="mt-3 text-sm font-bold text-zinc-800">運営PINを入力してください</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="off"
              value={gatePinInput}
              onChange={(e) => {
                setGatePinInput(filterAdminPinInput(e.target.value));
                if (gatePinError) setGatePinError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void verifyGatePin();
              }}
              className="mt-4 w-full rounded-xl border-2 border-zinc-200 px-4 py-4 text-xl font-bold tracking-widest"
              placeholder="例：1234"
              disabled={gatePinBusy}
            />
            {gatePinError ? <p className="mt-2 text-sm font-semibold text-red-600">{gatePinError}</p> : null}
            <button
              type="button"
              disabled={gatePinBusy}
              onClick={() => void verifyGatePin()}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-base font-bold text-white disabled:opacity-50"
            >
              {gatePinBusy ? "確認中…" : "確認して進む"}
            </button>
            <Link href={`/events/${eventId}`} className="mt-3 block text-center text-sm font-semibold text-blue-600 underline">
              参加者画面へ戻る
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-100 via-sky-100 to-cyan-100 p-4">
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-2xl border-4 border-indigo-300 bg-white p-4 shadow-[0_8px_0_#6366f1]">
          <p className="text-sm font-semibold text-indigo-700">参加者管理</p>
          <h1 className="text-2xl font-black text-zinc-900">{eventTitle || "イベント"}</h1>
          <p className="mt-1 text-xs font-bold text-zinc-600">
            状態: {eventStatus === "closed" ? "終了済み（閲覧のみ）" : "開催中"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/admin/${eventId}`} className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white">
              運営トップへ戻る
            </Link>
            <Link href={`/events/${eventId}`} className="rounded-full bg-zinc-500 px-4 py-2 text-sm font-bold text-white">
              参加者画面へ
            </Link>
          </div>
          {message ? <p className="mt-2 text-xs font-semibold text-indigo-700">{message}</p> : null}
        </header>

        <section className="rounded-2xl border-4 border-violet-300 bg-white p-4 shadow-[0_8px_0_#8b5cf6]">
          <h2 className="text-lg font-extrabold text-zinc-900">参加者一覧</h2>
          <div className="mt-3 space-y-3">
            {participants.map((row) => (
              <div key={row.uid} className="rounded-xl border-2 border-violet-100 bg-violet-50 p-3">
                <p className="text-base font-black text-zinc-900">{row.name}</p>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-zinc-700">
                  <span>合計: {row.totalPoints} pt</span>
                  <span>達成数: {row.completedCount}</span>
                  <span className="col-span-2">最終更新: {row.updatedAtText}</span>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    value={reasonMap[row.uid] ?? ""}
                    onChange={(e) => setReasonMap((prev) => ({ ...prev, [row.uid]: e.target.value }))}
                    placeholder="修正理由（必須）"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                    disabled={!canEdit || busyUid === row.uid}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => void applyDelta(row, 10, reasonMap[row.uid] ?? "")}
                      disabled={!canEdit || busyUid === row.uid}
                      className="rounded-lg bg-emerald-600 px-2 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyDelta(row, -10, reasonMap[row.uid] ?? "")}
                      disabled={!canEdit || busyUid === row.uid}
                      className="rounded-lg bg-amber-600 px-2 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      -10
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeParticipant(row)}
                      disabled={!canEdit || busyUid === row.uid}
                      className="rounded-lg bg-rose-600 px-2 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      削除
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={deltaMap[row.uid] ?? ""}
                      onChange={(e) => setDeltaMap((prev) => ({ ...prev, [row.uid]: e.target.value }))}
                      placeholder="直接入力（合計pt）"
                      className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      disabled={!canEdit || busyUid === row.uid}
                    />
                    <button
                      type="button"
                      onClick={() => void applyDirect(row)}
                      disabled={!canEdit || busyUid === row.uid}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      反映
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {participants.length === 0 ? (
              <p className="text-sm text-zinc-600">参加者はいません。</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border-4 border-cyan-300 bg-white p-4 shadow-[0_8px_0_#06b6d4]">
          <h2 className="text-lg font-extrabold text-zinc-900">達成・調整履歴（新しい順）</h2>
          <div className="mt-3 space-y-2">
            {logContent.map((log) => (
              <div key={log.id} className="rounded-lg border border-cyan-100 bg-cyan-50 p-3 text-xs">
                <p className="font-semibold text-zinc-800">{log.createdAtText}</p>
                <p className="mt-1 font-bold text-zinc-900">{log.participantName}</p>
                <p className="mt-1 text-zinc-700">{log.text}</p>
                <p className={`mt-1 font-black ${log.point >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {log.point >= 0 ? "+" : ""}
                  {log.point} pt
                </p>
              </div>
            ))}
            {logContent.length === 0 ? <p className="text-sm text-zinc-600">履歴はまだありません。</p> : null}
          </div>
        </section>
      </main>
    </div>
  );
}

