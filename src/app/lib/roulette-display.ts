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

/** セグメント中心角（deg）。conic-gradient(from -90deg) と同一基準 */
export function segmentCenterAngleDeg(segmentIndex: number, segmentCount: number): number {
  if (segmentCount <= 0) return 0;
  const seg = 360 / segmentCount;
  return -90 + (segmentIndex + 0.5) * seg;
}

/** 色リング（内円〜外円）の扇形重心半径 — 見た目の中央に近づける */
export function segmentLabelRadiusPx(outerRadiusPx: number, innerHubRadiusPx: number): number {
  const r1 = innerHubRadiusPx;
  const r2 = outerRadiusPx;
  if (r2 <= r1) return r1;
  const r1sq = r1 * r1;
  const r2sq = r2 * r2;
  const centroid = ((2 / 3) * (r2 * r2sq - r1 * r1sq)) / (r2sq - r1sq);
  return Math.min(r2 - 6, Math.max(r1 + 10, centroid));
}

/** 横向きテキストがくさび内に収まる最大幅（px） */
export function segmentTextMaxWidthPx(segmentCount: number, labelRadiusPx: number): number {
  if (segmentCount <= 0) return 48;
  const segDeg = 360 / segmentCount;
  const halfRad = (segDeg / 2) * (Math.PI / 180);
  const byChord = 2 * labelRadiusPx * Math.sin(halfRad) * 0.62;
  const byTan = 2 * labelRadiusPx * Math.tan(halfRad) * 0.52;
  return Math.max(22, Math.floor(Math.min(byChord, byTan)));
}

function polarToPercent(deg: number, radiusPercent: number): string {
  const rad = (deg * Math.PI) / 180;
  const x = 50 + radiusPercent * Math.cos(rad);
  const y = 50 + radiusPercent * Math.sin(rad);
  return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
}

/**
 * 環状くさび clip-path（境界線・START 内円を避ける）
 * @param innerRadiusPercent 外周半径に対する内側半径（0〜50）
 */
export function segmentWedgeClipPath(
  segmentIndex: number,
  segmentCount: number,
  wheelRotationDeg: number,
  innerRadiusPercent: number,
): string {
  if (segmentCount <= 0) return "none";
  const seg = 360 / segmentCount;
  const mid = segmentCenterAngleDeg(segmentIndex, segmentCount) + wheelRotationDeg;
  const angularMargin = Math.min(seg * 0.1, 4);
  const start = mid - seg / 2 + angularMargin;
  const end = mid + seg / 2 - angularMargin;
  const inner = Math.max(0, Math.min(45, innerRadiusPercent));
  const outer = 50;
  return `polygon(${polarToPercent(start, inner)}, ${polarToPercent(end, inner)}, ${polarToPercent(end, outer)}, ${polarToPercent(start, outer)})`;
}

/** テキスト中心基準の left / top（rotate なし） */
export function segmentLabelCenterStyle(
  wheelSizePx: number,
  offsetX: number,
  offsetY: number,
): {
  left: string;
  top: string;
  transform: string;
} {
  const cx = wheelSizePx / 2;
  const cy = wheelSizePx / 2;
  return {
    left: `${cx + offsetX}px`,
    top: `${cy + offsetY}px`,
    transform: "translate(-50%, -50%)",
  };
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

/** セグメント数に応じたフォントサイズ（px） */
export function segmentLabelFontSizePx(segmentCount: number): number {
  if (segmentCount <= 3) return 12;
  if (segmentCount <= 5) return 11;
  if (segmentCount <= 7) return 10;
  if (segmentCount <= 9) return 9;
  return 8;
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
