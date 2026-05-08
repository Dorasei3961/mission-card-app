import { RankingClient } from "./ranking-client";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventRankingPage({ params }: PageProps) {
  const { eventId } = await params;
  return <RankingClient eventId={eventId} />;
}

