import { useState, useEffect } from 'react';
import { query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { initializeFirebaseApp } from '../firebase/config';
import { observationsRef } from '../firebase/firestore';
import { Observation } from '../types/models';
import { useAuth } from './useAuth';

export function useObservations(itemId: string) {
  const { user } = useAuth();
  const [observations, setObservations] = useState<Observation[]>([]);

  useEffect(() => {
    // The security rules (firestore.rules) gate observations read/list on
    // resource.data.createdBy == request.auth.uid — a query that filters
    // only by registryItemId (no createdBy filter) fails rules evaluation
    // against a live, rules-enforced backend ("Property createdBy is
    // undefined on object", confirmed empirically against the emulator).
    // So this must wait for an authenticated user and scope the query by
    // createdBy too, same as useRegistryItems's query.
    if (!user) {
      setObservations([]);
      return;
    }
    const { db } = initializeFirebaseApp();
    const q = query(
      observationsRef(db),
      where('registryItemId', '==', itemId),
      where('createdBy', '==', user.uid)
    );
    return onSnapshot(q, (snapshot) => {
      setObservations(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Observation)));
    });
  }, [itemId, user?.uid]);

  const logObservation = async (usageCount: number, usageDurationMs: number) => {
    if (!user) return;
    const { db } = initializeFirebaseApp();
    await addDoc(observationsRef(db), {
      registryItemId: itemId,
      observedAt: new Date().toISOString(),
      windowHours: 24,
      usageCount,
      usageDurationMs,
      createdBy: user.uid,
    } as any);
  };

  return { observations, logObservation };
}
