import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Vercel 等では環境変数 FIREBASE_SERVICE_ACCOUNT_JSON に
 * サービスアカウント JSON の文字列（1行）を設定してください。
 */
export function isFirebaseAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}

export function getAdminFirestore(): Firestore {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  }
  if (!getApps().length) {
    initializeApp({
      credential: cert(JSON.parse(raw) as Record<string, unknown>),
    });
  }
  return getFirestore(getApps()[0]!);
}
