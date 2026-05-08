"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = { params: Promise<{ eventId: string }> };

export default function JoinByEventIdPage({ params }: Props) {
  const router = useRouter();

  useEffect(() => {
    void params.then((p) => {
      router.replace(`/events/join?eventId=${encodeURIComponent(p.eventId)}`);
    });
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100">
      <p className="text-sm text-zinc-600">参加画面へ移動中…</p>
    </div>
  );
}

