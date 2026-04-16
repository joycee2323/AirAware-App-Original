import React, { useEffect, useState, useCallback } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useColorScheme, Platform, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store/authStore';
import { useTheme } from '../theme';
import { api } from '../services/api';

import SettingsScreen from '../screens/SettingsScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import GuestScanScreen from '../screens/GuestScanScreen';
import LiveMapScreen from '../screens/LiveMapScreen';
import DeploymentsScreen from '../screens/DeploymentsScreen';
import NodesScreen from '../screens/NodesScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthTabs() {
  const colors = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 9,
          letterSpacing: 1,
          fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, string> = {
            LiveMap: focused ? 'map' : 'map-outline',
            Deployments: focused ? 'radio' : 'radio-outline',
            Nodes: focused ? 'hardware-chip' : 'hardware-chip-outline',
            Settings: focused ? 'person-circle' : 'person-circle-outline',
          };
          return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="LiveMap" component={LiveMapScreen} options={{ tabBarLabel: 'LIVE MAP' }} />
      <Tab.Screen name="Deployments" component={DeploymentsScreen} options={{ tabBarLabel: 'DEPLOYMENTS' }} />
      <Tab.Screen name="Nodes" component={NodesScreen} options={{ tabBarLabel: 'NODES' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: 'ACCOUNT' }} />
    </Tab.Navigator>
  );
}

function MainGate() {
  const colors = useTheme();
  const [hasNodes, setHasNodes] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const checkNodes = useCallback(async () => {
    setRefreshing(true);
    try {
      const nodes = await api.getNodes();
      setHasNodes(Array.isArray(nodes) && nodes.length > 0);
    } catch (err) {
      console.warn('Failed to check nodes:', err);
      setHasNodes(false);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { checkNodes(); }, [checkNodes]);

  if (hasNodes === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.cyan} size="large" />
      </View>
    );
  }

  if (!hasNodes) {
    return <OnboardingScreen onRefresh={checkNodes} refreshing={refreshing} />;
  }

  return <AuthTabs />;
}

export default function AppNavigator() {
  const scheme = useColorScheme();
  const { token, isLoading, loadToken } = useAuthStore();
  const colors = useTheme();

  useEffect(() => { loadToken(); }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.cyan} size="large" />
      </View>
    );
  }

  const navTheme = scheme === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, border: colors.border, primary: colors.cyan, text: colors.text, notification: colors.red } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, border: colors.border, primary: colors.cyan, text: colors.text, notification: colors.red } };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <Stack.Screen name="Main" component={MainGate} />
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="GuestScan" component={GuestScanScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
