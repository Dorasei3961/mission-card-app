"use client";

import type { ReactNode } from "react";

type Props = {
  eventId: string;
  children: ReactNode;
};

/** ルーレット画面のラッパー（利用制限なし・子をそのまま表示） */
export function RouletteDevelopmentGate({ children }: Props) {
  return <>{children}</>;
}
