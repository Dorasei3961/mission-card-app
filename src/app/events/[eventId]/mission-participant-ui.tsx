"use client";

import { Check } from "lucide-react";
import type { MissionFields } from "../../lib/mission-schema";

export type MissionFilterTab = "all" | "incomplete" | "complete";

export const MISSION_PAGE_BG = "min-h-screen bg-[#FAF7FF]";

type Accent = {
  main: string;
  light: string;
  border: string;
};

export function missionAccent(categoryColor: string): Accent {
  if (categoryColor === "bonus") {
    return {
      main: "#F59E0B",
      light: "rgba(245, 158, 11, 0.14)",
      border: "rgba(245, 158, 11, 0.35)",
    };
  }
  if (categoryColor === "custom") {
    return {
      main: "#0EA5E9",
      light: "rgba(14, 165, 233, 0.14)",
      border: "rgba(14, 165, 233, 0.35)",
    };
  }
  return {
    main: "#7C3AED",
    light: "rgba(124, 58, 237, 0.12)",
    border: "rgba(124, 58, 237, 0.28)",
  };
}

export function missionEmoji(mission: MissionFields): string {
  if (mission.categoryColor === "bonus") return "⭐";
  if (mission.category === "social" || mission.title.includes("交流")) return "🔥";
  return "🎯";
}

/** 数量型ミッションの達成に必要な回数 */
export function missionRequiredCount(mission: MissionFields): number {
  if (mission.type !== "number") return 1;
  const n = mission.requiredCount;
  return typeof n === "number" && n > 0 ? Math.floor(n) : 1;
}

/** 達成判定（チェック型のみ。数量型はカウント記録専用で常に未達成扱い） */
export function isMissionCompleted(
  mission: MissionFields,
  checkedMissionIds: number[],
  _numberValues: Record<number, number>,
): boolean {
  if (mission.type === "checkbox") {
    return checkedMissionIds.includes(mission.id);
  }
  return false;
}

export function missionProgressRatio(
  mission: MissionFields,
  checkedMissionIds: number[],
  numberValues: Record<number, number>,
): { current: number; max: number } {
  if (mission.type === "checkbox") {
    const done = checkedMissionIds.includes(mission.id) ? 1 : 0;
    return { current: done, max: 1 };
  }
  const count = Math.max(0, Math.floor(numberValues[mission.id] ?? 0));
  return { current: count, max: missionRequiredCount(mission) };
}

export function maxEarnablePoints(missions: MissionFields[]): number {
  let sum = 0;
  for (const m of missions) {
    if (m.type === "checkbox") sum += m.points;
    else sum += m.pointPerUnit * missionRequiredCount(m);
  }
  return sum;
}

type MissionPageHeaderProps = {
  eventTitle: string;
  isClosed: boolean;
};

export function MissionPageHeader({ eventTitle, isClosed }: MissionPageHeaderProps) {
  return (
    <header>
      <h1 className="text-4xl font-black tracking-tight text-[#111827]">ミッション</h1>
      <p className="mt-1 text-sm text-gray-400">達成してポイントをゲットしよう</p>
      {eventTitle ? (
        <p className="mt-2 truncate text-xs font-semibold text-[#7C3AED]/80">{eventTitle}</p>
      ) : null}
      {isClosed ? (
        <p className="mt-2 text-xs font-bold text-[#EF4444]">このイベントは終了しました（閲覧のみ）</p>
      ) : null}
    </header>
  );
}

type MissionSummaryBannerProps = {
  totalPoints: number;
  completedCount: number;
  totalCount: number;
};

export function MissionSummaryBanner({
  totalPoints,
  completedCount,
  totalCount,
}: MissionSummaryBannerProps) {
  return (
    <section
      className="rounded-3xl px-6 py-5 text-white shadow-lg"
      style={{
        background: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)",
      }}
    >
      <div className="grid grid-cols-2 items-end gap-4">
        <div>
          <p className="text-xs opacity-80">現在の合計</p>
          <p className="mt-1 text-5xl font-black tabular-nums leading-none">
            {totalPoints.toLocaleString("ja-JP")}
            <span className="ml-1 text-2xl font-black">pt</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-5xl font-black tabular-nums leading-none">
            {completedCount}
            <span className="text-3xl font-black opacity-90">/{totalCount}</span>
          </p>
          <p className="mt-0.5 text-xs font-semibold opacity-80">完了</p>
        </div>
      </div>
    </section>
  );
}

type MissionFilterTabsProps = {
  active: MissionFilterTab;
  counts: { all: number; incomplete: number; complete: number };
  onChange: (tab: MissionFilterTab) => void;
};

