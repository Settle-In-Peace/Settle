import { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { getToken, getProfile, getStoredUser, logout, User } from './src/services/auth';
import { colors } from './src/theme/colors';

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

  useEffect(() => {
    async function init() {
      const token = await getToken();
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
      setLoading(false);
    }
    init();
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking}>
        <AppNavigator user={user} setUser={setUser} />
      </NavigationContainer>
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
