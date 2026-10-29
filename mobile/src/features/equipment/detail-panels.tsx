import { StyleSheet, Text, View } from 'react-native';
import type { PublicEquipment } from '@/types/models';
import { formatDate, statusLabel } from '@/theme/status';
import { RADII, SPACE, TOKENS } from '@/theme/tokens';
import { EmptyState } from '@/ui/empty-state';

export const HolderPanel = ({ equipment }: { equipment: PublicEquipment }) => {
  if (equipment.status === 'zaduzeno' && equipment.currentHolder) {
    return (
      <View style={[styles.panel, { backgroundColor: '#ecfdf5' }]}>
        <Text style={styles.kicker}>Trenutno zadužen na</Text>
        <Text style={styles.title}>{equipment.currentHolder.fullName}</Text>
        <Text style={styles.sub}>{equipment.currentHolder.title}</Text>
        {equipment.currentHolder.orgUnitPath ? (
          <Text style={styles.sub}>{equipment.currentHolder.orgUnitPath}</Text>
        ) : null}
      </View>
    );
  }
  if (equipment.status === 'skladiste') {
    return (
      <View style={[styles.panel, { backgroundColor: '#eef2ff' }]}>
        <Text style={styles.kicker}>Lokacija</Text>
        <Text style={styles.title}>{equipment.warehouse?.name ?? 'Na skladištu'}</Text>
        <Text style={styles.sub}>Oprema je dostupna za zaduženje</Text>
      </View>
    );
  }
  if (equipment.status === 'za_rashod' || equipment.status === 'rashodovano') {
    return (
      <View style={[styles.panel, { backgroundColor: equipment.status === 'za_rashod' ? '#fffbeb' : '#fef2f2' }]}>
        <Text style={styles.title}>{statusLabel(equipment.status)}</Text>
        {equipment.disposalReason ? <Text style={styles.sub}>Razlog: {equipment.disposalReason}</Text> : null}
      </View>
    );
  }
  return <EmptyState message="Nema podataka o zaduženju" />;
};

export const SpecsPanel = ({ equipment }: { equipment: PublicEquipment }) => {
  const entries = Object.entries(equipment.specifications);
  if (!entries.length) {
    return <EmptyState message="Nema dodatnih specifikacija" />;
  }
  return (
    <View>
      {entries.map(([label, value]) => (
        <View key={label} style={styles.specRow}>
          <Text style={styles.specLabel}>{label}</Text>
          <Text style={styles.specValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
};

export const HistoryPanel = ({ equipment }: { equipment: PublicEquipment }) => {
  if (!equipment.movements.length) {
    return <EmptyState message="Nema zabilježenih kretanja" />;
  }
  return (
    <View>
      {equipment.movements.map((row) => (
        <View key={`${row.documentNumber}-${row.date}`} style={styles.specRow}>
          <Text style={styles.specLabel}>
            {statusLabel(row.type)} · {formatDate(row.date)}
          </Text>
          <Text style={styles.specValue}>
            {row.fromLabel} → {row.toLabel}
          </Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { borderRadius: RADII.surface, padding: SPACE.lg },
  kicker: { color: TOKENS.inkMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  title: { color: TOKENS.ink, fontSize: 18, fontWeight: '700', marginTop: 6 },
  sub: { color: TOKENS.inkMuted, marginTop: 4 },
  specRow: {
    borderBottomColor: TOKENS.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACE.md,
  },
  specLabel: { color: TOKENS.inkMuted, fontSize: 13 },
  specValue: { color: TOKENS.ink, fontSize: 14, fontWeight: '600', marginTop: 2 },
});
