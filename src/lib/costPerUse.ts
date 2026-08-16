import { Observation } from '../types/models';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function costPerUseStat(observations: Observation[]): { usageCount: number; usageHours: number } {
  const cutoff = Date.now() - NINETY_DAYS_MS;
  const inWindow = observations.filter((o) => new Date(o.observedAt).getTime() >= cutoff);
  const usageCount = inWindow.reduce((sum, o) => sum + o.usageCount, 0);
  const usageDurationMs = inWindow.reduce((sum, o) => sum + o.usageDurationMs, 0);
  return { usageCount, usageHours: usageDurationMs / (1000 * 60 * 60) };
}
