"use client";

import { useMemo } from "react";
import { ROULETTE_SEGMENT_COLORS } from "../../../lib/roulette-schema";
import type { RouletteItemRow } from "../../../lib/roulette-operations";

function shortLabel(s: string, max = 5): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

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
  const n = activeItems.length;
  const seg = n > 0 ? 360 / n : 360;

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
      <div
        className="relative h-[272px] w-[272px] rounded-full border-[4px] border-[#7C3AED] shadow-[0_8px_24px_rgba(0,0,0,0.08)] will-change-transform"
        style={{
          transform: `rotate(${rotationDeg}deg)`,
          transition: transitionMs > 0 ? `transform ${transitionMs}ms ${transitionEasing}` : "none",
          background: gradient,
        }}
      >
        {activeItems.map((item, i) => {
          const mid = -90 + (i + 0.5) * seg;
          const rad = (mid * Math.PI) / 180;
          const r = 108;
          const x = Math.cos(rad) * r;
          const y = Math.sin(rad) * r;
          return (
            <div
              key={item.id}
              className="absolute left-1/2 top-1/2 z-[1] w-[72px] text-center text-[10px] font-bold leading-tight text-[#111827]"
              style={{
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${mid + 90}deg)`,
              }}
            >
              {shortLabel(`${item.label}`, 4)}
              <br />
              <span className="font-semibold text-[9px] opacity-90">{shortLabel(item.name, 5)}</span>
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#7C3AED] shadow-[0_4px_14px_rgba(124,58,237,0.45)] ring-4 ring-white/90">
          <span className="max-w-[68px] text-center text-xs font-black leading-tight text-white">
            {centerText}
          </span>
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
