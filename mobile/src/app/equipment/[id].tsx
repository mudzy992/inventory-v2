import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { fetchEquipmentApi, fetchPublicEquipmentApi } from '@/api/equipment';
import { fetchTransfersPageApi } from '@/api/transfers';
import { useSession } from '@/auth/session-context';
import { useSettings } from '@/auth/settings-context';
import { DetailHero } from '@/features/equipment/detail-hero';
import { HistoryPanel, HolderPanel, SpecsPanel } from '@/features/equipment/detail-panels';
import { toPublicLike } from '@/features/equipment/map-detail';
import { availableTransferTypes } from '@/features/transfer/guards';
import { TransferSheet } from '@/features/transfer/transfer-sheet';
import type { Equipment, PublicEquipment, TransferType } from '@/types/models';
import { SPACE, TOKENS } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { SegmentTabs } from '@/ui/segment-tabs';

export default function EquipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { flag } = useSettings();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [display, setDisplay] = useState<PublicEquipment | null>(null);
  const [tab, setTab] = useState('holder');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [transferType, setTransferType] = useState<TransferType | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const eq = await fetchEquipmentApi(id);
      const transfers = await fetchTransfersPageApi({ equipmentId: id, page: 1, pageSize: 20 });
      let publicLike = toPublicLike(eq, transfers.items);
      try {
        publicLike = await fetchPublicEquipmentApi(id);
      } catch {
        // auth DTO already mapped
      }
      setEquipment(eq);
      setDisplay(publicLike);
    } catch {
      setError('Oprema nije pronađena.');
      setEquipment(null);
      setDisplay(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={TOKENS.brand} />
      </View>
    );
  }
  if (error || !display || !equipment) {
    return <EmptyState message={error || 'Oprema nije pronađena.'} />;
  }

  const actions = availableTransferTypes(user, equipment, flag('features.transfers'));

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <DetailHero equipment={display} />
        <View style={styles.panel}>
          <SegmentTabs
            tabs={[
              { id: 'holder', label: 'Zaduženje' },
              { id: 'specs', label: 'Specifikacije' },
              { id: 'history', label: 'Historija' },
            ]}
            active={tab}
            onChange={setTab}
          />
          <View style={{ marginTop: SPACE.md }}>
            {tab === 'holder' ? <HolderPanel equipment={display} /> : null}
            {tab === 'specs' ? <SpecsPanel equipment={display} /> : null}
            {tab === 'history' ? <HistoryPanel equipment={display} /> : null}
          </View>
        </View>
        {actions.length ? (
          <View style={styles.actions}>
            {actions.includes('zaduzenje') ? (
              <Button label="Zaduži" variant="success" onPress={() => setTransferType('zaduzenje')} />
            ) : null}
            {actions.includes('prenos') ? (
              <Button label="Prenesi" variant="warning" onPress={() => setTransferType('prenos')} />
            ) : null}
            {actions.includes('razduzenje') ? (
              <Button label="Razduži" onPress={() => setTransferType('razduzenje')} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <TransferSheet
        equipment={equipment}
        type={transferType}
        onClose={() => setTransferType(null)}
        onDone={() => {
          setTransferType(null);
          void load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: TOKENS.canvas, flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { gap: SPACE.lg, padding: SPACE.lg, paddingBottom: 40 },
  panel: {
    backgroundColor: TOKENS.panel,
    borderColor: TOKENS.line,
    borderRadius: 14,
    borderWidth: 1,
    padding: SPACE.lg,
  },
  actions: { gap: SPACE.sm },
});
