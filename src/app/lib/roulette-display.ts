/** ルーレット扇形内の省略表示（1セグメント1行） */
export function rouletteSegmentDisplayText(
  item: { label: string; name: string },
  segmentCount: number,
): string {
  const name = item.name.trim();
  const label = item.label.trim();
  const primary = name || label;
  if (!primary) return "—";

  const maxChars =
    segmentCount <= 3 ? 10 : segmentCount <= 5 ? 8 : segmentCount <= 7 ? 6 : 5;
  if (primary.length <= maxChars) return primary;
  return `${primary.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** 扇形の弦長に合わせたラベル最大幅（px） */
export function segmentTextMaxWidthPx(segmentCount: number): number {
  if (segmentCount <= 0) return 48;
  const segDeg = 360 / segmentCount;
  const halfRad = (segDeg / 2) * (Math.PI / 180);
  const labelRadius = 100;
  return Math.max(36, Math.floor(2 * labelRadius * Math.sin(halfRad) * 0.9));
}

/** 当選後の正式表示（例: 2等 Amazonギフト券 1,000円分） */
export function rouletteWinnerDisplayText(
  label: string | null | undefined,
  name: string | null | undefined,
): string {
  const l = (label ?? "").trim();
  const n = (name ?? "").trim();
  if (l && n) return `${l} ${n}`;
  return n || l || "—";
}
