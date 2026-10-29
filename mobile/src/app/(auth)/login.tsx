import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ApiError } from '@/api/errors';
import { useSession } from '@/auth/session-context';
import { APP_NAME, APP_SUBTITLE, SPACE, TOKENS } from '@/theme/tokens';
import { BrandMark } from '@/ui/brand-mark';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/text-field';

export default function LoginScreen() {
  const { login } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Prijava nije uspjela.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <LinearGradient colors={['#3730a3', '#4f46e5', '#0d9488']} style={styles.hero}>
        <BrandMark size={64} />
        <Text style={styles.name}>{APP_NAME}</Text>
        <Text style={styles.sub}>{APP_SUBTITLE}</Text>
      </LinearGradient>
      <View style={styles.card}>
        <TextField
          label="Korisničko ime"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextField
          label="Lozinka"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Prijavi se" onPress={() => void submit()} loading={loading} disabled={!username || !password} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: TOKENS.canvas, flex: 1 },
  hero: {
    alignItems: 'center',
    gap: SPACE.sm,
    paddingBottom: 48,
    paddingTop: 96,
  },
  name: { color: TOKENS.white, fontSize: 28, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  card: {
    backgroundColor: TOKENS.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
    gap: SPACE.lg,
    marginTop: -24,
    padding: SPACE.xl,
  },
  error: { color: TOKENS.dangerInk },
});
