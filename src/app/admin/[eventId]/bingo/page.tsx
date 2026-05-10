import { AdminBingoClient } from "./admin-bingo-client";

type PageProps = { params: Promise<{ eventId: string }> };

export default async function AdminBingoPage({ params }: PageProps) {
  const { eventId } = await params;
  return <AdminBingoClient eventId={eventId} />;
}
