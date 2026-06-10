"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  clearEventScopedStorage,
  EVENT_ENDED_MESSAGE,
  getEventSession,
  PARTICIPANT_SESSION_EXPIRED_MESSAGE,
} from "./event-session";
import { isActiveEventRecord } from "./event-list";
import { db } from "./firebase";
import { setParticipantFlashMessage } from "./participant-flash-message";

type Options = {
  /** false のときゲートしない（運営プレビューなど） */
  enabled?: boolean;
};

/**
 * 参加者向けイベント画面の入場チェック。
 * - 終了・削除 → TOP（メッセージ付き）
 * - セッションなし・期限切れ → 参加画面（eventId 付き）
 */
export function useParticipantEventGate(eventId: string, options: Options = {}) {
  const { enabled = true } = options;
  const router = useRouter();
  const redirectedRef = useRef(false);
  const [allowed, setAllowed] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setAllowed(true);
      return;
    }

    redirectedRef.current = false;
    setAllowed(false);

    const eventRef = doc(db, "events", eventId);
    const unsub = onSnapshot(
      eventRef,
      (snap) => {
        if (redirectedRef.current) return;

        if (!snap.exists()) {
          redirectedRef.current = true;
          clearEventScopedStorage(eventId);
          router.replace("/");
          return;
        }

        const data = snap.data() as { status?: string; endedAt?: unknown; deletedAt?: unknown };
        if (!isActiveEventRecord(data)) {
          redirectedRef.current = true;
          clearEventScopedStorage(eventId);
          setParticipantFlashMessage(EVENT_ENDED_MESSAGE);
          router.replace("/");
          return;
        }

        const session = getEventSession();
        if (!session || session.eventId !== eventId) {
          redirectedRef.current = true;
          setParticipantFlashMessage(PARTICIPANT_SESSION_EXPIRED_MESSAGE);
          router.replace(`/events/join?eventId=${encodeURIComponent(eventId)}`);
          return;
        }

        setAllowed(true);
      },
      () => setAllowed(false),
    );

    return () => unsub();
  }, [enabled, eventId, router]);

  return { allowed };
}
