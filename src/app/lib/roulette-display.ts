type RouletteDisplayOptions = {
  showGradeLabels?: boolean;
};

/** ルーレット扇形内の省略表示（1セグメント1行） */
export function rouletteSegmentDisplayText(
  item: { label: string; name: string },
  segmentCount: number,
  options?: RouletteDisplayOptions,
): string {
  const showGradeLabels = options?.showGradeLabels === true;
  const name = item.name.trim();
  const label = item.label.trim();
  let primary: string;
  if (showGradeLabels && label && name) {
    primary = `${label} ${name}`;
  } else if (showGradeLabels && label) {
    primary = label;
  } else {
    primary = name || label;
  }
  if (!primary) return "—";

  const maxChars =
    segmentCount <= 3 ? 10 : segmentCount <= 5 ? 8 : segmentCount <= 7 ? 6 : 5;
  if (primary.length <= maxChars) return primary;
  return `${primary.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * セグメント中心角（deg）
 * centerAngle = startAngle + segmentAngle / 2
 * conic-gradient(from -90deg) と同一
 */
export function segmentCenterAngleDeg(segmentIndex: number, segmentCount: number): number {
  if (segmentCount <= 0) return 0;
  const segmentAngle = 360 / segmentCount;
  const startAngle = -90 + segmentIndex * segmentAngle;
  return startAngle + segmentAngle / 2;
}

/** 内円と外円の中間: (innerRadius + outerRadius) / 2 */
export function segmentLabelRadiusPx(outerRadiusPx: number, innerHubRadiusPx: number): number {
  return (innerHubRadiusPx + outerRadiusPx) / 2;
}

/** 横向きテキストがくさび内に収まる最大幅（px）— Safari ではみ出し防止のため控えめ */
export function segmentTextMaxWidthPx(segmentCount: number, labelRadiusPx: number): number {
  if (segmentCount <= 0) return 48;
  const segDeg = 360 / segmentCount;
  const halfRad = (segDeg / 2) * (Math.PI / 180);
  const byChord = 2 * labelRadiusPx * Math.sin(halfRad) * 0.55;
  const byTan = 2 * labelRadiusPx * Math.tan(halfRad) * 0.48;
  return Math.max(20, Math.floor(Math.min(byChord, byTan)));
}

function polarToPercent(deg: number, radiusPercent: number): string {
  const rad = (deg * Math.PI) / 180;
  const x = 50 + radiusPercent * Math.cos(rad);
  const y = 50 + radiusPercent * Math.sin(rad);
  return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
}

/**
 * 回転盤ローカル座標の環状扇形 clip（隙間なく円周を埋める）
 * 親要素ごと rotate する前提。隣接セグメントと境界を共有し、サブピクセル隙間はわずかに重ねる。
 */
export function segmentWedgeClipPathLocal(
  segmentIndex: number,
  segmentCount: number,
  innerRadiusPercent: number,
): string {
  if (segmentCount <= 0) return "none";
  const segmentAngle = 360 / segmentCount;
  const startAngle = -90 + segmentIndex * segmentAngle;
  const endAngle = startAngle + segmentAngle;
  const seamOverlapDeg = 0.35;
  const start = startAngle - (segmentIndex === 0 ? 0 : seamOverlapDeg);
  const end = endAngle + (segmentIndex === segmentCount - 1 ? 0 : seamOverlapDeg);
  const inner = Math.max(0, Math.min(45, innerRadiusPercent));
  const outer = 50.2;
  return `polygon(${polarToPercent(start, inner)}, ${polarToPercent(end, inner)}, ${polarToPercent(end, outer)}, ${polarToPercent(start, outer)})`;
}

/** セグメント内ラベル位置（盤ローカル・中心角） */
export function segmentLabelOffsetLocalPx(
  segmentIndex: number,
  segmentCount: number,
  labelRadiusPx: number,
): { x: number; y: number } {
  const angleDeg = segmentCenterAngleDeg(segmentIndex, segmentCount);
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.cos(rad) * labelRadiusPx,
    y: Math.sin(rad) * labelRadiusPx,
  };
}

/**
 * 親の回転を打ち消しつつ横向き維持（扇形と一緒に回るが文字だけ水平）
 */
export function segmentLabelTransformInSlice(
  offsetX: number,
  offsetY: number,
  parentRotationDeg: number,
): string {
  return `rotate(${-parentRotationDeg}deg) translate(${offsetX}px, ${offsetY}px) translate(-50%, -50%)`;
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
  options?: RouletteDisplayOptions,
): string {
  const showGradeLabels = options?.showGradeLabels === true;
  const l = (label ?? "").trim();
  const n = (name ?? "").trim();
  if (!showGradeLabels) return n || l || "—";
  if (l && n) return `${l} ${n}`;
  return n || l || "—";
}
