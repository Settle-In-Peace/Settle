import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DebtsScreen from '../screens/DebtsScreen';
import AssessmentScreen from '../screens/AssessmentScreen';
import CalculatorsScreen from '../screens/CalculatorsScreen';
import LearnScreen from '../screens/LearnScreen';
import LearnArticleScreen from '../screens/LearnArticleScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettlementScreen from '../screens/SettlementScreen';
import { User } from '../services/auth';
import { colors } from '../theme/colors';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  Assessment: undefined;
  Settlement: undefined;
};

export type MainTabsParamList = {
  Dashboard: undefined;
  Debts: undefined;
  Calculators: undefined;
  Learn: undefined;
  Profile: undefined;
};

export type LearnStackParamList = {
  LearnList: undefined;
  Article: { slug: string };
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<MainTabsParamList>();
const LearnStack = createNativeStackNavigator<LearnStackParamList>();

function AuthNavigator({ setUser }: { setUser: (user: User | null) => void }) {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login">
        {(props) => <LoginScreen {...(props as any)} setUser={setUser} />}
      </AuthStack.Screen>
      <AuthStack.Screen name="Register">
        {(props) => <RegisterScreen {...(props as any)} setUser={setUser} />}
      </AuthStack.Screen>
    </AuthStack.Navigator>
  );
}

function MainStackScreen({ user, setUser }: { user: User | null; setUser: (user: User | null) => void }) {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs">
        {(props) => <MainTabs {...(props as any)} user={user} setUser={setUser} />}
      </MainStack.Screen>
      <MainStack.Screen name="Assessment" component={AssessmentScreen} />
      <MainStack.Screen name="Settlement" component={SettlementScreen} />
    </MainStack.Navigator>
  );
}

function LearnStackScreen() {
  return (
    <LearnStack.Navigator screenOptions={{ headerShown: true }}>
      <LearnStack.Screen name="LearnList" component={LearnScreen} options={{ title: 'Learn' }} />
      <LearnStack.Screen name="Article" component={LearnArticleScreen} options={{ title: 'Article' }} />
    </LearnStack.Navigator>
  );
}

function MainTabs({ user, setUser }: { user: User | null; setUser: (user: User | null) => void }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.slate,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        options={{ tabBarLabel: 'Home' }}
      >
        {(props) => <DashboardScreen {...(props as any)} user={user} />}
      </Tab.Screen>
      <Tab.Screen name="Debts" component={DebtsScreen} />
      <Tab.Screen name="Calculators" component={CalculatorsScreen} />
      <Tab.Screen
        name="Learn"
        options={{ tabBarLabel: 'Learn', headerShown: false }}
      >
        {(props) => <LearnStackScreen {...(props as any)} />}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        options={{ tabBarLabel: 'Profile' }}
      >
        {(props) => <ProfileScreen {...(props as any)} user={user} setUser={setUser} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

interface AppNavigatorProps {
  user: User | null;
  setUser: (user: User | null) => void;
}

export default function AppNavigator({ user, setUser }: AppNavigatorProps) {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <RootStack.Screen name="Main">
          {(props) => <MainStackScreen {...(props as any)} user={user} setUser={setUser} />}
        </RootStack.Screen>
      ) : (
        <RootStack.Screen name="Auth">
          {(props) => <AuthNavigator {...(props as any)} setUser={setUser} />}
        </RootStack.Screen>
      )}
    </RootStack.Navigator>
  );
}
