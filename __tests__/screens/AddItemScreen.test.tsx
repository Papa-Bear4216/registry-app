// Verifies AddItemScreen's UI behavior — form field updates, chip selection,
// and that Save/navigation.goBack fire — without touching the network.
// useAuth and Firestore's addDoc are mocked with fixtures, so jest-expo's
// native-networking stub (which makes network-dependent .test.tsx assertions
// vacuous, see __tests__/hooks/useAuth.test.tsx) doesn't apply here.
//
// The actual "did this write to Firestore with createdBy set correctly"
// assertion is NOT made here — it lives in
// __tests__/firebase/AddItemScreen.emulator.test.ts, which runs under the
// `node` Jest project against a real (rules-unit-testing) Firestore backend.
// A jest-expo .test.tsx can't make that assertion meaningfully: jest-expo
// stubs native networking, so even an unmocked addDoc call here would never
// reach the emulator (same conclusion as Task 4's
// useRegistryItems.emulator.test.ts note).
import { render, fireEvent } from '@testing-library/react-native';
import { AddItemScreen } from '../../src/screens/registry/AddItemScreen';
import { BillingCycle, ItemKind, TaskCategory } from '../../src/types/enums';

const mockUseAuth = jest.fn();
const mockAddDoc = jest.fn();

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  collection: jest.fn(),
}));
jest.mock('../../src/firebase/config', () => ({
  initializeFirebaseApp: () => ({ db: {} }),
}));
jest.mock('../../src/firebase/firestore', () => ({
  registryItemsRef: () => 'registryItemsRef',
}));

const navigation = { goBack: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'alice' } });
  mockAddDoc.mockResolvedValue({ id: 'new-id' });
});

test('typing into fields updates their values', async () => {
  const { getByPlaceholderText } = await render(<AddItemScreen navigation={navigation} route={{} as any} />);
  const nameInput = getByPlaceholderText('Name');
  await fireEvent.changeText(nameInput, 'Notion');
  expect(nameInput.props.value).toBe('Notion');

  const costInput = getByPlaceholderText('Cost');
  await fireEvent.changeText(costInput, '10');
  expect(costInput.props.value).toBe('10');

  const descriptionInput = getByPlaceholderText('Description');
  await fireEvent.changeText(descriptionInput, 'Notes app');
  expect(descriptionInput.props.value).toBe('Notes app');
});

test('billing cycle and kind chips are selectable, defaulting to Monthly/Subscription', async () => {
  const { getByTestId } = await render(<AddItemScreen navigation={navigation} route={{} as any} />);

  // Defaults
  expect(getByTestId(`billing-cycle-${BillingCycle.Monthly}`).props.style.backgroundColor).toBe('#2563EB');
  expect(getByTestId(`kind-${ItemKind.Subscription}`).props.style.backgroundColor).toBe('#2563EB');

  await fireEvent.press(getByTestId(`billing-cycle-${BillingCycle.Annual}`));
  expect(getByTestId(`billing-cycle-${BillingCycle.Annual}`).props.style.backgroundColor).toBe('#2563EB');
  expect(getByTestId(`billing-cycle-${BillingCycle.Monthly}`).props.style.backgroundColor).toBe('#E5E7EB');

  await fireEvent.press(getByTestId(`kind-${ItemKind.DevTool}`));
  expect(getByTestId(`kind-${ItemKind.DevTool}`).props.style.backgroundColor).toBe('#2563EB');
  expect(getByTestId(`kind-${ItemKind.Subscription}`).props.style.backgroundColor).toBe('#E5E7EB');
});

test('pressing Save calls addDoc with createdBy set and navigates back', async () => {
  const { getByPlaceholderText, getByText } = await render(<AddItemScreen navigation={navigation} route={{} as any} />);

  await fireEvent.changeText(getByPlaceholderText('Name'), 'Notion');
  await fireEvent.changeText(getByPlaceholderText('Cost'), '10');
  await fireEvent.press(getByText('Save'));

  expect(mockAddDoc).toHaveBeenCalledWith(
    'registryItemsRef',
    expect.objectContaining({ name: 'Notion', cost: 10, createdBy: 'alice' })
  );
  expect(navigation.goBack).toHaveBeenCalled();
});

test('selecting task category chips toggles them and Save writes the selected categories', async () => {
  const { getByPlaceholderText, getByText, getByTestId } = await render(
    <AddItemScreen navigation={navigation} route={{} as any} />
  );

  // Default: no task categories selected.
  expect(getByTestId(`task-category-${TaskCategory.Coding}`).props.style.backgroundColor).toBe('#E5E7EB');

  await fireEvent.press(getByTestId(`task-category-${TaskCategory.Coding}`));
  await fireEvent.press(getByTestId(`task-category-${TaskCategory.Writing}`));
  expect(getByTestId(`task-category-${TaskCategory.Coding}`).props.style.backgroundColor).toBe('#2563EB');
  expect(getByTestId(`task-category-${TaskCategory.Writing}`).props.style.backgroundColor).toBe('#2563EB');

  // Toggling Coding back off should remove it while Writing stays selected.
  await fireEvent.press(getByTestId(`task-category-${TaskCategory.Coding}`));
  expect(getByTestId(`task-category-${TaskCategory.Coding}`).props.style.backgroundColor).toBe('#E5E7EB');

  await fireEvent.changeText(getByPlaceholderText('Name'), 'Notion');
  await fireEvent.changeText(getByPlaceholderText('Cost'), '10');
  await fireEvent.press(getByText('Save'));

  expect(mockAddDoc).toHaveBeenCalledWith(
    'registryItemsRef',
    expect.objectContaining({ taskCategories: [TaskCategory.Writing] })
  );
});

test('Save does nothing when there is no authenticated user', async () => {
  mockUseAuth.mockReturnValue({ user: null });
  const { getByText } = await render(<AddItemScreen navigation={navigation} route={{} as any} />);

  await fireEvent.press(getByText('Save'));

  expect(mockAddDoc).not.toHaveBeenCalled();
  expect(navigation.goBack).not.toHaveBeenCalled();
});
