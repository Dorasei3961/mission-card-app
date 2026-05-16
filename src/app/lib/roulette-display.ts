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

/** 中心〜外周の中間付近（扇形の径方向中央） */
export function segmentLabelRadiusPx(outerRadiusPx: number, innerHubRadiusPx: number): number {
  const usable = Math.max(0, outerRadiusPx - innerHubRadiusPx);
  return innerHubRadiusPx + usable * 0.5;
}

/** 扇形の弦長に合わせたラベル最大幅（px）— 境界線から余白を確保 */
export function segmentTextMaxWidthPx(segmentCount: number, labelRadiusPx: number): number {
  if (segmentCount <= 0) return 48;
  const segDeg = 360 / segmentCount;
  const halfRad = (segDeg / 2) * (Math.PI / 180);
  return Math.max(28, Math.floor(2 * labelRadiusPx * Math.sin(halfRad) * 0.7));
}

/** セグメント数に応じたフォントサイズ（px） */
export function segmentLabelFontSizePx(segmentCount: number): number {
  if (segmentCount <= 3) return 12;
  if (segmentCount <= 5) return 11;
  if (segmentCount <= 7) return 10;
  if (segmentCount <= 9) return 9;
  return 8;
}

/** 盤面回転を反映したラベル座標（水平表示・rotate なし） */
export function segmentLabelOffsetPx(
  segmentIndex: number,
  segmentCount: number,
  wheelRotationDeg: number,
  labelRadiusPx: number,
): { x: number; y: number } {
  const angleDeg = segmentCenterAngleDeg(segmentIndex, segmentCount) + wheelRotationDeg;
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.cos(rad) * labelRadiusPx,
    y: Math.sin(rad) * labelRadiusPx,
  };
}

/** セグメント中心角（deg）。conic-gradient(from -90deg) と同一基準 */
export function segmentCenterAngleDeg(segmentIndex: number, segmentCount: number): number {
  if (segmentCount <= 0) return 0;
  const seg = 360 / segmentCount;
  return -90 + (segmentIndex + 0.5) * seg;
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
