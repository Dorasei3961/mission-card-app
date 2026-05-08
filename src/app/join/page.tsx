"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function JoinEntryPage() {
  const router = useRouter();

  useEffect(() => {
    const query = window.location.search.replace(/^\?/, "");
    router.replace(query ? `/events/join?${query}` : "/events/join");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100">
      <p className="text-sm text-zinc-600">参加画面へ移動中…</p>
    </div>
  );
}

