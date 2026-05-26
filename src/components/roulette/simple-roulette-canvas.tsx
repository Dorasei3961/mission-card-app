"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ROULETTE_SEGMENT_COLORS } from "@/app/lib/roulette-schema";

/** 復活版ルーレットの初期項目 */
export const DEFAULT_SIMPLE_ROULETTE_LABELS = [
  "景品A",
  "景品B",
  "景品C",
  "景品D",
  "景品E",
  "景品F",
] as const;

const SPIN_DURATION_MS = 4200;
const MIN_FULL_SPINS = 5;
const MAX_CANVAS_PX = 300;
const WHEEL_BORDER_PX = 4;

type Props = {
  items?: readonly string[];
  className?: string;
};

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** 当選セグメントの中心がポインタ（上端）に来る回転角（mod 360） */
function rotationModForWinner(winnerIndex: number, segmentCount: number): number {
  const segDeg = 360 / segmentCount;
  const centerDeg = winnerIndex * segDeg + segDeg / 2 - 90;
  return normalizeDeg(-90 - centerDeg);
}

function computeEndRotation(currentDeg: number, targetMod: number, minFullSpins: number): number {
  const curMod = normalizeDeg(currentDeg);
  let extra = normalizeDeg(targetMod - curMod);
  if (extra === 0) extra = 360;
  return currentDeg + minFullSpins * 360 + extra;
}

function drawWheel(
  ctx: CanvasRenderingContext2D,
  size: number,
  labels: readonly string[],
  rotationDeg: number,
) {
  const dpr = window.devicePixelRatio || 1;
  const px = size;
  ctx.clearRect(0, 0, px * dpr, px * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);

  const cx = px / 2;
  const cy = px / 2;
  const outerR = px / 2 - WHEEL_BORDER_PX;
  const n = labels.length;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotationDeg * Math.PI) / 180);

  if (n === 0) {
    ctx.beginPath();
    ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    ctx.fillStyle = "#E5E7EB";
    ctx.fill();
  } else {
    const segRad = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const start = i * segRad - Math.PI / 2;
      const end = start + segRad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, outerR, start, end);
      ctx.closePath();
      ctx.fillStyle = ROULETTE_SEGMENT_COLORS[i % ROULETTE_SEGMENT_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const mid = start + segRad / 2;
      const textR = outerR * 0.62;
      const tx = Math.cos(mid) * textR;
      const ty = Math.sin(mid) * textR;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = "#1F2937";
      ctx.font = `bold ${Math.max(11, Math.min(14, px / 22))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = labels[i] ?? "";
      ctx.fillText(label.length > 8 ? `${label.slice(0, 7)}…` : label, 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = "#7C3AED";
  ctx.lineWidth = WHEEL_BORDER_PX;
  ctx.stroke();

  const hubR = px * 0.14;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fillStyle = "#7C3AED";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${Math.max(10, Math.min(12, px / 26))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("GO", cx, cy);

  ctx.restore();
}

export function SimpleRouletteCanvas({ items = DEFAULT_SIMPLE_ROULETTE_LABELS, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [canvasSize, setCanvasSize] = useState(280);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const labels = items.length > 0 ? items : DEFAULT_SIMPLE_ROULETTE_LABELS;

  const measureSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const next = Math.max(200, Math.min(MAX_CANVAS_PX, Math.floor(w)));
    setCanvasSize((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    measureSize();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureSize]);

  const paint = useCallback(
    (rotationDeg: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvasSize * dpr);
      canvas.height = Math.floor(canvasSize * dpr);
      canvas.style.width = `${canvasSize}px`;
      canvas.style.height = `${canvasSize}px`;
      drawWheel(ctx, canvasSize, labels, rotationDeg);
    },
    [canvasSize, labels],
  );

  useEffect(() => {
    paint(rotationRef.current);
  }, [paint]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleSpin = () => {
    if (spinning || labels.length === 0) return;

    const winnerIndex = Math.floor(Math.random() * labels.length);
    const targetMod = rotationModForWinner(winnerIndex, labels.length);
    const startRot = rotationRef.current;
    const endRot = computeEndRotation(startRot, targetMod, MIN_FULL_SPINS);
    const startTime = performance.now();

    setSpinning(true);
    setResult(null);

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / SPIN_DURATION_MS);
      const eased = easeOutCubic(t);
      const current = startRot + (endRot - startRot) * eased;
      rotationRef.current = current;
      paint(current);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rotationRef.current = endRot;
        paint(endRot);
        const winner = labels[winnerIndex] ?? "";
        setResult(winner);
        setSpinning(false);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <div className={className}>
      <div ref={containerRef} className="relative mx-auto w-full max-w-[300px]">
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2"
          aria-hidden
        >
          <div
            className="h-0 w-0 border-x-[10px] border-x-transparent border-b-[16px] border-b-[#7C3AED]"
            style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.15))" }}
          />
        </div>
        <canvas
          ref={canvasRef}
          className="mx-auto block max-w-full touch-manipulation"
          role="img"
          aria-label="ルーレット"
        />
      </div>

      <button
        type="button"
        disabled={spinning}
        onClick={handleSpin}
        className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#9333EA] text-base font-bold text-white shadow-[0_8px_24px_rgba(124,58,237,0.35)] disabled:opacity-45 touch-manipulation"
      >
        {spinning ? "回転中…" : "回す"}
      </button>

      {result ? (
        <div
          className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-4 text-center"
          role="status"
          aria-live="polite"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-[#A78BFA]">結果</p>
          <p className="mt-2 text-xl font-black text-[#6D28D9]">{result}</p>
          <p className="mt-1 text-sm font-medium text-[#6B7280]">おめでとうございます！</p>
        </div>
      ) : (
        <p className="mt-6 text-center text-xs font-medium text-[#9CA3AF]">
          「回す」を押して抽選してください
        </p>
      )}
    </div>
  );
}
