import { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import AppNavigator from './src/navigation/AppNavigator';
import OnboardingScreen, { ONBOARD_KEY } from './src/screens/OnboardingScreen';
import { getToken, getProfile, getStoredUser, logout, User } from './src/services/auth';
import { colors } from './src/theme/colors';

// Keep the native splash up until the stored session + onboarding flag resolve.
SplashScreen.preventAutoHideAsync().catch(() => {});

const linking: LinkingOptions<any> = {
  prefixes: ['settleinpeace://'],
  config: {
    screens: {
      Auth: {
        screens: { Login: 'login', Register: 'register' },
      },
      Main: {
        screens: {
          Tabs: {
            screens: {
              Dashboard: 'home',
              Debts: 'debts',
              Calculators: 'calculators',
              Learn: { screens: { LearnList: 'learn', Article: 'learn/:id' } },
              Profile: 'profile',
            },
          },
          Assessment: 'assessment',
          Settlement: 'settlement',
          Attorneys: 'attorneys',
          Questions: 'questions',
          QuestionDetail: 'questions/:id',
          Coaching: 'coaching',
        },
      },
    },
  },
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    async function init() {
      const [token, seenOnboard] = await Promise.all([
        getToken(),
        AsyncStorage.getItem(ONBOARD_KEY).catch(() => null),
      ]);
      if (token) {
        try {
          const profile = await getProfile(token);
          setUser(profile);
        } catch {
          await logout();
          setUser(null);
        }
      } else {
        const stored = await getStoredUser();
        if (stored) setUser(stored);
      }
      setOnboarded(!!seenOnboard);
      setLoading(false);
    }
    init();
  }, []);

  // The native splash covers boot; hide it once auth/onboarding state is known.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  if (loading || onboarded === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!onboarded ? (
        <OnboardingScreen onDone={() => setOnboarded(true)} />
      ) : (
        <NavigationContainer linking={linking}>
          <AppNavigator user={user} setUser={setUser} />
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
