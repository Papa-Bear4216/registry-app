import { formatDecayClock, formatReusability, calculateTotalTimeSavedMinutes } from '../../src/lib/clockFormat';

describe('clockFormat helper', () => {
  it('formats healthy decay clock with days remaining', () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatDecayClock(futureDate, 'keep');
    expect(result.badge).toBe('healthy');
    expect(result.text).toContain('10d left');
  });

  it('formats warning when clock has <= 3 days left', () => {
    const soonDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatDecayClock(soonDate, 'keep');
    expect(result.badge).toBe('warning');
    expect(result.text).toContain('Expiring');
  });

  it('formats expired clock when timestamp is in past', () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const result = formatDecayClock(pastDate, 'keep');
    expect(result.badge).toBe('expired');
  });

  it('formats reusability run count', () => {
    expect(formatReusability(1)).toBe('⚡ 1 run');
    expect(formatReusability(42)).toBe('⚡ 42 runs');
    expect(formatReusability(undefined)).toBe('⚡ 0 runs');
  });

  it('calculates total time saved minutes', () => {
    const items = [
      { reusabilityCount: 10, estimatedSecondsSaved: 60 },
      { reusabilityCount: 20, estimatedSecondsSaved: 30 },
    ] as any;
    const totalMinutes = calculateTotalTimeSavedMinutes(items);
    expect(totalMinutes).toBe(20); // 10*1 + 20*0.5 = 20 mins
  });
});
