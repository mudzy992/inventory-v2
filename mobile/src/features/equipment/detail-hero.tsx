import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Package } from 'lucide-react-native';
import type { PublicEquipment } from '@/types/models';
import { resolveStatusTheme, statusLabel } from '@/theme/status';
import { RADII, SPACE, TOKENS } from '@/theme/tokens';

export const DetailHero = ({ equipment }: { equipment: PublicEquipment }) => {
  const theme = resolveStatusTheme(equipment.status);
  return (
    <LinearGradient colors={[theme.from, theme.to]} style={styles.hero}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Package color={TOKENS.white} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{equipment.categoryName}</Text>
          <Text style={styles.title}>{equipment.productName ?? '—'}</Text>
          <View style={styles.chips}>
            <Text style={styles.chip}>{equipment.inventoryNumber?.trim() || 'Bez inv. broja'}</Text>
            {!equipment.isAccountingTracked ? <Text style={styles.chip}>Evidencijska</Text> : null}
            <Text style={styles.chip}>{statusLabel(equipment.status)}</Text>
          </View>
        </View>
      </View>
      {equipment.uniqueFields.map((field) => (
        <View key={field.label} style={styles.unique}>
          <Text style={styles.uniqueLabel}>{field.label}</Text>
          <Text style={styles.uniqueValue}>{field.value}</Text>
        </View>
      ))}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  hero: { borderRadius: RADII.surface, padding: SPACE.lg },
  row: { flexDirection: 'row', gap: SPACE.md },
  icon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  kicker: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  title: { color: TOKENS.white, fontSize: 20, fontWeight: '700', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACE.md },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    color: TOKENS.white,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unique: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    marginTop: SPACE.md,
    padding: SPACE.md,
  },
  uniqueLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  uniqueValue: { color: TOKENS.white, fontSize: 14, fontWeight: '600', marginTop: 2 },
});
