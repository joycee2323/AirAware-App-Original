import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import AppNavigator from './src/navigation/AppNavigator';
import { initDroneNotifications } from './src/services/droneNotifier';
import { configureNotificationHandler, setupAndroidChannels } from './src/services/pushNotifications';
import { KEEP_SCREEN_ON_STORAGE_KEY } from './src/components/KeepScreenOnToggle';

// Foreground handler must be registered before any notification
// arrives, so it goes at module-load time (top of App.tsx import
// order). Channel setup is async but idempotent — the kicked-off
// promise can finish whenever.
configureNotificationHandler();
void setupAndroidChannels();

const LEGACY_KEEP_SCREEN_ON_KEY = 'live_map_keep_screen_on';

async function migrateKeepScreenOnKey() {
  try {
    const legacy = await AsyncStorage.getItem(LEGACY_KEEP_SCREEN_ON_KEY);
    if (legacy == null) return;
    const current = await AsyncStorage.getItem(KEEP_SCREEN_ON_STORAGE_KEY);
    if (current == null) {
      await AsyncStorage.setItem(KEEP_SCREEN_ON_STORAGE_KEY, legacy);
    }
    await AsyncStorage.removeItem(LEGACY_KEEP_SCREEN_ON_KEY);
  } catch (err) {
    console.warn('keep_screen_on migration failed:', err);
  }
}

export default function App() {
  // Pre-load icon fonts at the app root. SDK 53's @expo/vector-icons 14.1
  // ships the lazy `IconsLazy` entry; its per-icon-set createIconSet has
  // a componentDidMount Font.loadAsync call that silently swallows
  // rejections, leaving icons stuck on the empty <Text /> fallback if
  // the load fails. Loading upfront via useFonts surfaces failures and
  // ensures the per-icon mount path short-circuits via Font.isLoaded.
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    void migrateKeepScreenOnKey();
    void initDroneNotifications();
  }, []);

  useEffect(() => {
    if (fontError) {
      console.warn('[fonts] Ionicons load failed:', fontError);
    }
  }, [fontError]);

  // Fail open: if the font load errors, still render the app (with
  // missing icons) rather than stranding users on the splash screen.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppNavigator />
    </GestureHandlerRootView>
  );
}
