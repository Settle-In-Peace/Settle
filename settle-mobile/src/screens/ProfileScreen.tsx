import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { deleteAccount, logout, User } from '../services/auth';
import { colors } from '../theme/colors';

interface ProfileScreenProps {
  user: User | null;
  setUser: (user: User | null) => void;
}

function getDisplayName(user: User | null): string {
  if (!user) return 'Guest';
  if (user.firstName || user.lastName) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  }
  return user.name || user.email.split('@')[0];
}

export default function ProfileScreen({ user, setUser }: ProfileScreenProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleLogout() {
    await logout();
    setUser(null);
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteAccount();
      setUser(null);
    } catch (err: any) {
      Alert.alert(
        'Could not delete account',
        err?.message || 'Something went wrong. Please try again or contact support@settleinpeace.com.'
      );
    } finally {
      setDeleting(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your Settle In Peace account and associated debt data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      <Card>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{getDisplayName(user)}</Text>

        <Text style={[styles.label, styles.labelSpacing]}>Email</Text>
        <Text style={styles.value}>{user?.email || 'Not signed in'}</Text>

        <Text style={[styles.label, styles.labelSpacing]}>Role</Text>
        <Text style={styles.value}>{user?.role || 'customer'}</Text>
      </Card>

      <Button title="Log Out" onPress={handleLogout} variant="outline" />

      <View style={styles.deleteWrap}>
        <Button
          title={deleting ? 'Deleting...' : 'Delete Account'}
          onPress={handleDeleteAccount}
          variant="outline"
          disabled={deleting}
        />
      </View>
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
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
  },
  labelSpacing: {
    marginTop: 16,
  },
  value: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  deleteWrap: {
    marginTop: 12,
  },
});
