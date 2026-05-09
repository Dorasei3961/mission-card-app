import type { Firestore } from "firebase-admin/firestore";

async function deleteCollectionDocs(db: Firestore, collPath: string): Promise<void> {
  const coll = db.collection(collPath);
  const snap = await coll.limit(400).get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const d of snap.docs) {
    batch.delete(d.ref);
  }
  await batch.commit();
  await deleteCollectionDocs(db, collPath);
}

/** events/{eventId} 直下の既知サブコレクションを削除してからイベント本体を削除する */
export async function deleteEventAndSubcollections(db: Firestore, eventId: string): Promise<void> {
  const base = `events/${eventId}`;
  await deleteCollectionDocs(db, `${base}/participants`);
  await deleteCollectionDocs(db, `${base}/missionProgress`);
  await deleteCollectionDocs(db, `${base}/pointLogs`);
  await db.doc(`${base}`).delete();
}
