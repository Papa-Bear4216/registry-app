export function monthlyEquivalent(cost: number, billingCycle: string): number {
  switch (billingCycle) {
    case 'weekly':
      return cost * 4.33;
    case 'monthly':
      return cost;
    case 'quarterly':
      return cost / 3;
    case 'annual':
      return cost / 12;
    case 'one_time':
      return 0;
    default:
      // Unrecognized billingCycle (bad/legacy Firestore data) — match the
      // client's behavior for the same case rather than silently treating
      // the raw cost as already-monthly, which previously caused
      // deadMoneyAlert/weeklyDigest to badly over-count a malformed item.
      console.warn(`monthlyEquivalent: unrecognized billingCycle "${billingCycle}", treating as $0/mo`);
      return 0;
  }
}
