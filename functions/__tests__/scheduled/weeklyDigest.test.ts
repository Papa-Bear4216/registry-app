import { buildDigestSummary } from '../../src/scheduled/weeklyDigest';

test('summarizes item count, total monthly spend, and dormant count', () => {
  const items = [
    { id: '1', cost: 10, billingCycle: 'monthly', status: 'keep', observations: [{ observedAt: new Date().toISOString() }] },
    { id: '2', cost: 120, billingCycle: 'annual', status: 'review', observations: [] },
    { id: '3', cost: 5, billingCycle: 'monthly', status: 'cut', observations: [] },
  ];

  const summary = buildDigestSummary(items);

  expect(summary.itemCount).toBe(3);
  expect(summary.totalMonthlySpend).toBeCloseTo(25); // 10 + (120/12) + 5
  expect(summary.dormantCount).toBe(2); // items 2 and 3 have no observations
  expect(summary.flaggedToCutCount).toBe(1); // status 'cut'
});
