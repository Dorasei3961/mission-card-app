import { AdminMissionsClient } from "./admin-missions-client";

type PageProps = { params: Promise<{ eventId: string }> };

export default async function AdminMissionsPage({ params }: PageProps) {
  const { eventId } = await params;
  return <AdminMissionsClient eventId={eventId} />;
}
