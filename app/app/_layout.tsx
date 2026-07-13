import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  Theme,
  ThemeProvider,
} from '@react-navigation/native';
import {
  EncodeSansSemiExpanded_400Regular,
  EncodeSansSemiExpanded_500Medium,
  EncodeSansSemiExpanded_600SemiBold,
  EncodeSansSemiExpanded_700Bold,
  EncodeSansSemiExpanded_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/encode-sans-semi-expanded';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { Colors, Fonts } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth-store';
import { ItemsProvider, useItemsStore } from '@/lib/items-store';

SplashScreen.preventAutoHideAsync();

const navFonts: Theme['fonts'] = {
  regular: { fontFamily: Fonts.regular, fontWeight: '400' },
  medium: { fontFamily: Fonts.medium, fontWeight: '500' },
  bold: { fontFamily: Fonts.bold, fontWeight: '700' },
  heavy: { fontFamily: Fonts.extraBold, fontWeight: '800' },
};

const LightNavigationTheme: Theme = {
  ...NavigationDefaultTheme,
  colors: {
    ...NavigationDefaultTheme.colors,
    primary: Colors.light.accent,
    background: Colors.light.bg,
    card: Colors.light.tile,
    text: Colors.light.ink,
    border: Colors.light.border,
    notification: Colors.light.danger,
  },
  fonts: navFonts,
};

const DarkNavigationTheme: Theme = {
  ...NavigationDarkTheme,
  colors: {
    ...NavigationDarkTheme.colors,
    primary: Colors.dark.accent,
    background: Colors.dark.bg,
    card: Colors.dark.tile,
    text: Colors.dark.ink,
    border: Colors.dark.border,
    notification: Colors.dark.danger,
  },
  fonts: navFonts,
};

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <ItemsProvider>
        <RootLayoutNav />
      </ItemsProvider>
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const { theme, loading } = useItemsStore();
  const { session, householdId, initializing } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    EncodeSansSemiExpanded_400Regular,
    EncodeSansSemiExpanded_500Medium,
    EncodeSansSemiExpanded_600SemiBold,
    EncodeSansSemiExpanded_700Bold,
    EncodeSansSemiExpanded_800ExtraBold,
  });

  const ready = (fontsLoaded || fontError) && !loading && !initializing;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  const navigationTheme = theme === 'dark' ? DarkNavigationTheme : LightNavigationTheme;

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: navigationTheme.colors.background } }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !householdId}>
          <Stack.Screen name="household-setup" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !!householdId}>
          <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
          <Stack.Screen name="room/[room]" options={{ title: 'Room' }} />
          <Stack.Screen name="add" options={{ title: 'Add Item' }} />
          <Stack.Screen name="item/[id]" options={{ title: 'Item Detail' }} />
        </Stack.Protected>
      </Stack>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
