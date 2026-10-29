import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { RADII, SPACE, TOKENS } from '@/theme/tokens';

interface FieldProps extends TextInputProps {
  label: string;
}

export const TextField = ({ label, style, ...props }: FieldProps) => (
  <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      placeholderTextColor={TOKENS.inkSubtle}
      style={[styles.input, style]}
      {...props}
    />
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: SPACE.xs },
  label: { color: TOKENS.inkMuted, fontFamily: 'Inter_600SemiBold', fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: TOKENS.panel,
    borderColor: TOKENS.line,
    borderRadius: RADII.control,
    borderWidth: 1,
    color: TOKENS.ink,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: SPACE.md,
  },
});
