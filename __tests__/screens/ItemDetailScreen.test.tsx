// Verifies ItemDetailScreen's UI behavior — rendering fetched item data,
// the cost-per-use raw-pair display, log-observation form interaction,
// retire/reactivate toggle, and delete — without touching the network.
// firebase/firestore, useObservations, and firebase/config are mocked with
// fixtures.
//
// The actual "did this write to Firestore with createdBy set / rules
// enforced" assertions are NOT made here — they live in
// __tests__/firebase/ItemDetailScreen.emulator.test.ts, which runs under the
// `node` Jest project against a real (rules-unit-testing) Firestore backend.
// A jest-expo .test.tsx can't make that assertion meaningfully: jest-expo
// stubs native networking, so even an unmocked Firestore call here would
// never reach the emulator (same conclusion as Task 4/5's precedent, see
// __tests__/screens/AddItemScreen.test.tsx and
// __tests__/hooks/useAuth.test.tsx).
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ItemDetailScreen } from '../../src/screens/registry/ItemDetailScreen';
import { ItemStatus } from '../../src/types/enums';

const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockUseObservations = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => args,
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
}));
jest.mock('../../src/firebase/config', () => ({
  initializeFirebaseApp: () => ({ db: {} }),
}));
jest.mock('../../src/hooks/useObservations', () => ({
  useObservations: (...args: unknown[]) => mockUseObservations(...args),
}));

const baseItemData = {
  name: 'Figma',
  cost: 12,
  billingCycle: 'monthly',
  kind: 'app',
  status: ItemStatus.Keep,
  taskCategories: ['design'],
  description: 'Design tool',
  canonicalIdentity: null,
  justified: false,
  isBestForTask: false,
  useCases: null,
  capabilitySummary: null,
  sourceUrl: null,
  createdBy: 'alice',
  createdAt: new Date().toISOString(),
};

function mockItemSnapshot(data: Record<string, unknown> = baseItemData) {
  mockGetDoc.mockResolvedValue({ exists: () => true, id: 'item1', data: () => data });
}

const route = { params: { itemId: 'item1' } } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseObservations.mockReturnValue({ observations: [], logObservation: jest.fn() });
  mockItemSnapshot();
});

test('renders item name, description, monthly cost, and raw-pair usage stat', async () => {
  const navigation = { goBack: jest.fn() } as any;
  const { findByText } = await render(<ItemDetailScreen route={route} navigation={navigation} />);

  await findByText('Figma');
  await findByText('Design tool');
  await findByText(/\$12\.00\/mo · used 0× \/ 0\.0 hrs in last 90d/);
});

test('cost-per-use stat reflects observations returned by useObservations', async () => {
  mockUseObservations.mockReturnValue({
    observations: [
      {
        id: 'o1',
        registryItemId: 'item1',
        observedAt: new Date().toISOString(),
        windowHours: 24,
        usageCount: 4,
        usageDurationMs: 3_600_000,
        createdBy: 'alice',
      },
    ],
    logObservation: jest.fn(),
  });
  const navigation = { goBack: jest.fn() } as any;
  const { findByText } = await render(<ItemDetailScreen route={route} navigation={navigation} />);

  await findByText(/\$12\.00\/mo · used 4× \/ 1\.0 hrs in last 90d/);
});

test('logging an observation calls logObservation with parsed values and clears the form', async () => {
  const mockLogObservation = jest.fn().mockResolvedValue(undefined);
  mockUseObservations.mockReturnValue({ observations: [], logObservation: mockLogObservation });
  const navigation = { goBack: jest.fn() } as any;
  const { findByText, getByPlaceholderText, getByText } = await render(
    <ItemDetailScreen route={route} navigation={navigation} />
  );
  await findByText('Figma');

  const countInput = getByPlaceholderText('Times used');
  const minutesInput = getByPlaceholderText('Minutes used');
  await fireEvent.changeText(countInput, '3');
  await fireEvent.changeText(minutesInput, '30');
  await fireEvent.press(getByText('Log Observation'));

  await waitFor(() => expect(mockLogObservation).toHaveBeenCalledWith(3, 30 * 60 * 1000));
  await waitFor(() => expect(countInput.props.value).toBe(''));
  expect(minutesInput.props.value).toBe('');
});

test('pressing Retire toggles status to Cut and updates the button label', async () => {
  mockUpdateDoc.mockResolvedValue(undefined);
  const navigation = { goBack: jest.fn() } as any;
  const { findByText, getByText } = await render(<ItemDetailScreen route={route} navigation={navigation} />);
  await findByText('Figma');

  expect(getByText('Retire')).toBeTruthy();
  await fireEvent.press(getByText('Retire'));

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledWith(
    expect.anything(),
    { status: ItemStatus.Cut }
  ));
  await findByText('Reactivate');
});

test('pressing Reactivate on a retired item toggles status back to Keep', async () => {
  mockItemSnapshot({ ...baseItemData, status: ItemStatus.Cut });
  mockUpdateDoc.mockResolvedValue(undefined);
  const navigation = { goBack: jest.fn() } as any;
  const { findByText } = await render(<ItemDetailScreen route={route} navigation={navigation} />);

  const reactivateButton = await findByText('Reactivate');
  await fireEvent.press(reactivateButton);

  await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledWith(
    expect.anything(),
    { status: ItemStatus.Keep }
  ));
  await findByText('Retire');
});

test('pressing Delete calls deleteDoc and navigates back', async () => {
  mockDeleteDoc.mockResolvedValue(undefined);
  const navigation = { goBack: jest.fn() } as any;
  const { findByText, getByText } = await render(<ItemDetailScreen route={route} navigation={navigation} />);
  await findByText('Figma');

  await fireEvent.press(getByText('Delete'));

  await waitFor(() => expect(mockDeleteDoc).toHaveBeenCalled());
  expect(navigation.goBack).toHaveBeenCalled();
});
