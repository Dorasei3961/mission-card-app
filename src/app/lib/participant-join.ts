import { collection, getDoc, getDocs, doc } from "firebase/firestore";
import { db } from "./firebase";

/** 表示用参加者名（前後空白のみ除去） */
export function trimParticipantDisplayName(name: string): string {
  return name.trim();
}

/** participants / missionProgress のドキュメントID用キー（参加画面と同一ルール） */
export function normalizeParticipantKey(name: string): string {
  const normalized = trimParticipantDisplayName(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
  return normalized || "guest";
}

/** 参加者名が同一人物か（正規化キーで比較） */
export function participantNamesMatch(nameA: string, nameB: string): boolean {
  const keyA = normalizeParticipantKey(nameA);
  const keyB = normalizeParticipantKey(nameB);
  return keyA.length > 0 && keyA === keyB;
}

export type ExistingParticipantMatch = {
  participantDocId: string;
  data: Record<string, unknown>;
};

/**
 * events/{eventId}/participants から表示名が一致する既存参加者を探す。
 * docId が名前キーと異なる事前登録（運営登録など）にも対応する。
 */
export async function findExistingParticipantByName(
  eventId: string,
  displayName: string,
): Promise<ExistingParticipantMatch | null> {
  const trimmed = trimParticipantDisplayName(displayName);
  if (!trimmed) return null;

  const preferredKey = normalizeParticipantKey(trimmed);
  const preferredRef = doc(db, "events", eventId, "participants", preferredKey);
  const preferredSnap = await getDoc(preferredRef);
  if (preferredSnap.exists()) {
    const data = preferredSnap.data() as Record<string, unknown>;
    const storedName = typeof data.name === "string" ? data.name : "";
    if (!storedName || participantNamesMatch(storedName, trimmed)) {
      return { participantDocId: preferredSnap.id, data };
    }
  }

  const coll = collection(db, "events", eventId, "participants");
  const snap = await getDocs(coll);
  for (const d of snap.docs) {
    if (d.id === preferredKey) continue;
    const data = d.data() as Record<string, unknown>;
    const storedName = typeof data.name === "string" ? data.name : "";
    if (storedName && participantNamesMatch(storedName, trimmed)) {
      return { participantDocId: d.id, data };
    }
  }

  return null;
}
