import { useState, useEffect } from 'react';
import { query, where, onSnapshot } from 'firebase/firestore';
import { initializeFirebaseApp } from '../firebase/config';
import { registryItemsRef } from '../firebase/firestore';
import { RegistryItem } from '../types/models';

export function useRegistryItems(uid: string): { items: RegistryItem[]; loading: boolean; error: Error | null } {
  const [items, setItems] = useState<RegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const { db } = initializeFirebaseApp();
    const q = query(registryItemsRef(db), where('createdBy', '==', uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as RegistryItem)));
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
