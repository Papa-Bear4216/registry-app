import { View, Text } from 'react-native';
import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { monthlyEquivalent } from '../../lib/costNormalization';
import { ItemStatus } from '../../types/enums';

export function HomeScreen() {
  const { user } = useAuth();
  const { items, loading } = useRegistryItems(user?.uid ?? '');

  const totalMonthly = useMemo(
    () => items.reduce((sum, item) => sum + monthlyEquivalent(item.cost, item.billingCycle), 0),
    [items]
  );
  const counts = useMemo(() => {
    const result: Record<ItemStatus, number> = { [ItemStatus.Keep]: 0, [ItemStatus.Review]: 0, [ItemStatus.Cut]: 0 };
    items.forEach((item) => {
      result[item.status]++;
    });
    return result;
  }, [items]);

  if (loading) return <Text>Loading…</Text>;

  return (
    <View>
      <Text>${totalMonthly.toFixed(2)}/mo</Text>
      <Text>Keep: {counts[ItemStatus.Keep]}</Text>
      <Text>Review: {counts[ItemStatus.Review]}</Text>
      <Text>Cut: {counts[ItemStatus.Cut]}</Text>
      <Text>{items.length} items tracked</Text>
    </View>
  );
}
