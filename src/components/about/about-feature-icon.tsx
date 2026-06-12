import Image from "next/image";
import { FEATURE_ICON_BY_KIND, type FeatureKind } from "./about-feature-data";

type Props = {
  src: string;
  alt: string;
  size: number;
  className?: string;
};

/** 4機能共通アイコン（public/images/about/* など） */
export function AboutFeatureIcon({ src, alt, size, className = "" }: Props) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      unoptimized={src.endsWith(".svg")}
    />
  );
}

type IconBoxProps = {
  kind: FeatureKind;
  alt: string;
  size?: number;
  boxClassName?: string;
};

/** 背景付きの機能アイコン枠（TOP・イベントホームなど） */
export function FeatureIconBox({
  kind,
  alt,
  size = 32,
  boxClassName = "h-11 w-11",
}: IconBoxProps) {
  const icon = FEATURE_ICON_BY_KIND[kind];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-2xl p-1.5 ${boxClassName}`}
      style={{ backgroundColor: icon.iconBg }}
    >
      <AboutFeatureIcon src={icon.imageSrc} alt={alt} size={size} />
    </span>
  );
}
