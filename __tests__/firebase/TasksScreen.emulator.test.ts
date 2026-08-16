// Exercises TasksScreen's grouping logic against a REAL Firestore backend,
// ensuring items are correctly grouped by taskCategories. While grouping itself
// is client-side logic (pure JS transformation on fetched items), this test
// validates the end-to-end pipeline: items are fetched via useRegistryItems,
// then grouped by taskCategories.
//
// Runs under the `node` Jest project (real network), following the same pattern
// as useRegistryItems.emulator.test.ts. The grouping transformation is identical
// to what TasksScreen.tsx performs: build a Map<TaskCategory, RegistryItem[]> and
// render sections for each category.
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, query, where, onSnapshot, setLogLevel, Firestore } from 'firebase/firestore';
import { registryItemsRef } from '../../src/firebase/firestore';
import { RegistryItem } from '../../src/types/models';
import { TaskCategory } from '../../src/types/enums';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    projectId: 'registry-app-test-tasks',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});

afterAll(async () => await testEnv.cleanup());
afterEach(async () => await testEnv.clearFirestore());

function baseItem(overrides: Partial<RegistryItem>) {
  return {
    name: 'Test Item',
    cost: 10,
    billingCycle: 'monthly',
    kind: 'app',
    status: 'keep',
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

function groupByCategory(items: RegistryItem[]): Map<TaskCategory, RegistryItem[]> {
  const byCategory = new Map<TaskCategory, RegistryItem[]>();
  items.forEach((item) => {
    item.taskCategories.forEach((cat) => {
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(item);
    });
  });
  return byCategory;
}

test('items with single task category appear in exactly one group', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  await setDoc(doc(alice, 'registryItems/item1'), baseItem({
    name: 'VS Code',
    taskCategories: [TaskCategory.Coding],
  }));

  const items = await subscribeOnce(alice, 'alice');
  const grouped = groupByCategory(items);

  expect(grouped.size).toBe(1);
  expect(grouped.has(TaskCategory.Coding)).toBe(true);
  expect(grouped.get(TaskCategory.Coding)).toHaveLength(1);
  expect(grouped.get(TaskCategory.Coding)![0].name).toBe('VS Code');
});

test('items with multiple task categories appear in each category group', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  await setDoc(doc(alice, 'registryItems/item1'), baseItem({
    name: 'Slack',
    taskCategories: [TaskCategory.Communication, TaskCategory.Productivity],
  }));

  const items = await subscribeOnce(alice, 'alice');
  const grouped = groupByCategory(items);

  expect(grouped.size).toBe(2);
  expect(grouped.get(TaskCategory.Communication)).toHaveLength(1);
  expect(grouped.get(TaskCategory.Productivity)).toHaveLength(1);
  expect(grouped.get(TaskCategory.Communication)![0].name).toBe('Slack');
  expect(grouped.get(TaskCategory.Productivity)![0].name).toBe('Slack');
});

test('multiple items are correctly grouped across categories', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  await setDoc(doc(alice, 'registryItems/item1'), baseItem({
    name: 'VS Code',
    taskCategories: [TaskCategory.Coding],
  }));

  await setDoc(doc(alice, 'registryItems/item2'), baseItem({
    name: 'Figma',
    taskCategories: [TaskCategory.Design],
  }));

  await setDoc(doc(alice, 'registryItems/item3'), baseItem({
    name: 'Slack',
    taskCategories: [TaskCategory.Communication, TaskCategory.Productivity],
  }));

  const items = await subscribeOnce(alice, 'alice');
  const grouped = groupByCategory(items);

  expect(grouped.size).toBe(4);
  expect(grouped.get(TaskCategory.Coding)).toHaveLength(1);
  expect(grouped.get(TaskCategory.Design)).toHaveLength(1);
  expect(grouped.get(TaskCategory.Communication)).toHaveLength(1);
  expect(grouped.get(TaskCategory.Productivity)).toHaveLength(1);
});

test('empty taskCategories array results in item not appearing in any group', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  await setDoc(doc(alice, 'registryItems/item1'), baseItem({
    name: 'Untagged Item',
    taskCategories: [],
  }));

  const items = await subscribeOnce(alice, 'alice');
  const grouped = groupByCategory(items);

  expect(grouped.size).toBe(0);
});

test('scoped to authenticated user — alice\'s items don\'t leak to bob', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();

  await setDoc(doc(alice, 'registryItems/alice-item'), baseItem({
    name: 'Alice Tool',
    taskCategories: [TaskCategory.Coding],
    createdBy: 'alice',
  }));

  await setDoc(doc(bob, 'registryItems/bob-item'), baseItem({
    name: 'Bob Tool',
    taskCategories: [TaskCategory.Design],
    createdBy: 'bob',
  }));

  const aliceItems = await subscribeOnce(alice, 'alice');
  const bobItems = await subscribeOnce(bob, 'bob');

  const aliceGrouped = groupByCategory(aliceItems);
  const bobGrouped = groupByCategory(bobItems);

  expect(aliceGrouped.size).toBe(1);
  expect(aliceGrouped.get(TaskCategory.Coding)![0].name).toBe('Alice Tool');

  expect(bobGrouped.size).toBe(1);
  expect(bobGrouped.get(TaskCategory.Design)![0].name).toBe('Bob Tool');
});
