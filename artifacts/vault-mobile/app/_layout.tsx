import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { isUnauthorizedError, setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { AuthProvider } from '@/lib/auth';
import { tokenStorage } from '@/lib/auth-token';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

// Expo bundles run outside the web proxy and need absolute URLs to reach the API server.
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
// No cookies outside the web proxy: attach the stored session token as a bearer.
setAuthTokenGetter(() => tokenStorage.get());

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Do not retry unauthorized responses: surface the sign-in prompt immediately
// instead of leaving the user staring at a spinner through retries.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !isUnauthorizedError(error) && failureCount < 3,
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', headerShown: false, contentStyle: { backgroundColor: '#0C0D0E' } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="deal/[id]" />
      <Stack.Screen name="mandate/[id]" />
      <Stack.Screen name="thread/[id]" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <StatusBar style="light" />
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
