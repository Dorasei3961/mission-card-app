"use client";

import { Check, ChevronRight, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ensureDefaultAdminPinIfMissing } from "../../lib/default-admin-pin";
import {
  DEFAULT_MISSIONS_SEED,
  type MissionFields,
  normalizeMissionFromFirestore,
} from "../../lib/mission-schema";
import { clearEventScopedStorage, getEventSession, setEventSession } from "../../lib/event-session";
import { resolveEventFeatures } from "../../lib/event-features";
import { PARTICIPANT_MAIN_BOTTOM_PADDING, PARTICIPANT_PAGE_BG } from "../../lib/participant-ui";
import { recordParticipantMainPage } from "../../lib/participant-last-page";
import { ParticipantBottomNav } from "./participant-bottom-nav";
import { useParticipantRankingLink } from "./use-participant-ranking-link";

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
  const [redirected, setRedirected] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [missions, setMissions] = useState<MissionFields[]>(DEFAULT_MISSIONS_SEED);
  const [checkedMissionIds, setCheckedMissionIds] = useState<number[]>([]);
  const [numberValues, setNumberValues] = useState<Record<number, number>>({});
  /** participants / missionProgress のドキュメントID（セッション由来の participantKey） */
  const [participantDocId, setParticipantDocId] = useState("");
  /** Firestore ルール（pointLogs / users / authUid フィールド）用 */
  const [authUid, setAuthUid] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [canUseMissions, setCanUseMissions] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [featureMissionEnabled, setFeatureMissionEnabled] = useState(true);
  /** participants.totalPoints（ミッション保存・クイズ加点と同期） */
  const [liveParticipantTotalPts, setLiveParticipantTotalPts] = useState<number | null>(null);
  const saveSeqRef = useRef(0);

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

  const showRankingLink = useParticipantRankingLink(eventId);

  const toggleMissionCheck = useCallback(
    (missionId: number) => {
      if (!isReady || isClosed) return;
      setErrorMessage("");
      setCheckedMissionIds((prev) =>
        prev.includes(missionId) ? prev.filter((id) => id !== missionId) : [...prev, missionId],
      );
    },
    [isReady, isClosed],
  );

  useEffect(() => {
    const unsubEvent = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        if (!redirected) {
          setRedirected(true);
          clearEventScopedStorage(eventId);
          router.replace("/");
        }
        return;
      }
      const data = snap.data() as {
        title?: string;
        ownerUid?: string;
        status?: string;
        features?: unknown;
      };
      setEventTitle(String(data.title ?? "イベント"));
      setIsClosed(data.status === "closed");
      const rf = resolveEventFeatures(data.features);
      setFeatureMissionEnabled(rf.mission);
    });

    return () => unsubEvent();
  }, [eventId, redirected, router]);

  useEffect(() => {
    recordParticipantMainPage(eventId, `/events/${eventId}`);
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
        setParticipantDocId(participantKey);
        setAuthUid(user.uid);

        const eventRef = doc(db, "events", eventId);
        const eventSnap = await getDoc(eventRef);
        if (!eventSnap.exists()) {
          clearEventScopedStorage(eventId);
          router.replace("/");
          setCanUseMissions(false);
          setIsReady(true);
          return;
        }
        await ensureDefaultAdminPinIfMissing(eventId);
        const eventData = eventSnap.data() as {
          title?: string;
          ownerUid?: string;
          status?: string;
          features?: unknown;
        };
        setEventTitle(String(eventData.title ?? "イベント"));
        setIsClosed(eventData.status === "closed");
        const rf = resolveEventFeatures(eventData.features);
        setFeatureMissionEnabled(rf.mission);

        const participantRef = doc(db, "events", eventId, "participants", participantKey);
        const participantSnap = await getDoc(participantRef);
        if (!participantSnap.exists()) {
          setErrorMessage("このイベントに参加していません。参加画面から入り直してください。");
          setCanUseMissions(false);
          setIsReady(true);
          return;
        }
        const pdata = participantSnap.data() as { name?: string; authUid?: string };
        const storedAuthUid = typeof pdata.authUid === "string" ? pdata.authUid.trim() : "";
        if (storedAuthUid && storedAuthUid !== user.uid) {
          setErrorMessage(
            "この参加者名は別の端末で登録されています。参加画面から入り直すか、運営に確認してください。",
          );
          setCanUseMissions(false);
          setIsReady(true);
          return;
        }
        if (!storedAuthUid) {
          await setDoc(participantRef, { authUid: user.uid }, { merge: true });
        }
        setCanUseMissions(true);
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

        const missionsRef = collection(db, "events", eventId, "missions");
        let missionSnap = await getDocs(missionsRef);

        if (missionSnap.empty) {
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
            console.error("[event-missions] default mission seed failed", {
              eventId,
              seedFailureCount,
              results: seedResults,
            });
          }
          missionSnap = await getDocs(missionsRef);
        }
        const missionList = missionSnap.docs
          .map((missionDoc) =>
            normalizeMissionFromFirestore(missionDoc.id, missionDoc.data() as Record<string, unknown>),
          )
          .sort((a, b) => a.order - b.order || a.id - b.id);
        setMissions(missionList.length > 0 ? missionList : DEFAULT_MISSIONS_SEED);

        const progressRef = doc(db, "events", eventId, "missionProgress", participantKey);
        await setDoc(
          progressRef,
          {
            authUid: user.uid,
            userId: participantKey,
            eventId,
          },
          { merge: true },
        );

        const progressSnap = await getDoc(progressRef);
        if (progressSnap.exists()) {
          const data = progressSnap.data() as {
            checkedMissionIds?: string[];
            numberValues?: Record<string, number>;
            totalPoints?: number;
          };
          const hasChecked = Array.isArray(data.checkedMissionIds);
          const hasNumbers =
            data.numberValues != null && typeof data.numberValues === "object";
          if (!hasChecked || !hasNumbers) {
            await setDoc(
              progressRef,
              {
                checkedMissionIds: hasChecked ? data.checkedMissionIds : ([] as string[]),
                numberValues: hasNumbers ? data.numberValues : {},
                totalPoints: typeof data.totalPoints === "number" ? data.totalPoints : 0,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
          }
          setCheckedMissionIds(parseCheckedMissionIdsFromFirestore(data.checkedMissionIds));
          setNumberValues(parseNumberValuesFromFirestore(data.numberValues));
        } else {
          await setDoc(
            progressRef,
            {
              authUid: user.uid,
              userId: participantKey,
              eventId,
              checkedMissionIds: [] as string[],
              numberValues: {},
              totalPoints: 0,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
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
  }, [eventId, router]);

  useEffect(() => {
    if (!participantDocId || !canUseMissions) {
      setLiveParticipantTotalPts(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "events", eventId, "participants", participantDocId), (snap) => {
      if (!snap.exists()) {
        setLiveParticipantTotalPts(null);
        return;
      }
      const t = snap.data()?.totalPoints;
      setLiveParticipantTotalPts(typeof t === "number" && Number.isFinite(t) ? t : 0);
    });
    return () => unsub();
  }, [eventId, participantDocId, canUseMissions]);

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

  useEffect(() => {
    if (!isReady || !participantDocId || !authUid || !canUseMissions || isClosed) return;

    const checkedSnapshot = checkedMissionIds;
    const numbersSnapshot = numberValues;
    const saveSeq = ++saveSeqRef.current;
    const isStale = () => saveSeq !== saveSeqRef.current;

    const saveProgress = async () => {
      try {
        const active = missions.filter((m) => m.isActive !== false);
        let computedTotal = 0;
        let completedCount = 0;
        for (const m of active) {
          if (m.type === "checkbox" && checkedSnapshot.includes(m.id)) {
            computedTotal += m.points;
            completedCount += 1;
          }
          if (m.type === "number") {
            const c = Math.max(0, Math.floor(numbersSnapshot[m.id] ?? 0));
            computedTotal += c * m.pointPerUnit;
            if (c > 0) completedCount += 1;
          }
        }

        const progressRef = doc(db, "events", eventId, "missionProgress", participantDocId);
        const beforeSnap = await getDoc(progressRef);
        if (isStale()) return;

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
            const nowChecked = checkedSnapshot.includes(m.id);
            const wasChecked = prevChecked.has(m.id);
            if (nowChecked !== wasChecked) {
              await addDoc(collection(db, "events", eventId, "pointLogs"), {
                uid: authUid,
                participantName,
                type: "mission",
                missionId: m.id,
                missionTitle: m.title,
                point: nowChecked ? m.points : -m.points,
                reason: nowChecked ? "ミッション達成" : "ミッション取り消し",
                createdAt: serverTimestamp(),
                createdBy: authUid,
              });
              if (isStale()) return;
            }
          } else {
            const prev = Math.max(0, Math.floor(prevNumbers[m.id] ?? 0));
            const curr = Math.max(0, Math.floor(numbersSnapshot[m.id] ?? 0));
            if (prev !== curr) {
              const delta = (curr - prev) * m.pointPerUnit;
              await addDoc(collection(db, "events", eventId, "pointLogs"), {
                uid: authUid,
                participantName,
                type: "mission",
                missionId: m.id,
                missionTitle: m.title,
                point: delta,
                reason: `数量変更 ${prev}→${curr}`,
                createdAt: serverTimestamp(),
                createdBy: authUid,
              });
              if (isStale()) return;
            }
          }
        }

        await setDoc(
          progressRef,
          {
            authUid,
            userId: participantDocId,
            eventId,
            checkedMissionIds: checkedSnapshot.map(String),
            numberValues: numberValuesToFirestore(numbersSnapshot),
            totalPoints: computedTotal,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        if (isStale()) return;

        const participantRefForPts = doc(db, "events", eventId, "participants", participantDocId);
        const participantSnapForPts = await getDoc(participantRefForPts);
        if (isStale()) return;

        const quizPtsRaw = participantSnapForPts.data()?.quizPoints;
        const quizPts = typeof quizPtsRaw === "number" && Number.isFinite(quizPtsRaw) ? quizPtsRaw : 0;
        const bingoPtsRaw = participantSnapForPts.data()?.bingoPoints;
        const bingoPts = typeof bingoPtsRaw === "number" && Number.isFinite(bingoPtsRaw) ? bingoPtsRaw : 0;
        const grandTotal = computedTotal + quizPts + bingoPts;

        await setDoc(
          participantRefForPts,
          {
            authUid,
            name: participantName,
            totalPoints: grandTotal,
            completedCount,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        if (isStale()) return;

        await setDoc(
          doc(db, "users", authUid),
          {
            totalPoints: grandTotal,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        if (isStale()) return;

        setErrorMessage("");
      } catch (error) {
        if (isStale()) return;
        console.error("missionProgress save error:", error);
        setErrorMessage("通信に失敗しました。もう一度お試しください。");
      }
    };

    void saveProgress();
  }, [
    checkedMissionIds,
    numberValues,
    isReady,
    missions,
    participantDocId,
    authUid,
    eventId,
    participantName,
    canUseMissions,
    isClosed,
  ]);

  const missionProgressLabel = (mission: MissionFields): string => {
    if (mission.type === "checkbox") {
      const done = checkedMissionIds.includes(mission.id) ? 1 : 0;
      return `${done}/1`;
    }
    const count = Math.max(0, Math.floor(numberValues[mission.id] ?? 0));
    return `${count}/10`;
  };

  return (
    <div className={`${PARTICIPANT_PAGE_BG} px-4 pt-4 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-[#111827]">{eventTitle || "イベント"}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                isClosed
                  ? "bg-zinc-100 text-[#6B7280] ring-1 ring-zinc-200"
                  : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
              }`}
            >
              {isClosed ? "終了" : "開催中"}
            </span>
          </div>
        </header>

        <section className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-[#111827]">
            {participantName || "参加者"}さんの合計ポイント
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-[#111827]">
            {(liveParticipantTotalPts ?? totalPoints).toLocaleString("ja-JP")}{" "}
            <span className="text-lg font-bold text-[#6B7280]">pt</span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
            記録した内容から自動計算された合計です。
          </p>
          {isClosed ? (
            <p className="mt-3 text-xs font-bold text-[#EF4444]">このイベントは終了しました（閲覧のみ）</p>
          ) : null}
          {errorMessage ? (
            <p className="mt-2 text-xs font-semibold text-[#EF4444]">{errorMessage}</p>
          ) : null}
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#111827]">ミッション一覧</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            すべてのミッションに挑戦してポイントを集めよう！
          </p>

          {canUseMissions ? (
            <div className="mt-4 flex flex-col gap-3">
              {featureMissionEnabled ? (
                visibleMissions.map((mission) => (
                  <article
                    key={mission.id}
                    className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-[#7C3AED]">
                        <Target className="h-6 w-6" strokeWidth={2} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-[#111827]">{mission.title}</h3>
                        {mission.description.trim() ? (
                          <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                            {mission.description}
                          </p>
                        ) : null}
                        <p className="mt-1 text-sm font-semibold text-[#FBBF24]">
                          {mission.type === "checkbox"
                            ? `+${mission.points} pt`
                            : `+${mission.pointPerUnit} pt / 回`}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#7C3AED]">
                          {missionProgressLabel(mission)} 達成
                        </p>
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[#6B7280]" aria-hidden />
                    </div>

                    <div className="mt-4 border-t border-zinc-100 pt-4">
                      {mission.type === "checkbox" ? (
                        (() => {
                          const isChecked = checkedMissionIds.includes(mission.id);
                          return (
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={isChecked}
                              aria-label={
                                isChecked
                                  ? `${mission.title}の達成を取り消す`
                                  : `${mission.title}を達成済みにする`
                              }
                              disabled={!isReady || isClosed}
                              onClick={() => toggleMissionCheck(mission.id)}
                              className="flex w-full cursor-pointer items-center gap-3 touch-manipulation text-left disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                                  isChecked
                                    ? "border-[#7C3AED] bg-[#7C3AED]"
                                    : "border-zinc-300 bg-white"
                                }`}
                                aria-hidden
                              >
                                {isChecked ? (
                                  <Check className="h-4 w-4 text-white" strokeWidth={3} />
                                ) : null}
                              </span>
                              <span className="text-sm font-medium text-[#111827]">達成したらチェック</span>
                            </button>
                          );
                        })()
                      ) : (
                        (() => {
                          const count = Math.max(0, Math.floor(numberValues[mission.id] ?? 0));
                          const linePoints = count * mission.pointPerUnit;
                          return (
                            <div className="flex flex-col gap-3">
                              {mission.description.trim() ? (
                                <p className="text-xs text-[#6B7280]">{mission.description}</p>
                              ) : null}
                              <div className="flex items-center justify-center gap-6">
                                <button
                                  type="button"
                                  disabled={!isReady || isClosed || count === 0}
                                  aria-label={`${mission.title}の数量を1減らす`}
                                  onClick={() =>
                                    setNumberValues((prev) => {
                                      const current = Math.max(0, Math.floor(prev[mission.id] ?? 0));
                                      const nextValue = Math.max(0, current - 1);
                                      const next = { ...prev };
                                      if (nextValue === 0) delete next[mission.id];
                                      else next[mission.id] = nextValue;
                                      return next;
                                    })
                                  }
                                  className="inline-flex h-12 min-w-[48px] items-center justify-center rounded-[14px] bg-zinc-200 text-xl font-bold text-[#111827] disabled:opacity-40 touch-manipulation"
                                >
                                  −
                                </button>
                                <span
                                  className="min-w-[3rem] text-center text-2xl font-bold tabular-nums text-[#111827]"
                                  aria-live="polite"
                                >
                                  {count}
                                </span>
                                <button
                                  type="button"
                                  disabled={!isReady || isClosed}
                                  aria-label={`${mission.title}の数量を1増やす`}
                                  onClick={() =>
                                    setNumberValues((prev) => {
                                      const current = Math.max(0, Math.floor(prev[mission.id] ?? 0));
                                      return { ...prev, [mission.id]: current + 1 };
                                    })
                                  }
                                  className="inline-flex h-12 min-w-[48px] items-center justify-center rounded-[14px] bg-[#7C3AED] text-xl font-bold text-white disabled:opacity-50 touch-manipulation"
                                >
                                  ＋
                                </button>
                              </div>
                              <p className="text-center text-sm font-bold text-[#22C55E]">
                                +{linePoints} pt
                              </p>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <h3 className="text-base font-bold text-[#111827]">ミッション機能は無効です</h3>
                  <p className="mt-2 text-sm text-[#6B7280]">
                    このイベントではミッションが利用停止になっています。
                  </p>
                </article>
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              参加登録が必要です。参加画面から入り直してください。
            </p>
          )}
        </section>
      </main>

      <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingLink} />
    </div>
  );
}
