import { useState, useMemo } from 'react';
import { View, TextInput, FlatList, Text, Pressable, Alert } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { initializeFirebaseApp } from '../../firebase/config';
import { StatusBadge } from '../../components/StatusBadge';
import { isRealAutomation } from '../../lib/shortcutFilter';
import { SEEDED_ACTIVE_AUTOMATIONS, executeAutomation, parseStepsFromPayload } from '../../lib/defaultAutomations';
import { ItemStatus } from '../../types/enums';
import { RegistryItem, WorkflowStep } from '../../types/models';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { RootTabParamList } from '../../navigation/types';
import { formatDecayClock, formatReusability } from '../../lib/clockFormat';

type Props = CompositeScreenProps<
  BottomTabScreenProps<RootTabParamList, 'Registry'>,
  NativeStackScreenProps<RootStackParamList>
>;

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
        paddingHorizontal: 12,
        paddingVertical: 5,
        marginRight: 8,
      }}
    >
      <Text style={{ color: selected ? 'white' : '#111827', fontSize: 12, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

export function RegistryListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { items, loading } = useRegistryItems(user?.uid ?? '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all');
  const [runOverrides, setRunOverrides] = useState<Record<string, { runs: number; expiresAt: string }>>({});

  // Merge Firestore items with seeded automations to guarantee an active, runnable suite
  const allItems = useMemo(() => {
    const realFirestore = items.filter(isRealAutomation);
    const existingNames = new Set(realFirestore.map((i) => i.name.toLowerCase()));
    const missingSeeds = SEEDED_ACTIVE_AUTOMATIONS.filter((s) => !existingNames.has(s.name.toLowerCase()));
    return [...realFirestore, ...missingSeeds];
  }, [items]);

  const filtered = useMemo(() => {
    return allItems.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allItems, search, statusFilter]);

  const handleRunShortcut = async (item: RegistryItem) => {
    const now = new Date();
    const newExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const currentRuns = runOverrides[item.id]?.runs ?? item.reusabilityCount ?? 0;
    const newRuns = currentRuns + 1;

    // Optimistic UI update
    setRunOverrides((prev) => ({
      ...prev,
      [item.id]: { runs: newRuns, expiresAt: newExpiry },
    }));

    // Execute the action (intent, deep link, or multi-step sequence)
    const targetPayload = item.actionPayload || item.suggestedAction?.payload || item.canonicalIdentity || item.name;
    const steps = item.steps || item.suggestedAction?.steps;
    const actionType = item.suggestedAction?.type || ((steps && steps.length > 1) || (targetPayload && targetPayload.includes('->')) ? 'multi_step' : 'app_launch');
    await executeAutomation(item.name, targetPayload, actionType, steps);

    // Persist to Firestore if real item
    if (user && !item.id.startsWith('auto-')) {
      try {
        const { db } = initializeFirebaseApp();
        await updateDoc(doc(db, 'registryItems', item.id), {
          status: ItemStatus.Keep,
          keepClockExpiresAt: newExpiry,
          reusabilityCount: newRuns,
          lastExecutedAt: now.toISOString(),
          reviewReason: null,
          updatedAt: now.toISOString(),
        });
      } catch (e) {
        console.warn('Could not update execution in Firestore:', e);
      }
    }
  };

  if (loading) {
    return <Text style={{ padding: 16 }}>Loading…</Text>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <TextInput
        placeholder="Search automations…"
        value={search}
        onChangeText={setSearch}
        style={{
          margin: 12,
          padding: 10,
          backgroundColor: '#FFFFFF',
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          fontSize: 14,
        }}
      />
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, marginBottom: 10 }}>
        <FilterChip
          label="All Statuses"
          value="all"
          selected={statusFilter === 'all'}
          onPress={setStatusFilter}
          testID="status-filter-all"
        />
        {Object.values(ItemStatus).map((s) => (
          <FilterChip
            key={s}
            label={s.toUpperCase()}
            value={s}
            selected={statusFilter === s}
            onPress={setStatusFilter}
            testID={`status-filter-${s}`}
          />
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={{ flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>⚡</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 6 }}>
              No Active Automations
            </Text>
            <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18, marginBottom: 20 }}>
              Patterns discovered by Contextual Coach and Usage Telemetry will be staged for your review under Pattern Discovery.
            </Text>
            <Pressable
              onPress={() => navigation.navigate('AddItem')}
              style={{ backgroundColor: '#2563EB', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13 }}>+ Create Custom Shortcut</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const effectiveExpiry = runOverrides[item.id]?.expiresAt ?? item.keepClockExpiresAt;
          const effectiveRuns = runOverrides[item.id]?.runs ?? item.reusabilityCount ?? 0;
          const clock = formatDecayClock(effectiveExpiry, item.status);
          const runs = formatReusability(effectiveRuns);

          const resolvedSteps: WorkflowStep[] =
            item.steps && item.steps.length > 0
              ? item.steps
              : item.suggestedAction?.steps && item.suggestedAction.steps.length > 0
              ? item.suggestedAction.steps
              : item.actionPayload && (item.actionPayload.includes('->') || item.actionPayload.includes('➔'))
              ? parseStepsFromPayload(item.name, item.actionPayload)
              : [];

          const displayName = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(item.name)
            ? `${(item.name.split('.').pop() || item.name).replace(/^./, (c) => c.toUpperCase())} Workflow`
            : item.name;

          return (
            <Pressable
              onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
              style={{
                backgroundColor: '#FFFFFF',
                marginHorizontal: 12,
                marginVertical: 5,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                padding: 12,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <Text style={{ fontWeight: '700', fontSize: 15, color: '#111827' }}>{displayName}</Text>
                    {resolvedSteps.length > 1 && (
                      <View style={{ backgroundColor: '#EEF2FF', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#4F46E5' }}>
                          {resolvedSteps.length}-Step Flow
                        </Text>
                      </View>
                    )}
                  </View>

                  {item.triggerDescription ? (
                    <Text style={{ fontSize: 12, color: '#4B5563', marginTop: 3 }} numberOfLines={1}>
                      ⚡ {item.triggerDescription}
                    </Text>
                  ) : item.description ? (
                    <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }} numberOfLines={1}>
                      {item.description}
                    </Text>
                  ) : null}

                  {resolvedSteps.length > 1 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {resolvedSteps.map((step, idx) => (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View
                            style={{
                              backgroundColor: '#F8FAFC',
                              borderColor: '#CBD5E1',
                              borderWidth: 1,
                              borderRadius: 4,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#334155' }}>
                              {step.order || idx + 1}. {step.label || step.target}
                            </Text>
                          </View>
                          {idx < resolvedSteps.length - 1 && (
                            <Text style={{ fontSize: 10, color: '#94A3B8', marginHorizontal: 2 }}>➔</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={{ fontSize: 12, color: clock.color, marginTop: 6, fontWeight: '500' }}>
                    {clock.text}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>{runs}</Text>
                    <StatusBadge status={item.status} />
                  </View>

                  <Pressable
                    onPress={() => handleRunShortcut(item)}
                    style={{
                      backgroundColor: '#16A34A',
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 6,
                      marginTop: 4,
                    }}
                    testID={`run-shortcut-${item.id}`}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>⚡ Run</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      <Pressable onPress={() => navigation.navigate('AddItem')} style={{ position: 'absolute', bottom: 16, right: 16 }}>
        <Text style={{ fontSize: 32 }}>+</Text>
      </Pressable>
    </View>
  );
}
