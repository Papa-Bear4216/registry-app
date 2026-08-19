import { View, FlatList, Text, Pressable, Alert } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { useStagingItems } from '../../hooks/useStagingItems';
import { initializeFirebaseApp } from '../../firebase/config';
import { stagingItemsRef } from '../../firebase/firestore';
import { StagingItem } from '../../types/models';
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

  const reject = async (item: StagingItem) => {
    if (!user) return;
    const { db } = initializeFirebaseApp();
    await updateDoc(doc(stagingItemsRef(db), item.id), {
      resolved: true,
      resolvedAt: new Date().toISOString(),
    });
  };

  const approve = (item: StagingItem) => {
    if (item.suggestedMatch) {
      // Already matched to an existing registryItem server-side (aiClassify
      // backfilled the observation's registryItemId) — just resolve, don't
      // create a duplicate.
      reject(item); // same resolve write, different label at the call site
      return;
    }
    navigation.navigate('AddItem', {
      prefill: {
        name: item.rawLabel,
        kind: item.classifiedKind ?? 'subscription',
        taskCategory: item.classifiedCategory,
        description: item.classifiedDescription,
      },
      resolveStagingItemId: item.id,
    });
  };

  if (loading) return <Text>Loading…</Text>;

  return (
    <View style={{ flex: 1 }}>
      {items.length === 0 && (
        <Text style={{ padding: 16, color: '#6B7280' }}>Nothing waiting for review.</Text>
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
            <Text style={{ fontWeight: 'bold' }}>{item.rawLabel}</Text>
            <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 4 }}>
              {item.classifiedKind ?? 'unknown'} · {item.classifiedCategory ?? 'unknown'}
              {item.suggestedMatch ? ' · matches an existing item' : ''}
            </Text>
            {item.classifiedDescription && (
              <Text style={{ color: '#374151', fontSize: 13 }}>{item.classifiedDescription}</Text>
            )}
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <Pressable
                onPress={() => approve(item)}
                style={{ backgroundColor: '#16A34A', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}
              >
                <Text style={{ color: 'white' }}>{item.suggestedMatch ? 'Confirm match' : 'Approve'}</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert('Reject item?', `"${item.rawLabel}" won't be added to your registry.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Reject', style: 'destructive', onPress: () => reject(item) },
                  ])
                }
                style={{ backgroundColor: '#DC2626', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ color: 'white' }}>Reject</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}
