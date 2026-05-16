"use client";

import {
  rouletteSegmentDisplayText,
  segmentLabelOffsetLocalPx,
  segmentLabelTransformInSlice,
  segmentTextMaxWidthPx,
  segmentWedgeClipPathLocal,
} from "../../../lib/roulette-display";
import type { RouletteItemRow } from "../../../lib/roulette-operations";

type Props = {
  item: RouletteItemRow;
  segmentIndex: number;
  segmentCount: number;
  labelRadiusPx: number;
  labelFontSizePx: number;
  clipInnerPercent: number;
  parentRotationDeg: number;
  spinTransition: string;
};

/**
 * 1セグメント = その景品ラベル（色は親の conic-gradient、clip は文字のはみ出し防止のみ）
 */
export function RouletteSegmentSlice({
  item,
  segmentIndex,
  segmentCount,
  labelRadiusPx,
  labelFontSizePx,
  clipInnerPercent,
  parentRotationDeg,
  spinTransition,
}: Props) {
  const clip = segmentWedgeClipPathLocal(segmentIndex, segmentCount, clipInnerPercent);
  const { x, y } = segmentLabelOffsetLocalPx(segmentIndex, segmentCount, labelRadiusPx);
  const labelMaxWidth = segmentTextMaxWidthPx(segmentCount, labelRadiusPx);
  const displayText = rouletteSegmentDisplayText(item, segmentCount);
  const fullTitle = [item.label.trim(), item.name.trim()].filter(Boolean).join(" ");

  return (
    <div
      className="absolute inset-0"
      style={{
        clipPath: clip,
        WebkitClipPath: clip,
      }}
    >
      <div
        className="absolute left-1/2 top-1/2 z-[1] flex items-center justify-center overflow-hidden"
        style={{
          width: labelMaxWidth,
          maxWidth: labelMaxWidth,
          transform: segmentLabelTransformInSlice(x, y, parentRotationDeg),
          transformOrigin: "center center",
          textAlign: "center",
          transition: spinTransition,
        }}
      >
        <span
          title={fullTitle || displayText}
          className="line-clamp-2 block w-full overflow-hidden text-ellipsis text-center font-bold leading-snug text-[#111827]"
          style={{
            fontSize: labelFontSizePx,
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
}
