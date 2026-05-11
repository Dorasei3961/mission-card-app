"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { clearEventScopedStorage } from "./event-session";

/**
 * events/{eventId} が削除された場合に TOP へ退避する。
 * 参加者・運営の各画面で共通利用する。
 */
export function useRedirectIfEventMissing(eventId: string) {
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!eventId) return;
    redirectedRef.current = false;
    const unsub = onSnapshot(
      doc(db, "events", eventId),
      (snap) => {
        if (snap.exists()) return;
        if (redirectedRef.current) return;
        redirectedRef.current = true;
        clearEventScopedStorage(eventId);
        router.replace("/");
      },
      (err) => {
        console.error("[useRedirectIfEventMissing] snapshot error", { eventId, err });
      },
    );
    return () => unsub();
  }, [eventId, router]);
}
