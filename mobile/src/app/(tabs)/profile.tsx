import { StyleSheet, Text, View } from 'react-native';
import { useSession } from '@/auth/session-context';
import { APP_NAME, APP_SUBTITLE, SPACE, TOKENS } from '@/theme/tokens';
import { BrandMark } from '@/ui/brand-mark';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  evidenticar: 'Evidentičar',
  moderator: 'Moderator',
  user: 'Korisnik',
  skladistar: 'Skladištar',
  popis_koordinator: 'Koordinator popisa',
};

export default function ProfileScreen() {
  const { user, logout } = useSession();
  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <BrandMark />
        <Text style={styles.name}>{APP_NAME}</Text>
        <Text style={styles.sub}>{APP_SUBTITLE}</Text>
      </View>
      <Card>
        <Text style={styles.label}>Prijavljeni korisnik</Text>
        <Text style={styles.value}>{user?.username}</Text>
        <Text style={styles.role}>{ROLE_LABEL[user?.role ?? ''] ?? user?.role}</Text>
      </Card>
      <Button label="Odjava" variant="secondary" onPress={() => void logout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: TOKENS.canvas, flex: 1, gap: SPACE.lg, padding: SPACE.lg },
  hero: { alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.xl },
  name: { color: TOKENS.ink, fontSize: 22, fontWeight: '700' },
  sub: { color: TOKENS.inkMuted },
  label: { color: TOKENS.inkMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  value: { color: TOKENS.ink, fontSize: 18, fontWeight: '700', marginTop: 6 },
  role: { color: TOKENS.brandInk, marginTop: 4 },
});
