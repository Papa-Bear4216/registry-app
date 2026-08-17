import { BillingCycle } from '../types/enums';

export function monthlyEquivalent(cost: number, cycle: BillingCycle): number {
  switch (cycle) {
    case BillingCycle.Weekly:
      return cost * 4.33;
    case BillingCycle.Monthly:
      return cost;
    case BillingCycle.Quarterly:
      return cost / 3;
    case BillingCycle.Annual:
      return cost / 12;
    case BillingCycle.OneTime:
      return 0;
    default:
      // Unrecognized billingCycle (bad/legacy Firestore data bypassing the
      // type system) — return 0 rather than crashing the screen via
      // undefined.toFixed(), matching the server's costNormalization.
      return 0;
  }
}
