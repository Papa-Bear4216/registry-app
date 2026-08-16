import { useState, useEffect } from 'react';
import { query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { initializeFirebaseApp } from '../firebase/config';
import { alertDismissalsRef } from '../firebase/firestore';
import { AlertDismissal } from '../types/models';
import { AlertType } from '../types/enums';
import { useAuth } from './useAuth';

// Snooze/dismiss state for alerts lives ONLY in the alertDismissals collection,
// scoped per (itemId, alertType) pair. Never written back onto RegistryItem.
export function useAlertDismissals(uid: string) {
  const [dismissals, setDismissals] = useState<AlertDismissal[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!uid) {
      setDismissals([]);
      return;
    }
    const { db } = initializeFirebaseApp();
    const q = query(alertDismissalsRef(db), where('createdBy', '==', uid));
    return onSnapshot(q, (snapshot) => {
      setDismissals(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as AlertDismissal)));
    });
  }, [uid]);

  const dismiss = async (itemId: string, alertType: AlertType, snoozedUntil: string | null) => {
    if (!user) return;
    const { db } = initializeFirebaseApp();
    await addDoc(alertDismissalsRef(db), {
      itemId,
      alertType,
      dismissedAt: new Date().toISOString(),
      snoozedUntil,
      createdBy: user.uid,
    } as any);
  };

  const isDismissed = (itemId: string, alertType: AlertType): boolean => {
    return dismissals.some((d) => {
      if (d.itemId !== itemId || d.alertType !== alertType) return false;
      if (d.snoozedUntil) return new Date(d.snoozedUntil).getTime() > Date.now();
      return d.dismissedAt !== null;
    });
  };

  return { dismissals, dismiss, isDismissed };
}
