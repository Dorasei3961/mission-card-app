"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";

/** 参加者画面と同じ条件: ランキング公開 or イベント終了 */
export function useParticipantRankingLink(eventId: string): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        setShow(false);
        return;
      }
      const data = snap.data() as { rankingVisible?: boolean; status?: string };
      setShow(Boolean(data.rankingVisible) || data.status === "closed");
    });
    return () => unsub();
  }, [eventId]);
  return show;
}
