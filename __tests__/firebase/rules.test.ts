import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, getDoc, updateDoc, setLogLevel } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  // Silence expected PERMISSION_DENIED warnings logged by the Firestore SDK
  // when assertFails() exercises a denied write/read against the emulator.
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    projectId: 'registry-app-test-rules',
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

test('owner cannot change createdBy on update', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'registryItems/item1'), { name: 'Netflix', createdBy: 'alice' });
  });
  await assertFails(updateDoc(doc(alice, 'registryItems/item1'), { createdBy: 'bob' }));
});

test('owner can create and read their own stagingItem', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const itemRef = doc(alice, 'stagingItems/staging1');
  await assertSucceeds(setDoc(itemRef, { rawLabel: 'Netflix', createdBy: 'alice' }));
  await assertSucceeds(getDoc(itemRef));
});

test('non-owner cannot read another user\'s stagingItem', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'stagingItems/staging1'), { rawLabel: 'Netflix', createdBy: 'alice' });
  });
  await assertFails(getDoc(doc(bob, 'stagingItems/staging1')));
});

test('owner cannot reassign createdBy on a deviceSource update', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'deviceSources/device1'), { sourceId: 'x', createdBy: 'alice' });
  });
  await assertFails(updateDoc(doc(alice, 'deviceSources/device1'), { createdBy: 'bob' }));
});

test('owner can create and read their own suggestion', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const suggestionRef = doc(alice, 'suggestions/suggestion1');
  await assertSucceeds(setDoc(suggestionRef, { item: 'item1', suggestedAction: 'cut', createdBy: 'alice' }));
  await assertSucceeds(getDoc(suggestionRef));
});

test('non-owner cannot read another user\'s suggestion', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'suggestions/suggestion1'), { item: 'item1', suggestedAction: 'cut', createdBy: 'alice' });
  });
  await assertFails(getDoc(doc(bob, 'suggestions/suggestion1')));
});

test('owner can create and read their own taskRanking', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const rankingRef = doc(alice, 'taskRankings/ranking1');
  await assertSucceeds(setDoc(rankingRef, { taskCategory: 'writing', createdBy: 'alice' }));
  await assertSucceeds(getDoc(rankingRef));
});

test('non-owner cannot read another user\'s taskRanking', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'taskRankings/ranking1'), { taskCategory: 'writing', createdBy: 'alice' });
  });
  await assertFails(getDoc(doc(bob, 'taskRankings/ranking1')));
});
