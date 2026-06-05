"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ROULETTE_SEGMENT_COLORS } from "@/app/lib/roulette-schema";

const DEFAULT_ITEMS = ["景品A", "景品B", "景品C", "景品D", "景品E", "景品F"];
const SPIN_DURATION_MS = 4000;
const MIN_FULL_SPINS = 5;
const MAX_ITEMS = 12;
const MIN_CANVAS = 220;
const MAX_CANVAS = 320;

type EditorItem = { id: string; label: string };

type Props = {
  canSpin: boolean;
  className?: string;
  showItemEditor?: boolean;
  /** Firestore同期済みの表示ラベル（未指定時はローカル初期値） */
  items?: string[];
  editorItems?: EditorItem[];
  onAddItem?: (name: string) => void | Promise<void>;
  onRemoveItem?: (id: string) => void | Promise<void>;
  maxItems?: number;
  itemsBusy?: boolean;
  /** 回転時間（ミリ秒）。未指定時は4000 */
  spinDurationMs?: number;
};

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 当選セグメント中心が上向き矢印位置に来る角度を返す。 */
function targetRotationForWinner(index: number, count: number): number {
  const seg = 360 / count;
  const center = index * seg + seg / 2 - 90;
  return normalizeDeg(-90 - center);
}

function computeSpinEnd(from: number, targetMod: number): number {
  const currentMod = normalizeDeg(from);
  let diff = normalizeDeg(targetMod - currentMod);
  if (diff === 0) diff = 360;
  return from + MIN_FULL_SPINS * 360 + diff;
}

