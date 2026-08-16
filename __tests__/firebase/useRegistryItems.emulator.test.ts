// Exercises useRegistryItems's produced contract (query registryItems scoped by
// createdBy) against a REAL Firestore backend, INCLUDING the security rules from
// Task 1 (firestore.rules requires request.auth.uid == createdBy for reads).
// Runs under the `node` Jest project (real network), unlike a `.test.tsx` version
// of this test would under jest-expo, which stubs React Native's native
// networking module and never actually reaches the emulator (see the note in
// __tests__/hooks/useAuth.test.tsx and __tests__/firebase/useAuth.emulator.test.ts
// for the established precedent).
//
//   npx jest __tests__/firebase/useRegistryItems.emulator.test.ts
//     -> FAIL (connect ECONNREFUSED) when no emulator is running
//
//   firebase emulators:exec --only firestore \
//     "npx jest __tests__/firebase/useRegistryItems.emulator.test.ts"
//     -> PASS
//
// useRegistryItems() itself can't be called outside a React render (it uses
// useState/useEffect), and mounting it via @testing-library/react-native's
// renderHook is not viable here either: renderHook pulls in the `react-native`
// package itself, which under this project's plain ts-jest/node config (no
// Babel/RN transform, no jest-expo preset) fails to parse react-native's Flow
// source with "Cannot use import statement outside a module" (confirmed by
// direct probe). So, following the same approach as useAuth.emulator.test.ts and
// rules.test.ts, this test drives the identical firebase/firestore functions the
// hook wraps (query, where, onSnapshot, using registryItemsRef) directly against
// per-user authenticated Firestore instances from the rules-unit-testing harness
// — exercising both the createdBy query scoping AND the security rule that backs
// it (an unauthenticated/mismatched-uid `db` from initializeFirebaseApp() would
// hit PERMISSION_DENIED here, confirmed empirically). This is the real produced
// contract: a live, rules-enforced query scoped by createdBy.
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, query, where, onSnapshot, setLogLevel, Firestore } from 'firebase/firestore';
import { registryItemsRef } from '../../src/firebase/firestore';
import { RegistryItem } from '../../src/types/models';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    projectId: 'registry-app-test-registryitems',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});

afterAll(async () => await testEnv.cleanup());
afterEach(async () => await testEnv.clearFirestore());

function baseItem(overrides: Partial<RegistryItem>) {
  return {
    name: 'Netflix',
    cost: 15,
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
    createdBy: 'alice',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function subscribeOnce(db: ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>, uid: string): Promise<RegistryItem[]> {
  return new Promise((resolve, reject) => {
    // Cast is only to bridge rules-unit-testing's compat Firestore type to the
    // modular type registryItemsRef expects; at runtime this is the same
    // Firestore instance the hook's registryItemsRef(db) call receives, so this
    // genuinely goes through production's collection reference, not a
    // reimplementation of it.
    const q = query(registryItemsRef(db as unknown as Firestore), where('createdBy', '==', uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        unsubscribe();
        resolve(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as RegistryItem)));
      },
      (err) => {
        unsubscribe();
        reject(err);
      }
    );
  });
}

test('query scoped by createdBy returns only that user\'s items against a live, rules-enforced Firestore backend', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();

  await setDoc(doc(alice, 'registryItems/alice-item'), baseItem({ name: 'Netflix', createdBy: 'alice' }));
  await setDoc(doc(bob, 'registryItems/bob-item'), baseItem({ name: 'Spotify', createdBy: 'bob' }));

  // Alice's own query (as the hook would run it while she's logged in) returns
  // only her item. Firestore rules would PERMISSION_DENY this same query if
  // run as a different/no auth context (see rules.test.ts), so this also
  // proves the query is meaningfully scoped, not just filtered client-side.
  const aliceItems = await subscribeOnce(alice, 'alice');
  expect(aliceItems).toHaveLength(1);
  expect(aliceItems[0].name).toBe('Netflix');

  const bobItems = await subscribeOnce(bob, 'bob');
  expect(bobItems).toHaveLength(1);
  expect(bobItems[0].name).toBe('Spotify');
});
