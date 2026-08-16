import { Observation } from '../types/models';

const TWENTY_ONE_DAYS_MS = 21 * 24 * 60 * 60 * 1000;

// Dormancy is DERIVED, never stored. An item is dormant when it has no
// observation within the trailing 21-day window (or has never been observed
// at all). This is the canonical dormancy check — mirror it if a Phase 2
// dormancyCheck Cloud Function is ever built.
export function isDormant(observations: Observation[]): boolean {
  if (observations.length === 0) return true;
  const latest = Math.max(...observations.map((o) => new Date(o.observedAt).getTime()));
  return Date.now() - latest > TWENTY_ONE_DAYS_MS;
}
