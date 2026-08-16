import { View, Text, FlatList, Button } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { useObservations } from '../../hooks/useObservations';
import { useAlertDismissals } from '../../hooks/useAlertDismissals';
import { isDormant } from '../../lib/dormancy';
import { AlertType } from '../../types/enums';
import { RegistryItem } from '../../types/models';

// Phase 1 only implements the Dormant alert. HighCost and Redundant exist in
// the AlertType enum (Task 2) but are not derived or shown anywhere in this
// screen — cost-per-use is display-only (ItemDetailScreen), never an alert.
function DormantRow({
  item,
  dismiss,
  isDismissed,
}: {
  item: RegistryItem;
  dismiss: (itemId: string, alertType: AlertType, snoozedUntil: string | null) => Promise<void>;
  isDismissed: (itemId: string, alertType: AlertType) => boolean;
}) {
  const { observations } = useObservations(item.id);
  const dormant = isDormant(observations);

  if (!dormant || isDismissed(item.id, AlertType.Dormant)) return null;

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}>
      <Text>{item.name} — dormant</Text>
      <Button
        title="Snooze 7d"
        onPress={() =>
          dismiss(item.id, AlertType.Dormant, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
        }
      />
      <Button title="Dismiss" onPress={() => dismiss(item.id, AlertType.Dormant, null)} />
    </View>
  );
}

export function AlertsScreen() {
  const { user } = useAuth();
  const { items, loading } = useRegistryItems(user?.uid ?? '');
  const { dismiss, isDismissed } = useAlertDismissals(user?.uid ?? '');

  if (loading) return <Text>Loading…</Text>;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <DormantRow item={item} dismiss={dismiss} isDismissed={isDismissed} />}
    />
  );
}
