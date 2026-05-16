import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { isValidFourDigitAdminPin } from "@/app/lib/admin-pin";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/app/lib/firebase-admin";

const SESSION_HOURS = 24;

async function verifyBearerUid(request: NextRequest): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  if (!isFirebaseAdminConfigured()) return null;
  try {
    getAdminFirestore();
    const decoded = await getAuth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

function misconfigured() {
  return Response.json(
    { error: "サーバー設定が未完了です。管理者に FIREBASE_SERVICE_ACCOUNT_JSON を確認してください。" },
    { status: 503 },
  );
}

/** 運営PIN認証済みセッションの有効性確認 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  if (!isFirebaseAdminConfigured()) return misconfigured();
  const uid = await verifyBearerUid(request);
  if (!uid) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { eventId } = await context.params;
  if (!eventId) {
    return Response.json({ error: "Missing eventId" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const snap = await db.doc(`events/${eventId}/adminSessions/${uid}`).get();
  if (!snap.exists) {
    return Response.json({ error: "No admin session" }, { status: 401 });
  }
  const data = snap.data() as { authUid?: string; expiresAt?: Timestamp };
  if (data.authUid !== uid) {
    return Response.json({ error: "Invalid session" }, { status: 401 });
  }
  const expiresAt = data.expiresAt;
  if (!expiresAt || expiresAt.toMillis() <= Date.now()) {
    return Response.json({ error: "Session expired" }, { status: 401 });
  }
  return Response.json({ ok: true });
}

/** 運営PIN検証後に adminSessions を発行（Rules の isEventAdmin 用） */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  if (!isFirebaseAdminConfigured()) return misconfigured();
  const uid = await verifyBearerUid(request);
  if (!uid) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { eventId } = await context.params;
  if (!eventId) {
    return Response.json({ error: "Missing eventId" }, { status: 400 });
  }

  let body: { pin?: string };
  try {
    body = (await request.json()) as { pin?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!isValidFourDigitAdminPin(pin)) {
    return Response.json({ error: "管理用PINは4桁の数字です。" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const eventRef = db.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }

  const storedPin = String((eventSnap.data() as { adminPin?: unknown })?.adminPin ?? "").trim();
  if (!storedPin) {
    return Response.json({ error: "このイベントには管理PINが設定されていません。" }, { status: 400 });
  }
  if (pin !== storedPin) {
    return Response.json({ error: "PINが違います" }, { status: 403 });
  }

  const expiresAt = Timestamp.fromMillis(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await eventRef.collection("adminSessions").doc(uid).set(
    {
      authUid: uid,
      grantedAt: FieldValue.serverTimestamp(),
      expiresAt,
    },
    { merge: true },
  );

  return Response.json({ ok: true });
}
