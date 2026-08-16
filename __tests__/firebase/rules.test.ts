import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, getDoc, setLogLevel } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  // Silence expected PERMISSION_DENIED warnings logged by the Firestore SDK
  // when assertFails() exercises a denied write/read against the emulator.
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    projectId: 'registry-app-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});

afterAll(async () => await testEnv.cleanup());
afterEach(async () => await testEnv.clearFirestore());

test('owner can create and read their own registryItem', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const itemRef = doc(alice, 'registryItems/item1');
  await assertSucceeds(setDoc(itemRef, { name: 'Netflix', createdBy: 'alice' }));
  await assertSucceeds(getDoc(itemRef));
});

test('non-owner cannot read another user\'s registryItem', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'registryItems/item1'), { name: 'Netflix', createdBy: 'alice' });
  });
  await assertFails(getDoc(doc(bob, 'registryItems/item1')));
});

test('unauthenticated user cannot create a registryItem', async () => {
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(anon, 'registryItems/item1'), { name: 'Netflix', createdBy: 'ghost' }));
});
