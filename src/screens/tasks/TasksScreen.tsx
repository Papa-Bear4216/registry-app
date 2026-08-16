import { View, Text, SectionList } from 'react-native';
import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { TaskCategory } from '../../types/enums';
import { RegistryItem } from '../../types/models';

export function TasksScreen() {
  const { user } = useAuth();
  const { items, loading } = useRegistryItems(user?.uid ?? '');

  const sections = useMemo(() => {
    const byCategory = new Map<TaskCategory, RegistryItem[]>();
    items.forEach((item) => {
      item.taskCategories.forEach((cat) => {
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(item);
      });
    });
    return Array.from(byCategory.entries()).map(([category, data]) => ({ title: category, data }));
  }, [items]);

  if (loading) return <Text>Loading…</Text>;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderSectionHeader={({ section }) => <Text style={{ fontWeight: 'bold' }}>{section.title}</Text>}
      renderItem={({ item }) => <View><Text>{item.name}</Text></View>}
    />
  );
}
