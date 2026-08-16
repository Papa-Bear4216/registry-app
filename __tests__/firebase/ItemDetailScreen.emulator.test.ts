// Exercises ItemDetailScreen's produced Firestore contracts — logging an
// observation (addDoc(observationsRef(db), {...})), retire/reactivate
// (updateDoc(doc(db, 'registryItems', itemId), { status })), and delete
// (deleteDoc(doc(db, 'registryItems', itemId))) — against a REAL Firestore
// backend, INCLUDING the security rules from Task 1 (createdBy-scoped
// create/read/update/delete).
//
// Runs under the `node` Jest project (real network), unlike the
// `.test.tsx` version would under jest-expo, which stubs React Native's
// native networking module and never actually reaches the emulator (see the
// identical precedent in __tests__/firebase/AddItemScreen.emulator.test.ts
// and __tests__/firebase/useRegistryItems.emulator.test.ts).
//
//   npx jest __tests__/firebase/ItemDetailScreen.emulator.test.ts
//     -> FAIL (connect ECONNREFUSED) when no emulator is running
//
//   firebase emulators:exec --only firestore \
//     "npx jest __tests__/firebase/ItemDetailScreen.emulator.test.ts"
//     -> PASS
//
// ItemDetailScreen and useObservations can't be rendered/invoked outside
// jest-expo/React Native (this node/ts-jest project has no RN transform —
// see the identical note in useRegistryItems.emulator.test.ts about
// renderHook failing to parse react-native's Flow source). So, following the
// same precedent, this test drives the identical firebase/firestore calls
// the screen and hook make directly against per-user authenticated
// Firestore instances from the rules-unit-testing harness.
import { initializeTestEnvironment, RulesTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  setLogLevel,
  Firestore,
} from 'firebase/firestore';
import { observationsRef } from '../../src/firebase/firestore';
import { ItemStatus } from '../../src/types/enums';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    // A distinct projectId (not the 'registry-app-test' shared by
    // rules.test.ts / useRegistryItems.emulator.test.ts, nor
    // 'registry-app-test-additem' used by AddItemScreen.emulator.test.ts)
    // gives this suite its own isolated emulated Firestore database.
    // `firebase emulators:exec` runs every `node`-project test file against
    // ONE emulator process, and Jest can run suites concurrently in separate
    // workers; sharing a projectId risks another suite's
    // `afterEach(() => testEnv.clearFirestore())` wiping this suite's
    // just-written docs mid-assertion (confirmed as a real race in Task 5's
    // AddItemScreen.emulator.test.ts). A separate projectId sidesteps the
    // race entirely.
    projectId: 'registry-app-test-itemdetail',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});

