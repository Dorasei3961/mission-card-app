"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInAnonymously } from "firebase/auth";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { setEventSession } from "../../lib/event-session";

export default function EventCreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    const creator = creatorName.trim();
    const pin = adminPin.trim();
    const joinPw = joinPassword.trim();
    if (!t || !creator || !pin || !joinPw) {
      setMessage("イベント名・作成者名・管理用パスワード・参加用パスワードを入力してください。");
      return;
    }

    setPending(true);
    setMessage("");
    try {
      await signInAnonymously(auth);
      const authUid = auth.currentUser!.uid;
      const joinCode = t;
      const joinUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/join?code=${encodeURIComponent(joinCode)}`
          : `/join?code=${encodeURIComponent(joinCode)}`;
      const ref = await addDoc(collection(db, "events"), {
        title: t,
        creatorName: creator,
        password: t,
        joinCode,
        joinUrl,
        adminPin: pin,
        joinPassword: joinPw,
        ownerUid: authUid,
        status: "active",
        rankingVisible: true,
        createdAt: serverTimestamp(),
      });
      const ownerKey = "host";
      await setDoc(doc(db, "events", ref.id, "participants", ownerKey), {
        name: creator,
        totalPoints: 0,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setEventSession({ eventId: ref.id, participantName: creator, uid: ownerKey });
      router.push("/");
    } catch (err) {
      console.error(err);
      setMessage("作成に失敗しました。Firestore の権限を確認してください。");
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
          <h1 className="mt-3 text-2xl font-black text-zinc-900">イベント作成</h1>
          <p className="mt-1 text-sm text-zinc-600">
            イベント名・作成者・運営用と参加用のパスワードを設定します。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-800">イベント名</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl border-2 border-zinc-200 px-4 py-3 text-base"
              placeholder="例：春の記録会"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-800">作成者名</span>
            <input
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              className="rounded-xl border-2 border-zinc-200 px-4 py-3 text-base"
              placeholder="例：田中"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-800">管理用パスワード</span>
            <input
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="rounded-xl border-2 border-zinc-200 px-4 py-3 text-base"
              placeholder="運営担当者だけが知るパスワード"
              autoComplete="off"
            />
            <span className="text-xs text-zinc-500">
              「運営画面」で入力します。参加者には表示されません。
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-zinc-800">参加用パスワード</span>
            <input
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              className="rounded-xl border-2 border-zinc-200 px-4 py-3 text-base"
              placeholder="参加者が入力するパスワード"
              autoComplete="off"
            />
            <span className="text-xs text-zinc-500">
              参加者がイベントに参加するときに必要です。管理用パスワードとは別にしてください。
            </span>
          </label>
          {message ? <p className="text-sm font-medium text-red-600">{message}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-emerald-600 py-4 text-base font-bold text-white disabled:opacity-50"
          >
            {pending ? "作成中…" : "イベントを作成"}
          </button>
        </form>
      </main>
    </div>
  );
}
