import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchEmployeeProfileApi } from '@/api/employees';
import type { EmployeeProfile } from '@/types/models';
import { statusLabel } from '@/theme/status';
import { SPACE, TOKENS } from '@/theme/tokens';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { ListRow } from '@/ui/list-row';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      return;
    }
    setLoading(true);
    void fetchEmployeeProfileApi(id)
      .then(setProfile)
      .catch(() => setError('Profil radnika nije dostupan.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={TOKENS.brand} />
      </View>
    );
  }
  if (error || !profile) {
    return <EmptyState message={error || 'Radnik nije pronađen.'} />;
  }

  return (
    <View style={styles.root}>
      <Card style={{ marginHorizontal: SPACE.lg }}>
        <Text style={styles.name}>
          {profile.employee.firstName} {profile.employee.lastName}
        </Text>
        <Text style={styles.title}>{profile.employee.title}</Text>
        <Text style={styles.meta}>Zadužena oprema: {profile.heldEquipmentTotal}</Text>
      </Card>
      <FlatList
        data={profile.heldEquipment}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<EmptyState message="Nema zadužene opreme." />}
        renderItem={({ item }) => (
          <ListRow
            title={item.lotName || item.categoryName}
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
  root: { backgroundColor: TOKENS.canvas, flex: 1, gap: SPACE.md, paddingTop: SPACE.md },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  name: { color: TOKENS.ink, fontSize: 20, fontWeight: '700' },
  title: { color: TOKENS.inkMuted, marginTop: 4 },
  meta: { color: TOKENS.brandInk, marginTop: SPACE.sm, fontWeight: '600' },
});
