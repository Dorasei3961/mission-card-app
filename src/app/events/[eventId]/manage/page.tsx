import { Suspense } from "react";
import { ParticipantManageClient } from "./participant-manage-client";

type PageProps = { params: Promise<{ eventId: string }> };

export default async function ParticipantManagePage({ params }: PageProps) {
  const { eventId } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-amber-50 text-sm text-[#6B7280]">
          読み込み中…
        </div>
      }
    >
      <ParticipantManageClient eventId={eventId} />
    </Suspense>
  );
}
