import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchEquipmentPageApi } from '@/api/equipment';
import { useSettings } from '@/auth/settings-context';
import type { Equipment } from '@/types/models';
import { statusLabel } from '@/theme/status';
import { SPACE, TOKENS } from '@/theme/tokens';
import { EmptyState } from '@/ui/empty-state';
import { ListRow } from '@/ui/list-row';
import { TextField } from '@/ui/text-field';

export default function EquipmentSearchScreen() {
  const router = useRouter();
  const { flag } = useSettings();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!flag('features.equipment')) {
      return;
    }
    const handle = setTimeout(() => {
      setLoading(true);
      void fetchEquipmentPageApi({ search: query.trim() || undefined, page: 1, pageSize: 25 })
        .then((response) => setItems(response.items))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [flag, query]);

  if (!flag('features.equipment')) {
    return <EmptyState message="Modul opreme je isključen." />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.search}>
        <TextField label="Pretraga opreme" value={query} onChangeText={setQuery} placeholder="Naziv, inv. broj…" autoCorrect={false} />
      </View>
      {loading ? <ActivityIndicator color={TOKENS.brand} style={{ marginTop: SPACE.md }} /> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={!loading ? <EmptyState message="Nema rezultata." /> : undefined}
        renderItem={({ item }) => (
          <ListRow
            title={item.stockLot?.productName || item.category?.name || item.inventoryNumber || 'Oprema'}
            subtitle={item.inventoryNumber ?? 'Bez inv. broja'}
            meta={statusLabel(item.status)}
            onPress={() => router.push(`/equipment/${item.id}`)}
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
