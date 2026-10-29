import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CatalogProvider } from '@/auth/catalog-context';
import { SessionProvider, useSession } from '@/auth/session-context';
import { SettingsProvider, useSettings } from '@/auth/settings-context';
import { TOKENS } from '@/theme/tokens';
import { BlockedScreen } from '@/features/auth/blocked-screen';

SplashScreen.preventAutoHideAsync();

const RootNav = () => {
  const { ready: sessionReady } = useSession();
  const { ready: settingsReady, flag } = useSettings();
  if (!sessionReady || !settingsReady) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={TOKENS.brand} />
      </View>
    );
  }
  if (!flag('features.mobile_app', true)) {
    return <BlockedScreen />;
  }
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: TOKENS.brandInk }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="equipment/[id]" options={{ title: 'Oprema' }} />
        <Stack.Screen name="people/[id]" options={{ title: 'Radnik' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
};

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <SettingsProvider>
          <CatalogProvider>
            <RootNav />
          </CatalogProvider>
        </SettingsProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  boot: { alignItems: 'center', backgroundColor: TOKENS.canvas, flex: 1, justifyContent: 'center' },
});
