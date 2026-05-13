import type { Timestamp } from "firebase/firestore";

export type EventListFields = {
  title?: unknown;
  creatorName?: unknown;
  ownerUid?: unknown;
  rankingVisible?: unknown;
  status?: unknown;
  createdAt?: unknown;
  endedAt?: unknown;
  deletedAt?: unknown;
};

function hasTimestampLikeValue(value: unknown): boolean {
  return value !== null && value !== undefined;
}

export function isActiveEventRecord(raw: EventListFields): boolean {
  if (hasTimestampLikeValue(raw.deletedAt)) return false;
  if (hasTimestampLikeValue(raw.endedAt)) return false;
  const status = typeof raw.status === "string" ? raw.status.toLowerCase() : "";
  return status !== "ended" && status !== "closed";
}

export function normalizeEventListStatus(raw: EventListFields): "active" | "closed" {
  return isActiveEventRecord(raw) ? "active" : "closed";
}

export function getEventCreatedAtMillis(raw: EventListFields): number {
  const createdAt = raw.createdAt as Timestamp | null | undefined;
  return createdAt?.toMillis?.() ?? 0;
}
