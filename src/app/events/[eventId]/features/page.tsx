import { EventFeaturesClient } from "./features-client";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventFeaturesPage({ params }: PageProps) {
  const { eventId } = await params;
  return <EventFeaturesClient eventId={eventId} />;
}
