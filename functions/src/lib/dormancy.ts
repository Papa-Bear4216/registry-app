const TWENTY_ONE_DAYS_MS = 21 * 24 * 60 * 60 * 1000;

export function isDormant(observations: { observedAt: string }[]): boolean {
  if (observations.length === 0) return true;
  const latest = Math.max(...observations.map((o) => new Date(o.observedAt).getTime()));
  return Date.now() - latest > TWENTY_ONE_DAYS_MS;
}
