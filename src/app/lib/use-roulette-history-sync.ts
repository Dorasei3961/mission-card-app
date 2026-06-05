"use client";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import { rouletteWinnerDisplayText } from "./roulette-display";

const HISTORY_LIMIT = 30;

export type RouletteHistoryRow = {
  id: string;
  itemId: string;
  label: string;
  name: string;
  displayText: string;
  spunBy: "admin" | "participant";
  createdAt: Timestamp | null;
  createdAtText: string;
};

function formatHistoryTime(raw: unknown): string {
  if (!raw || typeof raw !== "object" || !("toDate" in raw)) return "—";
  const date = (raw as { toDate: () => Date }).toDate();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapHistoryDoc(
  id: string,
  raw: Record<string, unknown>,
  showGradeLabels: boolean,
): RouletteHistoryRow {
  const label = typeof raw.label === "string" ? raw.label : "";
  const name = typeof raw.name === "string" ? raw.name : "";
  const spunBy = raw.spunBy === "participant" ? "participant" : "admin";
  const createdAt =
    raw.createdAt && typeof raw.createdAt === "object" && "toDate" in raw.createdAt
      ? (raw.createdAt as Timestamp)
      : null;

  return {
    id,
    itemId: typeof raw.itemId === "string" ? raw.itemId : "",
    label,
    name,
    displayText: rouletteWinnerDisplayText(label, name, { showGradeLabels }),
    spunBy,
    createdAt,
    createdAtText: formatHistoryTime(raw.createdAt),
  };
}

type Options = {
  showGradeLabels?: boolean;
};

export function useRouletteHistorySync(eventId: string, options: Options = {}) {
  const { showGradeLabels = false } = options;
  const [rows, setRows] = useState<RouletteHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "events", eventId, "rouletteHistory"),
      orderBy("createdAt", "desc"),
      limit(HISTORY_LIMIT),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) =>
            mapHistoryDoc(d.id, d.data() as Record<string, unknown>, showGradeLabels),
          ),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [eventId, showGradeLabels]);

  const spunByLabel = useMemo(
    () =>
      ({
        admin: "運営",
        participant: "参加者",
      }) as const,
    [],
  );

  return { rows, loading, spunByLabel };
}
