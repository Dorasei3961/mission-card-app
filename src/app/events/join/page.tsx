"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import { buildJoinPasswordForgotMailtoHref } from "../../lib/contact-mail";
import { setEventSession } from "../../lib/event-session";
import { isActiveEventRecord } from "../../lib/event-list";
import {
  findExistingParticipantByName,
  normalizeParticipantKey,
  trimParticipantDisplayName,
} from "../../lib/participant-join";

type ActiveEventRow = { id: string; title: string; creatorName: string };

type EventJoinFields = {
  status?: string;
  joinCode?: string;
  joinUrl?: string;
  joinPassword?: unknown;
  title?: string;
};

function getStoredJoinPassword(data: EventJoinFields): string {
  const raw = data.joinPassword;
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function verifyJoinPassword(data: EventJoinFields, entered: string): { ok: true } | { ok: false; message: string } {
  const stored = getStoredJoinPassword(data);
  const input = entered.trim();
  if (!stored) {
    return { ok: true };
  }
  if (!input) {
    return { ok: false, message: "参加用パスワードを入力してください。" };
  }
  if (input !== stored) {
    return { ok: false, message: "参加用パスワードが違います" };
  }
  return { ok: true };
}

export default function EventJoinPage() {
  const router = useRouter();
  const [participantName, setParticipantName] = useState("");
  const [eventName, setEventName] = useState("");
  const [joinPasswordInput, setJoinPasswordInput] = useState("");
  const [eventIdFromUrl, setEventIdFromUrl] = useState("");
  const [hasCodeInUrl, setHasCodeInUrl] = useState(false);
  const [activeEvents, setActiveEvents] = useState<ActiveEventRow[]>([]);
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

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, "events"));
        const rows = snap.docs
          .map((d) => {
            const data = d.data() as {
              title?: string;
              creatorName?: string;
              status?: string;
              endedAt?: unknown;
              deletedAt?: unknown;
            };
            return {
              id: d.id,
              title: data.title?.trim() || "イベント",
              creatorName: data.creatorName?.trim() || "未設定",
              active: isActiveEventRecord(data),
            };
          })
          .filter((ev) => ev.active)
          .map(({ id, title, creatorName }) => ({ id, title, creatorName }));
        rows.sort((a, b) => a.title.localeCompare(b.title, "ja"));
        setActiveEvents(rows);
      } catch (error) {
        console.error("[join] active events load failed", error);
        setActiveEvents([]);
      }
    };
    void load();
  }, []);

  const suggestionEvents = useMemo(() => {
    const q = eventName.trim().toLowerCase();
    if (!q) return activeEvents.slice(0, 12);
    return activeEvents
      .filter((e) => e.title.toLowerCase().includes(q))
      .slice(0, 12);
  }, [activeEvents, eventName]);

  const joinPasswordForgotMailto = useMemo(() => buildJoinPasswordForgotMailtoHref(), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = trimParticipantDisplayName(participantName);
    const title = eventName.trim();
    if (!name || (!title && !hasCodeInUrl)) {
      setMessage("イベント名と参加者名を入力してください。");
      return;
    }

    setPending(true);
    setMessage("");
    try {
      await signInAnonymously(auth);
      const authUid = auth.currentUser?.uid;
      if (!authUid) {
        setMessage("認証に失敗しました。もう一度お試しください。");
        setPending(false);
        return;
      }

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
            setMessage("同じ名前のイベントが複数あります。運営に確認してください。");
            setPending(false);
            return;
          }
          eventDoc = fallbackSnap.docs[0];
        } else {
          if (evSnap.docs.length > 1) {
            setMessage("同じ名前のイベントが複数あります。運営に確認してください。");
            setPending(false);
            return;
          }
          eventDoc = evSnap.docs[0];
        }
      }
      const eventId = eventDoc.id;
      const eventData = eventDoc.data() as EventJoinFields;
      if (!isActiveEventRecord(eventData)) {
        setMessage("このイベントは終了しました。新規参加はできません。");
        setPending(false);
        return;
      }

      const pwCheck = verifyJoinPassword(eventData, joinPasswordInput);
      if (!pwCheck.ok) {
        setMessage(pwCheck.message);
        setPending(false);
        return;
      }

      const existing = await findExistingParticipantByName(eventId, name);
      const participantDocId = existing
        ? existing.participantDocId
        : normalizeParticipantKey(name);
      const participantRef = doc(db, "events", eventId, "participants", participantDocId);

      if (existing) {
        await setDoc(
          participantRef,
          {
            name,
            authUid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } else {
        const participantSnap = await getDoc(participantRef);
        if (participantSnap.exists()) {
          await setDoc(
            participantRef,
            {
              name,
              authUid,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        } else {
          await setDoc(participantRef, {
            name,
            authUid,
            totalPoints: 0,
            completedCount: 0,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      setEventSession({ eventId, participantName: name, uid: participantDocId });
      router.push(`/events/${eventId}/features`);
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
            イベント名・参加用パスワード・参加者名で参加できます。同じ入力で途中から再開できます。
          </p>
        </div>

        <form
          lang="ja"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-800">イベント名</span>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="rounded-xl border-2 border-zinc-200 px-4 py-3 text-base"
              placeholder="参加するイベント名（候補から選ぶか入力）"
              autoComplete="off"
              enterKeyHint="done"
              disabled={hasCodeInUrl}
            />
          </label>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold text-zinc-700">開催中の候補（タップで入力）</p>
            <div className="mt-2 flex max-h-44 flex-col gap-2 overflow-y-auto">
              {suggestionEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setEventName(ev.title)}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm active:bg-zinc-50"
                >
                  <span className="block text-sm font-bold text-zinc-900">{ev.title}</span>
                  <span className="text-xs text-zinc-600">作成者: {ev.creatorName}</span>
                </button>
              ))}
              {suggestionEvents.length === 0 ? (
                <p className="text-xs text-zinc-500">一致する開催中イベントがありません。手入力してください。</p>
              ) : null}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-800">参加用パスワード</span>
            <input
              type="text"
              value={joinPasswordInput}
              onChange={(e) => setJoinPasswordInput(e.target.value)}
              className="rounded-xl border-2 border-zinc-200 px-4 py-3 text-base"
              placeholder="運営から共有されたパスワード"
              autoComplete="off"
              enterKeyHint="done"
            />
            <div className="mt-1 flex flex-col gap-1">
              <p className="text-[11px] leading-snug text-zinc-500">
                ※パスワードが分からないときは、下記から運営へ依頼できます（返信先を本文に記入してください）。
              </p>
              <a
                href={joinPasswordForgotMailto}
                className="text-xs font-semibold text-blue-600 underline underline-offset-2"
              >
                参加用パスワードを忘れた方はこちら
              </a>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-800">参加者名</span>
            <input
              type="text"
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              className="rounded-xl border-2 border-zinc-200 px-4 py-3 text-base"
              placeholder="表示される名前"
              autoComplete="off"
              enterKeyHint="done"
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
