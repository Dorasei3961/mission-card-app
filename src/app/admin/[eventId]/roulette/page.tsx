import { RouletteDevelopmentGate } from "../../../lib/roulette-development-gate";
import { AdminRouletteClient } from "./admin-roulette-client";

type PageProps = { params: Promise<{ eventId: string }> };

export default async function AdminRoulettePage({ params }: PageProps) {
  const { eventId } = await params;
  return (
    <RouletteDevelopmentGate eventId={eventId}>
      <AdminRouletteClient eventId={eventId} />
    </RouletteDevelopmentGate>
  );
}
