"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { filterAdminPinInput } from "../../../lib/admin-pin";
import { ensureDefaultAdminPinIfMissing } from "../../../lib/default-admin-pin";
import { verifyEventAdminPin } from "../../../lib/verify-event-admin-pin";
import { ParticipantBottomNav } from "../participant-bottom-nav";
import { ParticipantGateLoading } from "../participant-gate-loading";
import { useParticipantRankingLink } from "../use-participant-ranking-link";
import { useParticipantEventGate } from "../../../lib/use-participant-event-gate";

type Props = { eventId: string };

export function ParticipantManageClient({ eventId }: Props) {
  const router = useRouter();
  const { allowed: gateAllowed } = useParticipantEventGate(eventId);
  const showRankingLink = useParticipantRankingLink(eventId);
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ref0 = useRef<HTMLInputElement>(null);
  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);
  const ref3 = useRef<HTMLInputElement>(null);
  const refs = [ref0, ref1, ref2, ref3];

  useEffect(() => {
    void ensureDefaultAdminPinIfMissing(eventId);
  }, [eventId]);

  const focusAt = (i: number) => {
    const el = refs[i]?.current;
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleChange = (index: number, raw: string) => {
    const d = filterAdminPinInput(raw).slice(-1);
    const next = [...digits];
    next[index] = d;
    setDigits(next);
    setError("");
    if (d && index < 3) focusAt(index + 1);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      focusAt(index - 1);
    }
    if (e.key === "Enter" && digits.join("").length === 4) void submit();
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await verifyEventAdminPin(eventId, digits.join(""));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/admin/${eventId}`);
    } catch (e) {
      console.error(e);
      setError("確認に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  if (!gateAllowed) {
    return <ParticipantGateLoading />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-rose-100 px-4 pb-[calc(100px+env(safe-area-inset-bottom))] pt-8">
      <main className="mx-auto max-w-md">
        <h1 className="text-center text-xl font-bold text-[#111827]">管理者ログイン</h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-[#6B7280]">管理用PINを入力してください</p>

        <div className="mt-10 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <input
              key={i}
              ref={refs[i]}
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={1}
              autoComplete="one-time-code"
              value={digits[i]}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={busy}
              className="h-14 w-12 rounded-xl border-2 border-zinc-200 bg-white text-center text-2xl font-bold text-[#111827] outline-none ring-[#7C3AED]/25 focus:border-[#7C3AED] focus:ring-2"
              aria-label={`PIN ${i + 1}桁目`}
            />
          ))}
        </div>

        {error ? (
          <p className="mt-6 text-center text-sm font-semibold text-[#EF4444]">{error}</p>
        ) : null}

        <button
          type="button"
          disabled={busy || digits.join("").length !== 4}
          onClick={() => void submit()}
          className="mt-10 flex h-12 w-full items-center justify-center rounded-[14px] bg-[#7C3AED] text-base font-bold text-white shadow-sm disabled:opacity-45 touch-manipulation"
        >
          {busy ? "確認中…" : "ログイン"}
        </button>

        <div className="mt-8 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-center text-xs leading-relaxed text-[#6B7280]">
            PIN認証に成功した場合のみ運営画面へアクセスできます。
          </p>
        </div>
      </main>

      <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingLink} />
    </div>
  );
}
