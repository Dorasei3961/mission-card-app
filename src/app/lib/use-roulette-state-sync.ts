"use client";

import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import { rouletteWinnerDisplayText } from "./roulette-display";
import {
  acknowledgeRouletteResult,
  finalizeRouletteSpin,
  predictFinalizeStoredRotationDeg,
  sortRouletteItemsByOrder,
  startRouletteSpin,
  type RouletteItemRow,
} from "./roulette-operations";
import {
  clockwiseEndRotationForSpin,
  DEFAULT_ROULETTE_STATE,
  normalizeRouletteState,
  type RouletteSettings,
  type RouletteState,
} from "./roulette-schema";

type Role = "admin" | "participant";

type Options = {
  role: Role;
  /** 運営画面のみ true。未作成時に既定 state を作成 */
  seedIfMissing?: boolean;
};

/** ルーレット表示項目と抽選対象を一致させる（active フィルターを使わない） */
function itemsForSpin(rows: RouletteItemRow[]): RouletteItemRow[] {
  return sortRouletteItemsByOrder(rows).map((row) => ({ ...row, active: true }));
}

export function useRouletteStateSync(
  eventId: string,
  settings: RouletteSettings,
  spinItems: RouletteItemRow[],
  options: Options,
) {
  const { role, seedIfMissing = false } = options;
  const [state, setState] = useState<RouletteState>(() => ({ ...DEFAULT_ROULETTE_STATE }));
  const [loading, setLoading] = useState(true);
  const [spinBusy, setSpinBusy] = useState(false);
  const [ackBusy, setAckBusy] = useState(false);
  const [visualRotation, setVisualRotation] = useState(0);
  const rotationSyncedNonceRef = useRef<number | null>(null);
  const seedingRef = useRef(false);
  const spinItemsRef = useRef<RouletteItemRow[]>([]);

  const spinPool = useMemo(() => itemsForSpin(spinItems), [spinItems]);
  spinItemsRef.current = spinPool;

  useEffect(() => {
    const stateRef = doc(db, "events", eventId, "rouletteState", "main");
    const unsub = onSnapshot(
      stateRef,
      (snap) => {
        setState(normalizeRouletteState(snap.data()));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    if (!seedIfMissing || seedingRef.current) return;
    const seed = async () => {
      const stateRef = doc(db, "events", eventId, "rouletteState", "main");
      const snap = await getDoc(stateRef);
      if (snap.exists()) return;
      seedingRef.current = true;
      await setDoc(
        stateRef,
        { ...DEFAULT_ROULETTE_STATE, updatedAt: serverTimestamp() },
        { merge: true },
      );
    };
    void seed();
  }, [eventId, seedIfMissing]);

  useEffect(() => {
    if (state.status !== "idle") return;
    setVisualRotation(0);
    rotationSyncedNonceRef.current = null;
  }, [state.status]);

  /** spinning 開始時に終端角を1回だけ算出してアニメーション先を決定 */
  useEffect(() => {
    if (state.status !== "spinning" || !state.startedAt) return;
    if (rotationSyncedNonceRef.current === state.spinNonce) return;

    const storedDeg = predictFinalizeStoredRotationDeg(
      eventId,
      state,
      settings,
      spinItemsRef.current,
    );
    if (storedDeg === null) {
      rotationSyncedNonceRef.current = state.spinNonce;
      return;
    }
    rotationSyncedNonceRef.current = state.spinNonce;
    setVisualRotation((prev) => clockwiseEndRotationForSpin(prev, storedDeg, 5));
  }, [eventId, state, settings]);

  /** 回転時間経過後に当選を確定（どちらの画面からでも1回実行） */
  useEffect(() => {
    if (state.status !== "spinning" || !state.startedAt) return;
    const deadline = state.startedAt.toMillis() + settings.spinDurationMs;
    const delay = Math.max(0, deadline - Date.now());
    const handle = window.setTimeout(() => {
      void finalizeRouletteSpin(db, eventId, spinItemsRef.current);
    }, delay);
    return () => clearTimeout(handle);
  }, [eventId, state.status, state.startedAt, state.spinNonce, settings.spinDurationMs]);

  const resultText = useMemo(() => {
    if (state.status !== "finished") return null;
    return rouletteWinnerDisplayText(state.winnerItemLabel, state.winnerItemName);
  }, [state.status, state.winnerItemLabel, state.winnerItemName]);

  /** 途中参加時は残り時間だけアニメーション */
  const spinAnimationMs = useMemo(() => {
    if (state.status !== "spinning" || !state.startedAt) return settings.spinDurationMs;
    const deadline = state.startedAt.toMillis() + settings.spinDurationMs;
    return Math.max(200, deadline - Date.now());
  }, [state.status, state.startedAt, settings.spinDurationMs]);

  const canSpin = useMemo(() => {
    if (state.status !== "idle" || spinPool.length === 0) return false;
    if (role === "admin") return true;
    return settings.controlMode === "participant";
  }, [state.status, spinPool.length, role, settings.controlMode]);

  const handleStart = useCallback(async () => {
    if (!canSpin || spinBusy) return;
    setSpinBusy(true);
    try {
      await startRouletteSpin(db, eventId, role);
    } finally {
      setSpinBusy(false);
    }
  }, [canSpin, spinBusy, eventId, role]);

  const handleAcknowledge = useCallback(async () => {
    if (state.status !== "finished" || ackBusy) return;
    setAckBusy(true);
    try {
      await acknowledgeRouletteResult(db, eventId, settings.removeWinnerAfterSpin);
    } finally {
      setAckBusy(false);
    }
  }, [state.status, ackBusy, eventId, settings.removeWinnerAfterSpin]);

  return {
    state,
    loading,
    visualRotation,
    spinAnimationMs,
    isSpinning: state.status === "spinning",
    isFinished: state.status === "finished",
    resultText,
    canSpin: canSpin && !spinBusy,
    spinBusy,
    ackBusy,
    handleStart,
    handleAcknowledge,
  };
}
