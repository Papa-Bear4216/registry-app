import { render, fireEvent } from '@testing-library/react-native';
import { MonthlyReviewScreen } from '../../src/screens/reviews/MonthlyReviewScreen';
import { ItemStatus, BillingCycle, ItemKind } from '../../src/types/enums';
import { RegistryItem } from '../../src/types/models';
import { updateDoc } from 'firebase/firestore';

const mockUseAuth = jest.fn();
const mockUseRegistryItems = jest.fn();

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock('../../src/hooks/useRegistryItems', () => ({
  useRegistryItems: () => mockUseRegistryItems(),
}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ id: 'mock-doc' })),
  updateDoc: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/firebase/config', () => ({
  initializeFirebaseApp: () => ({ db: {} }),
}));

function makeItem(overrides: Partial<RegistryItem>): RegistryItem {
  return {
    id: overrides.id ?? 'item-1',
    name: overrides.name ?? 'Item',
    cost: 10,
    billingCycle: BillingCycle.Monthly,
    kind: ItemKind.App,
    status: overrides.status ?? ItemStatus.Keep,
    taskCategories: [],
    description: 'Test description',
    canonicalIdentity: null,
    justified: false,
    isBestForTask: false,
    useCases: null,
    capabilitySummary: null,
    sourceUrl: null,
    createdBy: 'alice',
    createdAt: new Date().toISOString(),
    reusabilityCount: 12,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'alice' }, loading: false });
});

test('renders empty state when no items are in review', async () => {
  mockUseRegistryItems.mockReturnValue({
    items: [makeItem({ id: 'item-keep', status: ItemStatus.Keep })],
    loading: false,
  });

  const { findByText } = await render(<MonthlyReviewScreen />);
  expect(await findByText('All Clean!')).toBeTruthy();
  expect(await findByText(/No automations have decayed to Review/)).toBeTruthy();
});

test('renders review cards when items are in Review state', async () => {
  mockUseRegistryItems.mockReturnValue({
    items: [
      makeItem({
        id: 'dormant-shortcut',
        name: 'Export to Sheets',
        status: ItemStatus.Review,
        reusabilityCount: 15,
      }),
    ],
    loading: false,
  });

  const { findByText, getByTestId } = await render(<MonthlyReviewScreen />);
  expect(await findByText('Export to Sheets')).toBeTruthy();
  expect(await findByText('⚡ 15 runs')).toBeTruthy();
  expect(getByTestId('keep-dormant-shortcut')).toBeTruthy();
  expect(getByTestId('cut-dormant-shortcut')).toBeTruthy();
});

test('tapping Keep calls updateDoc with status Keep and 14-day clock', async () => {
  mockUseRegistryItems.mockReturnValue({
    items: [
      makeItem({
        id: 'dormant-shortcut',
        name: 'Export to Sheets',
        status: ItemStatus.Review,
      }),
    ],
    loading: false,
  });

  const { getByTestId } = await render(<MonthlyReviewScreen />);
  const keepBtn = getByTestId('keep-dormant-shortcut');
  await fireEvent.press(keepBtn);

  expect(updateDoc).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      status: ItemStatus.Keep,
      keepClockExpiresAt: expect.any(String),
      reviewReason: null,
    })
  );
});

test('tapping Cut calls updateDoc with status Cut', async () => {
  mockUseRegistryItems.mockReturnValue({
    items: [
      makeItem({
        id: 'dormant-shortcut',
        name: 'Export to Sheets',
        status: ItemStatus.Review,
      }),
    ],
    loading: false,
  });

  const { getByTestId } = await render(<MonthlyReviewScreen />);
  const cutBtn = getByTestId('cut-dormant-shortcut');
  await fireEvent.press(cutBtn);

  expect(updateDoc).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      status: ItemStatus.Cut,
      keepClockExpiresAt: null,
    })
  );
});
