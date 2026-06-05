"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import { rouletteSegmentDisplayText } from "./roulette-display";
import { sortRouletteItemsByOrder, type RouletteItemRow } from "./roulette-operations";

const MAX_ITEMS = 16;

/** 第1段階の初期シード（Firestoreが空のとき） */
const DEFAULT_SEED_NAMES = ["景品A", "景品B", "景品C", "景品D", "景品E", "景品F"];

type Options = {
  /** 運営画面のみ true。空コレクション時に初期項目を作成 */
  seedIfEmpty?: boolean;
  /** 等級ラベルを表示テキストに含める */
  showGradeLabels?: boolean;
};

function mapDocToRow(id: string, raw: Record<string, unknown>): RouletteItemRow {
  return {
    id,
    label: typeof raw.label === "string" ? raw.label : "",
    name: typeof raw.name === "string" ? raw.name : "",
    weight: typeof raw.weight === "number" ? raw.weight : 1,
    active: raw.active !== false,
    order: typeof raw.order === "number" ? raw.order : 0,
  };
}

/** ルーレットに表示できる項目（name または label があるもの） */
function hasDisplayText(item: RouletteItemRow): boolean {
  return Boolean(item.name.trim() || item.label.trim());
}

export function useRouletteItemsSync(eventId: string, options: Options = {}) {
  const { seedIfEmpty = false, showGradeLabels = false } = options;
  const [items, setItems] = useState<RouletteItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const seedingRef = useRef(false);

  useEffect(() => {
    const coll = collection(db, "events", eventId, "rouletteItems");
    const unsub = onSnapshot(
      coll,
      (snap) => {
        const rows = snap.docs.map((d) => mapDocToRow(d.id, d.data() as Record<string, unknown>));
        setItems(sortRouletteItemsByOrder(rows));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    if (!seedIfEmpty || seedingRef.current) return;
    const seed = async () => {
      const coll = collection(db, "events", eventId, "rouletteItems");
      const snap = await getDocs(coll);
      if (!snap.empty) return;
      seedingRef.current = true;
      const batch = writeBatch(db);
      DEFAULT_SEED_NAMES.forEach((name, i) => {
        const ref = doc(coll);
        batch.set(ref, {
          label: "",
          name,
          weight: 1,
          order: i + 1,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    };
    void seed();
  }, [eventId, seedIfEmpty]);

  /** 第1段階: active ではなく表示テキスト有無で判定（旧データの active:false も表示） */
  const displaySorted = useMemo(
    () => sortRouletteItemsByOrder(items).filter(hasDisplayText),
    [items],
  );

  const displayLabels = useMemo(
    () =>
      displaySorted.map((item) =>
        rouletteSegmentDisplayText(item, displaySorted.length || 1, { showGradeLabels }),
      ),
    [displaySorted, showGradeLabels],
  );

  const editorItems = useMemo(
    () =>
      displaySorted.map((item) => {
        const name = item.name.trim();
        const grade = item.label.trim();
        const chip =
          showGradeLabels && grade && name
            ? `${grade} ${name}`
            : name || grade || "—";
        return {
          id: item.id,
          label: chip,
          gradeLabel: grade,
          itemName: name || grade || "—",
        };
      }),
    [displaySorted, showGradeLabels],
  );

  const addItem = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || displaySorted.length >= MAX_ITEMS) return;
      setBusy(true);
      try {
        const maxOrder = items.reduce((m, r) => Math.max(m, r.order), 0);
        const ref = doc(collection(db, "events", eventId, "rouletteItems"));
        await setDoc(ref, {
          label: "",
          name: trimmed,
          weight: 1,
          order: maxOrder + 1,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } finally {
        setBusy(false);
      }
    },
    [eventId, items, displaySorted.length],
  );

  const removeItem = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await deleteDoc(doc(db, "events", eventId, "rouletteItems", id));
      } finally {
        setBusy(false);
      }
    },
    [eventId],
  );

  const updateItemGradeLabel = useCallback(
    async (id: string, gradeLabel: string) => {
      setBusy(true);
      try {
        await updateDoc(doc(db, "events", eventId, "rouletteItems", id), {
          label: gradeLabel.trim(),
          updatedAt: serverTimestamp(),
        });
      } finally {
        setBusy(false);
      }
    },
    [eventId],
  );

  return {
    items,
    displaySorted,
    displayLabels,
    editorItems,
    remainingCount: displaySorted.length,
    loading,
    busy,
    addItem,
    removeItem,
    updateItemGradeLabel,
    maxItems: MAX_ITEMS,
  };
}
