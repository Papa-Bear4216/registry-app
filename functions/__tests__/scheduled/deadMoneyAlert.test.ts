import { checkDeadMoneyThreshold } from '../../src/scheduled/deadMoneyAlert';

test('triggers when a single dormant item exceeds $5/mo', () => {
  const items = [{ id: '1', cost: 10, billingCycle: 'monthly', observations: [] }];
  const result = checkDeadMoneyThreshold(items);
  expect(result.shouldAlert).toBe(true);
  expect(result.reason).toContain('single item');
});

test('triggers when total dormant spend exceeds $20/mo even with no single item over $5', () => {
  const items = [
    { id: '1', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '2', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '3', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '4', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '5', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '6', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '7', cost: 3, billingCycle: 'monthly', observations: [] },
  ];
  const result = checkDeadMoneyThreshold(items);
  expect(result.shouldAlert).toBe(true);
  expect(result.reason).toContain('total');
});

test('does not trigger when no items are dormant', () => {
  const recentObservation = [{ observedAt: new Date().toISOString() }];
  const items = [{ id: '1', cost: 100, billingCycle: 'monthly', observations: recentObservation }];
  const result = checkDeadMoneyThreshold(items);
  expect(result.shouldAlert).toBe(false);
});

test('does not trigger when dormant spend is below both thresholds', () => {
  const items = [{ id: '1', cost: 2, billingCycle: 'monthly', observations: [] }];
  const result = checkDeadMoneyThreshold(items);
  expect(result.shouldAlert).toBe(false);
});
