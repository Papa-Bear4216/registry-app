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

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(
      db.collection('deviceSources').where('createdBy', '==', uid).where('sourceId', '==', sourceId).limit(1)
    );

    if (!existing.empty) {
      const doc = existing.docs[0];
      transaction.update(doc.ref, { lastSeen: now });
      return doc.id;
    }

    const newRef = db.collection('deviceSources').doc();
    transaction.set(newRef, {
      sourceId,
      label,
      collector,
      firstSeen: now,
      lastSeen: now,
      createdBy: uid,
    });
    return newRef.id;
  });
}
