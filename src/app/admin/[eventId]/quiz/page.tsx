import { AdminQuizClient } from "./admin-quiz-client";

type PageProps = { params: Promise<{ eventId: string }> };

export default async function AdminQuizPage({ params }: PageProps) {
  const { eventId } = await params;
  return <AdminQuizClient eventId={eventId} />;
}
