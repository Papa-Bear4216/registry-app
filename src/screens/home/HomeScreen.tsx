import { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { calculateTotalTimeSavedMinutes } from '../../lib/clockFormat';
import { launchPackage } from '../../lib/appLauncher';
import { isRealAutomation } from '../../lib/shortcutFilter';
import { SEEDED_ACTIVE_AUTOMATIONS } from '../../lib/defaultAutomations';
import { monthlyEquivalent } from '../../lib/costNormalization';
import { ItemStatus } from '../../types/enums';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, RootTabParamList } from '../../navigation/types';

type Props = Partial<
  CompositeScreenProps<
    BottomTabScreenProps<RootTabParamList, 'Home'>,
    NativeStackScreenProps<RootStackParamList>
  >
>;

interface ModuleCardProps {
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  onPress?: () => void;
  testID?: string;
}

function ModuleCard({ icon, title, subtitle, badge, badgeColor = '#2563EB', onPress, testID }: ModuleCardProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>{icon}</Text>
        <View style={styles.cardTitleContainer}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
        {badge && (
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { items, loading: itemsLoading } = useRegistryItems(user?.uid ?? '');

  const realItems = useMemo(() => items.filter(isRealAutomation), [items]);
  const allItems = useMemo(() => {
    return realItems.length > 0 ? realItems : SEEDED_ACTIVE_AUTOMATIONS;
  }, [realItems]);

  const counts = useMemo(() => {
    const result: Record<ItemStatus, number> = {
      [ItemStatus.Keep]: 0,
      [ItemStatus.Review]: 0,
      [ItemStatus.Cut]: 0,
    };
    allItems.forEach((item) => {
      if (result[item.status] !== undefined) {
        result[item.status]++;
      }
    });
    return result;
  }, [allItems]);

  const totalRuns = useMemo(() => {
    return allItems.reduce((sum, item) => sum + (item.reusabilityCount || 0), 0);
  }, [allItems]);

  const totalTimeSavedMinutes = useMemo(() => calculateTotalTimeSavedMinutes(allItems), [allItems]);
  const hoursSaved = (totalTimeSavedMinutes / 60).toFixed(1);

  const totalMonthly = useMemo(
    () => allItems.reduce((sum, item) => sum + monthlyEquivalent(item.cost, item.billingCycle), 0),
    [allItems]
  );

  if (itemsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appTitle}>SECOND GUESS</Text>
        <Text style={styles.appSubtitle}>Personal Efficiency & Automation Suite</Text>
      </View>

      {/* Summary KPI Banner */}
      <View style={styles.kpiBanner}>
        <View style={styles.kpiItem}>
          <Text style={styles.kpiValue}>{counts[ItemStatus.Keep]}</Text>
          <Text style={styles.kpiLabel}>Active Shortcuts</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={styles.kpiValue}>⚡ {totalRuns}</Text>
          <Text style={styles.kpiLabel}>Lifetime Runs</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiValue, counts[ItemStatus.Review] > 0 && styles.kpiWarning]}>
            {counts[ItemStatus.Review]}
          </Text>
          <Text style={styles.kpiLabel}>Needs Review</Text>
        </View>
      </View>

      {/* Suite Modules Section */}
      <Text style={styles.sectionHeading}>EFFICIENCY MODULES</Text>

      {/* 1. Active Automations */}
      <ModuleCard
        icon="⚡"
        title="Active Automations"
        subtitle={`${counts[ItemStatus.Keep]} active shortcuts · 14-day Keep decay clock`}
        badge={`${counts[ItemStatus.Keep]} Active`}
        badgeColor="#16A34A"
        onPress={() => navigation?.navigate('Registry')}
        testID="module-keep"
      />

      {/* 2. Pattern Discovery (Staging) */}
      <ModuleCard
        icon="💡"
        title="Pattern Discovery"
        subtitle="Review & test newly discovered workflow shortcuts detected by Gemini Nano"
        badge="Discovery"
        badgeColor="#2563EB"
        onPress={() => navigation?.navigate('Staging')}
        testID="module-staging"
      />

      {/* 3. Monthly Checkpoint (Triage) */}
      <ModuleCard
        icon="🗓️"
        title="Monthly Checkpoint"
        subtitle={
          counts[ItemStatus.Review] > 0
            ? `${counts[ItemStatus.Review]} inactive automations ready for Keep/Cut review`
            : 'Routine clean · All automations healthy'
        }
        badge={counts[ItemStatus.Review] > 0 ? 'Triage Due' : 'Clean'}
        badgeColor={counts[ItemStatus.Review] > 0 ? '#DC2626' : '#6B7280'}
        onPress={() => navigation?.navigate('MonthlyReview')}
        testID="module-monthly-checkpoint"
      />

      {/* 4. Contextual Coach */}
      <ModuleCard
        icon="🛡️"
        title="Contextual Coach"
        subtitle="On-Device Gemini Nano · Accessibility Monitor · Bubble Overlay Active"
        badge="Open Coach"
        badgeColor="#16A34A"
        onPress={() => launchPackage('com.registry.coach', 'Contextual Coach')}
        testID="module-coach"
      />

      {/* 5. Usage Telemetry */}
      <ModuleCard
        icon="📊"
        title="Usage Telemetry"
        subtitle="WorkManager Background Sync · Dwell Stats & App Transitions"
        badge="Open Sync"
        badgeColor="#16A34A"
        onPress={() => launchPackage('com.registry.usagecollector', 'Usage Telemetry Collector')}
        testID="module-telemetry"
      />

      {/* Summary Footer */}
      <View style={{ marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E5E7EB', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: '#6B7280' }}>
          {allItems.length} items tracked
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
          Keep: {counts[ItemStatus.Keep]} · Review: {counts[ItemStatus.Review]} · Cut: {counts[ItemStatus.Cut]}
        </Text>
        {totalMonthly > 0 ? (
          <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
            ${totalMonthly.toFixed(2)}/mo
          </Text>
        ) : (
          <Text style={{ fontSize: 11, color: '#16A34A', marginTop: 3, fontWeight: '600' }}>
            ⚡ 14-Day Self-Pruning Lifecycle Active
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 14,
  },
  header: {
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#111827',
  },
  appSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  kpiBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  kpiItem: {
    alignItems: 'center',
    flex: 1,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  kpiWarning: {
    color: '#DC2626',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  kpiDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E5E7EB',
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#9CA3AF',
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  cardPressed: {
    opacity: 0.75,
    backgroundColor: '#F3F4F6',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
});
