import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SPACE, TOKENS } from '@/theme/tokens';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Nije pronađeno' }} />
      <View style={styles.box}>
        <Text style={styles.title}>Stranica ne postoji.</Text>
        <Link href="/" style={styles.link}>
          Nazad na početak
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: SPACE.xl },
  title: { color: TOKENS.ink, fontSize: 18, fontWeight: '700' },
  link: { color: TOKENS.brand, marginTop: SPACE.md },
});
