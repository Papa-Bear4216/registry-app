import { monthlyEquivalent } from '../../src/lib/costNormalization';
import { BillingCycle } from '../../src/types/enums';

test('monthly cost passes through unchanged', () => {
  expect(monthlyEquivalent(10, BillingCycle.Monthly)).toBe(10);
});

test('annual cost divides by 12', () => {
  expect(monthlyEquivalent(120, BillingCycle.Annual)).toBe(10);
});

test('quarterly cost divides by 3', () => {
  expect(monthlyEquivalent(30, BillingCycle.Quarterly)).toBe(10);
});

test('weekly cost multiplies by 4.33', () => {
  expect(monthlyEquivalent(10, BillingCycle.Weekly)).toBeCloseTo(43.3);
});

test('one-time cost normalizes to zero', () => {
  expect(monthlyEquivalent(500, BillingCycle.OneTime)).toBe(0);
});
