import { onSchedule } from 'firebase-functions/v2/scheduler';
import { isDormant } from '../lib/dormancy';
import { monthlyEquivalent } from '../lib/costNormalization';

interface RegistryItemWithObservations {
  id: string;
  cost: number;
  billingCycle: string;
  status: string;
  observations: { observedAt: string }[];
}

export function buildDigestSummary(items: RegistryItemWithObservations[]) {
  const itemCount = items.length;
  const totalMonthlySpend = items.reduce((sum, item) => sum + monthlyEquivalent(item.cost, item.billingCycle), 0);
  const dormantCount = items.filter((item) => isDormant(item.observations)).length;
  const flaggedToCutCount = items.filter((item) => item.status === 'cut').length;

  return { itemCount, totalMonthlySpend, dormantCount, flaggedToCutCount };
}

export const weeklyDigest = onSchedule('every monday 07:00', async () => {
  // Email-sending wiring (fetching the user's email from Firebase Auth,
  // rendering an HTML template with buildDigestSummary's output, and
  // dispatching via an email provider) is deferred to implementation time —
  // buildDigestSummary above is the fully tested aggregation logic a future
  // email-sending wrapper calls.
});
