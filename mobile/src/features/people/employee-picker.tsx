import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { fetchEmployeesPageApi } from '@/api/employees';
import type { Employee } from '@/types/models';
import { ListRow } from '@/ui/list-row';
import { TextField } from '@/ui/text-field';
import { SPACE } from '@/theme/tokens';

export const EmployeePicker = ({
  excludeId,
  onSelect,
}: {
  excludeId?: string | null;
  onSelect: (employee: Employee) => void;
}) => {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      void fetchEmployeesPageApi({ search: query.trim() || undefined, page: 1, pageSize: 20, isActive: true })
        .then((response) => {
          setItems(response.items.filter((row) => row.id !== excludeId));
        })
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [excludeId, query]);

  return (
    <View style={styles.wrap}>
      <TextField label="Zadužiti na osobu" value={query} onChangeText={setQuery} placeholder="Pretraga radnika" autoCorrect={false} />
      {loading ? <ActivityIndicator style={{ marginTop: SPACE.md }} /> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        renderItem={({ item }) => (
          <ListRow
            title={`${item.firstName} ${item.lastName}`}
            subtitle={item.title}
            onPress={() => onSelect(item)}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { maxHeight: 320 },
  list: { marginTop: SPACE.sm },
});
