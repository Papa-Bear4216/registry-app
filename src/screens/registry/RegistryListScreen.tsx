import { useState, useMemo } from 'react';
import { View, TextInput, FlatList, Text, Pressable } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { StatusBadge } from '../../components/StatusBadge';
import { monthlyEquivalent } from '../../lib/costNormalization';
import { ItemStatus, ItemKind } from '../../types/enums';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { RootTabParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<RootTabParamList, 'Registry'>,
  NativeStackScreenProps<RootStackParamList>
>;

// NOTE: The task brief's UI used React Native's `Picker` component for the
// status/kind filters, but `Picker` was removed from react-native core years
// ago (moved to @react-native-picker/picker, which is not a dependency of this
// project — confirmed empirically: `react-native`'s index.js.flow does not
// export it). Rather than add a new dependency for Task 4, filters are
// implemented as a row of selectable chips, which are functionally equivalent
// (single-select from a fixed set of options) and require no extra package.
function FilterChip<T extends string>({
  label,
  value,
  selected,
  onPress,
  testID,
}: {
  label: string;
  value: T;
  selected: boolean;
  onPress: (value: T) => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={() => onPress(value)}
      testID={testID}
      style={{
        backgroundColor: selected ? '#2563EB' : '#E5E7EB',
        borderRadius: 16,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginRight: 6,
      }}
    >
      <Text style={{ color: selected ? 'white' : '#111827', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export function RegistryListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { items, loading } = useRegistryItems(user?.uid ?? '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<ItemKind | 'all'>('all');

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, search, statusFilter, kindFilter]);

  if (loading) return <Text>Loading…</Text>;

  return (
    <View style={{ flex: 1 }}>
      <TextInput placeholder="Search…" value={search} onChangeText={setSearch} style={{ padding: 8 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 }}>
        <FilterChip
          label="All statuses"
          value="all"
          selected={statusFilter === 'all'}
          onPress={setStatusFilter}
          testID="status-filter-all"
        />
        {Object.values(ItemStatus).map((s) => (
          <FilterChip
            key={s}
            label={s}
            value={s}
            selected={statusFilter === s}
            onPress={setStatusFilter}
            testID={`status-filter-${s}`}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, marginBottom: 4 }}>
        <FilterChip
          label="All kinds"
          value="all"
          selected={kindFilter === 'all'}
          onPress={setKindFilter}
          testID="kind-filter-all"
        />
        {Object.values(ItemKind).map((k) => (
          <FilterChip
            key={k}
            label={k}
            value={k}
            selected={kindFilter === k}
            onPress={setKindFilter}
            testID={`kind-filter-${k}`}
          />
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}>
              <Text>{item.name}</Text>
              <Text>${monthlyEquivalent(item.cost, item.billingCycle).toFixed(2)}/mo</Text>
              <StatusBadge status={item.status} />
            </View>
          </Pressable>
        )}
      />
      <Pressable onPress={() => navigation.navigate('AddItem')} style={{ position: 'absolute', bottom: 16, right: 16 }}>
        <Text style={{ fontSize: 32 }}>+</Text>
      </Pressable>
    </View>
  );
}
