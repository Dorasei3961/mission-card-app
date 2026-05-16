import { doc, getDoc } from "firebase/firestore";
import { filterAdminPinInput, isValidFourDigitAdminPin } from "./admin-pin";
import { grantEventAdminSession } from "./admin-session-client";
import { ensureDefaultAdminPinIfMissing } from "./default-admin-pin";
import { db } from "./firebase";
import { setAdminAccess } from "./event-session";

export type VerifyAdminPinResult =
  | { ok: true }
  | { ok: false; message: string };

/** 運営PINを検証し、localStorage と Firestore adminSessions を更新する */
export async function verifyEventAdminPin(eventId: string, rawPin: string): Promise<VerifyAdminPinResult> {
  const entered = filterAdminPinInput(rawPin);
  if (!isValidFourDigitAdminPin(entered)) {
    return { ok: false, message: "4桁の数字を入力してください。" };
  }

  await ensureDefaultAdminPinIfMissing(eventId);
  const snap = await getDoc(doc(db, "events", eventId));
  if (!snap.exists()) {
    return { ok: false, message: "イベントが見つかりません。" };
  }

  const pinStored = String((snap.data() as { adminPin?: unknown }).adminPin ?? "").trim();
  if (!pinStored) {
    return { ok: false, message: "このイベントには管理PINが設定されていません。" };
  }
  if (entered !== pinStored) {
    return { ok: false, message: "PINが違います" };
  }

  try {
    await grantEventAdminSession(eventId, entered);
  } catch (e) {
    console.error("[verifyEventAdminPin] grantEventAdminSession", e);
    const msg = e instanceof Error ? e.message : "運営セッションの作成に失敗しました。";
    return { ok: false, message: msg };
  }

  setAdminAccess(eventId, true);
  return { ok: true };
}