export function MissionFilterTabs({ active, counts, onChange }: MissionFilterTabsProps) {
  const tabs: { id: MissionFilterTab; label: string }[] = [
    { id: "all", label: "すべて" },
    { id: "incomplete", label: "未達成" },
    { id: "complete", label: "達成済み" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        const count = counts[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-all touch-manipulation ${
              isActive
                ? "bg-[#7C3AED] text-white shadow-md"
                : "bg-[#EDE9FE] text-[#7C3AED]"
            }`}
          >
            {tab.label}
            <span
              className={`flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                isActive ? "bg-white/25 text-white" : "bg-[#7C3AED]/10 text-[#7C3AED]"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MissionProgressBar({
  current,
  max,
  accentMain,
}: {
  current: number;
  max: number;
  accentMain: string;
}) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: accentMain }}
        />
      </div>
      <span className="shrink-0 text-xs font-bold tabular-nums text-gray-500">
        {current}/{max}
      </span>
    </div>
  );
}

type MissionCardProps = {
  mission: MissionFields;
  completed: boolean;
  checkedMissionIds: number[];
  numberValues: Record<number, number>;
  disabled: boolean;
  onToggleCheck: (missionId: number) => void;
  onDecrement: (missionId: number) => void;
  onIncrement: (missionId: number) => void;
};

export function MissionCard({
  mission,
  completed,
  checkedMissionIds,
  numberValues,
  disabled,
  onToggleCheck,
  onDecrement,
  onIncrement,
}: MissionCardProps) {
  const accent = missionAccent(mission.categoryColor);
  const emoji = missionEmoji(mission);
  const { current, max } = missionProgressRatio(mission, checkedMissionIds, numberValues);
  const isChecked = mission.type === "checkbox" && checkedMissionIds.includes(mission.id);
  const count =
    mission.type === "number" ? Math.max(0, Math.floor(numberValues[mission.id] ?? 0)) : 0;

  return (
    <article
      className={`relative overflow-hidden rounded-[32px] border bg-white p-5 shadow-sm transition-all ${
        completed ? "" : "border-gray-100"
      }`}
      style={
        completed
          ? {
              borderColor: accent.border,
              boxShadow: `0 4px 24px ${accent.light}`,
            }
          : undefined
      }
    >
      {completed ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: accent.light }}
          aria-hidden
        />
      ) : null}

      <div className="relative">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
            style={{ backgroundColor: accent.light }}
            aria-hidden
          >
            {emoji}
          </span>

          <div className="min-w-0 flex-1 pr-2">
            <h3 className="text-xl font-bold leading-snug text-gray-900">{mission.title}</h3>
            {mission.description.trim() ? (
              <p className="mt-1 line-clamp-2 text-sm text-gray-400">{mission.description}</p>
            ) : null}
          </div>

          {mission.type === "checkbox" ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              aria-label={
                isChecked
                  ? `${mission.title}の達成を取り消す`
                  : `${mission.title}を達成済みにする`
              }
              disabled={disabled}
              onClick={() => onToggleCheck(mission.id)}
              className="relative z-[1] flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-50"
              style={
                isChecked
                  ? { backgroundColor: accent.main, borderColor: accent.main }
                  : { backgroundColor: "#fff", borderColor: "#D1D5DB" }
              }
            >
              {isChecked ? <Check className="h-5 w-5 text-white" strokeWidth={3} /> : null}
            </button>
          ) : (
            <p className="shrink-0 text-right text-lg font-black leading-none text-[#F59E0B]">
              +{mission.pointPerUnit}
              <span className="text-xs font-bold">pt/回</span>
            </p>
          )}
        </div>

        {mission.type === "checkbox" ? (
          <p className="mt-4 text-2xl font-black text-[#F59E0B]">+{mission.points} pt</p>
        ) : null}

        <MissionProgressBar current={current} max={max} accentMain={accent.main} />

        {mission.type === "number" ? (
          <div className="mt-5 flex items-center justify-center gap-5">
            <button
              type="button"
              disabled={disabled || count === 0}
              aria-label={`${mission.title}の数量を1減らす`}
              onClick={() => onDecrement(mission.id)}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-3xl font-black text-gray-700 transition active:scale-95 disabled:opacity-40 touch-manipulation"
            >
              −
            </button>
            <span
              className="min-w-[3rem] text-center text-5xl font-black tabular-nums text-gray-900"
              aria-live="polite"
            >
              {count}
            </span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`${mission.title}の数量を1増やす`}
              onClick={() => onIncrement(mission.id)}
              className="flex h-16 w-16 items-center justify-center rounded-full text-3xl font-black text-white shadow-md transition active:scale-95 disabled:opacity-50 touch-manipulation"
              style={{ backgroundColor: accent.main }}
            >
              ＋
            </button>
          </div>
        ) : null}

        {mission.type === "number" ? (
          <p className="mt-3 text-center text-sm font-bold text-[#22C55E]">
            +{count * mission.pointPerUnit} pt
          </p>
        ) : null}
      </div>
    </article>
  );
}
