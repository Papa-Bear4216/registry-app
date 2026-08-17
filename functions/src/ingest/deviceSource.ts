import { Firestore } from 'firebase-admin/firestore';
import { CollectorType } from '../types/enums';

export async function findOrCreateDeviceSource(
  db: Firestore,
  uid: string,
  sourceId: string,
  collector: CollectorType,
  label: string
): Promise<string> {
  const now = new Date().toISOString();
  const existing = await db
    .collection('deviceSources')
    .where('createdBy', '==', uid)
    .where('sourceId', '==', sourceId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    await doc.ref.update({ lastSeen: now });
    return doc.id;
  }

  const created = await db.collection('deviceSources').add({
    sourceId,
    label,
    collector,
    firstSeen: now,
    lastSeen: now,
    createdBy: uid,
  });
  return created.id;
}
