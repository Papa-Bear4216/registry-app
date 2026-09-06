import { isRealAutomation } from '../../src/lib/shortcutFilter';
import { ItemKind, ItemStatus, BillingCycle } from '../../src/types/enums';
import { RegistryItem } from '../../src/types/models';

function mockItem(overrides: Partial<RegistryItem>): RegistryItem {
  return {
    id: 'test-1',
    name: 'Test',
    cost: 0,
    billingCycle: BillingCycle.Monthly,
    kind: ItemKind.App,
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

describe('shortcutFilter', () => {
  it('filters out raw Android reverse-DNS package names without actions', () => {
    expect(isRealAutomation(mockItem({ name: 'com.facebook.orca' }))).toBe(false);
    expect(isRealAutomation(mockItem({ name: 'com.google.android.apps.maps' }))).toBe(false);
    expect(isRealAutomation(mockItem({ name: 'org.chromium.webapk.ae39f1c5f958715ac_v2' }))).toBe(false);
  });

  it('keeps genuine workflow shortcuts and actions', () => {
    expect(isRealAutomation(mockItem({
      name: 'Quick Copy Notes',
      suggestedAction: { type: 'intent', payload: 'android.intent.action.SEND', estimatedSecondsSaved: 30 }
    }))).toBe(true);

    expect(isRealAutomation(mockItem({
      name: 'Daily Standup Macro',
      triggerSignature: { sourceApps: ['com.slack'] }
    }))).toBe(true);

    expect(isRealAutomation(mockItem({
      name: 'Clean Screenshot Macro',
      kind: ItemKind.DevTool,
    }))).toBe(true);
  });
});
