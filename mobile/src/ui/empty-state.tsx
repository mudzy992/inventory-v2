import { StyleSheet, Text, View } from 'react-native';
import { SPACE, TOKENS } from '@/theme/tokens';

export const EmptyState = ({ message }: { message: string }) => (
  <View style={styles.box}>
    <Text style={styles.text}>{message}</Text>
  </View>
);

const styles = StyleSheet.create({
  box: { padding: SPACE.xl },
  text: { color: TOKENS.inkMuted, fontSize: 14, textAlign: 'center' },
});
