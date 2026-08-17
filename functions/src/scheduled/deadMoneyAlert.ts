import { onSchedule } from 'firebase-functions/v2/scheduler';
import { isDormant } from '../lib/dormancy';
import { monthlyEquivalent } from '../lib/costNormalization';

const SINGLE_ITEM_THRESHOLD = 5;
const TOTAL_THRESHOLD = 20;

interface RegistryItemWithObservations {
  id: string;
  cost: number;
  billingCycle: string;
  observations: { observedAt: string }[];
}

export function checkDeadMoneyThreshold(items: RegistryItemWithObservations[]): { shouldAlert: boolean; reason: string } {
  const dormantItems = items.filter((item) => isDormant(item.observations));
  const dormantCosts = dormantItems.map((item) => monthlyEquivalent(item.cost, item.billingCycle));

  const maxSingle = Math.max(0, ...dormantCosts);
  if (maxSingle > SINGLE_ITEM_THRESHOLD) {
    return { shouldAlert: true, reason: `single item exceeds $${SINGLE_ITEM_THRESHOLD}/mo` };
  }

  const total = dormantCosts.reduce((sum, c) => sum + c, 0);
  if (total > TOTAL_THRESHOLD) {
    return { shouldAlert: true, reason: `total dormant spend exceeds $${TOTAL_THRESHOLD}/mo` };
  }

  return { shouldAlert: false, reason: '' };
}

export const deadMoneyAlert = onSchedule('every day 09:00', async () => {
  // FCM push-sending wiring (fetching each user's device token and calling
  // admin.messaging().send()) is deferred to implementation time once a
  // client-side FCM token registration flow exists — that is client work
  // outside this backend-only plan's scope. checkDeadMoneyThreshold above is
  // the fully tested decision logic a future push-sending wrapper calls.
});
