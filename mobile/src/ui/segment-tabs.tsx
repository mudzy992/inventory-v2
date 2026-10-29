import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RADII, SPACE, TOKENS } from '@/theme/tokens';

interface Tab {
  id: string;
  label: string;
}

export const SegmentTabs = ({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}) => (
  <View style={styles.row}>
    {tabs.map((tab) => {
      const selected = tab.id === active;
      return (
        <Pressable
          key={tab.id}
          onPress={() => onChange(tab.id)}
          style={[styles.tab, selected && styles.active]}
        >
          <Text style={[styles.label, selected && styles.activeLabel]}>{tab.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: {
    backgroundColor: TOKENS.subtle,
    borderRadius: RADII.control,
    flexDirection: 'row',
    padding: 4,
  },
  tab: { borderRadius: 8, flex: 1, paddingVertical: SPACE.sm },
  active: { backgroundColor: TOKENS.panel },
  label: { color: TOKENS.inkMuted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  activeLabel: { color: TOKENS.ink },
});
