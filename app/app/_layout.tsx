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
import { Outfit_400Regular, Outfit_600SemiBold } from '@expo-google-fonts/outfit';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { AnimatedSplash } from '@/components/animated-splash';
import { Colors, Fonts } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth-store';
import { ItemsProvider, useItemsStore } from '@/lib/items-store';

SplashScreen.preventAutoHideAsync();

// iOS only, and only a few frames long. AnimatedSplash draws a copy of
// the native splash and hides the real one underneath it, so this fade
// covers the swap itself — without it, the handoff is a hard cut between
// two images that happen to be identical, which shows up as a flicker on
// slower devices.
SplashScreen.setOptions({ duration: 250, fade: true });

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
  const { session, householdId, initializing, householdResolved } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    EncodeSansSemiExpanded_400Regular,
    EncodeSansSemiExpanded_500Medium,
    EncodeSansSemiExpanded_600SemiBold,
    EncodeSansSemiExpanded_700Bold,
    EncodeSansSemiExpanded_800ExtraBold,
    // Only the splash animation uses these; see DisplayFonts in the theme.
    Outfit_400Regular,
    Outfit_600SemiBold,
  });

  const [splashFinished, setSplashFinished] = useState(false);

  const ready = (fontsLoaded || fontError) && !loading && !initializing;

  // AnimatedSplash hides the native splash itself, once it has actually
  // been laid out. This is the backstop: if that component ever fails to
  // mount, the native splash would otherwise stay up forever and the app
  // would look hung.
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  const navigationTheme = theme === 'dark' ? DarkNavigationTheme : LightNavigationTheme;

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: navigationTheme.colors.background } }}>
        {/* While a just-signed-in user's household is still being looked
            up, stay on sign-in rather than routing anywhere. Falling
            through to household-setup — which is what `!householdId`
            alone does, since it's null until the fetch lands — flashes
            "Create a household" at someone who already has one. Holding
            the sign-in screen for those few hundred milliseconds reads as
            the sign-in still finishing, which is exactly what it is. */}
        <Stack.Protected guard={!session || !householdResolved}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && householdResolved && !householdId}>
          <Stack.Screen name="household-setup" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && householdResolved && !!householdId}>
          <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
          <Stack.Screen name="room/[room]" options={{ title: 'Room' }} />
          <Stack.Screen name="add" options={{ title: 'Add Item' }} />
          <Stack.Screen name="item/[id]" options={{ title: 'Item Detail' }} />
        </Stack.Protected>
      </Stack>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {/* Last child, so it covers the navigator, and mounted only while
          it has something to do — once it has faded out it is gone from
          the tree entirely rather than sitting there transparent and
          swallowing nothing. */}
      {!splashFinished && <AnimatedSplash onFinish={() => setSplashFinished(true)} />}
    </ThemeProvider>
  );
}
