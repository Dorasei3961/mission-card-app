"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  addDoc,
  collection,
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
import {
  DEFAULT_MISSIONS_SEED,
  type MissionFields,
  normalizeMissionFromFirestore,
} from "../../lib/mission-schema";
import {
  clearEventSession,
  getAdminAccess,
  getEventSession,
  setAdminAccess,
  setEventSession,
} from "../../lib/event-session";

function parseCheckedMissionIdsFromFirestore(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.floor(v));
  return Array.from(new Set(ids));
}

function parseNumberValuesFromFirestore(raw: unknown): Record<number, number> {
  const result: Record<number, number> = {};
  if (!raw || typeof raw !== "object") return result;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    if (!Number.isFinite(id)) continue;
    const num =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : NaN;
    if (!Number.isFinite(num)) continue;
    result[id] = Math.max(0, Math.floor(num));
  }
  return result;
}

function numberValuesToFirestore(record: Record<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(record)) {
    out[String(k)] = Math.max(0, Math.floor(v));
  }
  return out;
}

type Props = {
  eventId: string;
};

export function EventMissions({ eventId }: Props) {
  const router = useRouter();
  const [eventTitle, setEventTitle] = useState("");
  const [missions, setMissions] = useState<MissionFields[]>(DEFAULT_MISSIONS_SEED);
  const [checkedMissionIds, setCheckedMissionIds] = useState<number[]>([]);
  const [numberValues, setNumberValues] = useState<Record<number, number>>({});
  const [userId, setUserId] = useState<string>("");
  const [participantName, setParticipantName] = useState<string>("");
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [canUseMissions, setCanUseMissions] = useState(false);
  const [rankingVisible, setRankingVisible] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [adminPinModalOpen, setAdminPinModalOpen] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [adminPinError, setAdminPinError] = useState("");
  const [adminPinBusy, setAdminPinBusy] = useState(false);

  const visibleMissions = useMemo(
    () =>
      missions
        .filter((m) => m.isActive !== false)
        .sort((a, b) => a.order - b.order || a.id - b.id),
    [missions],
  );

  const totalPoints = useMemo(() => {
    let sum = 0;
    for (const mission of visibleMissions) {
      if (mission.type === "checkbox" && checkedMissionIds.includes(mission.id)) {
        sum += mission.points;
      }
      if (mission.type === "number") {
        const count = Math.max(0, Math.floor(numberValues[mission.id] ?? 0));
        sum += count * mission.pointPerUnit;
      }
    }
    return sum;
  }, [visibleMissions, checkedMissionIds, numberValues]);

  useEffect(() => {
    const unsubEvent = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        setRankingVisible(false);
        return;
      }
      const data = snap.data() as {
        title?: string;
        rankingVisible?: boolean;
        ownerUid?: string;
        status?: string;
      };
      setEventTitle(String(data.title ?? "イベント"));
      setRankingVisible(Boolean(data.rankingVisible));
      setIsClosed(data.status === "closed");
    });

    return () => unsubEvent();
  }, [eventId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        setErrorMessage("");

        if (!user) {
          await signInAnonymously(auth);
          return;
        }

        const session = getEventSession();
        const participantKey =
          session && session.eventId === eventId && session.uid ? session.uid : user.uid;
        setUserId(participantKey);

        const eventRef = doc(db, "events", eventId);
        const eventSnap = await getDoc(eventRef);
        if (!eventSnap.exists()) {
          setErrorMessage("イベントが見つかりません。");
          setCanUseMissions(false);
          setIsReady(true);
          return;
        }
        await ensureDefaultAdminPinIfMissing(eventId);
        const eventData = eventSnap.data() as {
          title?: string;
          rankingVisible?: boolean;
          ownerUid?: string;
          status?: string;
        };
        setEventTitle(String(eventData.title ?? "イベント"));
        setRankingVisible(Boolean(eventData.rankingVisible));
        setIsClosed(eventData.status === "closed");

        const participantRef = doc(db, "events", eventId, "participants", participantKey);
        const participantSnap = await getDoc(participantRef);
        if (!participantSnap.exists()) {
          setErrorMessage("このイベントに参加していません。参加画面から入り直してください。");
          setCanUseMissions(false);
          setIsReady(true);
          return;
        }
        setCanUseMissions(true);
        const pdata = participantSnap.data() as { name?: string };
        const name = pdata.name?.trim() ?? "";
        setParticipantName(name);

        if (!session || session.eventId !== eventId || session.uid !== participantKey) {
          setEventSession({
            eventId,
            participantName: name,
            uid: participantKey,
          });
        } else if (session.participantName !== name && name) {
          setEventSession({ eventId, participantName: name, uid: participantKey });
        }

        const missionsRef = collection(db, "missions");
        const missionSnap = await getDocs(missionsRef);

        if (missionSnap.empty) {
          await Promise.all(
            DEFAULT_MISSIONS_SEED.map((mission) =>
              setDoc(doc(db, "missions", String(mission.id)), {
                ...mission,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            ),
          );
          setMissions(DEFAULT_MISSIONS_SEED);
        } else {
          const missionList = missionSnap.docs
            .map((missionDoc) =>
              normalizeMissionFromFirestore(missionDoc.id, missionDoc.data() as Record<string, unknown>),
            )
            .sort((a, b) => a.order - b.order || a.id - b.id);
          setMissions(missionList);
        }

        const progressRef = doc(db, "events", eventId, "missionProgress", participantKey);
        const progressSnap = await getDoc(progressRef);

        if (progressSnap.exists()) {
          const data = progressSnap.data() as {
            checkedMissionIds?: string[];
            numberValues?: Record<string, number>;
          };
          setCheckedMissionIds(parseCheckedMissionIdsFromFirestore(data.checkedMissionIds));
          setNumberValues(parseNumberValuesFromFirestore(data.numberValues));
        } else {
          await setDoc(progressRef, {
            userId: user.uid,
            eventId,
            checkedMissionIds: [] as string[],
            numberValues: {},
            totalPoints: 0,
            updatedAt: serverTimestamp(),
          });
          setCheckedMissionIds([]);
          setNumberValues({});
        }

        const userRef = doc(db, "users", user.uid);
        await setDoc(
          userRef,
          {
            uid: user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (error) {
        console.error("Firestore initialization error:", error);
        setCanUseMissions(false);
        setErrorMessage(
          "読み込みに失敗しました。Firebase の設定とルールを確認してください。",
        );
      } finally {
        setIsReady(true);
      }
    });

    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const checkboxIds = new Set(
      visibleMissions.filter((m) => m.type === "checkbox").map((m) => m.id),
    );
    const numberIds = new Set(
      visibleMissions.filter((m) => m.type === "number").map((m) => m.id),
    );
    setCheckedMissionIds((prev) => prev.filter((id) => checkboxIds.has(id)));
    setNumberValues((prev) => {
      const next: Record<number, number> = {};
      for (const [k, v] of Object.entries(prev)) {
        const id = Number(k);
        if (numberIds.has(id)) next[id] = v;
      }
      return next;
    });
  }, [visibleMissions]);

  const openAdminFlow = () => {
    if (getAdminAccess(eventId)) {
      router.push(`/admin/${eventId}`);
      return;
    }
    setAdminPinInput("");
    setAdminPinError("");
    setAdminPinModalOpen(true);
  };

  const verifyAdminPin = async () => {
    const entered = filterAdminPinInput(adminPinInput);
    if (!isValidFourDigitAdminPin(entered)) {
      setAdminPinError("4桁の数字を入力してください。");
      return;
    }
    setAdminPinBusy(true);
    setAdminPinError("");
    try {
      await ensureDefaultAdminPinIfMissing(eventId);
      const snap = await getDoc(doc(db, "events", eventId));
      if (!snap.exists()) {
        setAdminPinError("イベントが見つかりません。");
        return;
      }
      const pinStored = String((snap.data() as { adminPin?: unknown }).adminPin ?? "").trim();
      if (!pinStored) {
        setAdminPinError("このイベントには管理PINが設定されていません。");
        return;
      }
      if (entered !== pinStored.trim()) {
        setAdminPinError("PINが違います");
        return;
      }
      setAdminAccess(eventId, true);
      setAdminPinModalOpen(false);
      router.push(`/admin/${eventId}`);
    } catch (e) {
      console.error(e);
      setAdminPinError("確認に失敗しました。");
    } finally {
      setAdminPinBusy(false);
    }
  };

  useEffect(() => {
    if (!isReady || !userId || !canUseMissions || isClosed) return;

    const saveProgress = async () => {
      try {
        const active = missions.filter((m) => m.isActive !== false);
        let computedTotal = 0;
        let completedCount = 0;
        for (const m of active) {
          if (m.type === "checkbox" && checkedMissionIds.includes(m.id)) {
            computedTotal += m.points;
            completedCount += 1;
          }
          if (m.type === "number") {
            const c = Math.max(0, Math.floor(numberValues[m.id] ?? 0));
            computedTotal += c * m.pointPerUnit;
            if (c > 0) completedCount += 1;
          }
        }

        const progressRef = doc(db, "events", eventId, "missionProgress", userId);
        const beforeSnap = await getDoc(progressRef);
        const beforeData = beforeSnap.exists()
          ? (beforeSnap.data() as {
              checkedMissionIds?: string[];
              numberValues?: Record<string, number>;
            })
          : {};
        const prevChecked = new Set(parseCheckedMissionIdsFromFirestore(beforeData.checkedMissionIds));
        const prevNumbers = parseNumberValuesFromFirestore(beforeData.numberValues);

        for (const m of active) {
          if (m.type === "checkbox") {
            const nowChecked = checkedMissionIds.includes(m.id);
            const wasChecked = prevChecked.has(m.id);
            if (nowChecked !== wasChecked) {
              await addDoc(collection(db, "events", eventId, "pointLogs"), {
                uid: userId,
                participantName,
                type: "mission",
                missionId: m.id,
                missionTitle: m.title,
                point: nowChecked ? m.points : -m.points,
                reason: nowChecked ? "ミッション達成" : "ミッション取り消し",
                createdAt: serverTimestamp(),
                createdBy: userId,
              });
            }
          } else {
            const prev = Math.max(0, Math.floor(prevNumbers[m.id] ?? 0));
            const curr = Math.max(0, Math.floor(numberValues[m.id] ?? 0));
            if (prev !== curr) {
              const delta = (curr - prev) * m.pointPerUnit;
              await addDoc(collection(db, "events", eventId, "pointLogs"), {
                uid: userId,
                participantName,
                type: "mission",
                missionId: m.id,
                missionTitle: m.title,
                point: delta,
                reason: `数量変更 ${prev}→${curr}`,
                createdAt: serverTimestamp(),
                createdBy: userId,
              });
            }
          }
        }

        await setDoc(
          progressRef,
          {
            userId,
            eventId,
            checkedMissionIds: checkedMissionIds.map(String),
            numberValues: numberValuesToFirestore(numberValues),
            totalPoints: computedTotal,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        await setDoc(
          doc(db, "events", eventId, "participants", userId),
          {
            name: participantName,
            totalPoints: computedTotal,
            completedCount,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        await setDoc(
          doc(db, "users", userId),
          {
            totalPoints: computedTotal,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (error) {
        console.error("missionProgress save error:", error);
        setErrorMessage("進捗の保存に失敗しました。Firestore ルールを確認してください。");
      }
    };

    void saveProgress();
  }, [
    checkedMissionIds,
    numberValues,
    isReady,
    missions,
    userId,
    eventId,
    participantName,
    canUseMissions,
    isClosed,
  ]);

  const showRankingLink = rankingVisible || isClosed;

  const goToTop = () => {
    clearEventSession();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-100 via-orange-100 to-red-100 p-4">
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <nav
          className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-amber-200 bg-white/95 p-3 shadow-sm"
          aria-label="イベント内ナビゲーション"
        >
          <button
            type="button"
            onClick={() => goToTop()}
            className="inline-flex min-h-[44px] flex-1 basis-[30%] items-center justify-center rounded-full bg-zinc-500 px-3 py-2 text-sm font-bold text-white shadow-[0_4px_0_#3f3f46] touch-manipulation active:translate-y-px active:shadow-none sm:flex-none sm:basis-auto"
          >
            トップへ戻る
          </button>
          {showRankingLink ? (
            <Link
              href={`/events/${eventId}/ranking`}
              className="inline-flex min-h-[44px] flex-1 basis-[30%] items-center justify-center rounded-full bg-violet-500 px-3 py-2 text-sm font-bold text-white shadow-[0_4px_0_#6d28d9] touch-manipulation active:translate-y-px active:shadow-none sm:flex-none sm:basis-auto"
            >
              ランキング
            </Link>
          ) : null}
          {canUseMissions ? (
            <button
              type="button"
              onClick={() => void openAdminFlow()}
              className="inline-flex min-h-[44px] flex-1 basis-[30%] items-center justify-center rounded-full bg-blue-500 px-3 py-2 text-sm font-bold text-white shadow-[0_4px_0_#1d4ed8] touch-manipulation active:translate-y-px active:shadow-none sm:flex-none sm:basis-auto"
            >
              運営画面
            </button>
          ) : null}
        </nav>

        <header className="rounded-2xl border-4 border-amber-300 bg-white p-4 shadow-[0_8px_0_#f59e0b]">
          <p className="text-sm font-semibold text-amber-700">{eventTitle || "イベント"}</p>
          <h1 className="text-2xl font-black tracking-wide text-zinc-900">
            {participantName || "参加者"}さんの合計ポイント: {totalPoints} pt
          </h1>
          <p className="mt-1 text-xs text-zinc-600">記録した内容から自動計算された合計です。</p>
          {isClosed ? (
            <p className="mt-2 text-xs font-bold text-red-600">このイベントは終了しました（閲覧のみ）</p>
          ) : null}
          {errorMessage ? (
            <p className="mt-2 text-xs font-semibold text-red-600">{errorMessage}</p>
          ) : null}
        </header>

        {canUseMissions ? (
          <section className="space-y-3">
            {visibleMissions.map((mission) => {
              if (mission.type === "checkbox") {
                const isChecked = checkedMissionIds.includes(mission.id);
                return (
                  <label
                    key={mission.id}
                    className="flex cursor-pointer items-start gap-4 rounded-2xl border-4 border-sky-300 bg-white p-4 shadow-[0_8px_0_#0284c7]"
                  >
                    <span className="flex shrink-0 items-start justify-center pt-1">
                      <input
                        type="checkbox"
                        className="h-8 w-8 shrink-0 cursor-pointer rounded-md border-2 border-zinc-300 accent-emerald-600"
                        checked={isChecked}
                        disabled={!isReady || !!errorMessage || isClosed}
                        onChange={() => {
                          setCheckedMissionIds((prev) =>
                            prev.includes(mission.id)
                              ? prev.filter((id) => id !== mission.id)
                              : [...prev, mission.id],
                          );
                        }}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-extrabold text-zinc-900">{mission.title}</h2>
                      {mission.description.trim() ? (
                        <p className="mt-1 text-sm text-zinc-600">{mission.description}</p>
                      ) : null}
                      <p className="mt-2 text-sm font-bold text-emerald-600">+{mission.points} pt</p>
                    </div>
                  </label>
                );
              }

              const count = Math.max(0, Math.floor(numberValues[mission.id] ?? 0));
              const linePoints = count * mission.pointPerUnit;
              return (
                <div
                  key={mission.id}
                  className="flex flex-col gap-3 rounded-2xl border-4 border-sky-300 bg-white p-4 shadow-[0_8px_0_#0284c7]"
                >
                  <h2 className="text-base font-extrabold text-zinc-900">{mission.title}</h2>
                  {mission.description.trim() ? (
                    <p className="text-sm text-zinc-600">{mission.description}</p>
                  ) : null}
                  <div className="flex items-center justify-center gap-5 px-1">
                    <button
                      type="button"
                      disabled={!isReady || !!errorMessage || isClosed || count === 0}
                      aria-label={`${mission.title}の数量を1減らす`}
                      onClick={() =>
                        setNumberValues((prev) => {
                          const current = Math.max(0, Math.floor(prev[mission.id] ?? 0));
                          const nextValue = Math.max(0, current - 1);
                          const next = { ...prev };
                          if (nextValue === 0) {
                            delete next[mission.id];
                          } else {
                            next[mission.id] = nextValue;
                          }
                          return next;
                        })
                      }
                      className="inline-flex h-14 min-h-[52px] min-w-[52px] shrink-0 touch-manipulation items-center justify-center rounded-2xl bg-zinc-200 text-2xl font-black leading-none text-zinc-800 shadow-[0_4px_0_#a1a1aa] transition-transform active:translate-y-px active:shadow-none disabled:pointer-events-none disabled:opacity-40"
                    >
                      −
                    </button>
                    <span
                      className="min-w-[4rem] text-center text-3xl font-black tabular-nums leading-none text-zinc-900"
                      aria-live="polite"
                    >
                      {count}
                    </span>
                    <button
                      type="button"
                      disabled={!isReady || !!errorMessage || isClosed}
                      aria-label={`${mission.title}の数量を1増やす`}
                      onClick={() =>
                        setNumberValues((prev) => {
                          const current = Math.max(0, Math.floor(prev[mission.id] ?? 0));
                          return { ...prev, [mission.id]: current + 1 };
                        })
                      }
                      className="inline-flex h-14 min-h-[52px] min-w-[52px] shrink-0 touch-manipulation items-center justify-center rounded-2xl bg-sky-400 text-2xl font-black leading-none text-sky-950 shadow-[0_4px_0_#0369a1] transition-transform active:translate-y-px active:shadow-none disabled:opacity-50"
                    >
                      ＋
                    </button>
                  </div>
                  <p className="text-center text-lg font-black text-emerald-600">+{linePoints} pt</p>
                </div>
              );
            })}
          </section>
        ) : null}
      </main>

      {adminPinModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-pin-title"
        >
          <div className="w-full max-w-md rounded-2xl border-4 border-blue-200 bg-white p-5 shadow-xl">
            <h2 id="admin-pin-title" className="text-lg font-black text-zinc-900">
              運営PINを入力
            </h2>
            <p className="mt-1 text-sm text-zinc-600">4桁の管理用PINを入力してください。</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="off"
              value={adminPinInput}
              onChange={(e) => {
                setAdminPinInput(filterAdminPinInput(e.target.value));
                if (adminPinError) setAdminPinError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void verifyAdminPin();
              }}
              className="mt-4 w-full rounded-xl border-2 border-zinc-200 px-4 py-4 text-xl font-bold tracking-widest"
              placeholder="例：1234"
              disabled={adminPinBusy}
            />
            {adminPinError ? (
              <p className="mt-2 text-sm font-semibold text-red-600">{adminPinError}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse sm:justify-end">
              <button
                type="button"
                disabled={adminPinBusy}
                onClick={() => void verifyAdminPin()}
                className="rounded-xl bg-blue-600 py-3 text-base font-bold text-white disabled:opacity-50 touch-manipulation"
              >
                {adminPinBusy ? "確認中…" : "運営画面へ"}
              </button>
              <button
                type="button"
                disabled={adminPinBusy}
                onClick={() => setAdminPinModalOpen(false)}
                className="rounded-xl bg-zinc-200 py-3 text-base font-bold text-zinc-800 disabled:opacity-50 touch-manipulation"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
