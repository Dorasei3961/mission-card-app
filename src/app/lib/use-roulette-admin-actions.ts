"use client";

import { useCallback, useMemo, useState } from "react";
import { db } from "./firebase";
import {
  clearAllRouletteHistory,
  forceRouletteWinner,
  prepareRouletteSpinItems,
  ROULETTE_MAX_ITEMS,
  rouletteItemNameKey,
  restoreRouletteItemFromHistory,
  type RestoreRouletteItemReason,
  type RouletteItemRow,
} from "./roulette-operations";

export function restoreRouletteItemErrorMessage(reason: RestoreRouletteItemReason): string {
  switch (reason) {
    case "not_idle":
      return "待機中のみ復元できます。";
    case "already_restored":
      return "この履歴はすでに復元済みです。";
    case "item_still_exists":
      return "この景品はまだルーレットに残っています。";
    case "duplicate_name":
      return "同じ名前の景品がすでにあります。";
    case "max_items":
      return `景品は最大${ROULETTE_MAX_ITEMS}件までです。`;
    case "invalid_history":
      return "履歴が見つかりません。";
    case "missing_text":
      return "復元できる景品名がありません。";
    default:
      return "復元に失敗しました。";
  }
}

/** 履歴行が復元候補か（UI表示用・サーバー側でも再検証） */
export function canRestoreRouletteHistoryRow(
  row: { restored: boolean; itemId: string; name: string; label: string },
  existingItemIds: ReadonlySet<string>,
  isIdle: boolean,
  displayItemCount: number,
): boolean {
  if (!isIdle) return false;
  if (row.restored) return false;
  if (!row.itemId) return false;
  if (existingItemIds.has(row.itemId)) return false;
  if (!row.name.trim() && !row.label.trim()) return false;
  if (displayItemCount >= ROULETTE_MAX_ITEMS) return false;
  return true;
}

export function hasDuplicateRouletteItemName(
  name: string,
  label: string,
  items: RouletteItemRow[],
): boolean {
  const key = rouletteItemNameKey(name, label);
  if (!key) return false;
  return items.some((row) => rouletteItemNameKey(row.name, row.label) === key);
}

export function useRouletteAdminActions(eventId: string, spinItems: RouletteItemRow[]) {
  const [forceBusy, setForceBusy] = useState(false);
  const [clearHistoryBusy, setClearHistoryBusy] = useState(false);
  const [restoreBusyId, setRestoreBusyId] = useState<string | null>(null);
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

  const handleRestoreFromHistory = useCallback(
    async (historyId: string) => {
      if (!historyId || restoreBusyId) return false;
      setRestoreBusyId(historyId);
      setLastError(null);
      try {
        const result = await restoreRouletteItemFromHistory(db, eventId, historyId);
        if (!result.ok) {
          setLastError(restoreRouletteItemErrorMessage(result.reason));
          return false;
        }
        return true;
      } catch {
        setLastError("復元に失敗しました。");
        return false;
      } finally {
        setRestoreBusyId(null);
      }
    },
    [eventId, restoreBusyId],
  );

  const clearError = useCallback(() => setLastError(null), []);

  return {
    forceBusy,
    clearHistoryBusy,
    restoreBusyId,
    lastError,
    clearError,
    handleForceWinner,
    handleClearHistory,
    handleRestoreFromHistory,
  };
}
