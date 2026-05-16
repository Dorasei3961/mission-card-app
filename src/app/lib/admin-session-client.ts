import { auth } from "./firebase";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("認証されていません。ページを再読み込みしてください。");
  }
  return user.getIdToken();
}

/** 運営PIN成功後に Firestore 上の adminSessions を発行する */
export async function grantEventAdminSession(eventId: string, pin: string): Promise<void> {
  const token = await getIdToken();
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/admin-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pin }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "運営セッションの作成に失敗しました。");
  }
}

/** localStorage の PIN 済み状態と Firestore adminSessions の整合を確認する */
export async function ensureEventAdminSession(eventId: string): Promise<boolean> {
  try {
    const token = await getIdToken();
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/admin-session`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export { SESSION_TTL_MS };
