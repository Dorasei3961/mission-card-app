import { participantLastPageStorageKey } from "./participant-last-page";

const STORAGE_KEY = "mission-card-event-session";

/** 旧キー（移行のみ）。運営UIの解放は eventId ごとのキーのみ使用 */
const LEGACY_ADMIN_ACCESS_PREFIX = "adminAccess_";

export const PARTICIPANT_SESSION_EXPIRED_MESSAGE =
  "ページが更新されました。同じ名前で再ログインをお願いします。";

export const EVENT_ENDED_MESSAGE = "このイベントは終了しました。";

export type EventSession = {
  eventId: string;
  participantName: string;
  uid: string;
  /** JST の暦日（YYYY-MM-DD）。この日と一致しないと無効 */
  sessionDate: string;
};

/** 現在の暦日（日本時間） */
export function getJstDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function readRawSession(): Partial<EventSession> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<EventSession>;
  } catch {
    return null;
  }
}

/** 日次期限切れ時にセッションと前回画面のみ削除（運営PINは残す） */
function clearDailyExpiredSession(eventId: string) {
  clearEventSession();
  try {
    localStorage.removeItem(participantLastPageStorageKey(eventId));
  } catch {
    // ignore
  }
}

export function getEventSession(): EventSession | null {
  const parsed = readRawSession();
  if (
    !parsed ||
    typeof parsed.eventId !== "string" ||
    typeof parsed.uid !== "string" ||
    !parsed.eventId ||
    !parsed.uid
  ) {
    if (parsed) clearEventSession();
    return null;
  }

  const session: EventSession = {
    eventId: parsed.eventId,
    participantName: typeof parsed.participantName === "string" ? parsed.participantName : "",
    uid: parsed.uid,
    sessionDate: typeof parsed.sessionDate === "string" ? parsed.sessionDate : "",
  };

  if (session.sessionDate !== getJstDateString()) {
    clearDailyExpiredSession(session.eventId);
    return null;
  }

  return session;
}

export function setEventSession(session: Omit<EventSession, "sessionDate">) {
  const payload: EventSession = {
    ...session,
    sessionDate: getJstDateString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearEventSession() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * イベント削除時に、該当 eventId に紐づく localStorage を掃除する。
 * 旧キーとの互換も含めて削除する。
 */
export function clearEventScopedStorage(eventId: string) {
  if (typeof window === "undefined") return;
  try {
    const parsed = readRawSession();
    if (parsed?.eventId === eventId) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("event_session");
    }
    localStorage.removeItem(participantLastPageStorageKey(eventId));
    localStorage.removeItem(adminAuthStorageKey(eventId));
    localStorage.removeItem(legacyAdminAccessKey(eventId));
    localStorage.removeItem(`admin_auth_${eventId}`);
  } catch {
    // ignore quota / private mode
  }
}

/** 運営PIN認証済みフラグ用（イベントごとに独立） */
export function adminAuthStorageKey(eventId: string): string {
  return `admin_auth_${eventId}`;
}

/** @deprecated adminAuthStorageKey と同一 */
export function adminAccessStorageKey(eventId: string): string {
  return adminAuthStorageKey(eventId);
}

function legacyAdminAccessKey(eventId: string): string {
  return `${LEGACY_ADMIN_ACCESS_PREFIX}${eventId}`;
}

export function getAdminAccess(eventId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = adminAuthStorageKey(eventId);
    if (localStorage.getItem(key) === "true") return true;
    const legacy = legacyAdminAccessKey(eventId);
    if (localStorage.getItem(legacy) === "true") {
      localStorage.setItem(key, "true");
      localStorage.removeItem(legacy);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function setAdminAccess(eventId: string, granted: boolean) {
  if (typeof window === "undefined") return;
  try {
    const key = adminAuthStorageKey(eventId);
    const legacy = legacyAdminAccessKey(eventId);
    if (granted) {
      localStorage.setItem(key, "true");
      localStorage.removeItem(legacy);
    } else {
      localStorage.removeItem(key);
      localStorage.removeItem(legacy);
    }
  } catch {
    // ignore quota / private mode
  }
}
