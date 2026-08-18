// Exercises the staging-review approve/reject writes StagingScreen and
// AddItemScreen (when opened via approve) make, against a REAL Firestore
// backend enforcing the real security rules. Same rationale as
// AddItemScreen.emulator.test.ts for why this drives the underlying
// firebase/firestore calls directly rather than rendering the screens.
//
//   firebase emulators:exec --only firestore \
//     "npx jest __tests__/firebase/StagingScreen.emulator.test.ts"
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, getDocs, query, where, updateDoc, runTransaction, setLogLevel, Firestore } from 'firebase/firestore';
import { registryItemsRef, stagingItemsRef } from '../../src/firebase/firestore';
import { CollectorType } from '../../src/types/enums';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    projectId: 'registry-app-test-staging',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});

afterAll(async () => await testEnv.cleanup());
afterEach(async () => await testEnv.clearFirestore());

function stagingPayload(uid: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rawLabel: 'Netflix',
    rawCategory: 'Entertainment',
    rawIdentity: null,
    collector: CollectorType.PhoneUsage,
    sourceId: 'device-1',
    capturedAt: new Date().toISOString(),
    suggestedMatch: null,
    suggestionConfidence: null,
    resolved: false,
    resolvedAt: null,
    classifiedAt: new Date().toISOString(),
    classifiedKind: 'subscription',
    classifiedCategory: 'media',
    classifiedActive: true,
    classifiedConfidence: 0.9,
    createdBy: uid,
    ...overrides,
  };
}

test('approving a staging item with no suggestedMatch creates a registryItem and resolves the staging item atomically', async () => {
  const uid = `alice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;

  const stagingRef = doc(stagingItemsRef(alice));
  await runTransaction(alice, async (tx) => {
    tx.set(stagingRef, stagingPayload(uid) as any);
  });

  // Mirrors AddItemScreen.handleSave's transaction when opened via approve.
  const newItemRef = doc(registryItemsRef(alice));
  await runTransaction(alice, async (tx) => {
    tx.set(newItemRef, {
      name: 'Netflix',
      cost: 15.49,
      billingCycle: 'monthly',
      kind: 'subscription',
      status: 'keep',
      taskCategories: ['media'],
      description: '',
      canonicalIdentity: null,
      justified: false,
      isBestForTask: false,
      useCases: null,
      capabilitySummary: null,
      sourceUrl: null,
      createdBy: uid,
      createdAt: new Date().toISOString(),
    } as any);
    tx.update(stagingRef, { resolved: true, resolvedAt: new Date().toISOString() });
  });

  const itemSnapshot = await getDocs(query(registryItemsRef(alice), where('createdBy', '==', uid)));
  expect(itemSnapshot.docs).toHaveLength(1);
  expect(itemSnapshot.docs[0].data().name).toBe('Netflix');

  const stagingSnapshot = await getDoc(stagingRef);
  expect(stagingSnapshot.data()?.resolved).toBe(true);
});

test('rejecting a staging item resolves it without creating a registryItem', async () => {
  const uid = `alice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;

  const stagingRef = doc(stagingItemsRef(alice));
  await runTransaction(alice, async (tx) => {
    tx.set(stagingRef, stagingPayload(uid) as any);
  });

  // Mirrors StagingScreen's reject().
  await updateDoc(stagingRef, { resolved: true, resolvedAt: new Date().toISOString() });

  const stagingSnapshot = await getDoc(stagingRef);
  expect(stagingSnapshot.data()?.resolved).toBe(true);

  const itemSnapshot = await getDocs(query(registryItemsRef(alice), where('createdBy', '==', uid)));
  expect(itemSnapshot.docs).toHaveLength(0);
});

test('a suggestedMatch item resolves without creating a duplicate registryItem (the "confirm match" path)', async () => {
  const uid = `alice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;

  const stagingRef = doc(stagingItemsRef(alice));
  await runTransaction(alice, async (tx) => {
    tx.set(stagingRef, stagingPayload(uid, { suggestedMatch: 'existing-item-42' }) as any);
  });

  // Mirrors StagingScreen.approve()'s suggestedMatch branch — same resolve
  // write as reject(), deliberately, since the matching registryItem
  // already exists (created via a prior classification of the same app).
  await updateDoc(stagingRef, { resolved: true, resolvedAt: new Date().toISOString() });

  const stagingSnapshot = await getDoc(stagingRef);
  expect(stagingSnapshot.data()?.resolved).toBe(true);

  const itemSnapshot = await getDocs(query(registryItemsRef(alice), where('createdBy', '==', uid)));
  expect(itemSnapshot.docs).toHaveLength(0);
});

test('security rules reject resolving a staging item that belongs to a different user', async () => {
  const uid = `alice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
  const bob = testEnv.authenticatedContext('bob').firestore() as unknown as Firestore;

  const stagingRef = doc(stagingItemsRef(alice));
  await runTransaction(alice, async (tx) => {
    tx.set(stagingRef, stagingPayload(uid) as any);
  });

  const bobsView = doc(stagingItemsRef(bob), stagingRef.id);
  await expect(
    updateDoc(bobsView, { resolved: true, resolvedAt: new Date().toISOString() })
  ).rejects.toThrow(/PERMISSION_DENIED|permission/i);
});
