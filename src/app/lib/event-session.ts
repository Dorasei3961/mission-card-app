const STORAGE_KEY = "mission-card-event-session";

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

/** localStorage key: adminAccess_{eventId} */
export function adminAccessStorageKey(eventId: string) {
  return `adminAccess_${eventId}`;
}

export function getAdminAccess(eventId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(adminAccessStorageKey(eventId)) === "true";
  } catch {
    return false;
  }
}

export function setAdminAccess(eventId: string, granted: boolean) {
  if (typeof window === "undefined") return;
  try {
    const key = adminAccessStorageKey(eventId);
    if (granted) {
      localStorage.setItem(key, "true");
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore quota / private mode
  }
}
