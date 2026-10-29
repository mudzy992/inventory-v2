import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchEmployeesPageApi } from '@/api/employees';
import { useSettings } from '@/auth/settings-context';
import type { Employee } from '@/types/models';
import { SPACE, TOKENS } from '@/theme/tokens';
import { EmptyState } from '@/ui/empty-state';
import { ListRow } from '@/ui/list-row';
import { TextField } from '@/ui/text-field';

export default function PeopleSearchScreen() {
  const router = useRouter();
  const { flag } = useSettings();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!flag('features.employees')) {
      return;
    }
    const handle = setTimeout(() => {
      setLoading(true);
      void fetchEmployeesPageApi({ search: query.trim() || undefined, page: 1, pageSize: 25, isActive: true })
        .then((response) => setItems(response.items))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [flag, query]);

  if (!flag('features.employees')) {
    return <EmptyState message="Modul radnika je isključen." />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.search}>
        <TextField label="Pretraga radnika" value={query} onChangeText={setQuery} placeholder="Ime ili prezime" autoCorrect={false} />
      </View>
      {loading ? <ActivityIndicator color={TOKENS.brand} style={{ marginTop: SPACE.md }} /> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={!loading ? <EmptyState message="Nema rezultata." /> : undefined}
        renderItem={({ item }) => (
          <ListRow
            title={`${item.firstName} ${item.lastName}`}
            subtitle={item.title}
            meta={item.heldEquipmentCount != null ? `${item.heldEquipmentCount}` : undefined}
            onPress={() => router.push(`/people/${item.id}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: TOKENS.canvas, flex: 1 },
  search: { backgroundColor: TOKENS.panel, padding: SPACE.lg },
});
