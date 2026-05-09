import { Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/app/lib/firebase-admin";
import {
  ownerMisconfiguredResponse,
  ownerUnauthorizedResponse,
  verifyOwnerPin,
} from "@/app/lib/owner-server";
import type { OwnerEventListItem } from "@/app/lib/owner-types";

function formatTimestamp(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return null;
}

export async function GET(request: NextRequest) {
  if (!verifyOwnerPin(request)) {
    return ownerUnauthorizedResponse();
  }
  if (!isFirebaseAdminConfigured()) {
    return ownerMisconfiguredResponse(
      "Firebase Admin が未設定です。サーバーに FIREBASE_SERVICE_ACCOUNT_JSON を設定してください。",
    );
  }
  try {
    const db = getAdminFirestore();
    const eventsSnap = await db.collection("events").get();
    const sorted = [...eventsSnap.docs].sort((a, b) => {
      const ca = a.data().createdAt;
      const cb = b.data().createdAt;
      const ma = ca instanceof Timestamp ? ca.toMillis() : 0;
      const mb = cb instanceof Timestamp ? cb.toMillis() : 0;
      return mb - ma;
    });
    const items: OwnerEventListItem[] = [];
    for (const docSnap of sorted) {
      const data = docSnap.data();
      const participantsSnap = await db
        .collection("events")
        .doc(docSnap.id)
        .collection("participants")
        .get();
      items.push({
        id: docSnap.id,
        title: String(data.title ?? ""),
        creatorName: String(data.creatorName ?? "").trim() || "—",
        createdAtIso: formatTimestamp(data.createdAt),
        participantCount: participantsSnap.size,
        status: data.status === "closed" ? "closed" : "active",
        joinPassword: typeof data.joinPassword === "string" ? data.joinPassword : "",
        adminPin: String(data.adminPin ?? "").trim(),
      });
    }
    return Response.json({ events: items });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Failed to list events" }, { status: 500 });
  }
}
