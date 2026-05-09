const STORAGE_KEY = "mission-card-event-session";

/** 旧キー（移行のみ）。運営UIの解放は eventId ごとのキーのみ使用 */
const LEGACY_ADMIN_ACCESS_PREFIX = "adminAccess_";

export type EventSession = {
  eventId: string;
  participantName: string;
  uid: string;
};

export function getEventSession(): EventSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EventSession>;
    if (
      typeof parsed.eventId !== "string" ||
      typeof parsed.uid !== "string" ||
      !parsed.eventId ||
      !parsed.uid
    ) {
      return null;
    }
    return {
      eventId: parsed.eventId,
      participantName: typeof parsed.participantName === "string" ? parsed.participantName : "",
      uid: parsed.uid,
    };
  } catch {
    return null;
  }
}

export function setEventSession(session: EventSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearEventSession() {
  localStorage.removeItem(STORAGE_KEY);
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
