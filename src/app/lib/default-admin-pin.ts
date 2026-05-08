import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

/** テスト用の既定PIN（既存イベントに未設定のときのみ書き込む） */
export const DEFAULT_TEST_ADMIN_PIN = "1234";

export async function ensureDefaultAdminPinIfMissing(eventId: string): Promise<void> {
  const ref = doc(db, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const raw = (snap.data() as { adminPin?: unknown }).adminPin;
  const pin =
    typeof raw === "string"
      ? raw.trim()
      : raw != null && raw !== ""
        ? String(raw).trim()
        : "";
  if (pin) return;
  try {
    await setDoc(
      ref,
      { adminPin: DEFAULT_TEST_ADMIN_PIN, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.warn("ensureDefaultAdminPinIfMissing:", e);
  }
}