afterAll(async () => await testEnv.cleanup());
afterEach(async () => await testEnv.clearFirestore());

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Figma',
    cost: 12,
    billingCycle: 'monthly',
    kind: 'app',
    status: ItemStatus.Keep,
    taskCategories: ['design'],
    description: 'Design tool',
    canonicalIdentity: null,
    justified: false,
    isBestForTask: false,
    useCases: null,
    capabilitySummary: null,
    sourceUrl: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function uniqueUid() {
  return `alice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('logObservation contract: addDoc creates an observation scoped to the item and owner', async () => {
  const uid = uniqueUid();
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
  await setDoc(doc(alice, 'registryItems/item1'), baseItem({ createdBy: uid }));

  await addDoc(observationsRef(alice), {
    registryItemId: 'item1',
    observedAt: new Date().toISOString(),
    windowHours: 24,
    usageCount: 3,
    usageDurationMs: 3_600_000,
    createdBy: uid,
  } as any);

  const snapshot = await getDocs(
    query(observationsRef(alice), where('registryItemId', '==', 'item1'), where('createdBy', '==', uid))
  );
  expect(snapshot.docs).toHaveLength(1);
  expect(snapshot.docs[0].data().usageCount).toBe(3);
  expect(snapshot.docs[0].data().createdBy).toBe(uid);
});

test("useObservations's live query contract: onSnapshot with registryItemId + createdBy filters returns only the owner's matching observations", async () => {
  // Mirrors the exact query useObservations builds — query(observationsRef(db),
  // where('registryItemId', '==', itemId), where('createdBy', '==', user.uid))
  // — subscribed via onSnapshot rather than a one-shot getDocs, and asserts it
  // resolves against the live, rules-enforced backend without a rules
  // evaluation error. An earlier version of this hook filtered only by
  // registryItemId (no createdBy filter); that query throws
  // "Property createdBy is undefined on object" during rules evaluation
  // against a live backend (confirmed empirically), which this test guards
  // against regressing to.
  const uid = uniqueUid();
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
  await setDoc(doc(alice, 'registryItems/item1'), baseItem({ createdBy: uid }));
  await addDoc(observationsRef(alice), {
    registryItemId: 'item1',
    observedAt: new Date().toISOString(),
    windowHours: 24,
    usageCount: 2,
    usageDurationMs: 1_800_000,
    createdBy: uid,
  } as any);
  // An observation for a different item, same owner — must be excluded by
  // the registryItemId filter.
  await addDoc(observationsRef(alice), {
    registryItemId: 'item2',
    observedAt: new Date().toISOString(),
    windowHours: 24,
    usageCount: 99,
    usageDurationMs: 1,
    createdBy: uid,
  } as any);

  const q = query(
    observationsRef(alice),
    where('registryItemId', '==', 'item1'),
    where('createdBy', '==', uid)
  );
  const results = await new Promise<unknown[]>((resolve, reject) => {
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        unsubscribe();
        resolve(snapshot.docs.map((d) => d.data()));
      },
      (err) => {
        unsubscribe();
        reject(err);
      }
    );
  });

  expect(results).toHaveLength(1);
  expect((results[0] as any).usageCount).toBe(2);
});

test('security rules reject logging an observation with a spoofed createdBy', async () => {
  const uid = uniqueUid();
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
  await setDoc(doc(alice, 'registryItems/item1'), baseItem({ createdBy: uid }));

  await expect(
    addDoc(observationsRef(alice), {
      registryItemId: 'item1',
      observedAt: new Date().toISOString(),
      windowHours: 24,
      usageCount: 3,
      usageDurationMs: 3_600_000,
      createdBy: 'someone-else',
    } as any)
  ).rejects.toThrow(/PERMISSION_DENIED|permission/i);
});

test('toggleRetire contract: updateDoc flips status keep -> cut -> keep for the owner', async () => {
  const uid = uniqueUid();
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
  const itemRef = doc(alice, 'registryItems/item1');
  await setDoc(itemRef, baseItem({ createdBy: uid, status: ItemStatus.Keep }));

  await updateDoc(itemRef, { status: ItemStatus.Cut });
  let snap = await getDoc(itemRef);
  expect(snap.data()?.status).toBe(ItemStatus.Cut);

  await updateDoc(itemRef, { status: ItemStatus.Keep });
  snap = await getDoc(itemRef);
  expect(snap.data()?.status).toBe(ItemStatus.Keep);
});

test('security rules reject a non-owner attempting to retire another user\'s item', async () => {
  const ownerUid = uniqueUid();
  const otherUid = uniqueUid();
  const owner = testEnv.authenticatedContext(ownerUid).firestore() as unknown as Firestore;
  const other = testEnv.authenticatedContext(otherUid).firestore() as unknown as Firestore;
  await setDoc(doc(owner, 'registryItems/item1'), baseItem({ createdBy: ownerUid, status: ItemStatus.Keep }));

  await assertFails(updateDoc(doc(other, 'registryItems/item1'), { status: ItemStatus.Cut }));
});

test('handleDelete contract: deleteDoc removes the item for the owner', async () => {
  const uid = uniqueUid();
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
  const itemRef = doc(alice, 'registryItems/item1');
  await setDoc(itemRef, baseItem({ createdBy: uid }));

  await deleteDoc(itemRef);

  // A rules-enforced getDoc on an already-deleted doc errors during rule
  // evaluation (resource.data.createdBy on a null resource), rather than
  // cleanly returning "not found" — a quirk of this ruleset's isOwner()
  // check, not something the app needs to handle (the deleting client
  // navigates away rather than re-reading). So existence is confirmed here
  // via a rules-disabled read, matching the setup/verification pattern used
  // in rules.test.ts.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), 'registryItems/item1'));
    expect(snap.exists()).toBe(false);
  });
});

test('security rules reject a non-owner attempting to delete another user\'s item', async () => {
  const ownerUid = uniqueUid();
  const otherUid = uniqueUid();
  const owner = testEnv.authenticatedContext(ownerUid).firestore() as unknown as Firestore;
  const other = testEnv.authenticatedContext(otherUid).firestore() as unknown as Firestore;
  await setDoc(doc(owner, 'registryItems/item1'), baseItem({ createdBy: ownerUid }));

  await assertFails(deleteDoc(doc(other, 'registryItems/item1')));
});
