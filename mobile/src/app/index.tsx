import { Redirect } from 'expo-router';
import { useSession } from '@/auth/session-context';

export default function Index() {
  const { user } = useSession();
  return <Redirect href={user ? '/(tabs)' : '/(auth)/login'} />;
}
