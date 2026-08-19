import { useState } from 'react';
import { View, TextInput, Button, Text, Pressable } from 'react-native';
import { doc, runTransaction } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { initializeFirebaseApp } from '../../firebase/config';
import { registryItemsRef, stagingItemsRef } from '../../firebase/firestore';
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

function isValidItemKind(value: string): value is ItemKind {
  return (Object.values(ItemKind) as string[]).includes(value);
}

function isValidTaskCategory(value: string): value is TaskCategory {
  return (Object.values(TaskCategory) as string[]).includes(value);
}

export function AddItemScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const prefill = route.params?.prefill;
  const resolveStagingItemId = route.params?.resolveStagingItemId;

  const [name, setName] = useState(prefill?.name ?? '');
  const [cost, setCost] = useState('');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(BillingCycle.Monthly);
  const [kind, setKind] = useState<ItemKind>(
    prefill && isValidItemKind(prefill.kind) ? prefill.kind : ItemKind.Subscription
  );
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>(
    prefill?.taskCategory && isValidTaskCategory(prefill.taskCategory) ? [prefill.taskCategory] : []
  );
  const [description, setDescription] = useState(prefill?.description ?? '');

  const toggleTaskCategory = (value: TaskCategory) => {
    setTaskCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  };

  const handleSave = async () => {
    if (!user) return;
    const { db } = initializeFirebaseApp();
    const newItemRef = doc(registryItemsRef(db));

    await runTransaction(db, async (transaction) => {
      transaction.set(newItemRef, {
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

      if (resolveStagingItemId) {
        const stagingRef = doc(stagingItemsRef(db), resolveStagingItemId);
        transaction.update(stagingRef, {
          resolved: true,
          resolvedAt: new Date().toISOString(),
        });
      }
    });

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
