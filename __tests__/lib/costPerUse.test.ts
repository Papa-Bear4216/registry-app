import { costPerUseStat } from '../../src/lib/costPerUse';
import { Observation } from '../../src/types/models';

function makeObservation(daysAgo: number, usageCount: number, usageDurationMs: number): Observation {
  const observedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return { id: 'x', registryItemId: 'item1', observedAt, windowHours: 24, usageCount, usageDurationMs, createdBy: 'alice' };
}

test('sums usage within the trailing 90-day window', () => {
  const observations = [makeObservation(10, 3, 3_600_000), makeObservation(50, 2, 1_800_000)];
  const stat = costPerUseStat(observations);
  expect(stat.usageCount).toBe(5);
  expect(stat.usageHours).toBeCloseTo(1.5);
});

test('excludes observations older than 90 days', () => {
  const observations = [makeObservation(10, 3, 3_600_000), makeObservation(120, 100, 999_999_999)];
  const stat = costPerUseStat(observations);
  expect(stat.usageCount).toBe(3);
});

test('returns zero for no observations', () => {
  const stat = costPerUseStat([]);
  expect(stat.usageCount).toBe(0);
  expect(stat.usageHours).toBe(0);
});
