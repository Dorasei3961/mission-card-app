"use client";

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
import { PARTICIPANT_MAIN_BOTTOM_PADDING } from "../../lib/participant-ui";
import { recordParticipantMainPage } from "../../lib/participant-last-page";
import {
  isMissionAchievedForSummary,
  isMissionCompleted,
  MISSION_PAGE_BG,
  MissionCard,
  MissionFilterTabs,
  type MissionFilterTab,
  MissionPageHeader,
  MissionSummaryBanner,
} from "./mission-participant-ui";
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
  const [missionFilter, setMissionFilter] = useState<MissionFilterTab>("all");
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

  const missionCompletionById = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const m of visibleMissions) {
      map.set(m.id, isMissionCompleted(m, checkedMissionIds, numberValues));
    }
    return map;
  }, [visibleMissions, checkedMissionIds, numberValues]);

  const sortedVisibleMissions = useMemo(() => {
    const incomplete: MissionFields[] = [];
    const complete: MissionFields[] = [];
    for (const m of visibleMissions) {
      if (missionCompletionById.get(m.id)) complete.push(m);
      else incomplete.push(m);
    }
    return [...incomplete, ...complete];
  }, [visibleMissions, missionCompletionById]);

  const filteredMissions = useMemo(() => {
    if (missionFilter === "all") return sortedVisibleMissions;
    return sortedVisibleMissions.filter((m) => {
      const done = missionCompletionById.get(m.id) === true;
      return missionFilter === "complete" ? done : !done;
    });
  }, [sortedVisibleMissions, missionFilter, missionCompletionById]);

  const missionFilterCounts = useMemo(() => {
    let complete = 0;
    for (const m of visibleMissions) {
      if (missionCompletionById.get(m.id)) complete += 1;
    }
    const all = visibleMissions.length;
    return { all, complete, incomplete: all - complete };
  }, [visibleMissions, missionCompletionById]);

  const completedMissionCount = useMemo(() => {
    let n = 0;
    for (const m of visibleMissions) {
      if (isMissionAchievedForSummary(m, checkedMissionIds, numberValues)) n += 1;
    }
    return n;
  }, [visibleMissions, checkedMissionIds, numberValues]);

  const decrementMissionCount = useCallback((missionId: number) => {
    setNumberValues((prev) => {
      const current = Math.max(0, Math.floor(prev[missionId] ?? 0));
      const nextValue = Math.max(0, current - 1);
      const next = { ...prev };
      if (nextValue === 0) delete next[missionId];
      else next[missionId] = nextValue;
      return next;
    });
  }, []);

  const incrementMissionCount = useCallback((missionId: number) => {
    setNumberValues((prev) => {
      const current = Math.max(0, Math.floor(prev[missionId] ?? 0));
      return { ...prev, [missionId]: current + 1 };
    });
  }, []);

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
        await setDoc(participantRef, { authUid: user.uid }, { merge: true });
        const pdata = participantSnap.data() as { name?: string };
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

  const missionControlsDisabled = !isReady || isClosed;

  return (
    <div className={`${MISSION_PAGE_BG} px-5 pt-5 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
      <main className="mx-auto flex w-full max-w-[375px] flex-col gap-5">
        <MissionPageHeader eventTitle={eventTitle} isClosed={isClosed} />

        {canUseMissions && featureMissionEnabled ? (
          <>
            <MissionSummaryBanner
              totalPoints={liveParticipantTotalPts ?? totalPoints}
              completedCount={completedMissionCount}
              totalCount={visibleMissions.length}
            />
            <MissionFilterTabs
              active={missionFilter}
              counts={missionFilterCounts}
              onChange={setMissionFilter}
            />
          </>
        ) : null}

        {errorMessage ? (
          <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-[#EF4444]">
            {errorMessage}
          </p>
        ) : null}

        <section className="flex flex-col gap-4">
          {canUseMissions ? (
            featureMissionEnabled ? (
              filteredMissions.length > 0 ? (
                filteredMissions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    completed={missionCompletionById.get(mission.id) === true}
                    checkedMissionIds={checkedMissionIds}
                    numberValues={numberValues}
                    disabled={missionControlsDisabled}
                    onToggleCheck={toggleMissionCheck}
                    onDecrement={decrementMissionCount}
                    onIncrement={incrementMissionCount}
                  />
                ))
              ) : (
                <p className="rounded-[32px] border border-gray-100 bg-white p-5 text-center text-sm text-gray-500">
                  {missionFilter === "complete"
                    ? "達成済みのミッションはありません"
                    : missionFilter === "incomplete"
                      ? "未達成のミッションはありません"
                      : "表示できるミッションがありません"}
                </p>
              )
            ) : (
              <article className="rounded-[32px] border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="text-xl font-bold text-gray-900">ミッション機能は無効です</h3>
                <p className="mt-2 text-sm text-gray-400">
                  このイベントではミッションが利用停止になっています。
                </p>
              </article>
            )
          ) : (
            <p className="rounded-[32px] border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              参加登録が必要です。参加画面から入り直してください。
            </p>
          )}
        </section>
      </main>

      <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingLink} />
    </div>
  );
}
