// Verifies RegistryListScreen's search + status/kind filter logic — the actual
// deliverable of Task 4 (the emulator test in
// __tests__/firebase/useRegistryItems.emulator.test.ts covers the data layer).
// This is a legitimate .test.tsx: it renders under jest-expo but never touches
// the network — useAuth and useRegistryItems are mocked with fixture data, so
// jest-expo's native-networking stub (which makes network-dependent .test.tsx
// assertions vacuous, see __tests__/hooks/useAuth.test.tsx) doesn't apply here.
//
// This installed RNTL version's render() is async (returns Promise<RenderResult>,
// like this version's renderHook — see the note in __tests__/hooks/useAuth.test.tsx)
// and its `render` result must be awaited and destructured directly: the `screen`
// singleton export only becomes queryable via an internal `exports.screen`
// reassignment inside render(), which a destructured `import { screen }` in this
// file does not observe (confirmed empirically — every screen.* query threw
// "`render` function has not been called" even after a successful render).
import { render, fireEvent } from '@testing-library/react-native';
import { RegistryListScreen } from '../../src/screens/registry/RegistryListScreen';
import { ItemStatus, ItemKind, BillingCycle } from '../../src/types/enums';
import { RegistryItem } from '../../src/types/models';

const mockUseAuth = jest.fn();
const mockUseRegistryItems = jest.fn();

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock('../../src/hooks/useRegistryItems', () => ({
  useRegistryItems: () => mockUseRegistryItems(),
}));

function item(overrides: Partial<RegistryItem>): RegistryItem {
  return {
    id: overrides.name ?? 'item',
    name: 'Item',
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

const fixtures: RegistryItem[] = [
  item({ name: 'Netflix', status: ItemStatus.Keep, kind: ItemKind.Subscription }),
  item({ name: 'Notion', status: ItemStatus.Review, kind: ItemKind.App, suggestedAction: 'Create quick note' }),
  item({ name: 'GitHub Copilot', status: ItemStatus.Cut, kind: ItemKind.DevTool }),
];

const navigation = { navigate: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'alice' }, loading: false });
  mockUseRegistryItems.mockReturnValue({ items: fixtures, loading: false });
});

test('renders all items with no filters applied', async () => {
  const { getByText } = await render(<RegistryListScreen navigation={navigation} route={{} as any} />);
  expect(getByText('Netflix')).toBeTruthy();
  expect(getByText('Notion')).toBeTruthy();
  expect(getByText('GitHub Copilot')).toBeTruthy();
});

test('search narrows the list by name (case-insensitive)', async () => {
  const { getByPlaceholderText, getByText, queryByText } = await render(
    <RegistryListScreen navigation={navigation} route={{} as any} />
  );
  await fireEvent.changeText(getByPlaceholderText('Search automations…'), 'NOTI');
  expect(getByText('Notion')).toBeTruthy();
  expect(queryByText('Netflix')).toBeNull();
  expect(queryByText('GitHub Copilot')).toBeNull();
});

test('status chip narrows the list, and "All Statuses" restores it', async () => {
  const { getByTestId, getByText, queryByText } = await render(
    <RegistryListScreen navigation={navigation} route={{} as any} />
  );
  // Status appears twice per matching row (filter chip + StatusBadge), so the
  // chip is targeted by testID rather than text.
  await fireEvent.press(getByTestId(`status-filter-${ItemStatus.Review}`));
  expect(getByText('Notion')).toBeTruthy();
  expect(queryByText('Netflix')).toBeNull();
  expect(queryByText('GitHub Copilot')).toBeNull();

  await fireEvent.press(getByText('All Statuses'));
  expect(getByText('Netflix')).toBeTruthy();
  expect(getByText('Notion')).toBeTruthy();
  expect(getByText('GitHub Copilot')).toBeTruthy();
});

test('shows empty state when no items match filters', async () => {
  const { getByPlaceholderText, getByText } = await render(
    <RegistryListScreen navigation={navigation} route={{} as any} />
  );
  await fireEvent.changeText(getByPlaceholderText('Search automations…'), 'NonExistentShortcut');
  expect(getByText('No Active Automations')).toBeTruthy();
  expect(getByText('+ Create Custom Shortcut')).toBeTruthy();
});

test('tapping a list item navigates to ItemDetail with the item id', async () => {
  const { getByText } = await render(<RegistryListScreen navigation={navigation} route={{} as any} />);
  fireEvent.press(getByText('Netflix'));
  expect(navigation.navigate).toHaveBeenCalledWith('ItemDetail', { itemId: 'Netflix' });
});

test('FAB navigates to AddItem', async () => {
  const { getByText } = await render(<RegistryListScreen navigation={navigation} route={{} as any} />);
  fireEvent.press(getByText('+'));
  expect(navigation.navigate).toHaveBeenCalledWith('AddItem');
});

test('shows loading text while items are loading', async () => {
  mockUseRegistryItems.mockReturnValue({ items: [], loading: true });
  const { getByText } = await render(<RegistryListScreen navigation={navigation} route={{} as any} />);
  expect(getByText('Loading…')).toBeTruthy();
});
