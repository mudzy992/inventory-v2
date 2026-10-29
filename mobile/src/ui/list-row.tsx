import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SPACE, TOKENS } from '@/theme/tokens';

export const ListRow = ({
  title,
  subtitle,
  meta,
  onPress,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.body}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {meta ? <Text style={styles.meta}>{meta}</Text> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  row: {
    backgroundColor: TOKENS.panel,
    borderBottomColor: TOKENS.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  pressed: { backgroundColor: TOKENS.subtle },
  body: { flex: 1 },
  title: { color: TOKENS.ink, fontSize: 15, fontWeight: '600' },
  subtitle: { color: TOKENS.inkMuted, fontSize: 13, marginTop: 2 },
  meta: { color: TOKENS.brandInk, fontSize: 12, fontWeight: '600' },
});
