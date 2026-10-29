import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/auth/session-context';

export default function AuthLayout() {
  const { user } = useSession();
  if (user) {
    return <Redirect href="/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
