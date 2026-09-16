import { useMemo } from 'react';
import { View, FlatList, Text, Pressable, Alert } from 'react-native';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { useStagingItems } from '../../hooks/useStagingItems';
import { initializeFirebaseApp } from '../../firebase/config';
import { stagingItemsRef, registryItemsRef } from '../../firebase/firestore';
import { StagingItem } from '../../types/models';
import { ItemKind, ItemStatus, BillingCycle, TaskCategory } from '../../types/enums';
import {
  SEEDED_DISCOVERED_PATTERNS,
  executeAutomation,
  normalizeDiscoveredWorkflow,
  parseStepsFromPayload,
  isSystemComponent,
} from '../../lib/defaultAutomations';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, RootTabParamList } from '../../navigation/types';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

type Props = CompositeScreenProps<
  BottomTabScreenProps<RootTabParamList, 'Staging'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function StagingScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { items, loading } = useStagingItems(user?.uid ?? '');

  // Normalize all items so Discovery shows actionable multi-step workflows, never raw packages or OS processes
  const displayItems = useMemo(() => {
    const validFirestoreItems = items.filter(
      (item) =>
        !isSystemComponent(item.rawLabel) &&
        !isSystemComponent(item.rawIdentity) &&
        !isSystemComponent(item.actionPayload)
    );
    const combined = [...validFirestoreItems];
    for (const pattern of SEEDED_DISCOVERED_PATTERNS) {
      if (!combined.some((c) => c.rawIdentity === pattern.rawIdentity || c.id === pattern.id)) {
        combined.push(pattern);
      }
    }
    return combined.map(normalizeDiscoveredWorkflow);
  }, [items]);

  const reject = async (item: StagingItem) => {
    if (!user) return;
    try {
      const { db } = initializeFirebaseApp();
      await updateDoc(doc(stagingItemsRef(db), item.id), {
        resolved: true,
        resolvedAt: new Date().toISOString(),
      });
    } catch {
      // Offline fallback
    }
  };

  const approveAndKeep = async (item: StagingItem) => {
    const now = new Date();
    const expiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const workflowTitle = item.workflowTitle || item.rawLabel;
    const resolvedSteps = item.steps ?? parseStepsFromPayload(workflowTitle, item.actionPayload);

    if (user) {
      try {
        const { db } = initializeFirebaseApp();
        const newItemRef = doc(registryItemsRef(db));
        await setDoc(newItemRef, {
          id: newItemRef.id,
          name: workflowTitle,
          cost: 0,
          billingCycle: BillingCycle.Monthly,
          kind: item.classifiedKind ?? ItemKind.App,
          status: ItemStatus.Keep,
          taskCategories: item.classifiedCategory ? [item.classifiedCategory] : [TaskCategory.Productivity],
          description: item.classifiedDescription ?? 'Discovered multi-step workflow',
          canonicalIdentity: item.rawIdentity ?? null,
          justified: true,
          isBestForTask: true,
          useCases: item.classifiedDescription ?? null,
          capabilitySummary: `${resolvedSteps.length}-Step Autonomous Workflow`,
          sourceUrl: null,
          createdBy: user.uid,
          createdAt: now.toISOString(),
          keepClockExpiresAt: expiry,
          reusabilityCount: 1,
          lastExecutedAt: now.toISOString(),
          triggerDescription: item.triggerDescription ?? 'Contextual transition trigger',
          actionPayload: item.actionPayload ?? item.rawIdentity ?? item.rawLabel,
          steps: resolvedSteps,
          estimatedSecondsSaved: item.estimatedSecondsSaved ?? 120,
          suggestedAction: {
            type: 'multi_step',
            payload: item.actionPayload ?? item.rawIdentity ?? item.rawLabel,
            estimatedSecondsSaved: item.estimatedSecondsSaved ?? 120,
            steps: resolvedSteps,
          },
        });
        await reject(item);
      } catch (err: any) {
        console.warn('Firestore write fallback:', err);
      }
    }

    Alert.alert(
      '🎉 Graduated to Active Automations!',
      `"${workflowTitle}" is now active with a 14-day Keep decay clock and reusability tracking.`
    );
  };

  if (loading && items.length === 0 && !displayItems.length) {
    return <Text style={{ padding: 16 }}>Loading workflows…</Text>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 }}>
          OBSERVED WORKFLOWS & USER PATTERNS
        </Text>
        <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
          Documenting real user behavior to establish a firm logic base before imagining workflow automations.
        </Text>
      </View>

      <FlatList
        data={displayItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View
            style={{
              padding: 14,
              marginHorizontal: 12,
              marginVertical: 6,
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              shadowColor: '#000',
              shadowOpacity: 0.03,
              shadowRadius: 2,
              elevation: 1,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 18, marginRight: 8 }}>{item.steps && item.steps.length > 1 ? '🔗' : '📊'}</Text>
                <Text style={{ fontWeight: '700', fontSize: 15, color: '#111827', flex: 1 }}>
                  {item.workflowTitle || item.rawLabel}
                </Text>
              </View>
              <View style={{ backgroundColor: item.steps && item.steps.length > 1 ? '#EFF6FF' : '#F3F4F6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: item.steps && item.steps.length > 1 ? '#1D4ED8' : '#4B5563' }}>
                  {item.steps && item.steps.length > 1 ? `Observed Switch (${item.steps.length} Steps)` : 'Observed Habit'}
                </Text>
              </View>
            </View>

            {item.steps && item.steps.length > 0 && (
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, marginVertical: 6, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 }}>
                  {item.steps.length > 1 ? 'Observed App Sequence' : 'Observed Target Application'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                  {item.steps.map((step, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#334155' }}>
                          {step.order || idx + 1}. {step.label || step.target}
                        </Text>
                      </View>
                      {idx < item.steps!.length - 1 && (
                        <Text style={{ color: '#94A3B8', marginHorizontal: 2, fontSize: 12, fontWeight: '700' }}>➔</Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {item.triggerDescription && (
              <View style={{ backgroundColor: '#F0FDF4', borderColor: '#DCFCE7', borderWidth: 1, borderRadius: 6, padding: 6, marginVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#166534' }}>
                  🎯 Logic Base: {item.triggerDescription}
                </Text>
              </View>
            )}

            {item.classifiedDescription && (
              <Text style={{ color: '#374151', fontSize: 13, lineHeight: 18, marginVertical: 4 }}>
                {item.classifiedDescription}
              </Text>
            )}

            {item.estimatedSecondsSaved && (
              <Text style={{ fontSize: 11, color: '#059669', fontWeight: '600', marginVertical: 2 }}>
                ⏱️ Saves ~{Math.round(item.estimatedSecondsSaved / 60)} min per execution
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
              <Pressable
                onPress={() =>
                  executeAutomation(
                    item.workflowTitle || item.rawLabel,
                    item.actionPayload,
                    item.actionType,
                    item.steps
                  )
                }
                style={{
                  backgroundColor: '#3B82F6',
                  borderRadius: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID={`test-${item.id}`}
              >
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 12 }}>
                  {item.steps && item.steps.length > 1 ? `⚡ Test Flow (${item.steps.length} Steps)` : `⚡ Launch App`}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => approveAndKeep(item)}
                style={{
                  backgroundColor: '#16A34A',
                  borderRadius: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID={`approve-${item.id}`}
              >
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 12 }}>Approve & Track</Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  Alert.alert('Dismiss candidate?', `"${item.workflowTitle || item.rawLabel}" will be removed from candidates.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Dismiss', style: 'destructive', onPress: () => reject(item) },
                  ])
                }
                style={{
                  backgroundColor: '#F3F4F6',
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: '#D1D5DB',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID={`dismiss-${item.id}`}
              >
                <Text style={{ color: '#4B5563', fontWeight: '600', fontSize: 12 }}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}
