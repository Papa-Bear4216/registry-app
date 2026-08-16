// Exercises the HomeScreen's aggregation logic (summing monthlyEquivalent across
// mixed billing cycles) against real Firestore data. This test does NOT import or
// render HomeScreen.tsx (ts-jest under the node environment can't parse
// react-native's Flow source); instead, it directly drives the firebase/firestore
// functions and monthlyEquivalent normalization that HomeScreen.tsx uses, against
// an authenticated Firestore instance from the rules-unit-testing harness.
//
// This verifies that:
// 1. Items from real Firestore (with real billingCycle values) get normalized correctly
// 2. The sum across mixed cycles (monthly + annual + one-time) produces expected results
//
// The HomeScreen component rendering itself is tested in __tests__/screens/HomeScreen.test.tsx
// with mocked useRegistryItems; that test doesn't need Firestore because it verifies
// the aggregation logic of summing an array — the data source is mocked fixture data.

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, query, where, onSnapshot, setLogLevel, Firestore } from 'firebase/firestore';
import { registryItemsRef } from '../../src/firebase/firestore';
import { monthlyEquivalent } from '../../src/lib/costNormalization';
import { RegistryItem } from '../../src/types/models';
import { ItemStatus, BillingCycle } from '../../src/types/enums';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    projectId: 'registry-app-test-home',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});

afterAll(async () => await testEnv.cleanup());
afterEach(async () => await testEnv.clearFirestore());

function baseItem(overrides: Partial<RegistryItem>) {
  return {
    name: 'Item',
    cost: 10,
    billingCycle: BillingCycle.Monthly,
    kind: 'subscription',
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

function subscribeOnce(db: ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>, uid: string): Promise<RegistryItem[]> {
  return new Promise((resolve, reject) => {
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

test('aggregates monthlyEquivalent cost across mixed billing cycles from real Firestore', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  // Item 1: $10/month = $10/mo
  await setDoc(doc(alice, 'registryItems/item1'), baseItem({
    name: 'Monthly Tool',
    cost: 10,
    billingCycle: BillingCycle.Monthly,
    createdBy: 'alice',
  }));

  // Item 2: $120/year = $10/mo
  await setDoc(doc(alice, 'registryItems/item2'), baseItem({
    name: 'Annual License',
    cost: 120,
    billingCycle: BillingCycle.Annual,
    createdBy: 'alice',
  }));

  // Item 3: $500 one-time = $0/mo (not recurring)
  await setDoc(doc(alice, 'registryItems/item3'), baseItem({
    name: 'OneTime Purchase',
    cost: 500,
    billingCycle: BillingCycle.OneTime,
    createdBy: 'alice',
  }));

  const items = await subscribeOnce(alice, 'alice');
  expect(items).toHaveLength(3);

  const totalMonthly = items.reduce(
    (sum, item) => sum + monthlyEquivalent(item.cost, item.billingCycle as any),
    0
  );

  // $10 (monthly) + $10 (120/12 annual) + $0 (one-time) = $20/mo
  expect(totalMonthly).toBeCloseTo(20, 1);
});

test('status count aggregation across real Firestore items', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  await setDoc(doc(alice, 'registryItems/keep1'), baseItem({
    status: ItemStatus.Keep,
    createdBy: 'alice',
  }));
  await setDoc(doc(alice, 'registryItems/review1'), baseItem({
    status: ItemStatus.Review,
    createdBy: 'alice',
  }));
  await setDoc(doc(alice, 'registryItems/review2'), baseItem({
    status: ItemStatus.Review,
    createdBy: 'alice',
  }));
  await setDoc(doc(alice, 'registryItems/cut1'), baseItem({
    status: ItemStatus.Cut,
    createdBy: 'alice',
  }));

  const items = await subscribeOnce(alice, 'alice');
  expect(items).toHaveLength(4);

  const counts = { keep: 0, review: 0, cut: 0 };
  items.forEach((item) => {
    counts[item.status as keyof typeof counts]++;
  });

  expect(counts.keep).toBe(1);
  expect(counts.review).toBe(2);
  expect(counts.cut).toBe(1);
});
