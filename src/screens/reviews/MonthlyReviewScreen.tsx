import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { initializeFirebaseApp } from '../../firebase/config';
import { RegistryItem } from '../../types/models';
import { ItemStatus } from '../../types/enums';

export function MonthlyReviewScreen() {
  const { user } = useAuth();
  const { items, loading } = useRegistryItems(user?.uid ?? '');

  // Filter for items in Review or Archive (the human checkpoint candidates)
  const reviewQueue = items.filter(
    (item) => item.status === ItemStatus.Review || (item.status as string) === 'archive'
  );

  const handleKeep = async (item: RegistryItem) => {
    const { db } = initializeFirebaseApp();
    const newExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await updateDoc(doc(db, 'registryItems', item.id), {
      status: ItemStatus.Keep,
      keepClockExpiresAt: newExpiry,
      reviewReason: null,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleCut = async (item: RegistryItem) => {
    const { db } = initializeFirebaseApp();
    await updateDoc(doc(db, 'registryItems', item.id), {
      status: ItemStatus.Cut,
      keepClockExpiresAt: null,
      updatedAt: new Date().toISOString(),
    });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading checkpoint queue…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🗓️ Monthly Checkpoint</Text>
        <Text style={styles.subtitle}>
          The single human review gate. Re-authorize or prune dormant automations.
        </Text>
      </View>

      {reviewQueue.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✨</Text>
          <Text style={styles.emptyTitle}>All Clean!</Text>
          <Text style={styles.emptySubtitle}>
            No automations have decayed to Review. Your active shortcuts remain in Keep.
          </Text>
        </View>
      ) : (
        <FlatList
          data={reviewQueue}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.reviewCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={styles.runsBadge}>
                  <Text style={styles.runsText}>⚡ {item.reusabilityCount || 0} runs</Text>
                </View>
              </View>

              <Text style={styles.itemDescription}>
                {item.description || item.triggerDescription || 'Workflow shortcut'}
              </Text>

              <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>Flag Reason:</Text>
                <Text style={styles.reasonText}>
                  {item.reviewReason === 'high_friction'
                    ? 'Prompted frequently but rarely accepted'
                    : '14 days elapsed with zero executions'}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.btn, styles.cutBtn]}
                  onPress={() => handleCut(item)}
                  testID={`cut-${item.id}`}
                >
                  <Text style={styles.cutBtnText}>❌ Cut & Remove</Text>
                </Pressable>

                <Pressable
                  style={[styles.btn, styles.keepBtn]}
                  onPress={() => handleKeep(item)}
                  testID={`keep-${item.id}`}
                >
                  <Text style={styles.keepBtnText}>🔄 Keep (Reset 14d)</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 14,
  },
  header: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  listContent: {
    padding: 16,
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  runsBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  runsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
  itemDescription: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 6,
  },
  reasonBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
  },
  reasonLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#991B1B',
    textTransform: 'uppercase',
  },
  reasonText: {
    fontSize: 12,
    color: '#7F1D1D',
    marginTop: 1,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cutBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  cutBtnText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  keepBtn: {
    backgroundColor: '#16A34A',
  },
  keepBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
