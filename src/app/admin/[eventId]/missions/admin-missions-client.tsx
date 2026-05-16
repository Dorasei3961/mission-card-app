"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { ChevronLeft } from "lucide-react";
import { db } from "../../../lib/firebase";
import { useRedirectIfEventMissing } from "../../../lib/use-redirect-if-event-missing";
import { useEventAdminAccess } from "../../../lib/use-event-admin-access";
import {
  DEFAULT_MISSIONS_SEED,
  type MissionFields,
  type MissionKind,
  normalizeMissionFromFirestore,
} from "../../../lib/mission-schema";

type AdminMission = MissionFields & { docId: string };
type Props = { eventId: string };

const DEFAULT_CATEGORY_COLOR = "custom";
const showMissionCategoryUi = false;

export function AdminMissionsClient({ eventId }: Props) {
  const router = useRouter();
  useRedirectIfEventMissing(eventId);
  const { allowed, authReady } = useEventAdminAccess({ eventId });
  const [eventStatus, setEventStatus] = useState<"active" | "closed">("active");

  const [missions, setMissions] = useState<AdminMission[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [missionKind, setMissionKind] = useState<MissionKind>("checkbox");
  const [points, setPoints] = useState("10");
  const [pointPerUnit, setPointPerUnit] = useState("50");
  const [order, setOrder] = useState("");
  const [isActiveNew, setIsActiveNew] = useState(true);
  const [missionCreateBusy, setMissionCreateBusy] = useState(false);
  const [message, setMessage] = useState("");

  const canManage = allowed === true;
  const canEdit = canManage && eventStatus === "active";

  useEffect(() => {
    if (!eventId) return;
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) return;
      setEventStatus((snap.data() as { status?: string }).status === "closed" ? "closed" : "active");
    });
    return () => unsub();
  }, [eventId]);

  const loadMissions = async () => {
    if (!eventId) return;
    const missionColl = collection(db, "events", eventId, "missions");
    let snapshot = await getDocs(missionColl);
    if (snapshot.empty) {
      const seedResults = await Promise.allSettled(
        DEFAULT_MISSIONS_SEED.map((mission) =>
          setDoc(doc(db, "events", eventId, "missions", String(mission.id)), {
            ...mission,
            eventId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        ),
      );
      const seedFailureCount = seedResults.filter((it) => it.status === "rejected").length;
      if (seedFailureCount > 0) {
        console.error("[admin-missions] default mission seed failed", { eventId, seedFailureCount });
      }
      snapshot = await getDocs(missionColl);
    }
    const missionList = snapshot.docs
      .map((missionDoc) => ({
        docId: missionDoc.id,
        ...normalizeMissionFromFirestore(missionDoc.id, missionDoc.data() as Record<string, unknown>),
      }))
      .sort((a, b) => a.order - b.order || a.id - b.id);
    setMissions(
      missionList.length > 0
        ? missionList
        : DEFAULT_MISSIONS_SEED.map((m) => ({ ...m, docId: String(m.id) })),
    );
  };

  useEffect(() => {
    if (!eventId || !authReady || !canManage) return;
    void loadMissions();
  }, [eventId, authReady, canManage]);

  const handleCreateMission = async () => {
    if (!canEdit || missionCreateBusy) return;
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
    setMissionCreateBusy(true);
    try {
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
    } catch (e) {
      console.error("[admin-missions] handleCreateMission", e);
      setMessage("保存に失敗しました。再読み込み後にもう一度お試しください。");
    } finally {
      setMissionCreateBusy(false);
    }
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
    try {
      await setDoc(doc(db, "events", eventId, "missions", mission.docId), payload, { merge: true });
      setMessage("更新しました。");
      await loadMissions();
    } catch (e) {
      console.error("[admin-missions] handleUpdateMission", e);
      setMessage("更新に失敗しました。");
    }
  };

  const handleDeleteMission = async (docId: string) => {
    if (!canEdit) return;
    try {
      await deleteDoc(doc(db, "events", eventId, "missions", docId));
      setMessage("削除しました。");
      await loadMissions();
    } catch (e) {
      console.error("[admin-missions] handleDeleteMission", e);
      setMessage("削除に失敗しました。");
    }
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
    try {
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
    } catch (e) {
      console.error("[admin-missions] moveMission", e);
      setMessage("並び順の更新に失敗しました。");
      await loadMissions();
    }
  };

  if (allowed !== true || !authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/90 to-zinc-50 px-4 pb-28 pt-4">
      <header className="mx-auto mb-4 flex max-w-md items-center gap-3">
        <Link
          href={`/admin/${eventId}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-zinc-200 bg-white text-[#111827] shadow-sm touch-manipulation"
          aria-label="運営ダッシュボードへ戻る"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[#7C3AED]">運営</p>
          <h1 className="truncate text-lg font-bold text-[#111827]">ミッション管理</h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        {message ? (
          <div className="rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-violet-800 shadow-sm">
            {message}
          </div>
        ) : null}

        {!canEdit ? (
          <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            {eventStatus === "closed" ? "イベント終了のため編集できません。" : "編集できません。"}
          </p>
        ) : null}

        <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-zinc-900">ミッションを追加</h2>
          <div className="mt-3 flex flex-col gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトル"
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
              disabled={!canEdit}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="説明文（任意）"
              className="min-h-20 rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
              disabled={!canEdit}
            />
            {showMissionCategoryUi ? (
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="カテゴリ（任意）"
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
                disabled={!canEdit}
              />
            ) : null}
            <input
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              placeholder="並び順（未入力で末尾）"
              type="number"
              min={0}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
              disabled={!canEdit}
            />
            <select
              value={missionKind}
              onChange={(e) => setMissionKind(e.target.value as MissionKind)}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
              disabled={!canEdit}
            >
              <option value="checkbox">チェック型（固定ポイント）</option>
              <option value="number">数量型（カウント × 1あたりpt）</option>
            </select>
            {missionKind === "checkbox" ? (
              <input
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                placeholder="固定ポイント（例: 20）※必須"
                type="number"
                min={0}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
                disabled={!canEdit}
              />
            ) : (
              <input
                value={pointPerUnit}
                onChange={(e) => setPointPerUnit(e.target.value)}
                placeholder="1あたりのポイント（例: 50）※必須"
                type="number"
                min={1}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
                disabled={!canEdit}
              />
            )}
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
              <input
                type="checkbox"
                checked={isActiveNew}
                onChange={(e) => setIsActiveNew(e.target.checked)}
                disabled={!canEdit}
              />
              公開（参加者に表示）
            </label>
            <button
              type="button"
              onClick={() => void handleCreateMission()}
              disabled={!canEdit || missionCreateBusy}
              className="rounded-xl bg-[#7C3AED] px-3 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50 touch-manipulation"
            >
              {missionCreateBusy ? "保存中…" : "項目を追加"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-zinc-900">ミッション一覧</h2>
          <div className="mt-3 space-y-2">
            {missions.map((mission) => (
              <div key={mission.docId} className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                <div className="flex flex-col gap-2">
                  <input
                    value={mission.title}
                    onChange={(e) =>
                      setMissions((prev) =>
                        prev.map((it) =>
                          it.docId === mission.docId ? { ...it, title: e.target.value } : it,
                        ),
                      )
                    }
                    className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-sm font-bold outline-none focus:ring-2 focus:ring-violet-500/25"
                    disabled={!canEdit}
                  />
                  <textarea
                    value={mission.description}
                    onChange={(e) =>
                      setMissions((prev) =>
                        prev.map((it) =>
                          it.docId === mission.docId ? { ...it, description: e.target.value } : it,
                        ),
                      )
                    }
                    className="min-h-16 rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-violet-500/25"
                    disabled={!canEdit}
                  />
                  {showMissionCategoryUi ? (
                    <input
                      value={mission.category}
                      onChange={(e) =>
                        setMissions((prev) =>
                          prev.map((it) =>
                            it.docId === mission.docId ? { ...it, category: e.target.value } : it,
                          ),
                        )
                      }
                      className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-violet-500/25"
                      disabled={!canEdit}
                    />
                  ) : null}
                  <input
                    type="number"
                    min={0}
                    value={mission.order}
                    onChange={(e) =>
                      setMissions((prev) =>
                        prev.map((it) =>
                          it.docId === mission.docId
                            ? { ...it, order: Math.max(0, Number(e.target.value) || 0) }
                            : it,
                        ),
                      )
                    }
                    className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-violet-500/25"
                    disabled={!canEdit}
                  />
                  <select
                    value={mission.type}
                    onChange={(e) =>
                      setMissions((prev) =>
                        prev.map((it) =>
                          it.docId === mission.docId
                            ? {
                                ...it,
                                type: e.target.value as MissionKind,
                                points:
                                  e.target.value === "checkbox"
                                    ? it.points > 0
                                      ? it.points
                                      : 10
                                    : 0,
                                pointPerUnit:
                                  e.target.value === "number"
                                    ? it.pointPerUnit > 0
                                      ? it.pointPerUnit
                                      : 50
                                    : 0,
                              }
                            : it,
                        ),
                      )
                    }
                    className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-violet-500/25"
                    disabled={!canEdit}
                  >
                    <option value="checkbox">チェック型</option>
                    <option value="number">数量型</option>
                  </select>
                  {mission.type === "checkbox" ? (
                    <input
                      type="number"
                      min={0}
                      value={mission.points}
                      onChange={(e) =>
                        setMissions((prev) =>
                          prev.map((it) =>
                            it.docId === mission.docId
                              ? { ...it, points: Number(e.target.value) || 0 }
                              : it,
                          ),
                        )
                      }
                      className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-violet-500/25"
                      disabled={!canEdit}
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      value={mission.pointPerUnit}
                      onChange={(e) =>
                        setMissions((prev) =>
                          prev.map((it) =>
                            it.docId === mission.docId
                              ? { ...it, pointPerUnit: Number(e.target.value) || 0 }
                              : it,
                          ),
                        )
                      }
                      className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-violet-500/25"
                      disabled={!canEdit}
                    />
                  )}
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                    <input
                      type="checkbox"
                      checked={mission.isActive}
                      onChange={(e) =>
                        setMissions((prev) =>
                          prev.map((it) =>
                            it.docId === mission.docId ? { ...it, isActive: e.target.checked } : it,
                          ),
                        )
                      }
                      disabled={!canEdit}
                    />
                    公開
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-emerald-700">order: {mission.order}</span>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => void moveMission(mission.docId, "up")}
                        disabled={!canEdit}
                        className="rounded-lg bg-zinc-200 px-2 py-1 text-xs font-bold disabled:opacity-50 touch-manipulation"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveMission(mission.docId, "down")}
                        disabled={!canEdit}
                        className="rounded-lg bg-zinc-200 px-2 py-1 text-xs font-bold disabled:opacity-50 touch-manipulation"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUpdateMission(mission)}
                        disabled={!canEdit}
                        className="rounded-lg bg-[#7C3AED] px-2 py-1 text-xs font-bold text-white disabled:opacity-50 touch-manipulation"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteMission(mission.docId)}
                        disabled={!canEdit}
                        className="rounded-lg bg-red-500 px-2 py-1 text-xs font-bold text-white disabled:opacity-50 touch-manipulation"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
