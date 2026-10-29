import { StyleSheet, View, type ViewProps } from 'react-native';
import { RADII, SPACE, TOKENS } from '@/theme/tokens';

export const Card = ({ style, ...props }: ViewProps) => (
  <View style={[styles.card, style]} {...props} />
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.panel,
    borderColor: TOKENS.line,
    borderRadius: RADII.surface,
    borderWidth: 1,
    padding: SPACE.lg,
  },
});
