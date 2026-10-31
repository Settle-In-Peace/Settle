import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList, MainTabsParamList } from '../navigation/AppNavigator';
import { Card } from '../components/Card';
import { User } from '../services/auth';
import { colors } from '../theme/colors';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

function getDisplayName(user: User | null): string {
  if (!user) return 'Guest';
  if (user.firstName || user.lastName) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  }
  return user.name || user.email.split('@')[0];
}

interface DashboardScreenProps {
  user: User | null;
}

export default function DashboardScreen({ user }: DashboardScreenProps) {
  const tabNavigation = useNavigation<BottomTabNavigationProp<MainTabsParamList>>();
  const mainNavigation = useNavigation<NativeStackScreenProps<MainStackParamList>['navigation']>();

  const actions = [
    { label: 'My Debts', target: 'Debts', icon: '💳' },
    { label: 'My Program', target: 'Settlement' as const, icon: '🤝' },
    { label: 'Assessment', target: 'Assessment' as const, icon: '💬' },
    { label: 'Calculators', target: 'Calculators', icon: '🧮' },
    { label: 'Learn', target: 'Learn', icon: '📚' },
    { label: 'Profile', target: 'Profile', icon: '👤' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Hello, {getDisplayName(user)}</Text>
      <Text style={styles.subtitle}>Here is your financial snapshot today.</Text>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>Total Debt</Text>
          <Text style={styles.statValue}>$0.00</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>Monthly Payment</Text>
          <Text style={styles.statValue}>$0.00</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>Quick Actions</Text>

      {actions.map((action) => (
        <TouchableOpacity
          key={action.label}
          style={styles.actionRow}
          onPress={() => {
            if (action.target === 'Assessment' || action.target === 'Settlement') {
              (mainNavigation as any).navigate(action.target);
            } else {
              tabNavigation.navigate(action.target as any);
            }
          }}
        >
          <Text style={styles.actionIcon}>{action.icon}</Text>
          <Text style={styles.actionLabel}>{action.label}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    marginBottom: 0,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    fontSize: 20,
    marginRight: 14,
  },
  actionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  chevron: {
    fontSize: 22,
    color: colors.slate,
  },
});
