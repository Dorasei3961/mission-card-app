"use client";

import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { SimpleRouletteCanvas } from "@/components/roulette/simple-roulette-canvas";
import { db } from "../../../lib/firebase";
import { useRedirectIfEventMissing } from "../../../lib/use-redirect-if-event-missing";
import { useEventAdminAccess } from "../../../lib/use-event-admin-access";
import { useRouletteItemsSync } from "../../../lib/use-roulette-items-sync";
import { useRouletteSettingsSync } from "../../../lib/use-roulette-settings-sync";

type Props = { eventId: string };

const BG = "min-h-screen bg-gradient-to-b from-[#FFF7E8] via-[#FFF5EE] to-[#EDE9FE]";
const SPIN_OPTIONS = [3000, 4000, 5000, 7000] as const;

export function AdminRouletteClient({ eventId }: Props) {
  useRedirectIfEventMissing(eventId);
  const { allowed } = useEventAdminAccess({ eventId });
  const [eventTitle, setEventTitle] = useState("イベント");
  const [nameDraft, setNameDraft] = useState("");

  const {
    displayLabels,
    editorItems,
    loading: itemsLoading,
    busy: itemsBusy,
    addItem,
    removeItem,
    maxItems,
  } = useRouletteItemsSync(eventId, { seedIfEmpty: true });

  const {
    settings,
    loading: settingsLoading,
    busy: settingsBusy,
    updateName,
    updateSpinDurationMs,
    updateControlMode,
  } = useRouletteSettingsSync(eventId, { seedIfMissing: true });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as { title?: string };
      setEventTitle(String(data.title ?? "イベント"));
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    setNameDraft(settings.name);
  }, [settings.name]);

  if (allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        読み込み中…
      </div>
    );
  }

  const loading = itemsLoading || settingsLoading;

  return (
    <div className={`${BG} px-4 pb-24 pt-4`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-xs font-semibold text-[#7C3AED]">{eventTitle}（運営）</p>
          <h1 className="mt-1 text-xl font-bold text-[#111827]">{settings.name}</h1>
          <p className="mt-1 text-xs font-medium text-[#6B7280]">
            STARTで回転し、約{Math.round(settings.spinDurationMs / 1000)}秒で結果が表示されます
          </p>
        </header>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          {loading ? (
            <p className="text-center text-sm text-[#6B7280]">読み込み中…</p>
          ) : (
            <SimpleRouletteCanvas
              canSpin
              showItemEditor
              items={displayLabels}
              editorItems={editorItems}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              maxItems={maxItems}
              itemsBusy={itemsBusy}
              spinDurationMs={settings.spinDurationMs}
            />
          )}
        </section>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <h2 className="text-sm font-bold text-[#111827]">ルーレット設定</h2>

          <label className="mt-4 block text-[11px] font-bold text-[#6B7280]">ルーレット名</label>
          <div className="mt-1 flex gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-violet-200 px-3 text-sm"
            />
            <button
              type="button"
              disabled={settingsBusy || nameDraft.trim() === ""}
              onClick={() => void updateName(nameDraft.trim())}
              className="rounded-xl bg-[#7C3AED] px-4 text-xs font-bold text-white disabled:opacity-45"
            >
              保存
            </button>
          </div>

          <p className="mt-4 text-[11px] font-bold text-[#6B7280]">回転時間</p>
          <div className="mt-2 inline-flex flex-wrap gap-1 rounded-2xl border border-[#E9D5FF] p-1">
            {SPIN_OPTIONS.map((ms) => (
              <button
                key={ms}
                type="button"
                disabled={settingsBusy}
                onClick={() => void updateSpinDurationMs(ms)}
                className={`rounded-xl px-3 py-2 text-sm font-bold ${
                  settings.spinDurationMs === ms ? "bg-[#7C3AED] text-white" : "text-[#7C3AED]"
                }`}
              >
                {ms / 1000}秒
              </button>
            ))}
          </div>

          <p className="mt-4 text-[11px] font-bold text-[#6B7280]">操作権限</p>
          <div className="mt-2 inline-flex rounded-2xl border border-[#E9D5FF] p-1">
            <button
              type="button"
              disabled={settingsBusy}
              onClick={() => void updateControlMode("admin")}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
                settings.controlMode === "admin" ? "bg-[#7C3AED] text-white" : "text-[#7C3AED]"
              }`}
            >
              運営のみ
            </button>
            <button
              type="button"
              disabled={settingsBusy}
              onClick={() => void updateControlMode("participant")}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
                settings.controlMode === "participant"
                  ? "bg-[#7C3AED] text-white"
                  : "text-[#7C3AED]"
              }`}
            >
              参加者も操作可
            </button>
          </div>
        </section>

        <Link
          href={`/admin/${eventId}`}
          className="block text-center text-sm font-semibold text-[#7C3AED] underline"
        >
          運営ダッシュボードへ戻る
        </Link>
      </main>
    </div>
  );
}
