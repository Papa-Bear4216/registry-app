// Exercises AddItemScreen's produced contract (a registryItems doc created via
// addDoc(registryItemsRef(db), {..., createdBy: user.uid})) against a REAL
// Firestore backend, INCLUDING the security rules from Task 1 (firestore.rules
// requires request.resource.data.createdBy == request.auth.uid on create).
// Runs under the `node` Jest project (real network), unlike a .test.tsx version
// would under jest-expo, which stubs React Native's native networking module
// and never actually reaches the emulator (see the note in
// __tests__/hooks/useAuth.test.tsx and the identical precedent in
// __tests__/firebase/useRegistryItems.emulator.test.ts from Task 4).
//
//   npx jest __tests__/firebase/AddItemScreen.emulator.test.ts
//     -> FAIL (connect ECONNREFUSED) when no emulator is running
//
//   firebase emulators:exec --only firestore \
//     "npx jest __tests__/firebase/AddItemScreen.emulator.test.ts"
//     -> PASS
//
// AddItemScreen itself can't be rendered outside jest-expo/React Native (this
// node/ts-jest project has no RN transform — see the identical note in
// useRegistryItems.emulator.test.ts about renderHook failing to parse
// react-native's Flow source). So, following the same precedent, this test
// drives the identical firebase/firestore call the screen's handleSave makes —
// addDoc(registryItemsRef(db), {...}) — directly against a per-user
// authenticated Firestore instance from the rules-unit-testing harness. This
// is the real produced contract: a live, rules-enforced create with createdBy
// set from the authenticated user.
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { addDoc, getDocs, query, where, setLogLevel, Firestore } from 'firebase/firestore';
import { registryItemsRef } from '../../src/firebase/firestore';
import { BillingCycle, ItemKind, ItemStatus } from '../../src/types/enums';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    // A distinct projectId (not the 'registry-app-test' shared by
    // rules.test.ts and useRegistryItems.emulator.test.ts) gives this suite
    // its own isolated emulated Firestore database. `firebase emulators:exec`
    // runs every `node`-project test file against ONE emulator process, and
    // Jest can run suites concurrently in separate workers; sharing a
    // projectId meant another suite's `afterEach(() => testEnv.clearFirestore())`
    // could wipe this suite's just-written doc between its addDoc and getDocs
    // calls — confirmed empirically (this test flaked with 0 docs found,
    // consistent with a concurrent clear, after an earlier per-uid-only fix
    // that didn't address the cross-suite race). A separate projectId
    // sidesteps the race entirely rather than trying to out-run it.
    projectId: 'registry-app-test-additem',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});

afterAll(async () => await testEnv.cleanup());
afterEach(async () => await testEnv.clearFirestore());

// Mirrors the payload AddItemScreen's handleSave builds from form state.
function newItemPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Notion',
    cost: 10,
    billingCycle: BillingCycle.Monthly,
    kind: ItemKind.Subscription,
    status: ItemStatus.Keep,
    taskCategories: [],
    description: '',
    canonicalIdentity: null,
    justified: false,
    isBestForTask: false,
    useCases: null,
    capabilitySummary: null,
    sourceUrl: null,
    createdBy: 'alice',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('creating a registryItem with createdBy set succeeds against a live, rules-enforced Firestore backend', async () => {
  // A per-test unique uid (rather than a shared fixture name like "alice") is
  // used here because `firebase emulators:exec` runs all `node`-project test
  // files against ONE shared emulator instance; other suites in this repo
  // (rules.test.ts, useRegistryItems.emulator.test.ts) also authenticate as
  // "alice" and may execute concurrently in a different Jest worker, so a
  // query scoped only by createdBy == 'alice' can observe their documents too
  // (confirmed empirically — this test flaked with extra docs before this
  // uid was made unique).
  const uid = `alice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;

  await addDoc(registryItemsRef(alice), newItemPayload({ name: 'Notion', createdBy: uid }) as any);

  const snapshot = await getDocs(query(registryItemsRef(alice), where('createdBy', '==', uid)));
  expect(snapshot.docs).toHaveLength(1);
  expect(snapshot.docs[0].data().name).toBe('Notion');
  expect(snapshot.docs[0].data().createdBy).toBe(uid);
});

test('security rules reject a create where createdBy does not match the authenticated uid', async () => {
  const uid = `alice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const alice = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;

  // Alice authenticated, but attempting to write a doc claiming a different
  // uid as createdBy — this is exactly the spoofing scenario the Task 1
  // rules guard against, and proves the rule is enforced server-side, not
  // just a client-side convention.
  await expect(
    addDoc(registryItemsRef(alice), newItemPayload({ name: 'Spoofed', createdBy: 'someone-else' }) as any)
  ).rejects.toThrow(/PERMISSION_DENIED|permission/i);
});
