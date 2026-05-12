"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  LayoutGrid,
  Link2,
  ListChecks,
  QrCode,
  Settings,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { isValidFourDigitAdminPin, filterAdminPinInput } from "../../lib/admin-pin";
import { ensureDefaultAdminPinIfMissing } from "../../lib/default-admin-pin";
import { DEFAULT_EVENT_FEATURES, resolveEventFeatures, type EventFeatures } from "../../lib/event-features";
import { clearEventScopedStorage, getAdminAccess, setAdminAccess } from "../../lib/event-session";
import {
  DEFAULT_MISSIONS_SEED,
  type MissionFields,
  type MissionKind,
  normalizeMissionFromFirestore,
} from "../../lib/mission-schema";

type AdminMission = MissionFields & { docId: string };
type ParticipantSummary = { uid: string; name: string; totalPoints: number; completedCount: number };
type Props = { params: Promise<{ eventId: string }> };
type AdminFeatureKey = "mission" | "quiz" | "bingo" | "roulette";

/** 機能管理：右上の ON/OFF トグル */
function FeatureOnOffToggle({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  onToggle: () => void | Promise<void>;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => void onToggle()}
        className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors ${
          on ? "bg-emerald-500" : "bg-zinc-400"
        } disabled:pointer-events-none disabled:opacity-50`}
      >
        <span
          className={`absolute top-[3px] left-[3px] h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
            on ? "translate-x-[22px]" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-[9px] font-bold leading-none text-zinc-500">{on ? "ON" : "OFF"}</span>
    </div>
  );
}

