import { isDormant } from '../../src/lib/dormancy';
import { Observation } from '../../src/types/models';

function makeObservation(daysAgo: number): Observation {
  return {
    id: 'x', registryItemId: 'item1',
    observedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    windowHours: 24, usageCount: 1, usageDurationMs: 60000, createdBy: 'alice',
  };
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

test('item last observed exactly 21 days ago is not yet dormant', () => {
  expect(isDormant([makeObservation(20.9)])).toBe(false);
});

test('only the most recent observation matters (mixed recent + old)', () => {
  expect(isDormant([makeObservation(30), makeObservation(5)])).toBe(false);
});

test('all observations old means dormant', () => {
  expect(isDormant([makeObservation(40), makeObservation(25)])).toBe(true);
});
