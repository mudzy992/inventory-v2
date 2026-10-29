import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { FONT, RADII, SPACE, TOKENS } from '@/theme/tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  disabled?: boolean;
  loading?: boolean;
}

const COLORS = {
  primary: TOKENS.brand,
  secondary: TOKENS.subtle,
  danger: TOKENS.dangerInk,
  success: '#16a34a',
  warning: '#ea580c',
} as const;

export const Button = ({ label, onPress, variant = 'primary', disabled, loading }: ButtonProps) => {
  const bg = COLORS[variant];
  const color = variant === 'secondary' ? TOKENS.ink : TOKENS.white;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.88 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.label, { color }]}>{label}</Text>}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: RADII.control,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
  },
  label: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    fontWeight: '600',
  },
});
