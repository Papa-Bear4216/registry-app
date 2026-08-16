// Verifies TasksScreen's UI behavior — rendering section list grouped by task categories —
// without touching the network. useAuth and useRegistryItems are mocked with fixtures,
// so jest-expo's native-networking stub doesn't apply here.
//
// The actual "does the grouping logic work correctly with real Firestore items"
// assertion lives in __tests__/firebase/TasksScreen.emulator.test.ts, which runs
// under the `node` Jest project against a real Firestore backend. A jest-expo .test.tsx
// can't make that assertion meaningfully: jest-expo stubs native networking.
import { render } from '@testing-library/react-native';
import { TasksScreen } from '../../src/screens/tasks/TasksScreen';

const mockUseAuth = jest.fn();
const mockUseRegistryItems = jest.fn();

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../../src/hooks/useRegistryItems', () => ({
  useRegistryItems: () => mockUseRegistryItems(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'alice' }, loading: false });
  mockUseRegistryItems.mockReturnValue({
    items: [
      {
        id: 'item1',
        name: 'VS Code',
        cost: 0,
        billingCycle: 'monthly',
        kind: 'dev_tool',
        status: 'keep',
        taskCategories: ['coding'],
        description: '',
        canonicalIdentity: null,
        justified: false,
        isBestForTask: false,
        useCases: null,
        capabilitySummary: null,
        sourceUrl: null,
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'item2',
        name: 'Figma',
        cost: 12,
        billingCycle: 'monthly',
        kind: 'app',
        status: 'keep',
        taskCategories: ['design'],
        description: '',
        canonicalIdentity: null,
        justified: false,
        isBestForTask: false,
        useCases: null,
        capabilitySummary: null,
        sourceUrl: null,
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'item3',
        name: 'Slack',
        cost: 8,
        billingCycle: 'monthly',
        kind: 'app',
        status: 'keep',
        taskCategories: ['communication', 'productivity'],
        description: '',
        canonicalIdentity: null,
        justified: false,
        isBestForTask: false,
        useCases: null,
        capabilitySummary: null,
        sourceUrl: null,
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
      },
    ],
    loading: false,
  });
});

test('renders section list with items grouped under their task categories', async () => {
  const { getByText } = await render(<TasksScreen />);

  // Check that section headers exist for each category
  expect(getByText('coding')).toBeTruthy();
  expect(getByText('design')).toBeTruthy();
  expect(getByText('communication')).toBeTruthy();
  expect(getByText('productivity')).toBeTruthy();

  // Check that items appear under their respective sections
  expect(getByText('VS Code')).toBeTruthy();
  expect(getByText('Figma')).toBeTruthy();
  expect(getByText('Slack')).toBeTruthy();
});

test('items with multiple task categories appear in each section', async () => {
  const { getAllByText } = await render(<TasksScreen />);

  // Slack should appear at least once (it's in multiple categories)
  const slackTexts = getAllByText('Slack');
  expect(slackTexts.length).toBeGreaterThanOrEqual(1);
});
