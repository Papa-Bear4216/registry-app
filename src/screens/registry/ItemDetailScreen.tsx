import { useState, useEffect } from 'react';
import { View, Text, TextInput, Button } from 'react-native';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { initializeFirebaseApp } from '../../firebase/config';
import { useObservations } from '../../hooks/useObservations';
import { costPerUseStat } from '../../lib/costPerUse';
import { monthlyEquivalent } from '../../lib/costNormalization';
import { RegistryItem } from '../../types/models';
import { ItemStatus } from '../../types/enums';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemDetail'>;

export function ItemDetailScreen({ route, navigation }: Props) {
  const { itemId } = route.params;
  const [item, setItem] = useState<RegistryItem | null>(null);
  const { observations, logObservation } = useObservations(itemId);
  const [logCount, setLogCount] = useState('');
  const [logMinutes, setLogMinutes] = useState('');

  useEffect(() => {
    const { db } = initializeFirebaseApp();
    getDoc(doc(db, 'registryItems', itemId)).then((snap) => {
      if (snap.exists()) setItem({ id: snap.id, ...snap.data() } as RegistryItem);
    });
  }, [itemId]);

  if (!item) return <Text>Loading…</Text>;

  const stat = costPerUseStat(observations);
  const monthly = monthlyEquivalent(item.cost, item.billingCycle);

  const toggleRetire = async () => {
    const { db } = initializeFirebaseApp();
    const nextStatus = item.status === ItemStatus.Cut ? ItemStatus.Keep : ItemStatus.Cut;
    await updateDoc(doc(db, 'registryItems', itemId), { status: nextStatus });
    setItem({ ...item, status: nextStatus });
  };

  const handleDelete = async () => {
    const { db } = initializeFirebaseApp();
    await deleteDoc(doc(db, 'registryItems', itemId));
    navigation.goBack();
  };

  const handleLogObservation = async () => {
    await logObservation(parseInt(logCount, 10) || 0, (parseInt(logMinutes, 10) || 0) * 60 * 1000);
    setLogCount('');
    setLogMinutes('');
  };

  return (
    <View>
      <Text>{item.name}</Text>
      <Text>
        ${monthly.toFixed(2)}/mo · used {stat.usageCount}× / {stat.usageHours.toFixed(1)} hrs in last 90d
      </Text>
      <Text>{item.description}</Text>

      <TextInput placeholder="Times used" value={logCount} onChangeText={setLogCount} keyboardType="numeric" />
      <TextInput placeholder="Minutes used" value={logMinutes} onChangeText={setLogMinutes} keyboardType="numeric" />
      <Button title="Log Observation" onPress={handleLogObservation} />

      <Button title={item.status === ItemStatus.Cut ? 'Reactivate' : 'Retire'} onPress={toggleRetire} />
      <Button title="Delete" onPress={handleDelete} />
    </View>
  );
}
