import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { isValidFourDigitAdminPin } from "@/app/lib/admin-pin";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/app/lib/firebase-admin";
import { deleteEventAndSubcollections } from "@/app/lib/owner-delete-event";
import {
  ownerMisconfiguredResponse,
  ownerUnauthorizedResponse,
  verifyOwnerPin,
} from "@/app/lib/owner-server";

type PatchBody = {
  action?: string;
  joinPassword?: string;
  adminPin?: string;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  if (!verifyOwnerPin(request)) {
    return ownerUnauthorizedResponse();
  }
  if (!isFirebaseAdminConfigured()) {
    return ownerMisconfiguredResponse(
      "Firebase Admin が未設定です。サーバーに FIREBASE_SERVICE_ACCOUNT_JSON を設定してください。",
    );
  }
  const { eventId } = await context.params;
  if (!eventId) {
    return Response.json({ error: "Missing eventId" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection("events").doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }

  try {
    if (body.action === "close") {
      await ref.update({
        status: "closed",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return Response.json({ ok: true });
    }
    if (body.action === "reopen") {
      await ref.update({
        status: "active",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return Response.json({ ok: true });
    }
    if (body.action === "updateCredentials") {
      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (typeof body.joinPassword === "string") {
        updates.joinPassword = body.joinPassword;
      }
      if (body.adminPin !== undefined) {
        const pin = typeof body.adminPin === "string" ? body.adminPin.trim() : "";
        if (!isValidFourDigitAdminPin(pin)) {
          return Response.json({ error: "管理用PINは4桁の数字で入力してください。" }, { status: 400 });
        }
        updates.adminPin = pin;
      }
      if (Object.keys(updates).length <= 1) {
        return Response.json({ error: "更新する項目がありません。" }, { status: 400 });
      }
      await ref.update(updates);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  if (!verifyOwnerPin(request)) {
    return ownerUnauthorizedResponse();
  }
  if (!isFirebaseAdminConfigured()) {
    return ownerMisconfiguredResponse(
      "Firebase Admin が未設定です。サーバーに FIREBASE_SERVICE_ACCOUNT_JSON を設定してください。",
    );
  }
  const { eventId } = await context.params;
  if (!eventId) {
    return Response.json({ error: "Missing eventId" }, { status: 400 });
  }
  try {
    const db = getAdminFirestore();
    await deleteEventAndSubcollections(db, eventId);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Delete failed" }, { status: 500 });
  }
}
