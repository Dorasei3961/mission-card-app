const FLASH_KEY = "participant_flash_message";

/** 参加者向け一度きりのメッセージ（TOP・参加画面など） */
export function setParticipantFlashMessage(message: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    // ignore
  }
}

export function consumeParticipantFlashMessage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FLASH_KEY)?.trim();
    if (!raw) return null;
    sessionStorage.removeItem(FLASH_KEY);
    return raw;
  } catch {
    return null;
  }
}
