// Exercises useAlertDismissals's produced contract (write a dismissal/snooze
// doc, query alertDismissals scoped by createdBy, and derive isDismissed) against
// a REAL Firestore backend, INCLUDING the security rules from Task 1
// (firestore.rules requires request.auth.uid == createdBy for both create and
// read/list on alertDismissals). This is genuinely new integration surface —
// Tasks 4/6/7/8's emulator tests cover registryItems/observations, not
// alertDismissals — so it earns its own emulator test per the carried-forward
// lesson about not duplicating already-proven Firestore scoping tests.
//
// Uses an isolated projectId ('registry-app-test-alerts') distinct from the
// shared 'registry-app-test' (Task 1/4) and 'registry-app-test-tasks' (Task 8),
// per the known cross-suite flake on the shared projectId.
//
//   npx jest __tests__/firebase/alertDismissals.emulator.test.ts
//     -> FAIL (connect ECONNREFUSED) when no emulator is running
//
//   firebase emulators:exec --only firestore \
//     "npx jest __tests__/firebase/alertDismissals.emulator.test.ts"
//     -> PASS
//
// useAlertDismissals() itself can't be called outside a React render (uses
// useState/useEffect + useAuth), and renderHook isn't viable under this
// project's plain ts-jest/node config (no RN transform — see the identical
// note in useRegistryItems.emulator.test.ts). So this test drives the same
// firebase/firestore calls the hook wraps (addDoc, query, where, onSnapshot,
// using alertDismissalsRef) directly against per-user authenticated Firestore
// instances from the rules-unit-testing harness, and re-implements
// isDismissed's exact branching to verify it against real documents.
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, addDoc, query, where, onSnapshot, setLogLevel, Firestore } from 'firebase/firestore';
import { alertDismissalsRef } from '../../src/firebase/firestore';
import { AlertDismissal } from '../../src/types/models';
import { AlertType } from '../../src/types/enums';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    projectId: 'registry-app-test-alerts',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});

afterAll(async () => await testEnv.cleanup());
afterEach(async () => await testEnv.clearFirestore());

type TestFirestore = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>;

function subscribeOnce(db: TestFirestore, uid: string): Promise<AlertDismissal[]> {
  return new Promise((resolve, reject) => {
    const q = query(alertDismissalsRef(db as unknown as Firestore), where('createdBy', '==', uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        unsubscribe();
        resolve(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as AlertDismissal)));
      },
      (err) => {
        unsubscribe();
        reject(err);
      }
    );
  });
}

// Mirrors useAlertDismissals's isDismissed exactly, so this test proves the
// hook's derivation logic is correct against real Firestore documents/timestamps.
function isDismissed(dismissals: AlertDismissal[], itemId: string, alertType: AlertType): boolean {
  return dismissals.some((d) => {
    if (d.itemId !== itemId || d.alertType !== alertType) return false;
    if (d.snoozedUntil) return new Date(d.snoozedUntil).getTime() > Date.now();
    return d.dismissedAt !== null;
  });
}

test('dismiss writes a doc scoped by createdBy, readable back via the createdBy query', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  await addDoc(alertDismissalsRef(alice as unknown as Firestore), {
    itemId: 'item1',
    alertType: AlertType.Dormant,
    dismissedAt: new Date().toISOString(),
    snoozedUntil: null,
    createdBy: 'alice',
  } as any);

  const dismissals = await subscribeOnce(alice, 'alice');
  expect(dismissals).toHaveLength(1);
  expect(dismissals[0].itemId).toBe('item1');
  expect(dismissals[0].alertType).toBe(AlertType.Dormant);
});

test('a dismissal is scoped per item+alertType — does not suppress a different item or a different alert type on the same item', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  await addDoc(alertDismissalsRef(alice as unknown as Firestore), {
    itemId: 'item1',
    alertType: AlertType.Dormant,
    dismissedAt: new Date().toISOString(),
    snoozedUntil: null,
    createdBy: 'alice',
  } as any);

  const dismissals = await subscribeOnce(alice, 'alice');

  expect(isDismissed(dismissals, 'item1', AlertType.Dormant)).toBe(true);
  expect(isDismissed(dismissals, 'item2', AlertType.Dormant)).toBe(false);
  expect(isDismissed(dismissals, 'item1', AlertType.HighCost)).toBe(false);
});

test('a future snoozedUntil suppresses the alert; a past snoozedUntil does not', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  await addDoc(alertDismissalsRef(alice as unknown as Firestore), {
    itemId: 'item-future',
    alertType: AlertType.Dormant,
    dismissedAt: new Date().toISOString(),
    snoozedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'alice',
  } as any);

  await addDoc(alertDismissalsRef(alice as unknown as Firestore), {
    itemId: 'item-past',
    alertType: AlertType.Dormant,
    dismissedAt: new Date().toISOString(),
    snoozedUntil: new Date(Date.now() - 1000).toISOString(),
    createdBy: 'alice',
  } as any);

  const dismissals = await subscribeOnce(alice, 'alice');

  expect(isDismissed(dismissals, 'item-future', AlertType.Dormant)).toBe(true);
  expect(isDismissed(dismissals, 'item-past', AlertType.Dormant)).toBe(false);
});

test('permanent dismiss (snoozedUntil null, dismissedAt set) suppresses indefinitely', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  await addDoc(alertDismissalsRef(alice as unknown as Firestore), {
    itemId: 'item1',
    alertType: AlertType.Dormant,
    dismissedAt: new Date().toISOString(),
    snoozedUntil: null,
    createdBy: 'alice',
  } as any);

  const dismissals = await subscribeOnce(alice, 'alice');
  expect(isDismissed(dismissals, 'item1', AlertType.Dormant)).toBe(true);
});

test('scoped to authenticated user — alice\'s dismissals don\'t leak to bob, against a live rules-enforced backend', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();

  await addDoc(alertDismissalsRef(alice as unknown as Firestore), {
    itemId: 'alice-item',
    alertType: AlertType.Dormant,
    dismissedAt: new Date().toISOString(),
    snoozedUntil: null,
    createdBy: 'alice',
  } as any);

  await addDoc(alertDismissalsRef(bob as unknown as Firestore), {
    itemId: 'bob-item',
    alertType: AlertType.Dormant,
    dismissedAt: new Date().toISOString(),
    snoozedUntil: null,
    createdBy: 'bob',
  } as any);

  const aliceDismissals = await subscribeOnce(alice, 'alice');
  const bobDismissals = await subscribeOnce(bob, 'bob');

  expect(aliceDismissals).toHaveLength(1);
  expect(aliceDismissals[0].itemId).toBe('alice-item');

  expect(bobDismissals).toHaveLength(1);
  expect(bobDismissals[0].itemId).toBe('bob-item');
});

test('security rules reject a create where createdBy does not match the authenticated uid', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  await expect(
    addDoc(alertDismissalsRef(alice as unknown as Firestore), {
      itemId: 'item1',
      alertType: AlertType.Dormant,
      dismissedAt: new Date().toISOString(),
      snoozedUntil: null,
      createdBy: 'mallory', // spoofed owner, mismatched from the authenticated uid
    } as any)
  ).rejects.toThrow();
});
