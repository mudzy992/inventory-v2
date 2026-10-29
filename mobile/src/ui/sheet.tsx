import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADII, SPACE, TOKENS } from '@/theme/tokens';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export const Sheet = ({ open, title, onClose, children }: SheetProps) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACE.lg) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(17,24,39,0.35)' },
  sheet: {
    backgroundColor: TOKENS.panel,
    borderTopLeftRadius: RADII.surface * 1.4,
    borderTopRightRadius: RADII.surface * 1.4,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.md,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: TOKENS.lineStrong,
    borderRadius: 99,
    height: 4,
    marginBottom: SPACE.md,
    width: 40,
  },
  title: { color: TOKENS.ink, fontSize: 18, fontWeight: '700', marginBottom: SPACE.lg },
});
