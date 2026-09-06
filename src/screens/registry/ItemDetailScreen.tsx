import { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, ScrollView } from 'react-native';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { initializeFirebaseApp } from '../../firebase/config';
import { useObservations } from '../../hooks/useObservations';
import { costPerUseStat } from '../../lib/costPerUse';
import { monthlyEquivalent } from '../../lib/costNormalization';
import { SEEDED_ACTIVE_AUTOMATIONS, executeAutomation, parseStepsFromPayload } from '../../lib/defaultAutomations';
import { RegistryItem, WorkflowStep } from '../../types/models';
import { ItemStatus } from '../../types/enums';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemDetail'>;

export function ItemDetailScreen({ route, navigation }: Props) {
  const { itemId } = route.params;
  const [item, setItem] = useState<RegistryItem | null>(() => {
    return SEEDED_ACTIVE_AUTOMATIONS.find((s) => s.id === itemId) ?? null;
  });
  const { observations, logObservation } = useObservations(itemId);
  const [logCount, setLogCount] = useState('');
  const [logMinutes, setLogMinutes] = useState('');

  useEffect(() => {
    const { db } = initializeFirebaseApp();
    getDoc(doc(db, 'registryItems', itemId)).then((snap) => {
      if (snap.exists()) {
        setItem({ id: snap.id, ...snap.data() } as RegistryItem);
      } else {
        const seed = SEEDED_ACTIVE_AUTOMATIONS.find((s) => s.id === itemId);
        if (seed) setItem(seed);
      }
    });
  }, [itemId]);

  if (!item) return <Text style={{ padding: 16 }}>Loading…</Text>;

  const stat = costPerUseStat(observations);

  const toggleRetire = async () => {
    const { db } = initializeFirebaseApp();
    const nextStatus = item.status === ItemStatus.Cut ? ItemStatus.Keep : ItemStatus.Cut;
    if (!item.id.startsWith('auto-')) {
      await updateDoc(doc(db, 'registryItems', itemId), { status: nextStatus });
    }
    setItem({ ...item, status: nextStatus });
  };

  const handleDelete = async () => {
    if (!item.id.startsWith('auto-')) {
      const { db } = initializeFirebaseApp();
      await deleteDoc(doc(db, 'registryItems', itemId));
    }
    navigation.goBack();
  };

  const handleLogObservation = async () => {
    await logObservation(parseInt(logCount, 10) || 0, (parseInt(logMinutes, 10) || 0) * 60 * 1000);
    setLogCount('');
    setLogMinutes('');
  };

  const handleRunShortcut = async () => {
    const now = new Date();
    const newExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const newCount = (item.reusabilityCount || 0) + 1;

    // Execute real action
    const targetPayload = item.actionPayload || item.suggestedAction?.payload || item.canonicalIdentity || item.name;
    const steps = item.steps || item.suggestedAction?.steps;
    const actionType = item.suggestedAction?.type || ((steps && steps.length > 1) || (targetPayload && targetPayload.includes('->')) ? 'multi_step' : 'app_launch');
    await executeAutomation(item.name, targetPayload, actionType, steps);

    try {
      await logObservation(1, 60 * 1000);
    } catch {}

    if (!item.id.startsWith('auto-')) {
      try {
        const { db } = initializeFirebaseApp();
        await updateDoc(doc(db, 'registryItems', itemId), {
          status: ItemStatus.Keep,
          keepClockExpiresAt: newExpiry,
          reusabilityCount: newCount,
          lastExecutedAt: now.toISOString(),
          reviewReason: null,
          updatedAt: now.toISOString(),
        });
      } catch (e) {
        console.warn('Firestore write fallback:', e);
      }
    }

    setItem({
      ...item,
      status: ItemStatus.Keep,
      keepClockExpiresAt: newExpiry,
      reusabilityCount: newCount,
      lastExecutedAt: now.toISOString(),
      reviewReason: null,
    });
  };

  const monthly = monthlyEquivalent(item.cost, item.billingCycle);

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
    <ScrollView style={{ flex: 1, backgroundColor: '#F9FAFB' }} contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827', flex: 1 }}>{displayName}</Text>
        {resolvedSteps.length > 1 && (
          <View style={{ backgroundColor: '#EEF2FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>
              {resolvedSteps.length}-Step Flow
            </Text>
          </View>
        )}
      </View>
      <Text style={{ color: '#4B5563', marginVertical: 4, fontSize: 13 }}>
        {monthly > 0 ? `$${monthly.toFixed(2)}/mo · ` : ''}used {stat.usageCount}× / {stat.usageHours.toFixed(1)} hrs in last 90d
      </Text>
      {item.description ? (
        <Text style={{ color: '#6B7280', marginVertical: 8, fontSize: 14, lineHeight: 20 }}>{item.description}</Text>
      ) : null}

      {/* Sequential Multi-Step Workflow Card */}
      {resolvedSteps.length > 0 && (
        <View style={{ marginVertical: 10, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1' }}>
          <Text style={{ fontWeight: '700', fontSize: 11, color: '#475569', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>
            Sequential Workflow Pipeline ({resolvedSteps.length} Steps)
          </Text>
          {resolvedSteps.map((step, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>{step.order || idx + 1}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#1E293B', flex: 1 }}>
                {step.label || step.target}
              </Text>
              <Text style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>
                {step.target}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Script & Payload Info Card */}
      {(item.triggerDescription || item.actionPayload || item.suggestedAction) && (
        <View style={{ marginVertical: 10, padding: 12, backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1, borderColor: '#DBEAFE' }}>
          <Text style={{ fontWeight: '700', fontSize: 12, color: '#1E40AF', letterSpacing: 0.5 }}>
            WORKFLOW & INTENT SPECIFICATION
          </Text>
          {item.triggerDescription && (
            <Text style={{ marginTop: 6, fontSize: 12, color: '#1E3A8A' }}>
              ⚡ <Text style={{ fontWeight: '600' }}>Trigger:</Text> {item.triggerDescription}
            </Text>
          )}
          {(item.actionPayload || item.suggestedAction?.payload) && (
            <Text style={{ marginTop: 4, fontSize: 12, color: '#1E3A8A', fontFamily: 'monospace' }}>
              Action Target: {item.actionPayload || item.suggestedAction?.payload}
            </Text>
          )}
        </View>
      )}

      {/* Automation Lifecycle Card */}
      <View style={{ marginVertical: 10, padding: 14, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
        <Text style={{ fontWeight: '700', fontSize: 12, color: '#4B5563', letterSpacing: 0.5 }}>
          LIFECYCLE & 14-DAY KEEP CLOCK
        </Text>
        <Text style={{ marginTop: 6, fontWeight: '700', fontSize: 15, color: item.status === ItemStatus.Review ? '#DC2626' : '#16A34A' }}>
          {item.status === ItemStatus.Review
            ? '⚠️ Inactive (Demoted to Review)'
            : item.keepClockExpiresAt
            ? `⏳ Reset Clock: Active (${item.keepClockExpiresAt.slice(0, 10)})`
            : '⏳ 14-Day Keep Clock Active'}
        </Text>
        <Text style={{ marginTop: 4, color: '#2563EB', fontWeight: '700', fontSize: 14 }}>
          ⚡ {item.reusabilityCount || 0} lifetime runs
        </Text>
        <View style={{ marginTop: 14 }}>
          <Button title="⚡ Run Shortcut (Reset 14d Clock)" onPress={handleRunShortcut} color="#16A34A" />
        </View>
      </View>

      <TextInput placeholder="Times used" value={logCount} onChangeText={setLogCount} keyboardType="numeric" />
      <TextInput placeholder="Minutes used" value={logMinutes} onChangeText={setLogMinutes} keyboardType="numeric" />
      <Button title="Log Observation" onPress={handleLogObservation} />

      <View style={{ marginTop: 8 }}>
        <Button title={item.status === ItemStatus.Cut ? 'Reactivate' : 'Retire'} onPress={toggleRetire} />
      </View>
      <View style={{ marginTop: 8 }}>
        <Button title="Delete" onPress={handleDelete} color="#DC2626" />
      </View>
    </ScrollView>
  );
}
