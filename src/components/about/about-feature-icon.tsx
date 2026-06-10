import Image from "next/image";

type Props = {
  src: string;
  alt: string;
  size: number;
  className?: string;
};

/** サービス紹介ページの機能アイコン（public/about/*.svg など） */
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
