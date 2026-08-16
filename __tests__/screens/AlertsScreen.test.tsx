// Verifies AlertsScreen's UI behavior — showing dormant items, hiding
// non-dormant/dismissed ones, and wiring the Snooze/Dismiss buttons — without
// touching the network. useAuth, useRegistryItems, useObservations, and
// useAlertDismissals are all mocked with fixtures, so jest-expo's native-
// networking stub doesn't apply here.
//
// The actual "does alertDismissals read/write correctly against real
// Firestore" assertion lives in __tests__/firebase/alertDismissals.emulator.test.ts,
// which runs under the `node` Jest project against a real Firestore backend.
import { render, fireEvent } from '@testing-library/react-native';
import { AlertsScreen } from '../../src/screens/alerts/AlertsScreen';
import { AlertType } from '../../src/types/enums';

const mockUseAuth = jest.fn();
const mockUseRegistryItems = jest.fn();
const mockUseObservations = jest.fn();
const mockDismiss = jest.fn();
const mockIsDismissed = jest.fn();

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../../src/hooks/useRegistryItems', () => ({
  useRegistryItems: () => mockUseRegistryItems(),
}));

jest.mock('../../src/hooks/useObservations', () => ({
  useObservations: (itemId: string) => mockUseObservations(itemId),
}));

jest.mock('../../src/hooks/useAlertDismissals', () => ({
  useAlertDismissals: () => ({
    dismiss: mockDismiss,
    isDismissed: mockIsDismissed,
    dismissals: [],
  }),
}));

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'item1',
    name: 'Unused App',
    cost: 5,
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

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'alice' }, loading: false });
  mockIsDismissed.mockReturnValue(false);
});

test('item with no observations shows as dormant', async () => {
  mockUseRegistryItems.mockReturnValue({ items: [makeItem()], loading: false });
  mockUseObservations.mockReturnValue({ observations: [], logObservation: jest.fn() });

  const { findByText } = await render(<AlertsScreen />);
  await findByText(/Unused App — dormant/);
});

test('item observed recently does not show as dormant', async () => {
  mockUseRegistryItems.mockReturnValue({ items: [makeItem({ name: 'Fresh App' })], loading: false });
  mockUseObservations.mockReturnValue({
    observations: [
      {
        id: 'obs1',
        registryItemId: 'item1',
        observedAt: new Date().toISOString(),
        windowHours: 24,
        usageCount: 1,
        usageDurationMs: 60000,
        createdBy: 'alice',
      },
    ],
    logObservation: jest.fn(),
  });

  const { queryByText } = await render(<AlertsScreen />);
  expect(queryByText(/Fresh App — dormant/)).toBeNull();
});

test('dormant item that has been dismissed is not shown', async () => {
  mockUseRegistryItems.mockReturnValue({ items: [makeItem({ name: 'Dismissed App' })], loading: false });
  mockUseObservations.mockReturnValue({ observations: [], logObservation: jest.fn() });
  mockIsDismissed.mockReturnValue(true);

  const { queryByText } = await render(<AlertsScreen />);
  expect(queryByText(/Dismissed App — dormant/)).toBeNull();
});

test('pressing Snooze 7d calls dismiss with a future snoozedUntil for AlertType.Dormant', async () => {
  mockUseRegistryItems.mockReturnValue({ items: [makeItem()], loading: false });
  mockUseObservations.mockReturnValue({ observations: [], logObservation: jest.fn() });

  const { findByText } = await render(<AlertsScreen />);
  const button = await findByText('Snooze 7d');
  fireEvent.press(button);

  expect(mockDismiss).toHaveBeenCalledTimes(1);
  const [itemId, alertType, snoozedUntil] = mockDismiss.mock.calls[0];
  expect(itemId).toBe('item1');
  expect(alertType).toBe(AlertType.Dormant);
  expect(new Date(snoozedUntil).getTime()).toBeGreaterThan(Date.now());
});

test('pressing Dismiss calls dismiss with null snoozedUntil for AlertType.Dormant', async () => {
  mockUseRegistryItems.mockReturnValue({ items: [makeItem()], loading: false });
  mockUseObservations.mockReturnValue({ observations: [], logObservation: jest.fn() });

  const { findByText } = await render(<AlertsScreen />);
  const button = await findByText('Dismiss');
  fireEvent.press(button);

  expect(mockDismiss).toHaveBeenCalledWith('item1', AlertType.Dormant, null);
});
