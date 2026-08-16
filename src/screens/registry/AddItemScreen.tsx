import { useState } from 'react';
import { View, TextInput, Button, Text, Pressable } from 'react-native';
import { addDoc } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { initializeFirebaseApp } from '../../firebase/config';
import { registryItemsRef } from '../../firebase/firestore';
import { ItemKind, ItemStatus, BillingCycle, TaskCategory } from '../../types/enums';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddItem'>;

// NOTE: The task brief's UI used React Native's `Picker` component for the
// billingCycle/kind selection, but `Picker` was removed from react-native
// core years ago (moved to @react-native-picker/picker, which is not a
// dependency of this project — same defect already documented in Task 4's
// RegistryListScreen.tsx). Rather than add a new dependency, billingCycle and
// kind are implemented as rows of selectable chips, mirroring Task 4's
// FilterChip pattern (single-select from a fixed set of options). That
// component isn't exported from RegistryListScreen.tsx, so this is a local
// equivalent rather than a shared import.
function SelectChip<T extends string>({
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
        marginBottom: 6,
      }}
    >
      <Text style={{ color: selected ? 'white' : '#111827', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export function AddItemScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(BillingCycle.Monthly);
  const [kind, setKind] = useState<ItemKind>(ItemKind.Subscription);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  const [description, setDescription] = useState('');

  const toggleTaskCategory = (value: TaskCategory) => {
    setTaskCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  };

  const handleSave = async () => {
    if (!user) return;
    const { db } = initializeFirebaseApp();
    await addDoc(registryItemsRef(db), {
      name,
      cost: parseFloat(cost) || 0,
      billingCycle,
      kind,
      status: ItemStatus.Keep,
      taskCategories,
      description,
      canonicalIdentity: null,
      justified: false,
      isBestForTask: false,
      useCases: null,
      capabilitySummary: null,
      sourceUrl: null,
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
    } as any);
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TextInput placeholder="Name" value={name} onChangeText={setName} style={{ padding: 8, marginBottom: 8 }} />
      <TextInput
        placeholder="Cost"
        value={cost}
        onChangeText={setCost}
        keyboardType="numeric"
        style={{ padding: 8, marginBottom: 8 }}
      />

      <Text style={{ marginBottom: 4 }}>Billing cycle</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        {Object.values(BillingCycle).map((c) => (
          <SelectChip
            key={c}
            label={c}
            value={c}
            selected={billingCycle === c}
            onPress={setBillingCycle}
            testID={`billing-cycle-${c}`}
          />
        ))}
      </View>

      <Text style={{ marginBottom: 4 }}>Kind</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        {Object.values(ItemKind).map((k) => (
          <SelectChip key={k} label={k} value={k} selected={kind === k} onPress={setKind} testID={`kind-${k}`} />
        ))}
      </View>

      <Text style={{ marginBottom: 4 }}>Task categories</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        {Object.values(TaskCategory).map((c) => (
          <SelectChip
            key={c}
            label={c}
            value={c}
            selected={taskCategories.includes(c)}
            onPress={toggleTaskCategory}
            testID={`task-category-${c}`}
          />
        ))}
      </View>

      <TextInput
        placeholder="Description"
        value={description}
        onChangeText={setDescription}
        style={{ padding: 8, marginBottom: 8 }}
      />
      <Button title="Save" onPress={handleSave} />
    </View>
  );
}
