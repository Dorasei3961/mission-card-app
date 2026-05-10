/** localStorage: 参加者が直近でいたイベント内メイン画面（ランキング・管理PIN画面は含めない） */

export function participantLastPageStorageKey(eventId: string): string {
  return `last_event_page_${eventId}`;
}

function isAllowedStoredPath(eventId: string, path: string): boolean {
  const prefix = `/events/${eventId}`;
  if (!path.startsWith(prefix)) return false;
  if (path.includes("/ranking")) return false;
  if (path.includes("/admin")) return false;
  return true;
}

/** ホームタブで復帰するパス（無効・未設定時はミッション画面） */
export function getLastEventPage(eventId: string): string {
  if (typeof window === "undefined") return `/events/${eventId}`;
  try {
    const raw = localStorage.getItem(participantLastPageStorageKey(eventId))?.trim();
    if (raw && isAllowedStoredPath(eventId, raw)) return raw;
  } catch {
    // ignore
  }
  return `/events/${eventId}`;
}

/**
 * 参加者がメインで見ていた画面を記録する。
 * ランキング・運営 `/admin` は記録しない（ホームからランキングへ来た場合の戻り先を維持）。
 */
export function recordParticipantMainPage(eventId: string, path: string): void {
  if (typeof window === "undefined") return;
  const normalized = path.split("?")[0] ?? path;
  if (!isAllowedStoredPath(eventId, normalized)) return;
  try {
    localStorage.setItem(participantLastPageStorageKey(eventId), normalized);
  } catch {
    // ignore quota / private mode
  }
}
