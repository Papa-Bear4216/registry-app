import { RegistryItem } from '../types/models';

export function formatDecayClock(
  keepClockExpiresAt?: string | null,
  status?: string
): { text: string; color: string; badge: 'healthy' | 'warning' | 'expired' } {
  if (status === 'review') {
    return { text: '⚠️ Demoted to Review', color: '#DC2626', badge: 'expired' };
  }
  if (status === 'cut') {
    return { text: '✂️ Cut', color: '#6B7280', badge: 'expired' };
  }
  if (!keepClockExpiresAt) {
    return { text: '⏳ 14d clock active', color: '#16A34A', badge: 'healthy' };
  }

  const expiry = new Date(keepClockExpiresAt).getTime();
  const now = Date.now();
  const diffMs = expiry - now;
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return { text: '⚠️ Clock expired', color: '#DC2626', badge: 'expired' };
  }
  if (daysLeft <= 3) {
    return { text: `⏳ ${daysLeft}d left (Expiring!)`, color: '#D97706', badge: 'warning' };
  }
  return { text: `⏳ ${daysLeft}d left`, color: '#16A34A', badge: 'healthy' };
}

export function formatReusability(count?: number): string {
  const n = count || 0;
  return `⚡ ${n} ${n === 1 ? 'run' : 'runs'}`;
}

export function calculateTotalTimeSavedMinutes(items: RegistryItem[]): number {
  return items.reduce((sum, item) => {
    const runs = item.reusabilityCount || 0;
    const secondsPerRun = item.estimatedSecondsSaved || 30;
    return sum + (runs * secondsPerRun) / 60;
  }, 0);
}