function drawWheel(
  ctx: CanvasRenderingContext2D,
  size: number,
  items: string[],
  rotationDeg: number,
) {
  const dpr = window.devicePixelRatio || 1;
  const width = size * dpr;
  const height = size * dpr;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 4;
  const n = items.length;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotationDeg * Math.PI) / 180);

  if (n === 0) {
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2);
    ctx.fillStyle = "#E5E7EB";
    ctx.fill();
  } else {
    const segRad = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const start = i * segRad - Math.PI / 2;
      const end = start + segRad;
      const mid = start + segRad / 2;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, outer, start, end);
      ctx.closePath();
      ctx.fillStyle = ROULETTE_SEGMENT_COLORS[i % ROULETTE_SEGMENT_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const r = outer * 0.64;
      ctx.save();
      ctx.translate(Math.cos(mid) * r, Math.sin(mid) * r);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = "#1F2937";
      const fontSize =
        n <= 6 ? 13 : n <= 8 ? 11 : n <= 10 ? 10 : n <= 12 ? 9 : 8;
      const maxChars = n <= 6 ? 8 : n <= 8 ? 6 : n <= 10 ? 5 : 4;
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = items[i] ?? "";
      const display =
        label.length > maxChars ? `${label.slice(0, Math.max(1, maxChars - 1))}…` : label;
      ctx.fillText(display, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.strokeStyle = "#7C3AED";
  ctx.lineWidth = 4;
  ctx.stroke();

  const hubR = size * 0.14;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fillStyle = "#7C3AED";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 ${Math.max(10, Math.min(12, size / 27))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("START", cx, cy);
  ctx.restore();
}

export function SimpleRouletteCanvas({
  canSpin,
  className,
  showItemEditor = false,
  items: externalItems,
  editorItems,
  onAddItem,
  onRemoveItem,
  maxItems = MAX_ITEMS,
  itemsBusy = false,
  spinDurationMs = SPIN_DURATION_MS,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const rotationRef = useRef(0);

  const [items, setItems] = useState<string[]>(DEFAULT_ITEMS);
  const [newItem, setNewItem] = useState("");
  const [size, setSize] = useState(280);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [showFlash, setShowFlash] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);

  const sourceItems = externalItems ?? items;

  const cleanItems = useMemo(
    () => sourceItems.map((x) => x.trim()).filter((x) => x.length > 0),
    [sourceItems],
  );

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const next = Math.max(MIN_CANVAS, Math.min(MAX_CANVAS, Math.floor(el.clientWidth)));
    setSize((prev) => (prev === next ? prev : next));
  }, []);

  const paint = useCallback(
    (deg: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawWheel(ctx, size, cleanItems, deg);
    },
    [cleanItems, size],
  );

  useEffect(() => {
    measure();
    const target = containerRef.current;
    if (!target) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(target);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    paint(rotation);
  }, [rotation, paint]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!showFlash) return;
    const id = window.setTimeout(() => setShowFlash(false), 260);
    return () => clearTimeout(id);
  }, [showFlash]);

  useEffect(() => {
    if (!showConfetti) return;
    const id = window.setTimeout(() => setShowConfetti(false), 1800);
    return () => clearTimeout(id);
  }, [showConfetti]);

  useEffect(() => {
    if (!result) {
      setResultVisible(false);
      return;
    }
    const id = window.setTimeout(() => setResultVisible(true), 30);
    return () => clearTimeout(id);
  }, [result]);

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    if (cleanItems.length >= maxItems) return;
    if (onAddItem) {
      void onAddItem(trimmed);
      setNewItem("");
      return;
    }
    setItems((prev) => [...prev, trimmed]);
    setNewItem("");
  };

  const removeItem = (index: number, id?: string) => {
    if (isSpinning) return;
    if (onRemoveItem && id) {
      void onRemoveItem(id);
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const onSpin = () => {
    if (!canSpin || isSpinning || cleanItems.length === 0) return;
    const winnerIndex = Math.floor(Math.random() * cleanItems.length);
    const winner = cleanItems[winnerIndex] ?? "";
    const targetMod = targetRotationForWinner(winnerIndex, cleanItems.length);
    const startRot = rotationRef.current;
    const endRot = computeSpinEnd(startRot, targetMod);
    const startTime = performance.now();

    setIsSpinning(true);
    setResult(null);
    setResultVisible(false);

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / spinDurationMs);
      const eased = easeOutCubic(t);
      const current = startRot + (endRot - startRot) * eased;
      rotationRef.current = current;
      setRotation(current);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      rotationRef.current = endRot;
      setRotation(endRot);
      setIsSpinning(false);
      setResult(winner);
      setShowFlash(true);
      setShowConfetti(true);
      rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <div className={className}>
      {showItemEditor ? (
        <section className="rounded-2xl border border-[#E9D5FF] bg-violet-50/50 p-3">
          <p className="text-xs font-bold text-[#6D28D9]">項目管理（最大12件）</p>
          <div className="mt-2 flex gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="景品名を入力"
              className="h-10 flex-1 rounded-xl border border-violet-200 bg-white px-3 text-sm"
            />
            <button
              type="button"
              onClick={addItem}
              disabled={cleanItems.length >= maxItems || itemsBusy}
              className="rounded-xl bg-[#7C3AED] px-4 text-sm font-bold text-white disabled:opacity-45"
            >
              追加
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(editorItems ?? cleanItems.map((label, idx) => ({ id: String(idx), label }))).map(
              (item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => removeItem(idx, item.id)}
                disabled={itemsBusy || isSpinning}
                className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-[#6D28D9] disabled:opacity-45"
              >
                {item.label} ×
              </button>
            ),
            )}
          </div>
        </section>
      ) : null}

      <div ref={containerRef} className="relative mx-auto mt-4 w-full max-w-[320px]">
        {showFlash ? (
          <div className="pointer-events-none absolute inset-0 z-20 rounded-full bg-white/70 animate-pulse" />
        ) : null}
        {showConfetti ? (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-full">
            {Array.from({ length: 28 }).map((_, i) => (
              <span
                key={`confetti-${i}`}
                className="absolute h-2 w-1.5 animate-[fall_1.8s_ease-out_forwards]"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${-8 - Math.random() * 22}%`,
                  backgroundColor: ROULETTE_SEGMENT_COLORS[i % ROULETTE_SEGMENT_COLORS.length],
                  transform: `rotate(${Math.random() * 360}deg)`,
                  animationDelay: `${Math.random() * 220}ms`,
                }}
              />
            ))}
          </div>
        ) : null}
        <div className="pointer-events-none absolute left-1/2 top-[4px] z-10 -translate-x-1/2" aria-hidden>
          <div
            className="h-0 w-0 border-x-[11px] border-x-transparent border-t-[18px] border-t-[#7C3AED]"
            style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.2))" }}
          />
        </div>
        <canvas
          ref={canvasRef}
          className="mx-auto block max-w-full touch-manipulation"
          role="img"
          aria-label="ルーレット"
        />
      </div>

      {cleanItems.length === 0 ? (
        <p className="mt-4 text-center text-sm font-semibold text-[#EF4444]">項目を追加してください</p>
      ) : null}

      <div className="mt-5">
        {canSpin ? (
          <button
            type="button"
            onClick={onSpin}
            disabled={isSpinning || cleanItems.length === 0}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#9333EA] text-lg font-black text-white shadow-[0_8px_24px_rgba(124,58,237,0.35)] disabled:opacity-45 touch-manipulation"
          >
            START
          </button>
        ) : (
          <p className="text-center text-xs font-semibold text-[#6B7280]">運営の抽選開始をお待ちください</p>
        )}
      </div>

      {isSpinning ? (
        <p className="mt-4 text-center text-sm font-bold text-[#6D28D9]">抽選中...</p>
      ) : null}

      {result ? (
        <div
          className={`mt-4 rounded-2xl border border-violet-100 bg-white px-4 py-4 text-center shadow-[0_8px_24px_rgba(124,58,237,0.18)] transition-all duration-500 ${
            resultVisible ? "scale-100 opacity-100" : "scale-90 opacity-0"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-[#A78BFA]">抽選結果</p>
          <p className="mt-2 text-xl font-black text-[#6D28D9]">結果：{result}</p>
        </div>
      ) : null}

      <style jsx>{`
        @keyframes fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(260px) rotate(240deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
