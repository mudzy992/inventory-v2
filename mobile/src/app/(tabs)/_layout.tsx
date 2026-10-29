import { Redirect, Tabs } from 'expo-router';
import { Package, QrCode, UserRound, Users } from 'lucide-react-native';
import { useSession } from '@/auth/session-context';
import { TOKENS } from '@/theme/tokens';

export default function TabsLayout() {
  const { user } = useSession();
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: TOKENS.ink,
        tabBarActiveTintColor: TOKENS.brand,
        tabBarInactiveTintColor: TOKENS.inkSubtle,
        tabBarStyle: { backgroundColor: TOKENS.panel, borderTopColor: TOKENS.line },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Sken',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <QrCode color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="equipment"
        options={{
          title: 'Oprema',
          tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: 'Radnici',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
