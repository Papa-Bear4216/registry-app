import { render } from '@testing-library/react-native';
import { HomeScreen } from '../../src/screens/home/HomeScreen';
import { ItemStatus, BillingCycle, ItemKind } from '../../src/types/enums';
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
  item({ name: 'Netflix', cost: 10, billingCycle: BillingCycle.Monthly, status: ItemStatus.Keep }),
  item({ name: 'Annual Tool', cost: 120, billingCycle: BillingCycle.Annual, status: ItemStatus.Review }),
  item({ name: 'OneTime', cost: 500, billingCycle: BillingCycle.OneTime, status: ItemStatus.Cut }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'alice' }, loading: false });
  mockUseRegistryItems.mockReturnValue({ items: fixtures, loading: false });
});

test('sums monthly-equivalent cost across mixed billing cycles (monthly + annual + one-time)', async () => {
  const { findByText } = await render(<HomeScreen />);
  // $10/mo (monthly) + $10/mo (120 annual / 12) + $0/mo (one-time) = $20/mo
  expect(await findByText(/\$20\.00\/mo/)).toBeTruthy();
});

test('counts items by status', async () => {
  const { findByText } = await render(<HomeScreen />);
  expect(await findByText(/Keep: 1/)).toBeTruthy();
  expect(await findByText(/Review: 1/)).toBeTruthy();
  expect(await findByText(/Cut: 1/)).toBeTruthy();
});

test('displays total item count', async () => {
  const { findByText } = await render(<HomeScreen />);
  expect(await findByText(/3 items tracked/)).toBeTruthy();
});

test('shows loading text while items are loading', async () => {
  mockUseRegistryItems.mockReturnValue({ items: [], loading: true });
  const { findByText } = await render(<HomeScreen />);
  expect(await findByText('Loading…')).toBeTruthy();
});
