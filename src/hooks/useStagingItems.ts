import { useState, useEffect } from 'react';
import { query, where, onSnapshot } from 'firebase/firestore';
import { initializeFirebaseApp } from '../firebase/config';
import { stagingItemsRef } from '../firebase/firestore';
import { StagingItem } from '../types/models';

/**
 * Items classified by aiClassify and awaiting user review. Filters
 * classifiedAt != null client-side (rather than in the Firestore query) to
 * avoid Firestore's single-inequality-field constraint — this excludes
 * items that have never successfully classified (still mid-retry or
 * permanently failed), which belong in a retry queue, not this review list.
 */
export function useStagingItems(uid: string): { items: StagingItem[]; loading: boolean; error: Error | null } {
  const [items, setItems] = useState<StagingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const { db } = initializeFirebaseApp();
    const q = query(stagingItemsRef(db), where('createdBy', '==', uid), where('resolved', '==', false));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const all = snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as StagingItem));
        setItems(all.filter((item) => item.classifiedAt !== null));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setLoading(false);
        setError(err);
      }
    );
    return unsubscribe;
  }, [uid]);

  return { items, loading, error };
}
