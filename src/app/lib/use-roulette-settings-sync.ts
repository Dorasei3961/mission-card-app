"use client";

import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import {
  DEFAULT_ROULETTE_SETTINGS,
  normalizeRouletteSettings,
  type RouletteControlMode,
  type RouletteSettings,
} from "./roulette-schema";

type Options = {
  /** 運営画面のみ true。未作成時に既定設定を作成 */
  seedIfMissing?: boolean;
};

export function useRouletteSettingsSync(eventId: string, options: Options = {}) {
  const { seedIfMissing = false } = options;
  const [settings, setSettings] = useState<RouletteSettings>(() => ({ ...DEFAULT_ROULETTE_SETTINGS }));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const seedingRef = useRef(false);

  useEffect(() => {
    const settingsRef = doc(db, "events", eventId, "rouletteSettings", "main");
    const unsub = onSnapshot(
      settingsRef,
      (snap) => {
        setSettings(normalizeRouletteSettings(snap.data()));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    if (!seedIfMissing || seedingRef.current) return;
    const seed = async () => {
      const settingsRef = doc(db, "events", eventId, "rouletteSettings", "main");
      const snap = await getDoc(settingsRef);
      if (snap.exists()) return;
      seedingRef.current = true;
      await setDoc(
        settingsRef,
        { ...DEFAULT_ROULETTE_SETTINGS, updatedAt: serverTimestamp() },
        { merge: true },
      );
    };
    void seed();
  }, [eventId, seedIfMissing]);

  const saveSettings = useCallback(
    async (
      patch: Partial<
        Pick<
          RouletteSettings,
          | "name"
          | "spinDurationMs"
          | "controlMode"
          | "preventSameConsecutive"
          | "removeWinnerAfterSpin"
        >
      >,
    ) => {
      setBusy(true);
      try {
        const settingsRef = doc(db, "events", eventId, "rouletteSettings", "main");
        await setDoc(
          settingsRef,
          { ...patch, updatedAt: serverTimestamp() },
          { merge: true },
        );
      } finally {
        setBusy(false);
      }
    },
    [eventId],
  );

  const updateName = useCallback((name: string) => saveSettings({ name }), [saveSettings]);

  const updateSpinDurationMs = useCallback(
    (spinDurationMs: number) => saveSettings({ spinDurationMs }),
    [saveSettings],
  );

  const updateControlMode = useCallback(
    (controlMode: RouletteControlMode) => saveSettings({ controlMode }),
    [saveSettings],
  );

  const updatePreventSameConsecutive = useCallback(
    (preventSameConsecutive: boolean) => saveSettings({ preventSameConsecutive }),
    [saveSettings],
  );

  const updateRemoveWinnerAfterSpin = useCallback(
    (removeWinnerAfterSpin: boolean) => saveSettings({ removeWinnerAfterSpin }),
    [saveSettings],
  );

  return {
    settings,
    loading,
    busy,
    saveSettings,
    updateName,
    updateSpinDurationMs,
    updateControlMode,
    updatePreventSameConsecutive,
    updateRemoveWinnerAfterSpin,
  };
}
