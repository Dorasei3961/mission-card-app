"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "./firebase";
import { ensureEventAdminSession } from "./admin-session-client";
import { getAdminAccess, setAdminAccess } from "./event-session";

type Options = {
  eventId: string;
  /** false のとき PIN 未認証なら /events/{id}/manage へ */
  redirectIfDenied?: boolean;
};

/**
 * localStorage の運営PIN済みフラグと Firestore adminSessions を同期する。
 */
export function useEventAdminAccess({ eventId, redirectIfDenied = true }: Options) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    setAllowed(getAdminAccess(eventId));
  }, [eventId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await signInAnonymously(auth);
        return;
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!eventId || !authReady || allowed !== true) return;

    let cancelled = false;
    const sync = async () => {
      const ok = await ensureEventAdminSession(eventId);
      if (cancelled) return;
      if (!ok) {
        setAdminAccess(eventId, false);
        setAllowed(false);
        if (redirectIfDenied) {
          router.replace(`/events/${eventId}/manage`);
        }
      }
    };
    void sync();
    return () => {
      cancelled = true;
    };
  }, [eventId, authReady, allowed, redirectIfDenied, router]);

  useEffect(() => {
    if (allowed === false && redirectIfDenied) {
      router.replace(`/events/${eventId}/manage`);
    }
  }, [allowed, eventId, redirectIfDenied, router]);

  return { allowed, authReady, setAllowed };
}
