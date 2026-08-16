import { collection, CollectionReference, Firestore } from 'firebase/firestore';
import { RegistryItem, Observation, AlertDismissal } from '../types/models';

export function registryItemsRef(db: Firestore): CollectionReference<RegistryItem> {
  return collection(db, 'registryItems') as CollectionReference<RegistryItem>;
}

export function observationsRef(db: Firestore): CollectionReference<Observation> {
  return collection(db, 'observations') as CollectionReference<Observation>;
}

export function alertDismissalsRef(db: Firestore): CollectionReference<AlertDismissal> {
  return collection(db, 'alertDismissals') as CollectionReference<AlertDismissal>;
}
