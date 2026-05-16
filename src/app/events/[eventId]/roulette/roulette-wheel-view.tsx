"use client";

import { useMemo } from "react";
import { ROULETTE_SEGMENT_COLORS } from "../../../lib/roulette-schema";
import {
  rouletteSegmentDisplayText,
  segmentLabelCenterStyle,
  segmentLabelFontSizePx,
  segmentLabelOffsetPx,
  segmentLabelRadiusPx,
  segmentTextMaxWidthPx,
  segmentWedgeClipPath,
} from "../../../lib/roulette-display";
import type { RouletteItemRow } from "../../../lib/roulette-operations";

const WHEEL_PX = 272;
const WHEEL_BORDER_PX = 4;
const HUB_PX = 76;

export function RouletteWheelView({
  activeItems,
  rotationDeg,
  transitionMs,
  transitionEasing,
  centerText,
}: {
  activeItems: RouletteItemRow[];
  rotationDeg: number;
  transitionMs: number;
  transitionEasing: string;
  centerText: string;
}) {
  const segments = useMemo(() => {
    const seen = new Set<string>();
    return activeItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [activeItems]);

  const n = segments.length;
  const seg = n > 0 ? 360 / n : 360;
  const outerRadius = WHEEL_PX / 2 - WHEEL_BORDER_PX;
  const innerHubRadius = HUB_PX / 2;
  const labelRadius = segmentLabelRadiusPx(outerRadius, innerHubRadius);
  const labelMaxWidth = segmentTextMaxWidthPx(n, labelRadius);
  const labelFontSize = segmentLabelFontSizePx(n);
  /** 内円端を clip 内径に（外周半径比で % 化） */
  const clipInnerPercent = (innerHubRadius / outerRadius) * 50;
  const labelTransition =
    transitionMs > 0
      ? `left ${transitionMs}ms ${transitionEasing}, top ${transitionMs}ms ${transitionEasing}`
      : "none";

  const gradient = useMemo(() => {
    if (n === 0) return "conic-gradient(from -90deg, #E5E7EB 0deg 360deg)";
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const start = i * seg;
      const end = (i + 1) * seg;
      const c = ROULETTE_SEGMENT_COLORS[i % ROULETTE_SEGMENT_COLORS.length];
      parts.push(`${c} ${start}deg ${end}deg`);
    }
    return `conic-gradient(from -90deg, ${parts.join(", ")})`;
  }, [n, seg]);

  return (
    <div className="relative mx-auto flex h-[280px] w-[280px] shrink-0 items-center justify-center">
      <div
        className="pointer-events-none absolute -top-2 left-1/2 z-20 -translate-x-1/2"
        aria-hidden
      >
        <div
          className="h-0 w-0 border-x-[10px] border-x-transparent border-b-[16px] border-b-[#7C3AED]"
          style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.15))" }}
        />
      </div>

      <div className="relative h-[272px] w-[272px]">
        <div
          className="absolute inset-0 rounded-full border-[4px] border-[#7C3AED] shadow-[0_8px_24px_rgba(0,0,0,0.08)] will-change-transform"
          style={{
            transform: `rotate(${rotationDeg}deg)`,
            transition:
              transitionMs > 0 ? `transform ${transitionMs}ms ${transitionEasing}` : "none",
            background: gradient,
          }}
        />

        <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-full">
          {segments.map((item, i) => {
            const { x, y } = segmentLabelOffsetPx(i, n, rotationDeg, labelRadius);
            const pos = segmentLabelCenterStyle(WHEEL_PX, x, y);
            const clip = segmentWedgeClipPath(i, n, rotationDeg, clipInnerPercent);
            const displayText = rouletteSegmentDisplayText(item, n);
            const fullTitle = [item.label.trim(), item.name.trim()].filter(Boolean).join(" ");

            return (
              <div
                key={item.id}
                className="absolute inset-0"
                style={{
                  clipPath: clip,
                  WebkitClipPath: clip,
                }}
              >
                <div
                  className="absolute box-border"
                  style={{
                    ...pos,
                    maxWidth: labelMaxWidth,
                    width: "max-content",
                    transition: labelTransition,
                    textAlign: "center",
                  }}
                >
                  <span
                    title={fullTitle || displayText}
                    className="line-clamp-2 block overflow-hidden text-ellipsis text-center font-bold leading-snug text-[#111827]"
                    style={{
                      fontSize: labelFontSize,
                      maxWidth: labelMaxWidth,
                      wordBreak: "keep-all",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {displayText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#7C3AED] shadow-[0_4px_14px_rgba(124,58,237,0.45)] ring-4 ring-white/90">
            <span className="max-w-[68px] overflow-hidden text-ellipsis whitespace-nowrap text-center text-xs font-black leading-tight text-white">
              {centerText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null;
  const emojis = ["✨", "🎉", "✨", "🎊", "⭐", "🎊", "✨", "🎉"];
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex justify-center gap-3 overflow-hidden rounded-[18px] pt-3">
      {emojis.map((e, i) => (
        <span
          key={i}
          className="animate-bounce text-2xl"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          {e}
        </span>
      ))}
    </div>
  );
}
