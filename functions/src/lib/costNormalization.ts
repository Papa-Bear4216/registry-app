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
      return cost;
  }
}
