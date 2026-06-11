"use client";

import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { SimpleRouletteCanvas } from "@/components/roulette/simple-roulette-canvas";
import { db } from "../../../lib/firebase";
import { useRedirectIfEventMissing } from "../../../lib/use-redirect-if-event-missing";
import { useEventAdminAccess } from "../../../lib/use-event-admin-access";
import { useRouletteItemsSync } from "../../../lib/use-roulette-items-sync";
import type { RouletteItemRow } from "../../../lib/roulette-operations";
import { rouletteWinnerDisplayText } from "../../../lib/roulette-display";
import { useRouletteAdminActions } from "../../../lib/use-roulette-admin-actions";
import { useRouletteHistorySync } from "../../../lib/use-roulette-history-sync";
import { useRouletteSettingsSync } from "../../../lib/use-roulette-settings-sync";
import { useRouletteStateSync } from "../../../lib/use-roulette-state-sync";
import { ROULETTE_SPIN_DURATION_MS_OPTIONS } from "../../../lib/roulette-schema";

type Props = { eventId: string };

const BG = "min-h-screen bg-gradient-to-b from-[#FFF7E8] via-[#FFF5EE] to-[#EDE9FE]";

function OptionToggle({
  label,
  description,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  description: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#111827]">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[#6B7280]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={`relative mt-0.5 h-[30px] w-[52px] shrink-0 rounded-full transition-colors ${
          on ? "bg-[#7C3AED]" : "bg-zinc-300"
        } disabled:opacity-45`}
      >
        <span
          className={`absolute top-[3px] left-[3px] h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
            on ? "translate-x-[22px]" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function GradeLabelEditor({
  items,
  busy,
  disabled,
  onSave,
}: {
  items: RouletteItemRow[];
  busy: boolean;
  disabled: boolean;
  onSave: (id: string, gradeLabel: string) => void | Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts(Object.fromEntries(items.map((item) => [item.id, item.label])));
  }, [items]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-[#6B7280]">項目を追加すると等級ラベルを設定できます</p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const name = item.name.trim() || item.label.trim() || "—";
        const draft = drafts[item.id] ?? "";
        const saved = item.label.trim();
        const dirty = draft.trim() !== saved;
        return (
          <li
            key={item.id}
            className="flex items-center gap-2 rounded-xl border border-violet-100 px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#374151]">
              {name}
            </span>
            <input
              value={draft}
              onChange={(e) =>
                setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
              }
              placeholder="1等"
              disabled={busy || disabled}
              className="h-9 w-24 rounded-lg border border-violet-200 px-2 text-sm"
            />
            <button
              type="button"
              disabled={busy || disabled || !dirty}
              onClick={() => void onSave(item.id, draft.trim())}
              className="rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-45"
            >
              保存
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminRouletteClient({ eventId }: Props) {
  useRedirectIfEventMissing(eventId);
  const { allowed } = useEventAdminAccess({ eventId });
  const [eventTitle, setEventTitle] = useState("イベント");
  const [nameDraft, setNameDraft] = useState("");
  const [forceItemId, setForceItemId] = useState("");

  const {
    settings,
    loading: settingsLoading,
    busy: settingsBusy,
    updateName,
    updateSpinDurationMs,
    updateControlMode,
    updatePreventSameConsecutive,
    updateRemoveWinnerAfterSpin,
    updateShowGradeLabels,
    updateShowRemainingCount,
  } = useRouletteSettingsSync(eventId, { seedIfMissing: true });

  const {
    displaySorted,
    displayLabels,
    editorItems,
    remainingCount,
    loading: itemsLoading,
    busy: itemsBusy,
    addItem,
    removeItem,
    updateItemGradeLabel,
    maxItems,
  } = useRouletteItemsSync(eventId, {
    seedIfEmpty: true,
    showGradeLabels: settings.showGradeLabels,
  });

  const { rows: historyRows, loading: historyLoading, spunByLabel } = useRouletteHistorySync(eventId, {
    showGradeLabels: settings.showGradeLabels,
  });

  const {
    loading: stateLoading,
    visualRotation,
    spinAnimationMs,
    isSpinning,
    isFinished,
    resultText,
    canSpin,
    spinBusy,
    ackBusy,
    handleStart,
    handleAcknowledge,
  } = useRouletteStateSync(eventId, settings, displaySorted, {
    role: "admin",
    seedIfMissing: true,
  });

  const {
    forceBusy,
    clearHistoryBusy,
    lastError,
    clearError,
    handleForceWinner,
    handleClearHistory,
  } = useRouletteAdminActions(eventId, displaySorted);

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

  useEffect(() => {
    if (!forceItemId && displaySorted.length > 0) {
      setForceItemId(displaySorted[0].id);
      return;
    }
    if (forceItemId && !displaySorted.some((item) => item.id === forceItemId)) {
      setForceItemId(displaySorted[0]?.id ?? "");
    }
  }, [displaySorted, forceItemId]);

  const adminToolsDisabled = isSpinning || isFinished || displaySorted.length === 0;

  const onForceWinner = async () => {
    if (!forceItemId || adminToolsDisabled || forceBusy) return;
    const item = displaySorted.find((row) => row.id === forceItemId);
    const label = item
      ? rouletteWinnerDisplayText(item.label, item.name, {
          showGradeLabels: settings.showGradeLabels,
        })
      : "選択した景品";
    if (
      !window.confirm(
        `「${label}」を当選として確定します。\n回転演出は行わず、参加者画面にも即時反映されます。よろしいですか？`,
      )
    ) {
      return;
    }
    clearError();
    await handleForceWinner(forceItemId);
  };

  const onClearHistory = async () => {
    if (historyRows.length === 0 || clearHistoryBusy) return;
    if (
      !window.confirm(
        `抽選履歴 ${historyRows.length} 件をすべて削除します。\nこの操作は取り消せません。よろしいですか？`,
      )
    ) {
      return;
    }
    clearError();
    await handleClearHistory();
  };

  if (allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        読み込み中…
      </div>
    );
  }

  const loading = itemsLoading || settingsLoading || stateLoading;

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
            <>
              <SimpleRouletteCanvas
                canSpin={canSpin}
                showItemEditor
                items={displayLabels}
                editorItems={editorItems}
                onAddItem={addItem}
                onRemoveItem={removeItem}
                maxItems={maxItems}
                itemsBusy={itemsBusy}
                spinDurationMs={settings.spinDurationMs}
                spinAnimationMs={spinAnimationMs}
                rotationDeg={visualRotation}
                externalSpinning={isSpinning}
                externalResult={resultText}
                onRequestSpin={() => void handleStart()}
                spinDisabled={spinBusy || isFinished}
                remainingCount={
                  settings.showRemainingCount ? remainingCount : null
                }
              />
              {isFinished ? (
                <button
                  type="button"
                  disabled={ackBusy}
                  onClick={() => void handleAcknowledge()}
                  className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-sm font-bold text-[#6D28D9] disabled:opacity-45"
                >
                  次の抽選へ
                </button>
              ) : null}
            </>
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
            {ROULETTE_SPIN_DURATION_MS_OPTIONS.map((ms) => (
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

          <p className="mt-5 text-[11px] font-bold text-[#6B7280]">抽選オプション</p>
          <div className="mt-2 flex flex-col gap-2">
            <OptionToggle
              label="連続同じ結果を防ぐ"
              description="前回と同じ景品が連続で当たらないようにします"
              on={settings.preventSameConsecutive}
              disabled={settingsBusy}
              onToggle={() =>
                void updatePreventSameConsecutive(!settings.preventSameConsecutive)
              }
            />
            <OptionToggle
              label="当選後に景品を除外"
              description="「次の抽選へ」で当選した景品をルーレットから削除します"
              on={settings.removeWinnerAfterSpin}
              disabled={settingsBusy}
              onToggle={() => void updateRemoveWinnerAfterSpin(!settings.removeWinnerAfterSpin)}
            />
            <OptionToggle
              label="等級ラベルを表示"
              description="1等・参加賞などの等級をルーレットと抽選結果に表示します"
              on={settings.showGradeLabels}
              disabled={settingsBusy}
              onToggle={() => void updateShowGradeLabels(!settings.showGradeLabels)}
            />
            <OptionToggle
              label="残り景品数を表示"
              description="ルーレット上に残りの景品種類数を表示します"
              on={settings.showRemainingCount}
              disabled={settingsBusy}
              onToggle={() => void updateShowRemainingCount(!settings.showRemainingCount)}
            />
          </div>
        </section>

        {settings.showGradeLabels ? (
          <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <h2 className="text-sm font-bold text-[#111827]">等級ラベル設定</h2>
            <p className="mt-1 text-[11px] text-[#6B7280]">
              各景品に等級（例: 1等・参加賞）を設定できます
            </p>
            {loading ? (
              <p className="mt-4 text-center text-sm text-[#6B7280]">読み込み中…</p>
            ) : (
              <div className="mt-3">
                <GradeLabelEditor
                  items={displaySorted}
                  busy={itemsBusy}
                  disabled={isSpinning}
                  onSave={updateItemGradeLabel}
                />
              </div>
            )}
          </section>
        ) : null}

        <section className="rounded-[18px] border border-amber-200 bg-amber-50/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
          <h2 className="text-sm font-bold text-[#111827]">運営ツール</h2>
          <p className="mt-1 text-[11px] text-[#6B7280]">
            テストやトラブル時のみ使用してください（参加者画面にも反映されます）
          </p>

          <label className="mt-4 block text-[11px] font-bold text-[#6B7280]">当選景品を指定</label>
          <div className="mt-1 flex gap-2">
            <select
              value={forceItemId}
              onChange={(e) => setForceItemId(e.target.value)}
              disabled={adminToolsDisabled || forceBusy}
              className="h-10 min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 text-sm disabled:opacity-45"
            >
              {displaySorted.map((item) => (
                <option key={item.id} value={item.id}>
                  {rouletteWinnerDisplayText(item.label, item.name, {
                    showGradeLabels: settings.showGradeLabels,
                  })}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={adminToolsDisabled || forceBusy || !forceItemId}
              onClick={() => void onForceWinner()}
              className="shrink-0 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white disabled:opacity-45"
            >
              確定
            </button>
          </div>
          <p className="mt-2 text-[11px] text-amber-800">
            待機中（idle）のときのみ実行できます。回転なしで結果が確定します。
          </p>
        </section>

        {lastError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {lastError}
          </p>
        ) : null}

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#111827]">抽選履歴</h2>
              <p className="mt-1 text-[11px] text-[#6B7280]">直近30件を新しい順に表示します</p>
            </div>
            <button
              type="button"
              disabled={historyLoading || historyRows.length === 0 || clearHistoryBusy}
              onClick={() => void onClearHistory()}
              className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 disabled:opacity-45"
            >
              すべて削除
            </button>
          </div>
          {historyLoading ? (
            <p className="mt-4 text-center text-sm text-[#6B7280]">読み込み中…</p>
          ) : historyRows.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-3 py-6 text-center text-sm text-[#6B7280]">
              まだ抽選履歴はありません
            </p>
          ) : (
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {historyRows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-violet-100 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#111827]">{row.displayText}</p>
                    <p className="mt-0.5 text-[11px] text-[#6B7280]">
                      {spunByLabel[row.spunBy]}が操作
                    </p>
                  </div>
                  <time className="shrink-0 text-[11px] font-medium text-[#9CA3AF]">
                    {row.createdAtText}
                  </time>
                </li>
              ))}
            </ul>
          )}
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
