import { Suspense } from "react";
import { EventMissions } from "./event-missions";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventPage({ params }: PageProps) {
  const { eventId } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-4 text-sm text-zinc-600">
          読み込み中…
        </div>
      }
    >
      <EventMissions eventId={eventId} />
    </Suspense>
  );
}
