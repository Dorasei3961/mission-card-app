"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { setEventSession } from "../../lib/event-session";

function normalizeParticipantKey(name: string): string {
  const normalized = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
  return normalized || "guest";
}

export default function EventJoinPage() {
  const router = useRouter();
  const [participantName, setParticipantName] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventIdFromUrl, setEventIdFromUrl] = useState("");
  const [hasCodeInUrl, setHasCodeInUrl] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code")?.trim() ?? "";
    const eventId = params.get("eventId")?.trim() ?? "";
    const eventNameQuery = params.get("eventName")?.trim() ?? "";
    if (code) setEventName(code);
    if (eventNameQuery) setEventName(eventNameQuery);
    setHasCodeInUrl(Boolean(code));
    if (eventId) setEventIdFromUrl(eventId);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = participantName.trim();
    const title = eventName.trim();
    if (!name || (!title && !hasCodeInUrl)) {
      setMessage("イベント名と参加者名を入力してください。");
      return;
    }

    setPending(true);
    setMessage("");
    try {
      await signInAnonymously(auth);

      let eventDoc;
      if (eventIdFromUrl) {
        const byId = await getDoc(doc(db, "events", eventIdFromUrl));
        if (!byId.exists()) {
          setMessage("指定されたイベントが見つかりません。");
          setPending(false);
          return;
        }
        eventDoc = byId;
      } else {
        const eventSearchValue = title;
        const evQuery = query(collection(db, "events"), where("title", "==", eventSearchValue), limit(5));
        const evSnap = await getDocs(evQuery);
        if (evSnap.empty) {
          const fallbackQuery = query(collection(db, "events"), where("joinCode", "==", eventSearchValue), limit(5));
          const fallbackSnap = await getDocs(fallbackQuery);
          if (fallbackSnap.empty) {
            setMessage("イベント名に一致する開催中イベントが見つかりません。");
            setPending(false);
            return;
          }
          if (fallbackSnap.docs.length > 1) {
            setMessage("同じ合言葉のイベントが複数あります。運営に確認してください。");
            setPending(false);
            return;
          }
          eventDoc = fallbackSnap.docs[0];
        } else {
          if (evSnap.docs.length > 1) {
            setMessage("同じ合言葉のイベントが複数あります。運営に確認してください。");
            setPending(false);
            return;
          }
          eventDoc = evSnap.docs[0];
        }
      }
      const eventId = eventDoc.id;
      const eventData = eventDoc.data() as { status?: string; joinCode?: string; joinUrl?: string };
      if (eventData.status === "closed") {
        setMessage("このイベントは終了しました。新規参加はできません。");
        setPending(false);
        return;
      }
      if (!eventData.joinCode || !eventData.joinUrl) {
        const joinCode = (eventData.joinCode?.trim() || (eventData as { title?: string }).title?.trim() || "").trim();
        const joinUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}/join?code=${encodeURIComponent(joinCode)}`
            : `/join?code=${encodeURIComponent(joinCode)}`;
        await setDoc(doc(db, "events", eventId), { joinCode, joinUrl, updatedAt: serverTimestamp() }, { merge: true });
      }

      const participantKey = normalizeParticipantKey(name);
      const participantRef = doc(db, "events", eventId, "participants", participantKey);
      const participantSnap = await getDoc(participantRef);
      if (participantSnap.exists()) {
        await setDoc(
          participantRef,
          { name, updatedAt: serverTimestamp() },
          { merge: true },
        );
      } else {
        await setDoc(participantRef, {
          name,
          totalPoints: 0,
          completedCount: 0,
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setEventSession({ eventId, participantName: name, uid: participantKey });
      router.push(`/events/${eventId}`);
    } catch (err) {
      console.error(err);
      setMessage("参加処理に失敗しました。ネットワークと Firestore ルールを確認してください。");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 p-4">
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 pt-4">
        <div>
          <Link href="/" className="text-sm font-semibold text-blue-600 underline">
            ← トップへ
          </Link>
          <h1 className="mt-3 text-2xl font-black text-zinc-900">イベント参加</h1>
          <p className="mt-1 text-sm text-zinc-600">
            イベント名と参加者名で参加できます。同じ入力で途中から再開できます。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-800">イベント名</span>
            <input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="rounded-xl border-2 border-zinc-200 px-4 py-3 text-base"
              placeholder="参加するイベント名"
              autoComplete="off"
              disabled={hasCodeInUrl}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-800">参加者名</span>
            <input
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              className="rounded-xl border-2 border-zinc-200 px-4 py-3 text-base"
              placeholder="表示される名前"
              autoComplete="off"
            />
          </label>
          {message ? <p className="text-sm font-medium text-red-600">{message}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-sky-600 py-4 text-base font-bold text-white disabled:opacity-50"
          >
            {pending ? "処理中…" : "参加する"}
          </button>
        </form>
      </main>
    </div>
  );
}
