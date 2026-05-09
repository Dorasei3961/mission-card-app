/**
 * アプリ全体オーナー（裏管理）向け認証の境界。
 *
 * 現在: 環境変数 NEXT_PUBLIC_OWNER_PIN（クライアントで入力検証）+
 * API ルートでの同一 PIN 検証 + Firebase Admin（Firestore 全体操作）。
 *
 * 将来 Google ログインへ移行する場合のメモ:
 * - Firebase Auth で Google プロバイダを有効化し、API ルートで ID トークンを検証する。
 * - 許可メールは allowlist（例: mission.event.app@gmail.com のみ）を環境変数または Firestore で保持。
 * - このファイルに「許可ユーザかどうか」を判定する関数を集約すると、/owner UI と API の差し替えがしやすい。
 */
export const OWNER_ALLOWED_EMAIL_FUTURE = "mission.event.app@gmail.com";

export type OwnerAuthMode = "pin" | "google_oauth_future";
