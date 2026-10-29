import { StyleSheet, Text, View } from 'react-native';
import { BrandMark } from '@/ui/brand-mark';
import { APP_NAME, SPACE, TOKENS } from '@/theme/tokens';

export const BlockedScreen = () => (
  <View style={styles.box}>
    <BrandMark />
    <Text style={styles.title}>{APP_NAME}</Text>
    <Text style={styles.copy}>Mobilna aplikacija je trenutno isključena u postavkama.</Text>
  </View>
);

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    backgroundColor: TOKENS.canvas,
    flex: 1,
    gap: SPACE.md,
    justifyContent: 'center',
    padding: SPACE.xl,
  },
  title: { color: TOKENS.ink, fontSize: 24, fontWeight: '700' },
  copy: { color: TOKENS.inkMuted, fontSize: 15, textAlign: 'center' },
});