/** 展開時の概要カード（紫アイコン・白背景・#E9D5FF 枠） */
function FeatureStatBox({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center rounded-[14px] border border-[#E9D5FF] bg-white px-2 py-3 text-center shadow-sm">
      <Icon className="h-5 w-5 shrink-0 text-[#7C3AED]" strokeWidth={2} aria-hidden />
      <p className="mt-2 text-[10px] font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 w-full truncate text-sm font-bold tabular-nums text-zinc-900">{value}</p>
    </div>
  );
}

const DEFAULT_CATEGORY_COLOR = "custom";

export default function EventAdminPage({ params }: Props) {
  const router = useRouter();
  const showMissionCategoryUi = false;
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
  const [eventStatus, setEventStatus] = useState<"active" | "closed">("active");
  const [pinSession, setPinSession] = useState(false);
  const [eventResolved, setEventResolved] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [gatePinInput, setGatePinInput] = useState("");
  const [gatePinError, setGatePinError] = useState("");
  const [gatePinBusy, setGatePinBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [creatorNameDisplay, setCreatorNameDisplay] = useState("");
  const [joinPasswordDisplay, setJoinPasswordDisplay] = useState("");
  const [adminPinDisplay, setAdminPinDisplay] = useState("");
  const [eventFeatures, setEventFeatures] = useState<EventFeatures>(DEFAULT_EVENT_FEATURES);
  const [featureUpdatingKey, setFeatureUpdatingKey] = useState<AdminFeatureKey | null>(null);
  /** 機能管理アコーディオン（1つだけ開く。null はすべて閉じ） */
  const [featureAccordionOpen, setFeatureAccordionOpen] = useState<AdminFeatureKey | null>(null);
  const [rankingToggleBusy, setRankingToggleBusy] = useState(false);
  const [closeEventBusy, setCloseEventBusy] = useState(false);
  const [missionCreateBusy, setMissionCreateBusy] = useState(false);
  const [createdAtDisplay, setCreatedAtDisplay] = useState("—");
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [missionEditorOpen, setMissionEditorOpen] = useState(false);
  const [quizStats, setQuizStats] = useState({ questionCount: 0, answerCount: 0, correctCount: 0 });
  const [bingoStats, setBingoStats] = useState({ participantCount: 0, reachCount: 0, bingoCount: 0 });
  const [rouletteStats, setRouletteStats] = useState({
    candidateCount: 0,
    executionCount: 0,
    latestResult: "未実行",
  });

  const missionHubRef = useRef<HTMLDivElement>(null);
  const missionEditorPanelRef = useRef<HTMLDivElement>(null);
  const detailSettingsRef = useRef<HTMLDivElement>(null);

  /** Firebase のイベント作成者でも、運営UIは管理PIN認証後のみ（owner バイパスなし） */
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
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!eventId) return;
    setEventResolved(false);
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
    const unsub = onSnapshot(
      doc(db, "events", eventId),
      (snap) => {
        setEventResolved(true);
        if (!snap.exists()) {
          clearEventScopedStorage(eventId);
          router.replace("/");
          return;
        }
        const data = snap.data() as {
        title?: string;
        creatorName?: string;
        joinPassword?: unknown;
        adminPin?: unknown;
        rankingVisible?: boolean;
        password?: string;
        joinCode?: string;
        joinUrl?: string;
        features?: unknown;
        createdAt?: unknown;
      };
      const ca = data.createdAt;
      setCreatedAtDisplay(
        ca instanceof Timestamp
          ? ca.toDate().toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" })
          : "—",
      );
      setEventTitle(String(data.title ?? "イベント"));
      setCreatorNameDisplay(String(data.creatorName ?? "").trim());
      setJoinPasswordDisplay(
        typeof data.joinPassword === "string" ? data.joinPassword : "",
      );
      setAdminPinDisplay(String(data.adminPin ?? "").trim());
      setRankingVisible(Boolean(data.rankingVisible));
      setEventFeatures(resolveEventFeatures(data.features));
      setEventStatus((data as { status?: string }).status === "closed" ? "closed" : "active");
      const code = (data.joinCode?.trim() || data.password?.trim() || "").trim();
      setJoinCode(code);
      const generated =
        typeof window !== "undefined" && code
          ? `${window.location.origin}/join?code=${encodeURIComponent(code)}`
          : "";
      setJoinUrl((data.joinUrl?.trim() || generated || `/join?code=${encodeURIComponent(code)}`).trim());
      },
      (err) => {
        console.error("[admin] events snapshot error", { eventId, err });
        setMessage("通信に失敗しました。もう一度お試しください。");
      },
    );
    return () => unsub();
  }, [eventId, router]);

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
        console.error("[admin] default mission seed failed", {
          eventId,
          seedFailureCount,
          results: seedResults,
        });
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

  const loadParticipants = async () => {
    if (!eventId) return;
    const snapshot = await getDocs(collection(db, "events", eventId, "participants"));
    const rows = snapshot.docs
      .map((d) => {
        const data = d.data() as { name?: string; totalPoints?: number; completedCount?: number };
        return {
          uid: d.id,
          name: data.name?.trim() || "未登録ユーザー",
          totalPoints: typeof data.totalPoints === "number" ? data.totalPoints : 0,
          completedCount: typeof data.completedCount === "number" ? data.completedCount : 0,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);
    setParticipants(rows);
  };

  useEffect(() => {
    if (!eventId || !authReady || !eventResolved || !canManage) return;
    void loadMissions();
    void loadParticipants();
  }, [eventId, authReady, eventResolved, canManage]);

  useEffect(() => {
    if (!eventId || !canManage) return;
    const unsubQuizzes = onSnapshot(collection(db, "events", eventId, "quizzes"), (snap) => {
      setQuizStats((prev) => ({ ...prev, questionCount: snap.size }));
    });
    const unsubQuizAnswers = onSnapshot(collection(db, "events", eventId, "quizAnswers"), (snap) => {
      let correctCount = 0;
      snap.docs.forEach((answerDoc) => {
        const data = answerDoc.data() as { isCorrect?: unknown };
        if (data.isCorrect === true) correctCount += 1;
      });
      setQuizStats((prev) => ({ ...prev, answerCount: snap.size, correctCount }));
    });
    const unsubBingoCards = onSnapshot(collection(db, "events", eventId, "bingoCards"), (snap) => {
      let reachCount = 0;
      let bingoCount = 0;
      snap.docs.forEach((cardDoc) => {
        const data = cardDoc.data() as { reachLines?: unknown; bingoLines?: unknown };
        const reachLines = typeof data.reachLines === "number" ? data.reachLines : 0;
        const bingoLines = typeof data.bingoLines === "number" ? data.bingoLines : 0;
        if (reachLines > 0 && bingoLines === 0) reachCount += 1;
        if (bingoLines > 0) bingoCount += 1;
      });
      setBingoStats({ participantCount: snap.size, reachCount, bingoCount });
    });
    const unsubRouletteItems = onSnapshot(collection(db, "events", eventId, "rouletteItems"), (snap) => {
      setRouletteStats((prev) => ({ ...prev, candidateCount: snap.size }));
    });
    const unsubRouletteHistory = onSnapshot(
      query(collection(db, "events", eventId, "rouletteHistory")),
      (snap) => {
        let latestCreatedAt = 0;
        let latestResult = "未実行";
        snap.docs.forEach((historyDoc) => {
          const data = historyDoc.data() as { winnerLabel?: unknown; label?: unknown; createdAt?: unknown };
          const createdAt =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toMillis()
              : data.createdAt && typeof (data.createdAt as { toMillis?: unknown }).toMillis === "function"
                ? ((data.createdAt as { toMillis: () => number }).toMillis?.() ?? 0)
                : 0;
          if (createdAt >= latestCreatedAt) {
            latestCreatedAt = createdAt;
            if (typeof data.winnerLabel === "string" && data.winnerLabel.trim()) {
              latestResult = data.winnerLabel.trim();
            } else if (typeof data.label === "string" && data.label.trim()) {
              latestResult = data.label.trim();
            }
          }
        });
        setRouletteStats((prev) => ({ ...prev, executionCount: snap.size, latestResult }));
      },
    );
    return () => {
      unsubQuizzes();
      unsubQuizAnswers();
      unsubBingoCards();
      unsubRouletteItems();
      unsubRouletteHistory();
    };
  }, [eventId, canManage]);

  const toggleRankingVisible = async () => {
    if (!canEdit || rankingToggleBusy) return;
    setRankingToggleBusy(true);
    try {
      await setDoc(
        doc(db, "events", eventId),
        { rankingVisible: !rankingVisible, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setMessage(`ランキング表示を${!rankingVisible ? "ON" : "OFF"}にしました。`);
    } catch (e) {
      console.error("[admin] toggleRankingVisible", e);
      setMessage("保存に失敗しました。再読み込み後にもう一度お試しください。");
    } finally {
      setRankingToggleBusy(false);
    }
  };

  const toggleFeature = async (featureKey: AdminFeatureKey) => {
    if (!canManage || !eventId || featureUpdatingKey) return;
    const prev = { ...eventFeatures };
    const nextValue = !prev[featureKey];
    const nextFeatures = { ...prev, [featureKey]: nextValue };
    setFeatureUpdatingKey(featureKey);
    setEventFeatures(nextFeatures);
    try {
      await setDoc(
        doc(db, "events", eventId),
        {
          features: {
            mission: nextFeatures.mission,
            quiz: nextFeatures.quiz,
            bingo: nextFeatures.bingo,
            roulette: nextFeatures.roulette,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage(`機能設定を更新しました（${featureKey}: ${nextValue ? "ON" : "OFF"}）。`);
    } catch (e) {
      console.error("[admin] toggleFeature failed", { eventId, featureKey, nextValue, err: e });
      setEventFeatures(prev);
      setMessage("保存に失敗しました。再読み込み後にもう一度お試しください。");
    } finally {
      setFeatureUpdatingKey(null);
    }
  };

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
      console.error("[admin] handleCreateMission", e);
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
        clearEventScopedStorage(eventId);
        router.replace("/");
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
    if (!canManage || eventStatus === "closed" || closeEventBusy) return;
    setCloseEventBusy(true);
    try {
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
    } catch (e) {
      console.error("[admin] closeEvent", e);
      setMessage("保存に失敗しました。再読み込み後にもう一度お試しください。");
    } finally {
      setCloseEventBusy(false);
    }
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

  const logoutAdmin = () => {
    setAdminAccess(eventId, false);
    setPinSession(false);
  };

  const missionStats = useMemo(() => {
    const active = missions.filter((m) => m.isActive !== false);
    const activeCount = active.length;
    const pc = participants.length;
    const achievementSum = participants.reduce((s, p) => s + p.completedCount, 0);
    const denom = activeCount > 0 && pc > 0 ? activeCount * pc : 0;
    const achievementRate = denom > 0 ? Math.min(100, Math.round((achievementSum / denom) * 100)) : 0;
    return { activeCount, achievementSum, achievementRate, participantCount: pc };
  }, [missions, participants]);

  const totalPointsSum = useMemo(
    () => participants.reduce((s, p) => s + p.totalPoints, 0),
    [participants],
  );
  const quizCorrectRate = useMemo(() => {
    if (quizStats.answerCount <= 0) return 0;
    return Math.round((quizStats.correctCount / quizStats.answerCount) * 100);
  }, [quizStats.answerCount, quizStats.correctCount]);

  const qrImageSrc =
    joinUrl.length > 0
      ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(joinUrl)}`
      : "";

  const scrollToMissionHub = () => {
    missionHubRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openMissionAdminPanel = () => {
    setFeatureAccordionOpen("mission");
    setMissionEditorOpen(true);
    requestAnimationFrame(() => {
      missionEditorPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const rouletteLatestLabel = useMemo(() => {
    const t = String(rouletteStats.latestResult ?? "").trim();
    if (!t || t === "未実行") return "なし";
    return t;
  }, [rouletteStats.latestResult]);

  const toggleFeatureAccordion = (key: AdminFeatureKey) => {
    setFeatureAccordionOpen((cur) => (cur === key ? null : key));
  };

  const scrollToDetailSettings = () => {
    setSettingsOpen(true);
    requestAnimationFrame(() => detailSettingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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

  if (!canManage) {
    return (
      <div className="min-h-screen bg-violet-50/70 p-4 pb-10">
        <main className="mx-auto flex w-full max-w-md flex-col gap-4 pt-8">
          <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-violet-600">運営管理画面</p>
            <h1 className="mt-1 text-lg font-bold text-zinc-900">管理PINの入力</h1>
            <p className="mt-2 text-sm text-zinc-600">
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
              className="mt-4 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-xl font-bold tracking-widest outline-none ring-violet-500/30 focus:ring-2"
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
              className="mt-4 w-full rounded-xl bg-[#7C3AED] py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50 touch-manipulation"
            >
              {gatePinBusy ? "確認中…" : "確認して進む"}
            </button>
            <Link
              href={`/events/${eventId}`}
              className="mt-4 block text-center text-sm font-semibold text-violet-700 underline underline-offset-2"
            >
              参加者画面へ戻る
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/90 to-zinc-50 pb-28">
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-4">
        {message ? (
          <div className="rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-violet-800 shadow-sm">
            {message}
          </div>
        ) : null}

        <header className="relative overflow-hidden rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                運営ダッシュボード
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold text-zinc-900">{eventTitle || "イベント"}</h1>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    eventStatus === "closed"
                      ? "bg-zinc-100 text-zinc-600"
                      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80"
                  }`}
                >
                  <span className={eventStatus === "closed" ? "text-zinc-400" : "text-emerald-500"}>●</span>
                  {eventStatus === "closed" ? "終了" : "開催中"}
                </span>
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Trophy className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
                <Users className="h-3.5 w-3.5 text-violet-500" strokeWidth={2} aria-hidden />
                参加者数
              </div>
              <p className="mt-0.5 text-sm font-bold text-zinc-900">{participants.length}人</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
                <BarChart3 className="h-3.5 w-3.5 text-violet-500" strokeWidth={2} aria-hidden />
                合計ポイント
              </div>
              <p className="mt-0.5 text-sm font-bold text-zinc-900">{totalPointsSum.toLocaleString("ja-JP")} pt</p>
            </div>
          </div>
        </header>

        <section aria-label="クイックメニュー" className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-5 gap-1">
            <Link
              href={`/admin/${eventId}/participants`}
              className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold text-zinc-700 transition hover:bg-violet-50 touch-manipulation"
            >
              <Users className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} aria-hidden />
              <span className="leading-tight text-center">参加者管理</span>
            </Link>
            <Link
              href={`/events/${eventId}/ranking`}
              className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold text-zinc-700 transition hover:bg-violet-50 touch-manipulation"
            >
              <Trophy className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} aria-hidden />
              <span className="leading-tight text-center">ランキング</span>
            </Link>
            <button
              type="button"
              onClick={scrollToMissionHub}
              className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold text-zinc-700 transition hover:bg-violet-50 touch-manipulation"
            >
              <LayoutGrid className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} aria-hidden />
              <span className="leading-tight text-center">イベント機能</span>
            </button>
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold text-zinc-700 transition hover:bg-violet-50 touch-manipulation"
            >
              <QrCode className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} aria-hidden />
              <span className="leading-tight text-center">QRコード</span>
            </button>
            <button
              type="button"
              onClick={scrollToDetailSettings}
              className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold text-zinc-700 transition hover:bg-violet-50 touch-manipulation"
            >
              <Settings className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} aria-hidden />
              <span className="leading-tight text-center">設定</span>
            </button>
          </div>
        </section>

        <section ref={missionHubRef} id="admin-feature-hub" className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-zinc-900">機能管理</h2>
          <p className="mt-1 text-xs text-zinc-600">ミッション・クイズなどのコンテンツを運営します。</p>

          <div className="mt-4 space-y-3">
            {/* ミッションカード */}
            <div className="overflow-hidden rounded-[14px] border border-zinc-200 bg-zinc-50/90 shadow-sm">
              <div className="flex items-center gap-2 px-2 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleFeatureAccordion("mission")}
                  className="min-w-0 flex-1 rounded-lg py-1 pl-1 text-left touch-manipulation outline-none ring-violet-500/30 focus-visible:ring-2"
                >
                  <p className="text-sm font-bold text-zinc-900">ミッションカード</p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                      eventFeatures.mission
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
                        : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                    }`}
                  >
                    {eventFeatures.mission ? "利用中" : "未利用"}
                  </span>
                </button>
                <FeatureOnOffToggle
                  on={eventFeatures.mission}
                  disabled={!canManage || featureUpdatingKey !== null}
                  onToggle={() => void toggleFeature("mission")}
                />
                <button
                  type="button"
                  onClick={() => toggleFeatureAccordion("mission")}
                  className="shrink-0 rounded-lg p-2 text-zinc-500 touch-manipulation outline-none ring-violet-500/30 focus-visible:ring-2"
                  aria-label={featureAccordionOpen === "mission" ? "詳細を閉じる" : "詳細を開く"}
                >
                  <ChevronDown
                    className={`h-5 w-5 transition-transform duration-200 ${
                      featureAccordionOpen === "mission" ? "rotate-180" : ""
                    }`}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              </div>
              {featureAccordionOpen === "mission" ? (
                <div className="border-t border-zinc-200/80 bg-white px-3 pb-4 pt-3">
                  <p className="text-xs leading-relaxed text-zinc-600">
                    ミッションカードの作成・編集・達成状況を確認できます。
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <FeatureStatBox
                      Icon={ListChecks}
                      label="ミッション数"
                      value={`${missionStats.activeCount}個`}
                    />
                    <FeatureStatBox
                      Icon={CheckCircle2}
                      label="達成数"
                      value={`${missionStats.achievementSum}件`}
                    />
                    <FeatureStatBox
                      Icon={BarChart3}
                      label="達成率"
                      value={`${missionStats.achievementRate}%`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => openMissionAdminPanel()}
                    className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-1 rounded-[14px] bg-[#7C3AED] px-4 text-sm font-bold text-white shadow-sm touch-manipulation"
                  >
                    ミッション管理画面を開く
                    <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                  {!eventFeatures.mission ? (
                    <p className="mt-2 text-[11px] font-semibold text-amber-700">
                      参加者向けはOFFです。準備ができたらトグルでONにしてください。
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* クイズ */}
            <div className="overflow-hidden rounded-[14px] border border-zinc-200 bg-zinc-50/90 shadow-sm">
              <div className="flex items-center gap-2 px-2 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleFeatureAccordion("quiz")}
                  className="min-w-0 flex-1 rounded-lg py-1 pl-1 text-left touch-manipulation outline-none ring-violet-500/30 focus-visible:ring-2"
                >
                  <p className="text-sm font-bold text-zinc-900">クイズ</p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                      eventFeatures.quiz
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
                        : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                    }`}
                  >
                    {eventFeatures.quiz ? "利用中" : "未利用"}
                  </span>
                </button>
                <FeatureOnOffToggle
                  on={eventFeatures.quiz}
                  disabled={!canManage || featureUpdatingKey !== null}
                  onToggle={() => void toggleFeature("quiz")}
                />
                <button
                  type="button"
                  onClick={() => toggleFeatureAccordion("quiz")}
                  className="shrink-0 rounded-lg p-2 text-zinc-500 touch-manipulation outline-none ring-violet-500/30 focus-visible:ring-2"
                  aria-label={featureAccordionOpen === "quiz" ? "詳細を閉じる" : "詳細を開く"}
                >
                  <ChevronDown
                    className={`h-5 w-5 transition-transform duration-200 ${
                      featureAccordionOpen === "quiz" ? "rotate-180" : ""
                    }`}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              </div>
              {featureAccordionOpen === "quiz" ? (
                <div className="border-t border-zinc-200/80 bg-white px-3 pb-4 pt-3">
                  <p className="text-xs leading-relaxed text-zinc-600">
                    クイズ作成・出題・結果確認ができます。
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <FeatureStatBox Icon={ListChecks} label="問題数" value={`${quizStats.questionCount}問`} />
                    <FeatureStatBox Icon={CheckCircle2} label="回答数" value={`${quizStats.answerCount}件`} />
                    <FeatureStatBox Icon={BarChart3} label="正解率" value={`${quizCorrectRate}%`} />
                  </div>
                  <Link
                    href={`/admin/${eventId}/quiz`}
                    className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-1 rounded-[14px] bg-[#7C3AED] px-4 text-sm font-bold text-white shadow-sm touch-manipulation"
                  >
                    クイズ管理画面を開く
                    <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                  </Link>
                </div>
              ) : null}
            </div>

            {/* ビンゴ */}
            <div className="overflow-hidden rounded-[14px] border border-zinc-200 bg-zinc-50/90 shadow-sm">
              <div className="flex items-center gap-2 px-2 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleFeatureAccordion("bingo")}
                  className="min-w-0 flex-1 rounded-lg py-1 pl-1 text-left touch-manipulation outline-none ring-violet-500/30 focus-visible:ring-2"
                >
                  <p className="text-sm font-bold text-zinc-900">ビンゴ</p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                      eventFeatures.bingo
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
                        : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                    }`}
                  >
                    {eventFeatures.bingo ? "利用中" : "未利用"}
                  </span>
                </button>
                <FeatureOnOffToggle
                  on={eventFeatures.bingo}
                  disabled={!canManage || featureUpdatingKey !== null}
                  onToggle={() => void toggleFeature("bingo")}
                />
                <button
                  type="button"
                  onClick={() => toggleFeatureAccordion("bingo")}
                  className="shrink-0 rounded-lg p-2 text-zinc-500 touch-manipulation outline-none ring-violet-500/30 focus-visible:ring-2"
                  aria-label={featureAccordionOpen === "bingo" ? "詳細を閉じる" : "詳細を開く"}
                >
                  <ChevronDown
                    className={`h-5 w-5 transition-transform duration-200 ${
                      featureAccordionOpen === "bingo" ? "rotate-180" : ""
                    }`}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              </div>
              {featureAccordionOpen === "bingo" ? (
                <div className="border-t border-zinc-200/80 bg-white px-3 pb-4 pt-3">
                  <p className="text-xs leading-relaxed text-zinc-600">
                    ビンゴカード・抽選・達成状況を確認できます。
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <FeatureStatBox Icon={Users} label="参加者数" value={`${bingoStats.participantCount}人`} />
                    <FeatureStatBox Icon={Bell} label="リーチ人数" value={`${bingoStats.reachCount}人`} />
                    <FeatureStatBox Icon={Trophy} label="ビンゴ人数" value={`${bingoStats.bingoCount}人`} />
                  </div>
                  <Link
                    href={`/admin/${eventId}/bingo`}
                    className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-1 rounded-[14px] bg-[#7C3AED] px-4 text-sm font-bold text-white shadow-sm touch-manipulation"
                  >
                    ビンゴ管理画面を開く
                    <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                  </Link>
                </div>
              ) : null}
            </div>

            {/* ルーレット */}
            <div className="overflow-hidden rounded-[14px] border border-zinc-200 bg-zinc-50/90 shadow-sm">
              <div className="flex items-center gap-2 px-2 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleFeatureAccordion("roulette")}
                  className="min-w-0 flex-1 rounded-lg py-1 pl-1 text-left touch-manipulation outline-none ring-violet-500/30 focus-visible:ring-2"
                >
                  <p className="text-sm font-bold text-zinc-900">ルーレット</p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                      eventFeatures.roulette
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
                        : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                    }`}
                  >
                    {eventFeatures.roulette ? "利用中" : "未利用"}
                  </span>
                </button>
                <FeatureOnOffToggle
                  on={eventFeatures.roulette}
                  disabled={!canManage || featureUpdatingKey !== null}
                  onToggle={() => void toggleFeature("roulette")}
                />
                <button
                  type="button"
                  onClick={() => toggleFeatureAccordion("roulette")}
                  className="shrink-0 rounded-lg p-2 text-zinc-500 touch-manipulation outline-none ring-violet-500/30 focus-visible:ring-2"
                  aria-label={featureAccordionOpen === "roulette" ? "詳細を閉じる" : "詳細を開く"}
                >
                  <ChevronDown
                    className={`h-5 w-5 transition-transform duration-200 ${
                      featureAccordionOpen === "roulette" ? "rotate-180" : ""
                    }`}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              </div>
              {featureAccordionOpen === "roulette" ? (
                <div className="border-t border-zinc-200/80 bg-white px-3 pb-4 pt-3">
                  <p className="text-xs leading-relaxed text-zinc-600">
                    候補編集・抽選・履歴確認ができます。
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <FeatureStatBox Icon={ListChecks} label="候補数" value={`${rouletteStats.candidateCount}個`} />
                    <FeatureStatBox Icon={History} label="実行回数" value={`${rouletteStats.executionCount}回`} />
                    <FeatureStatBox Icon={Sparkles} label="最新結果" value={rouletteLatestLabel} />
                  </div>
                  <Link
                    href={`/admin/${eventId}/roulette`}
                    className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-1 rounded-[14px] bg-[#7C3AED] px-4 text-sm font-bold text-white shadow-sm touch-manipulation"
                  >
                    ルーレット管理画面を開く
                    <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 space-y-3">
                {missionEditorOpen ? (
                  <div ref={missionEditorPanelRef} className="rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-zinc-900">ミッションの編集</h3>
                      <button
                        type="button"
                        onClick={() => setMissionEditorOpen(false)}
                        className="shrink-0 text-xs font-semibold text-[#7C3AED] underline underline-offset-2 touch-manipulation"
                      >
                        閉じる
                      </button>
                    </div>
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
                        onClick={() => void handleCreateMission()}
                        disabled={!canEdit || missionCreateBusy}
                        className="rounded-xl bg-[#7C3AED] px-3 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50 touch-manipulation"
                      >
                        {missionCreateBusy ? "保存中…" : "項目を追加"}
                      </button>
                    </div>

                    <div className="mt-4 space-y-2">
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
                                  onClick={() => void moveMission(mission.docId, "up")}
                                  disabled={!canEdit}
                                  className="rounded-lg bg-zinc-200 px-2 py-1 text-xs font-bold disabled:opacity-50 touch-manipulation"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => void moveMission(mission.docId, "down")}
                                  disabled={!canEdit}
                                  className="rounded-lg bg-zinc-200 px-2 py-1 text-xs font-bold disabled:opacity-50 touch-manipulation"
                                >
                                  ↓
                                </button>
                                <button
                                  onClick={() => void handleUpdateMission(mission)}
                                  disabled={!canEdit}
                                  className="rounded-lg bg-[#7C3AED] px-2 py-1 text-xs font-bold text-white disabled:opacity-50 touch-manipulation"
                                >
                                  保存
                                </button>
                                <button
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
                  </div>
                ) : null}

                <Link
                  href={`/events/${eventId}/features?from=admin`}
                  className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 touch-manipulation"
                >
                  <span>参加者・機能一覧を開く</span>
                  <ChevronRight className="h-4 w-4 text-zinc-400" strokeWidth={2} aria-hidden />
                </Link>
          </div>
        </section>

        <section ref={detailSettingsRef} id="admin-detail-settings" className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left touch-manipulation"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-zinc-900">
              <Settings className="h-4 w-4 text-violet-600" strokeWidth={2} aria-hidden />
              詳細設定
            </span>
            <ChevronRight
              className={`h-4 w-4 text-zinc-400 transition ${settingsOpen ? "rotate-90" : ""}`}
              strokeWidth={2}
              aria-hidden
            />
          </button>
          {settingsOpen ? (
            <div className="space-y-3 border-t border-zinc-100 px-4 pb-4 pt-3">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                <h3 className="text-xs font-bold text-zinc-900">認証情報の確認</h3>
                <p className="mt-1 text-[11px] text-zinc-500">運営画面のみ表示されます。</p>
                <dl className="mt-3 space-y-2 text-xs">
                  <div>
                    <dt className="font-semibold text-zinc-600">イベント名</dt>
                    <dd className="mt-0.5 break-all font-medium text-zinc-900">{eventTitle || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-zinc-600">作成日</dt>
                    <dd className="mt-0.5 font-medium text-zinc-900">{createdAtDisplay}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-zinc-600">作成者名</dt>
                    <dd className="mt-0.5 break-all font-medium text-zinc-900">{creatorNameDisplay || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-zinc-600">参加用パスワード</dt>
                    <dd className="mt-0.5 break-all font-mono text-sm font-bold text-zinc-900">
                      {joinPasswordDisplay || "（未設定）"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-zinc-600">管理用PIN</dt>
                    <dd className="mt-0.5 font-mono text-sm font-bold tracking-widest text-zinc-900">
                      {adminPinDisplay || "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                <h3 className="text-xs font-bold text-zinc-900">ランキング表示</h3>
                <p className="mt-1 text-[11px] text-zinc-500">参加者向けランキング画面の公開設定です。</p>
                <button
                  onClick={() => void toggleRankingVisible()}
                  disabled={!canEdit || rankingToggleBusy}
                  className={`mt-3 w-full rounded-xl py-2.5 text-xs font-bold text-white shadow-sm disabled:opacity-50 touch-manipulation ${
                    rankingVisible ? "bg-emerald-600" : "bg-zinc-600"
                  }`}
                >
                  {rankingToggleBusy ? "保存中…" : `ランキング表示: ${rankingVisible ? "ON" : "OFF"}`}
                </button>
                <Link
                  href={`/events/${eventId}/ranking`}
                  className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-violet-700 underline underline-offset-2"
                >
                  ランキング画面を開く
                  <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden />
                </Link>
              </div>

              <Link
                href={`/events/${eventId}/features?from=admin`}
                className="flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-3 text-sm font-semibold text-zinc-900 touch-manipulation"
              >
                イベント機能ハブへ
                <ChevronRight className="h-4 w-4 text-violet-500" strokeWidth={2} aria-hidden />
              </Link>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-red-100 bg-red-50/40 p-4 shadow-sm">
          <button
            type="button"
            onClick={() => void closeEvent()}
            disabled={!canManage || eventStatus === "closed" || closeEventBusy}
            className="flex w-full flex-col items-start gap-0.5 rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm disabled:opacity-50 touch-manipulation"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-red-600">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600">
                <Bell className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              {closeEventBusy ? "終了処理中…" : "イベントを終了する"}
            </span>
            <span className="pl-9 text-[11px] font-medium text-red-700/90">
              イベントを終了し、参加画面の運営操作を制限します。
            </span>
          </button>
        </section>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-violet-100 bg-white/95 px-4 py-2 shadow-[0_-4px_20px_rgba(124,58,237,0.08)] backdrop-blur-sm"
        aria-label="運営ナビゲーション"
      >
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          <Link
            href={`/events/${eventId}`}
            className="flex flex-col items-center justify-center rounded-xl py-2 text-[11px] font-semibold text-zinc-600 transition hover:bg-violet-50 touch-manipulation"
          >
            参加者画面
          </Link>
          <Link
            href="/events"
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#7C3AED] text-xs font-bold text-white shadow-md ring-4 ring-violet-100 touch-manipulation"
          >
            ホーム
          </Link>
          <button
            type="button"
            onClick={logoutAdmin}
            className="rounded-xl py-2 text-[11px] font-semibold text-zinc-600 transition hover:bg-violet-50 touch-manipulation"
          >
            運営ログアウト
          </button>
        </div>
      </nav>

      {qrModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-violet-100 bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h2 id="qr-modal-title" className="text-base font-bold text-zinc-900">
                参加用QRコード
              </h2>
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setQrModalOpen(false)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 touch-manipulation"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 flex justify-center rounded-xl border border-zinc-100 bg-white p-3">
              {qrImageSrc ? (
                <img src={qrImageSrc} alt="" className="h-52 w-52 rounded-lg" />
              ) : (
                <p className="py-12 text-sm text-zinc-500">URLを準備中です…</p>
              )}
            </div>
            <p className="mt-3 break-all rounded-lg bg-zinc-50 px-3 py-2 text-[11px] font-medium text-zinc-700">
              {joinUrl || "—"}
            </p>
            <button
              type="button"
              onClick={() => void copyJoinUrl()}
              disabled={!joinUrl}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50 touch-manipulation"
            >
              <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              URLをコピー
            </button>
            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              className="mt-3 w-full py-2 text-sm font-semibold text-violet-700 underline underline-offset-2 touch-manipulation"
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

