"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { isValidFourDigitAdminPin, filterAdminPinInput } from "../../lib/admin-pin";
import { ensureDefaultAdminPinIfMissing } from "../../lib/default-admin-pin";
import { resolveEventFeatures } from "../../lib/event-features";
import { getAdminAccess, setAdminAccess } from "../../lib/event-session";
import {
  DEFAULT_MISSIONS_SEED,
  type MissionFields,
  type MissionKind,
  normalizeMissionFromFirestore,
} from "../../lib/mission-schema";

type AdminMission = MissionFields & { docId: string };
type ParticipantSummary = { uid: string; name: string; totalPoints: number };
type Props = { params: Promise<{ eventId: string }> };

const DEFAULT_CATEGORY_COLOR = "custom";

export default function EventAdminPage({ params }: Props) {
  const [eventId, setEventId] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [missions, setMissions] = useState<AdminMission[]>([]);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [missionKind, setMissionKind] = useState<MissionKind>("checkbox");
  const [points, setPoints] = useState("10");
  const [pointPerUnit, setPointPerUnit] = useState("50");
  const [order, setOrder] = useState("");
  const [isActiveNew, setIsActiveNew] = useState(true);
  const [rankingVisible, setRankingVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [currentUid, setCurrentUid] = useState("");
  const [ownerUid, setOwnerUid] = useState("");
  const [eventStatus, setEventStatus] = useState<"active" | "closed">("active");
  const [pinSession, setPinSession] = useState(false);
  const [eventResolved, setEventResolved] = useState(false);
  const [eventMissing, setEventMissing] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [gatePinInput, setGatePinInput] = useState("");
  const [gatePinError, setGatePinError] = useState("");
  const [gatePinBusy, setGatePinBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [creatorNameDisplay, setCreatorNameDisplay] = useState("");
  const [joinPasswordDisplay, setJoinPasswordDisplay] = useState("");
  const [adminPinDisplay, setAdminPinDisplay] = useState("");
  const [featureMissionEnabled, setFeatureMissionEnabled] = useState(true);

  const isOwner = Boolean(currentUid && ownerUid && currentUid === ownerUid);
  const canManage = isOwner || pinSession;
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
        setEventTitle("イベントが見つかりません");
        setOwnerUid("");
        setRankingVisible(false);
        setCreatorNameDisplay("");
        setJoinPasswordDisplay("");
        setAdminPinDisplay("");
        setEventMissing(true);
        return;
      }
      setEventMissing(false);
      const data = snap.data() as {
        title?: string;
        creatorName?: string;
        joinPassword?: unknown;
        adminPin?: unknown;
        ownerUid?: string;
        rankingVisible?: boolean;
        password?: string;
        joinCode?: string;
        joinUrl?: string;
        features?: unknown;
      };
      setEventTitle(String(data.title ?? "イベント"));
      setCreatorNameDisplay(String(data.creatorName ?? "").trim());
      setJoinPasswordDisplay(
        typeof data.joinPassword === "string" ? data.joinPassword : "",
      );
      setAdminPinDisplay(String(data.adminPin ?? "").trim());
      setOwnerUid(String(data.ownerUid ?? ""));
      setRankingVisible(Boolean(data.rankingVisible));
      setFeatureMissionEnabled(resolveEventFeatures(data.features).mission);
      setEventStatus((data as { status?: string }).status === "closed" ? "closed" : "active");
      const code = (data.joinCode?.trim() || data.password?.trim() || "").trim();
      setJoinCode(code);
      const generated =
        typeof window !== "undefined" && code
          ? `${window.location.origin}/join?code=${encodeURIComponent(code)}`
          : "";
      setJoinUrl((data.joinUrl?.trim() || generated || `/join?code=${encodeURIComponent(code)}`).trim());
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    if (!eventId || !canManage || !joinCode) return;
    const generated =
      typeof window !== "undefined"
        ? `${window.location.origin}/join?code=${encodeURIComponent(joinCode)}`
        : `/join?code=${encodeURIComponent(joinCode)}`;
    if (joinUrl === generated) return;
    void setDoc(
      doc(db, "events", eventId),
      { joinCode, joinUrl: generated, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }, [eventId, canManage, joinCode, joinUrl]);

  const loadMissions = async () => {
    if (!eventId) return;
    const missionColl = collection(db, "events", eventId, "missions");
    let snapshot = await getDocs(missionColl);
    if (snapshot.empty) {
      await Promise.all(
        DEFAULT_MISSIONS_SEED.map((mission) =>
          setDoc(doc(db, "events", eventId, "missions", String(mission.id)), {
            ...mission,
            eventId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        ),
      );
      snapshot = await getDocs(missionColl);
    }
    const missionList = snapshot.docs
      .map((missionDoc) => ({
        docId: missionDoc.id,
        ...normalizeMissionFromFirestore(missionDoc.id, missionDoc.data() as Record<string, unknown>),
      }))
      .sort((a, b) => a.order - b.order || a.id - b.id);
    setMissions(missionList);
  };

  const loadParticipants = async () => {
    if (!eventId) return;
    const snapshot = await getDocs(collection(db, "events", eventId, "participants"));
    const rows = snapshot.docs
      .map((d) => {
        const data = d.data() as { name?: string; totalPoints?: number };
        return {
          uid: d.id,
          name: data.name?.trim() || "未登録ユーザー",
          totalPoints: typeof data.totalPoints === "number" ? data.totalPoints : 0,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);
    setParticipants(rows);
  };

  useEffect(() => {
    if (!eventId || !authReady || !eventResolved || eventMissing || !canManage) return;
    void loadMissions();
    void loadParticipants();
  }, [eventId, authReady, eventResolved, eventMissing, canManage]);

  const toggleRankingVisible = async () => {
    if (!canEdit) return;
    await setDoc(
      doc(db, "events", eventId),
      { rankingVisible: !rankingVisible, updatedAt: serverTimestamp() },
      { merge: true },
    );
    setMessage(`ランキング表示を${!rankingVisible ? "ON" : "OFF"}にしました。`);
  };

  const handleCreateMission = async () => {
    if (!canEdit) return;
    const parsedPoints = Number(points);
    const parsedPerUnit = Number(pointPerUnit);
    const parsedOrder = Number(order);
    if (!title.trim()) return setMessage("タイトルは必須です。");
    if (order && (Number.isNaN(parsedOrder) || parsedOrder < 0)) {
      return setMessage("並び順には0以上の数値を入力してください。");
    }
    if (missionKind === "checkbox") {
      if (Number.isNaN(parsedPoints) || parsedPoints < 0) {
        return setMessage("チェック型では固定ポイントに0以上の数値を入力してください。");
      }
    } else if (Number.isNaN(parsedPerUnit) || parsedPerUnit <= 0) {
      return setMessage("数量型では「1あたりのポイント」に正の数値を入力してください。");
    }
    const id = Date.now();
    const nextOrder =
      order.trim().length > 0
        ? Math.floor(parsedOrder)
        : missions.length > 0
          ? Math.max(...missions.map((m) => m.order)) + 1
          : 1;
    const payload: Record<string, unknown> = {
      id,
      order: nextOrder,
      title: title.trim(),
      description: description.trim(),
      type: missionKind,
      category: category.trim(),
      categoryColor: DEFAULT_CATEGORY_COLOR,
      isActive: isActiveNew,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (missionKind === "checkbox") {
      payload.points = parsedPoints;
      payload.pointPerUnit = 0;
      payload.unitLabel = "";
    } else {
      payload.points = 0;
      payload.pointPerUnit = parsedPerUnit;
      payload.unitLabel = "";
    }
    await setDoc(doc(db, "events", eventId, "missions", String(id)), {
      ...payload,
      eventId,
    });
    setTitle("");
    setDescription("");
    setCategory("");
    setMissionKind("checkbox");
    setPoints("10");
    setPointPerUnit("50");
    setOrder("");
    setIsActiveNew(true);
    setMessage("保存しました。");
    await loadMissions();
  };

  const handleUpdateMission = async (mission: AdminMission) => {
    if (!canEdit) return;
    if (!mission.title.trim()) return setMessage("タイトルは必須です。");
    if (mission.type === "number" && mission.pointPerUnit <= 0) {
      return setMessage("数量型では「1あたりのポイント」を正の数値にしてください。");
    }
    if (mission.type === "checkbox" && mission.points < 0) {
      return setMessage("チェック型の固定ポイントは0以上にしてください。");
    }
    const payload: Record<string, unknown> = {
      id: mission.id,
      order: mission.order,
      title: mission.title.trim(),
      description: mission.description.trim(),
      type: mission.type,
      category: mission.category.trim(),
      isActive: mission.isActive,
      updatedAt: serverTimestamp(),
    };
    if (mission.type === "checkbox") {
      payload.points = mission.points;
      payload.pointPerUnit = 0;
      payload.unitLabel = "";
    } else {
      payload.points = 0;
      payload.pointPerUnit = mission.pointPerUnit;
    }
    await setDoc(doc(db, "events", eventId, "missions", mission.docId), payload, { merge: true });
    setMessage("更新しました。");
    await loadMissions();
  };

  const handleDeleteMission = async (docId: string) => {
    if (!canEdit) return;
    await deleteDoc(doc(db, "events", eventId, "missions", docId));
    setMessage("削除しました。");
    await loadMissions();
  };

  const moveMission = async (docId: string, direction: "up" | "down") => {
    if (!canEdit) return;
    const sorted = [...missions].sort((a, b) => a.order - b.order || a.id - b.id);
    const index = sorted.findIndex((m) => m.docId === docId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return;
    [sorted[index], sorted[targetIndex]] = [sorted[targetIndex], sorted[index]];
    const next = sorted.map((m, i) => ({ ...m, order: i + 1 }));
    setMissions(next);
    await Promise.all(
      next.map((m, i) =>
        setDoc(
          doc(db, "events", eventId, "missions", m.docId),
          { order: i + 1, updatedAt: serverTimestamp() },
          { merge: true },
        ),
      ),
    );
    setMessage("並び順を更新しました。");
  };

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
      if (!snap.exists()) {
        setGatePinError("イベントが見つかりません。");
        return;
      }
      const pinStored = String((snap.data() as { adminPin?: unknown }).adminPin ?? "").trim();
      if (!pinStored) {
        setGatePinError("このイベントには管理PINが設定されていません。");
        return;
      }
      if (entered !== pinStored.trim()) {
        setGatePinError("PINが違います");
        return;
      }
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

  const closeEvent = async () => {
    if (!canManage || eventStatus === "closed") return;
    await setDoc(
      doc(db, "events", eventId),
      {
        status: "closed",
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    setMessage("イベントを終了しました。以後は閲覧のみです。");
  };

  const copyJoinUrl = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setMessage("参加用URLをコピーしました。");
    } catch (e) {
      console.error(e);
      setMessage("URLコピーに失敗しました。");
    }
  };

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
          <h1 className="text-xl font-black text-zinc-900">運営管理画面</h1>
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
            <h1 className="text-xl font-black text-zinc-900">運営管理画面</h1>
            <p className="mt-3 text-sm font-bold text-zinc-800">運営PINを入力してください</p>
            <p className="mt-1 text-xs text-zinc-600">
              イベント作成者のほか、管理PINを知っている方のみ入場できます。
            </p>
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
            {gatePinError ? (
              <p className="mt-2 text-sm font-semibold text-red-600">{gatePinError}</p>
            ) : null}
            <button
              type="button"
              disabled={gatePinBusy}
              onClick={() => void verifyGatePin()}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-base font-bold text-white disabled:opacity-50 touch-manipulation"
            >
              {gatePinBusy ? "確認中…" : "確認して進む"}
            </button>
            <Link
              href={`/events/${eventId}`}
              className="mt-3 block text-center text-sm font-semibold text-blue-600 underline"
            >
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
          <p className="text-sm font-semibold text-indigo-700">運営管理画面</p>
          <h1 className="text-2xl font-black text-zinc-900">{eventTitle || "Point Admin"}</h1>
          <p className="mt-1 text-xs font-bold text-zinc-600">
            状態: {eventStatus === "closed" ? "終了済み" : "開催中"}
          </p>
          <Link href={`/events/${eventId}`} className="mt-3 inline-flex rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white">
            参加者画面へ戻る
          </Link>
          <Link
            href={`/admin/${eventId}/participants`}
            className="mt-2 inline-flex rounded-full bg-cyan-600 px-4 py-2 text-sm font-bold text-white"
          >
            参加者管理
          </Link>
          <button
            onClick={() => void closeEvent()}
            disabled={!canManage || eventStatus === "closed"}
            className="mt-2 inline-flex rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            イベント終了
          </button>
        </header>

        <section className="rounded-2xl border-4 border-slate-300 bg-white p-4 shadow-[0_8px_0_#94a3b8]">
          <h2 className="text-lg font-extrabold text-zinc-900">認証情報の確認</h2>
          <p className="mt-1 text-xs text-zinc-500">
            運営画面のみ表示されます。作成者が忘れたときの確認用です。
          </p>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-zinc-700">イベント名</dt>
              <dd className="mt-0.5 break-all font-medium text-zinc-900">{eventTitle || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-700">作成者名</dt>
              <dd className="mt-0.5 break-all font-medium text-zinc-900">
                {creatorNameDisplay || "—"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-700">参加用パスワード</dt>
              <dd className="mt-0.5 break-all font-mono text-base font-bold text-zinc-900">
                {joinPasswordDisplay || "（未設定）"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-700">管理用PIN</dt>
              <dd className="mt-0.5 font-mono text-base font-bold tracking-widest text-zinc-900">
                {adminPinDisplay || "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border-4 border-amber-300 bg-white p-4 shadow-[0_8px_0_#f59e0b]">
          <h2 className="text-lg font-extrabold text-zinc-900">ランキング表示設定</h2>
          <p className="mt-2 text-sm font-semibold text-zinc-700">対象イベント: {eventTitle || "未取得"}</p>
          <button
            onClick={() => void toggleRankingVisible()}
            disabled={!canEdit}
            className={`mt-2 rounded-xl px-3 py-2 text-sm font-bold text-white ${rankingVisible ? "bg-emerald-600" : "bg-zinc-600"} disabled:opacity-50`}
          >
            ランキング表示: {rankingVisible ? "ON" : "OFF"}
          </button>
          <Link href={`/events/${eventId}/ranking`} className="mt-2 block text-sm font-semibold text-blue-600 underline">
            ランキング画面を確認
          </Link>
        </section>

        <section className="rounded-2xl border-4 border-fuchsia-300 bg-white p-4 shadow-[0_8px_0_#d946ef]">
          <h2 className="text-lg font-extrabold text-zinc-900">イベント機能</h2>
          <p className="mt-2 text-sm text-zinc-700">
            ミッション・クイズ・ビンゴ・ルーレットなどを管理できます。
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            現在の有効機能: {featureMissionEnabled ? "ミッション" : "なし"}
          </p>
          <Link
            href={`/events/${eventId}/features`}
            className="mt-3 inline-flex rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-bold text-white"
          >
            イベント機能を開く
          </Link>
        </section>

        <section className="rounded-2xl border-4 border-emerald-300 bg-white p-4 shadow-[0_8px_0_#10b981]">
          <h2 className="text-lg font-extrabold text-zinc-900">参加用QRコード</h2>
          <p className="mt-2 text-xs text-zinc-600">QRを読み取ると参加画面が開き、合言葉が自動入力されます。</p>
          <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-800 break-all">
            {joinUrl || "URL生成中..."}
          </p>
          {joinUrl ? (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(joinUrl)}`}
              alt="参加用QRコード"
              className="mx-auto mt-3 h-48 w-48 rounded-lg border border-zinc-200 bg-white p-2"
            />
          ) : null}
          <button
            type="button"
            onClick={() => void copyJoinUrl()}
            className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white"
          >
            URLコピー
          </button>
        </section>

        <section className="rounded-2xl border-4 border-violet-300 bg-white p-4 shadow-[0_8px_0_#8b5cf6]">
          <h2 className="text-lg font-extrabold text-zinc-900">1) ポイント項目</h2>
          <div className="mt-3 flex flex-col gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="タイトル" className="rounded-xl border-2 border-zinc-200 px-3 py-2 text-sm" disabled={!canEdit} />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="説明文（任意）" className="min-h-20 rounded-xl border-2 border-zinc-200 px-3 py-2 text-sm" disabled={!canEdit} />
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="カテゴリ（任意）" className="rounded-xl border-2 border-zinc-200 px-3 py-2 text-sm" disabled={!canEdit} />
            <input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="並び順（未入力で末尾）" type="number" min={0} className="rounded-xl border-2 border-zinc-200 px-3 py-2 text-sm" disabled={!canEdit} />
            <select value={missionKind} onChange={(e) => setMissionKind(e.target.value as MissionKind)} className="rounded-xl border-2 border-zinc-200 px-3 py-2 text-sm" disabled={!canEdit}>
              <option value="checkbox">チェック型（固定ポイント）</option>
              <option value="number">数量型（カウント × 1あたりpt）</option>
            </select>
            {missionKind === "checkbox" ? (
              <input value={points} onChange={(e) => setPoints(e.target.value)} placeholder="固定ポイント（例: 20）※必須" type="number" min={0} className="rounded-xl border-2 border-zinc-200 px-3 py-2 text-sm" disabled={!canEdit} />
            ) : (
              <input value={pointPerUnit} onChange={(e) => setPointPerUnit(e.target.value)} placeholder="1あたりのポイント（例: 50）※必須" type="number" min={1} className="rounded-xl border-2 border-zinc-200 px-3 py-2 text-sm" disabled={!canEdit} />
            )}
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
              <input type="checkbox" checked={isActiveNew} onChange={(e) => setIsActiveNew(e.target.checked)} disabled={!canEdit} />
              公開（参加者に表示）
            </label>
            <button onClick={() => void handleCreateMission()} disabled={!canEdit} className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">項目を追加</button>
            {message ? <p className="text-xs font-semibold text-violet-700">{message}</p> : null}
          </div>

          <div className="mt-4 space-y-2">
            {missions.map((mission) => (
              <div key={mission.docId} className="rounded-xl border-2 border-violet-100 bg-violet-50 p-3">
                <div className="flex flex-col gap-2">
                  <input value={mission.title} onChange={(e) => setMissions((prev) => prev.map((it) => it.docId === mission.docId ? { ...it, title: e.target.value } : it))} className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-sm font-bold" disabled={!canEdit} />
                  <textarea value={mission.description} onChange={(e) => setMissions((prev) => prev.map((it) => it.docId === mission.docId ? { ...it, description: e.target.value } : it))} className="min-h-16 rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs" disabled={!canEdit} />
                  <input value={mission.category} onChange={(e) => setMissions((prev) => prev.map((it) => it.docId === mission.docId ? { ...it, category: e.target.value } : it))} className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs" disabled={!canEdit} />
                  <input type="number" min={0} value={mission.order} onChange={(e) => setMissions((prev) => prev.map((it) => it.docId === mission.docId ? { ...it, order: Math.max(0, Number(e.target.value) || 0) } : it))} className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs" disabled={!canEdit} />
                  <select value={mission.type} onChange={(e) => setMissions((prev) => prev.map((it) => it.docId === mission.docId ? { ...it, type: e.target.value as MissionKind, points: e.target.value === "checkbox" ? (it.points > 0 ? it.points : 10) : 0, pointPerUnit: e.target.value === "number" ? (it.pointPerUnit > 0 ? it.pointPerUnit : 50) : 0 } : it))} className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs" disabled={!canEdit}>
                    <option value="checkbox">チェック型</option><option value="number">数量型</option>
                  </select>
                  {mission.type === "checkbox" ? (
                    <input type="number" min={0} value={mission.points} onChange={(e) => setMissions((prev) => prev.map((it) => it.docId === mission.docId ? { ...it, points: Number(e.target.value) || 0 } : it))} className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs" disabled={!canEdit} />
                  ) : (
                    <input type="number" min={1} value={mission.pointPerUnit} onChange={(e) => setMissions((prev) => prev.map((it) => it.docId === mission.docId ? { ...it, pointPerUnit: Number(e.target.value) || 0 } : it))} className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs" disabled={!canEdit} />
                  )}
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700"><input type="checkbox" checked={mission.isActive} onChange={(e) => setMissions((prev) => prev.map((it) => it.docId === mission.docId ? { ...it, isActive: e.target.checked } : it))} disabled={!canEdit} />公開</label>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-700">order: {mission.order}</span>
                    <div className="flex gap-2">
                      <button onClick={() => void moveMission(mission.docId, "up")} disabled={!canEdit} className="rounded-lg bg-zinc-300 px-2 py-1 text-xs font-bold disabled:opacity-50">↑</button>
                      <button onClick={() => void moveMission(mission.docId, "down")} disabled={!canEdit} className="rounded-lg bg-zinc-300 px-2 py-1 text-xs font-bold disabled:opacity-50">↓</button>
                      <button onClick={() => void handleUpdateMission(mission)} disabled={!canEdit} className="rounded-lg bg-indigo-500 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">保存</button>
                      <button onClick={() => void handleDeleteMission(mission.docId)} disabled={!canEdit} className="rounded-lg bg-rose-500 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">削除</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border-4 border-cyan-300 bg-white p-4 shadow-[0_8px_0_#06b6d4]">
          <h2 className="text-lg font-extrabold text-zinc-900">2) 参加者一覧</h2>
          <div className="mt-3 space-y-2">
            {participants.map((p) => (
              <div key={p.uid} className="rounded-xl border-2 border-cyan-100 bg-cyan-50 p-3 text-sm">
                <p className="font-bold text-zinc-900">{p.name}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-zinc-700">
                  <span>合計: {p.totalPoints} pt</span>
                  <span>{p.uid.slice(0, 6)}...</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

