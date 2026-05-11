"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { GripVertical, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../../lib/firebase";
import { getAdminAccess } from "../../../lib/event-session";
import { resolveEventFeatures } from "../../../lib/event-features";
import {
  DEFAULT_ROULETTE_SETTINGS,
  DEFAULT_ROULETTE_STATE,
  INITIAL_ROULETTE_ITEMS_SEED,
  normalizeRouletteSettings,
  normalizeRouletteState,
  clockwiseRotationToMatchStoredAngle,
  ROULETTE_SPIN_TRANSITION_EASING,
} from "../../../lib/roulette-schema";
import {
  clearAllRouletteHistory,
  finalizeRouletteSpin,
  forceRouletteWinner,
  resetRouletteResult,
  sortRouletteItemsByOrder,
  startRouletteSpin,
  type RouletteItemRow,
} from "../../../lib/roulette-operations";
import { ConfettiBurst, RouletteWheelView } from "../../../events/[eventId]/roulette/roulette-wheel-view";
import type { Timestamp } from "firebase/firestore";

type Props = { eventId: string };

const BG = "min-h-screen bg-gradient-to-b from-[#FFF7E8] via-[#FFF5EE] to-[#EDE9FE]";

function formatHistTime(ts: Timestamp | undefined): string {
  if (!ts) return "—";
  const d = ts.toDate();
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminRouletteClient({ eventId }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [eventTitle, setEventTitle] = useState("イベント");
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_ROULETTE_SETTINGS }));
  const [settingsDraft, setSettingsDraft] = useState(() => ({ ...DEFAULT_ROULETTE_SETTINGS }));
  const [state, setState] = useState(() => ({ ...DEFAULT_ROULETTE_STATE }));
  const [items, setItems] = useState<RouletteItemRow[]>([]);
  const [itemsDirty, setItemsDirty] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [history, setHistory] = useState<
    { id: string; label: string; name: string; createdAt?: Timestamp }[]
  >([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [visualRotation, setVisualRotation] = useState(0);
  const prevStatusRef = useRef<string>("idle");
  const [busy, setBusy] = useState(false);
  const itemsRef = useRef<RouletteItemRow[]>([]);
  itemsRef.current = sortRouletteItemsByOrder(items);

  useEffect(() => {
    setAllowed(getAdminAccess(eventId));
  }, [eventId]);

  useEffect(() => {
    if (allowed === false) router.replace(`/events/${eventId}/manage`);
  }, [allowed, eventId, router]);

  /** 初期シード・機能フラグ・既定ドキュメント */
  useEffect(() => {
    const init = async () => {
      const evRef = doc(db, "events", eventId);
      const settingsRef = doc(db, "events", eventId, "rouletteSettings", "main");
      const stateRef = doc(db, "events", eventId, "rouletteState", "main");
      const master = await getDoc(evRef);
      if (master.exists()) {
        const data = master.data() as { features?: unknown };
        const f = resolveEventFeatures(data.features);
        await setDoc(
          evRef,
          {
            features: {
              mission: f.mission,
              quiz: f.quiz,
              bingo: f.bingo,
              roulette: true,
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
      await setDoc(
        settingsRef,
        { ...DEFAULT_ROULETTE_SETTINGS, updatedAt: serverTimestamp() },
        { merge: true },
      );
      await setDoc(
        stateRef,
        { ...DEFAULT_ROULETTE_STATE, updatedAt: serverTimestamp() },
        { merge: true },
      );
      const itemsColl = collection(db, "events", eventId, "rouletteItems");
      const itemsSnap = await getDocs(itemsColl);
      if (itemsSnap.empty) {
        const batch = writeBatch(db);
        for (const row of INITIAL_ROULETTE_ITEMS_SEED) {
          const ref = doc(collection(db, "events", eventId, "rouletteItems"));
          batch.set(ref, {
            ...row,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
    };
    void init();
  }, [eventId]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as { title?: string };
      setEventTitle(String(data.title ?? "イベント"));
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId, "rouletteSettings", "main"), (snap) => {
      const n = normalizeRouletteSettings(snap.data());
      setSettings(n);
      if (!settingsDirty) setSettingsDraft(n);
    });
    return () => unsub();
  }, [eventId, settingsDirty]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId, "rouletteState", "main"), (snap) => {
      setState(normalizeRouletteState(snap.data()));
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "events", eventId, "rouletteItems"), (snap) => {
      const rows: RouletteItemRow[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          label: typeof raw.label === "string" ? raw.label : "",
          name: typeof raw.name === "string" ? raw.name : "",
          weight: typeof raw.weight === "number" ? raw.weight : 1,
          active: raw.active !== false,
          order: typeof raw.order === "number" ? raw.order : 0,
        };
      });
      if (!itemsDirty) setItems(sortRouletteItemsByOrder(rows));
    });
    return () => unsub();
  }, [eventId, itemsDirty]);

  useEffect(() => {
    const q = query(
      collection(db, "events", eventId, "rouletteHistory"),
      orderBy("createdAt", "desc"),
      limit(120),
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistory(
        snap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            label: String(raw.label ?? ""),
            name: String(raw.name ?? ""),
            createdAt: raw.createdAt as Timestamp | undefined,
          };
        }),
      );
    });
    return () => unsub();
  }, [eventId]);

  const activeSorted = useMemo(() => items.filter((i) => i.active), [items]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = state.status;
    if (state.status === "spinning" && prev !== "spinning") {
      const extraSpins = 5 + (state.spinNonce % 4);
      setVisualRotation((r) => r + extraSpins * 360);
    }
    if (state.status === "idle") setVisualRotation(0);
  }, [state.status, state.spinNonce]);

  useEffect(() => {
    if (state.status !== "finished" || typeof state.currentRotation !== "number") return;
    setVisualRotation((prev) =>
      clockwiseRotationToMatchStoredAngle(prev, state.currentRotation as number),
    );
  }, [state.status, state.currentRotation]);

  useEffect(() => {
    if (state.status !== "spinning") return;
    const started = state.startedAt;
    if (!started) return;
    const ms = settings.spinDurationMs;
    const deadline = started.toMillis() + ms;
    const delay = Math.max(0, deadline - Date.now());
    const handle = window.setTimeout(async () => {
      await finalizeRouletteSpin(db, eventId, sortRouletteItemsByOrder(itemsRef.current.filter((i) => i.active)));
    }, delay);
    return () => clearTimeout(handle);
  }, [eventId, state.status, state.startedAt, state.spinNonce, settings.spinDurationMs]);

  const centerText = useMemo(() => {
    if (state.status === "idle") return "START";
    if (state.status === "spinning") return "…";
    return state.winnerItemLabel ?? "結果";
  }, [state.status, state.winnerItemLabel]);

  const handleStart = async () => {
    if (state.status === "spinning" || busy) return;
    setBusy(true);
    try {
      await startRouletteSpin(db, eventId, "admin");
    } finally {
      setBusy(false);
    }
  };

  const handleResetResult = async () => {
    const ok = window.confirm(
      "結果をリセットします。履歴は残ります。よろしいですか？",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await resetRouletteResult(db, eventId);
    } finally {
      setBusy(false);
    }
  };

  const handleManualPick = async () => {
    const sorted = sortRouletteItemsByOrder(itemsRef.current.filter((i) => i.active));
    if (sorted.length === 0) {
      window.alert("有効な候補がありません。");
      return;
    }
    const lines = sorted.map((it, i) => `${i + 1}. ${it.label}　${it.name}`).join("\n");
    const raw = window.prompt(`番号を入力（1〜${sorted.length}）\n${lines}`);
    if (!raw) return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > sorted.length) {
      window.alert("無効な番号です。");
      return;
    }
    const picked = sorted[n - 1];
    setBusy(true);
    try {
      await forceRouletteWinner(db, eventId, picked.id, itemsRef.current, {
        removeWinnerAfterSpin: settings.removeWinnerAfterSpin,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveItems = async () => {
    setBusy(true);
    try {
      const batch = writeBatch(db);
      for (const row of items) {
        batch.set(
          doc(db, "events", eventId, "rouletteItems", row.id),
          {
            label: row.label,
            name: row.name,
            weight: row.weight,
            order: row.order,
            active: row.active,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
      await batch.commit();
      setItemsDirty(false);
    } finally {
      setBusy(false);
    }
  };

  const handleAddItem = async () => {
    setBusy(true);
    try {
      const maxOrder = items.reduce((m, r) => Math.max(m, r.order), 0);
      const ref = doc(collection(db, "events", eventId, "rouletteItems"));
      await setDoc(ref, {
        label: "新品",
        name: "景品名",
        weight: 1,
        order: maxOrder + 1,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    const ok = window.confirm("この候補を削除しますか？");
    if (!ok) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, "events", eventId, "rouletteItems", id));
      setItems((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusy(false);
    }
  };

  const moveItem = (id: string, dir: "up" | "down") => {
    setItemsDirty(true);
    setItems((prev) => {
      const sorted = sortRouletteItemsByOrder([...prev]);
      const idx = sorted.findIndex((r) => r.id === id);
      const j = dir === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || j < 0 || j >= sorted.length) return prev;
      const next = [...sorted];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((row, i) => ({ ...row, order: i + 1 }));
    });
  };

  const handleSaveSettings = async () => {
    setBusy(true);
    try {
      await setDoc(
        doc(db, "events", eventId, "rouletteSettings", "main"),
        {
          enabled: settingsDraft.enabled,
          name: settingsDraft.name,
          controlMode: settingsDraft.controlMode,
          spinDurationMs: settingsDraft.spinDurationMs,
          preventSameConsecutive: settingsDraft.preventSameConsecutive,
          removeWinnerAfterSpin: settingsDraft.removeWinnerAfterSpin,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setSettingsDirty(false);
    } finally {
      setBusy(false);
    }
  };

  const handleClearHistory = async () => {
    const ok = window.confirm("履歴をすべて削除します。よろしいですか？");
    if (!ok) return;
    setBusy(true);
    try {
      await clearAllRouletteHistory(db, eventId);
    } finally {
      setBusy(false);
    }
  };

  const historyPreview = history.slice(0, 3);

  const spinAllowed = state.status !== "spinning" && !busy;

  if (allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        読み込み中…
      </div>
    );
  }

  return (
    <div className={`${BG} px-4 pb-28 pt-4`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-xs font-semibold text-[#7C3AED]">
            {eventTitle}（運営）
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-[#111827]">{settings.name}</h1>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              運営中
            </span>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-[18px] border border-[#E9D5FF] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <ConfettiBurst active={state.status === "finished"} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-black text-[#111827]">{settings.name}</h2>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-3">
            <div>
              <p className="text-[11px] font-bold text-[#6B7280]">操作権限</p>
              <p className="text-sm font-bold text-[#111827]">
                {settings.controlMode === "participant" ? "参加者も操作可能" : "運営のみ"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = settings.controlMode === "admin" ? "participant" : "admin";
                void setDoc(
                  doc(db, "events", eventId, "rouletteSettings", "main"),
                  {
                    controlMode: next,
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true },
                );
              }}
              className="rounded-xl border border-[#E9D5FF] bg-white px-3 py-2 text-xs font-bold text-[#7C3AED] touch-manipulation"
            >
              変更
            </button>
          </div>

          <div className="mt-6 flex justify-center">
            <RouletteWheelView
              activeItems={activeSorted}
              rotationDeg={visualRotation}
              transitionMs={
                state.status === "spinning"
                  ? settings.spinDurationMs
                  : state.status === "finished"
                    ? 650
                    : 0
              }
              transitionEasing={ROULETTE_SPIN_TRANSITION_EASING}
              centerText={centerText}
            />
          </div>

          <button
            type="button"
            disabled={!spinAllowed}
            onClick={() => void handleStart()}
            className="mt-8 flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#9333EA] text-lg font-bold text-white shadow-[0_8px_24px_rgba(124,58,237,0.35)] disabled:opacity-45 touch-manipulation"
          >
            <Play className="h-7 w-7 shrink-0 text-white" strokeWidth={2.25} fill="currentColor" aria-hidden />
            ルーレットを開始する
          </button>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleManualPick()}
              disabled={busy}
              className="rounded-2xl border border-[#E9D5FF] bg-white py-3 text-sm font-bold text-[#7C3AED] disabled:opacity-45 touch-manipulation"
            >
              番号/候補を選択する
            </button>
            <button
              type="button"
              onClick={() => void handleResetResult()}
              disabled={busy}
              className="rounded-2xl border border-red-200 bg-white py-3 text-sm font-bold text-[#EF4444] disabled:opacity-45 touch-manipulation"
            >
              結果をリセット
            </button>
          </div>
        </section>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#111827]">これまでの結果</h3>
            <span className="text-[11px] font-semibold text-[#6B7280]">新しい順</span>
          </div>
          <ul className="mt-3 space-y-2">
            {historyPreview.length === 0 ? (
              <li className="text-sm text-[#6B7280]">まだありません</li>
            ) : (
              historyPreview.map((h) => (
                <li key={h.id} className="text-sm font-medium text-[#111827]">
                  <span className="text-[#6B7280]">{formatHistTime(h.createdAt)}</span>　{h.label}　
                  {h.name}
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => setHistoryExpanded(true)}
            className="mt-4 w-full rounded-xl border border-[#E9D5FF] bg-violet-50/50 py-3 text-sm font-bold text-[#7C3AED]"
          >
            もっと見る
          </button>
        </section>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#111827]">候補リストの編集</h3>
            <button
              type="button"
              onClick={() => void handleSaveItems()}
              disabled={busy}
              className="rounded-xl bg-[#7C3AED] px-4 py-2 text-xs font-bold text-white disabled:opacity-45 touch-manipulation"
            >
              保存
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[#6B7280]">重みが大きいほど当選しやすくなります</p>
          <ul className="mt-4 space-y-3">
            {items.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3"
              >
                <div className="flex flex-wrap items-start gap-2">
                  <input
                    value={row.label}
                    onChange={(e) => {
                      setItemsDirty(true);
                      setItems((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r)),
                      );
                    }}
                    className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-bold"
                    placeholder="ラベル"
                  />
                  <input
                    value={row.name}
                    onChange={(e) => {
                      setItemsDirty(true);
                      setItems((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)),
                      );
                    }}
                    className="min-w-[120px] flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-sm"
                    placeholder="候補名"
                  />
                  <input
                    type="number"
                    min={0}
                    value={row.weight}
                    onChange={(e) => {
                      setItemsDirty(true);
                      const v = Math.max(0, Number(e.target.value) || 0);
                      setItems((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, weight: v } : r)),
                      );
                    }}
                    className="w-16 rounded-lg border border-zinc-200 px-2 py-1 text-xs"
                  />
                  <span className="text-[11px] text-[#6B7280]">重み</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white p-1 touch-manipulation"
                      aria-label="上へ"
                      onClick={() => moveItem(row.id, "up")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white p-1 touch-manipulation"
                      aria-label="下へ"
                      onClick={() => moveItem(row.id, "down")}
                    >
                      ↓
                    </button>
                    <GripVertical className="h-5 w-5 text-[#9CA3AF]" aria-hidden />
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="text-xs font-bold text-red-600 touch-manipulation"
                    onClick={() => void handleDeleteItem(row.id)}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void handleAddItem()}
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center rounded-2xl border-2 border-dashed border-[#E9D5FF] bg-violet-50/30 py-4 text-sm font-bold text-[#7C3AED] touch-manipulation disabled:opacity-45"
          >
            ＋ 候補を追加
          </button>
        </section>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <h3 className="text-sm font-bold text-[#111827]">ルーレット設定</h3>
          <label className="mt-4 block text-[11px] font-bold text-[#6B7280]">ルーレット名</label>
          <input
            value={settingsDraft.name}
            onChange={(e) => {
              setSettingsDirty(true);
              setSettingsDraft((s) => ({ ...s, name: e.target.value }));
            }}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm font-semibold"
          />
          <p className="mt-4 text-[11px] font-bold text-[#6B7280]">操作権限</p>
          <div className="mt-2 inline-flex rounded-2xl border border-[#E9D5FF] p-1">
            <button
              type="button"
              onClick={() => {
                setSettingsDirty(true);
                setSettingsDraft((s) => ({ ...s, controlMode: "admin" }));
              }}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
                settingsDraft.controlMode === "admin" ? "bg-[#7C3AED] text-white" : "text-[#7C3AED]"
              }`}
            >
              運営のみ
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsDirty(true);
                setSettingsDraft((s) => ({ ...s, controlMode: "participant" }));
              }}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
                settingsDraft.controlMode === "participant"
                  ? "bg-[#7C3AED] text-white"
                  : "text-[#7C3AED]"
              }`}
            >
              参加者も操作可能
            </button>
          </div>
          <p className="mt-4 text-[11px] font-bold text-[#6B7280]">回転時間</p>
          <div className="mt-2 inline-flex rounded-2xl border border-[#E9D5FF] p-1">
            {([3000, 5000, 7000] as const).map((ms) => (
              <button
                key={ms}
                type="button"
                onClick={() => {
                  setSettingsDirty(true);
                  setSettingsDraft((s) => ({ ...s, spinDurationMs: ms }));
                }}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  settingsDraft.spinDurationMs === ms ? "bg-[#7C3AED] text-white" : "text-[#7C3AED]"
                }`}
              >
                {ms / 1000}秒
              </button>
            ))}
          </div>
          <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
            <span className="text-sm font-semibold text-[#111827]">同じ結果の連続当選を防ぐ</span>
            <input
              type="checkbox"
              checked={settingsDraft.preventSameConsecutive}
              onChange={(e) => {
                setSettingsDirty(true);
                setSettingsDraft((s) => ({ ...s, preventSameConsecutive: e.target.checked }));
              }}
              className="h-5 w-5 accent-[#7C3AED]"
            />
          </label>
          <label className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
            <span className="text-sm font-semibold text-[#111827]">一度当たった景品を除外する</span>
            <input
              type="checkbox"
              checked={settingsDraft.removeWinnerAfterSpin}
              onChange={(e) => {
                setSettingsDirty(true);
                setSettingsDraft((s) => ({ ...s, removeWinnerAfterSpin: e.target.checked }));
              }}
              className="h-5 w-5 accent-[#7C3AED]"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSaveSettings()}
            disabled={busy}
            className="mt-6 w-full rounded-2xl bg-[#7C3AED] py-4 text-sm font-bold text-white shadow-md disabled:opacity-45 touch-manipulation"
          >
            設定を保存
          </button>
        </section>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#111827]">履歴</h3>
            <button
              type="button"
              onClick={() => void handleClearHistory()}
              disabled={busy}
              className="text-xs font-bold text-red-600 disabled:opacity-45 touch-manipulation"
            >
              全件削除
            </button>
          </div>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {history.map((h) => (
              <li key={h.id} className="border-b border-zinc-100 pb-2 text-sm last:border-0">
                <span className="text-[#6B7280]">{formatHistTime(h.createdAt)}</span>　<span className="font-semibold">{h.label}</span>　
                {h.name}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setHistoryExpanded(true)}
            className="mt-4 w-full rounded-xl border border-[#E9D5FF] bg-violet-50/50 py-3 text-sm font-bold text-[#7C3AED]"
          >
            もっと見る
          </button>
        </section>

        <Link
          href={`/admin/${eventId}`}
          className="block text-center text-sm font-semibold text-[#7C3AED] underline"
        >
          運営ダッシュボードへ戻る
        </Link>
      </main>

      {historyExpanded ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[min(80vh,560px)] w-full max-w-md overflow-y-auto rounded-2xl border border-[#E9D5FF] bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">履歴（全件）</h3>
              <button
                type="button"
                className="text-sm font-semibold text-[#7C3AED]"
                onClick={() => setHistoryExpanded(false)}
              >
                閉じる
              </button>
            </div>
            <ul className="mt-4 space-y-3">
              {history.map((h) => (
                <li key={h.id} className="border-b border-zinc-100 pb-2 text-sm">
                  {formatHistTime(h.createdAt)}　{h.label}　{h.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E9D5FF] bg-white/95 px-4 py-2 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(124,58,237,0.08)]">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2 text-center text-[11px] font-semibold">
          <Link href={`/events/${eventId}`} className="rounded-xl py-2 text-[#6B7280] touch-manipulation">
            参加者画面
          </Link>
          <Link href={`/admin/${eventId}`} className="rounded-xl py-2 text-[#6B7280] touch-manipulation">
            運営TOP
          </Link>
          <span className="rounded-xl py-2 font-bold text-[#7C3AED]">ルーレット</span>
        </div>
      </nav>
    </div>
  );
}
