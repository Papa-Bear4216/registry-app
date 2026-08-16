import { useState, useEffect } from 'react';
import { query, where, onSnapshot } from 'firebase/firestore';
import { initializeFirebaseApp } from '../firebase/config';
import { registryItemsRef } from '../firebase/firestore';
import { RegistryItem } from '../types/models';

export function useRegistryItems(uid: string): { items: RegistryItem[]; loading: boolean } {
  const [items, setItems] = useState<RegistryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { db } = initializeFirebaseApp();
    const q = query(registryItemsRef(db), where('createdBy', '==', uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as RegistryItem)));
      setLoading(false);
    });
    return unsubscribe;
  }, [uid]);

  return { items, loading };
}
