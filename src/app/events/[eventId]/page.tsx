import { EventMissions } from "./event-missions";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventPage({ params }: PageProps) {
  const { eventId } = await params;
  return <EventMissions eventId={eventId} />;
}
