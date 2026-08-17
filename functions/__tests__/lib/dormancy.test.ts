import { isDormant } from '../../src/lib/dormancy';

function makeObservation(daysAgo: number) {
  return { observedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString() };
}

test('item with no observations is dormant', () => {
  expect(isDormant([])).toBe(true);
});

test('item observed 10 days ago is not dormant', () => {
  expect(isDormant([makeObservation(10)])).toBe(false);
});

test('item last observed 22 days ago is dormant', () => {
  expect(isDormant([makeObservation(22)])).toBe(true);
});
