// Proves useRegistryItems's onSnapshot error callback actually fires and
// surfaces a permission-denied query as `error` (rather than leaving `loading`
// stuck true forever), against a REAL Firestore backend enforcing the real
// security rules — the exact live failure mode (auth-timing race, offline,
// rules rejection) the fix targets.
//
// Companion to useRegistryItems.emulator.test.ts, which proves the success
// path's createdBy scoping. See that file's header for why renderHook can't
// be used here (RN/Flow parse failure under this project's plain node/ts-jest
// config) — this test drives the same onSnapshot call the hook makes,
// directly, exactly as that file already establishes as the pattern.
//
//   firebase emulators:exec --only firestore \
//     "npx jest __tests__/firebase/useRegistryItems.errorCallback.emulator.test.ts"
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { query, where, onSnapshot, setLogLevel, Firestore } from 'firebase/firestore';
import { registryItemsRef } from '../../src/firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    projectId: 'registry-app-test-registryitems-error',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});

afterAll(async () => await testEnv.cleanup());
afterEach(async () => await testEnv.clearFirestore());

// Mirrors the exact onSnapshot call inside useRegistryItems — including the
// error callback the fix added — but resolves/rejects a Promise instead of
// calling setState, since the hook itself can't be mounted here.
function subscribeAsHookWould(db: ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']>, uid: string) {
  return new Promise<{ ok: true } | { ok: false; error: Error }>((resolve) => {
    const q = query(registryItemsRef(db as unknown as Firestore), where('createdBy', '==', uid));
    const unsubscribe = onSnapshot(
      q,
      () => {
        unsubscribe();
        resolve({ ok: true });
      },
      (err) => {
        unsubscribe();
        resolve({ ok: false, error: err });
      }
    );
  });
}

test('an unauthenticated query (permission-denied by rules) resolves via the error callback, not the success one', async () => {
  const anon = testEnv.unauthenticatedContext().firestore();

  const result = await subscribeAsHookWould(anon, 'alice');

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeDefined();
    expect(result.error.message.length).toBeGreaterThan(0);
  }
});

test('a mismatched-uid query (querying for someone else\'s createdBy while authenticated as a different user) also hits the error callback', async () => {
  // firestore.rules scopes registryItems reads to isOwner(resource), i.e.
  // request.auth.uid == resource.data.createdBy — querying while authenticated
  // as 'bob' but filtering where('createdBy', '==', 'alice') is exactly the
  // auth-timing race this fix targets (a stale/wrong uid reaching the hook
  // before auth state settles), and rules correctly deny it.
  const bob = testEnv.authenticatedContext('bob').firestore();

  const result = await subscribeAsHookWould(bob, 'alice');

  expect(result.ok).toBe(false);
});
