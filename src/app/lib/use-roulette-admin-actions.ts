"use client";

import { useCallback, useMemo, useState } from "react";
import { db } from "./firebase";
import {
  clearAllRouletteHistory,
  forceRouletteWinner,
  prepareRouletteSpinItems,
  type RouletteItemRow,
} from "./roulette-operations";

export function useRouletteAdminActions(eventId: string, spinItems: RouletteItemRow[]) {
  const [forceBusy, setForceBusy] = useState(false);
  const [clearHistoryBusy, setClearHistoryBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const spinPool = useMemo(() => prepareRouletteSpinItems(spinItems), [spinItems]);

  const handleForceWinner = useCallback(
    async (itemId: string) => {
      if (!itemId || forceBusy) return false;
      setForceBusy(true);
      setLastError(null);
      try {
        const ok = await forceRouletteWinner(db, eventId, itemId, spinPool);
        if (!ok) {
          setLastError("当選の指定に失敗しました。抽選中でないか確認してください。");
        }
        return ok;
      } catch {
        setLastError("当選の指定に失敗しました。");
        return false;
      } finally {
        setForceBusy(false);
      }
    },
    [eventId, forceBusy, spinPool],
  );

  const handleClearHistory = useCallback(async () => {
    if (clearHistoryBusy) return 0;
    setClearHistoryBusy(true);
    setLastError(null);
    try {
      return await clearAllRouletteHistory(db, eventId);
    } catch {
      setLastError("履歴の削除に失敗しました。");
      return 0;
    } finally {
      setClearHistoryBusy(false);
    }
  }, [eventId, clearHistoryBusy]);

  const clearError = useCallback(() => setLastError(null), []);

  return {
    forceBusy,
    clearHistoryBusy,
    lastError,
    clearError,
    handleForceWinner,
    handleClearHistory,
  };
}
