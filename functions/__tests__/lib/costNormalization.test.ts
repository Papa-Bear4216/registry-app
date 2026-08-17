import { monthlyEquivalent } from '../../src/lib/costNormalization';

test('converts weekly to monthly', () => {
  expect(monthlyEquivalent(10, 'weekly')).toBeCloseTo(43.3);
});

test('leaves monthly unchanged', () => {
  expect(monthlyEquivalent(10, 'monthly')).toBe(10);
});

test('converts quarterly to monthly', () => {
  expect(monthlyEquivalent(30, 'quarterly')).toBe(10);
});

test('converts annual to monthly', () => {
  expect(monthlyEquivalent(120, 'annual')).toBe(10);
});

test('treats one_time as zero monthly cost', () => {
  expect(monthlyEquivalent(500, 'one_time')).toBe(0);
});

test('treats an unrecognized billingCycle as zero monthly cost rather than the raw cost', () => {
  expect(monthlyEquivalent(500, 'not_a_real_cycle')).toBe(0);
});
