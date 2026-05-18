import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NativeModules, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

export const KEEP_SCREEN_ON_STORAGE_KEY = 'keep_screen_on';

type KeepScreenOnNative = {
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
};

const keepScreenOn: KeepScreenOnNative | null =
  Platform.OS === 'android'
    ? ((NativeModules as { KeepScreenOn?: KeepScreenOnNative }).KeepScreenOn ?? null)
    : null;

type Props = {
  /** Diagnostic-only tag echoed in [keepAwake] logs so concurrent callers are distinguishable. */
  keepAwakeTag: string;
};

export default function KeepScreenOnToggle({ keepAwakeTag }: Props) {
  const colors = useTheme();
  const [enabled, setEnabled] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEEP_SCREEN_ON_STORAGE_KEY)
      .then(raw => {
        console.info('[keepAwake] AsyncStorage load, tag=', keepAwakeTag, 'raw=', raw);
        if (raw === 'true') setEnabled(true);
      })
      .catch(err => console.warn('[keepAwake] Failed to load keepScreenOn:', err))
      .finally(() => { loaded.current = true; });
  }, [keepAwakeTag]);

  useEffect(() => {
    if (!loaded.current) return;
    console.info('[keepAwake] enabled changed, tag=', keepAwakeTag, 'enabled=', enabled);
    AsyncStorage.setItem(KEEP_SCREEN_ON_STORAGE_KEY, enabled ? 'true' : 'false')
      .catch(err => console.warn('[keepAwake] Failed to save keepScreenOn:', err));
  }, [enabled, keepAwakeTag]);

  useFocusEffect(
    useCallback(() => {
      console.info('[keepAwake] focus effect, tag=', keepAwakeTag, 'enabled=', enabled, 'nativeAvailable=', !!keepScreenOn);
      if (enabled && keepScreenOn) {
        console.info('[keepAwake] calling activate, tag=', keepAwakeTag);
        keepScreenOn.activate()
          .then(() => console.info('[keepAwake] activate resolved, tag=', keepAwakeTag))
          .catch(err => console.warn('[keepAwake] activate rejected, tag=', keepAwakeTag, 'err=', err));
      }
      return () => {
        if (!keepScreenOn) return;
        console.info('[keepAwake] cleanup, calling deactivate, tag=', keepAwakeTag);
        keepScreenOn.deactivate()
          .then(() => console.info('[keepAwake] deactivate resolved, tag=', keepAwakeTag))
          .catch(err => console.warn('[keepAwake] deactivate rejected, tag=', keepAwakeTag, 'err=', err));
      };
    }, [enabled, keepAwakeTag])
  );

  const s = styles(colors);
  return (
    <TouchableOpacity
      onPress={() => setEnabled(prev => !prev)}
      accessibilityLabel="Keep screen on"
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      style={[s.btn, enabled && s.btnActive]}
    >
      <Ionicons
        name={enabled ? 'sunny' : 'sunny-outline'}
        size={18}
        color={enabled ? colors.green : colors.textMuted}
      />
      <Text style={[s.label, { color: enabled ? colors.green : colors.textMuted }]}>
        SCREEN ON
      </Text>
    </TouchableOpacity>
  );
}

const styles = (c: ReturnType<typeof useTheme>) => StyleSheet.create({
  btn: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  btnActive: {
    borderColor: 'rgba(0,255,136,0.4)',
    backgroundColor: 'rgba(0,255,136,0.12)',
  },
  label: {
    fontSize: 8,
    letterSpacing: 0.5,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
});
