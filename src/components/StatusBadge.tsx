import { View, Text } from 'react-native';
import { ItemStatus } from '../types/enums';

const COLORS: Record<ItemStatus, string> = {
  [ItemStatus.Keep]: '#16A34A',
  [ItemStatus.Review]: '#D97706',
  [ItemStatus.Cut]: '#DC2626',
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <View style={{ backgroundColor: COLORS[status], borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ color: 'white', fontSize: 12 }}>{status}</Text>
    </View>
  );
}
