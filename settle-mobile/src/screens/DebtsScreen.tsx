import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, Modal, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { colors } from '../theme/colors';

interface Debt {
  id: string;
  creditor: string;
  balance: number;
  interestRate?: number;
  type?: string;
  status?: string;
}

const DEBT_TYPES = [
  { key: 'credit_card', label: 'Credit card' },
  { key: 'personal_loan', label: 'Personal loan' },
  { key: 'medical', label: 'Medical' },
  { key: 'collections', label: 'Collections' },
  { key: 'other', label: 'Other' },
];

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export default function DebtsScreen() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creditor, setCreditor] = useState('');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [type, setType] = useState('credit_card');

  const fetchDebts = useCallback(async () => {
    try {
      const response = await api.get<Debt[]>('/debts');
      setDebts(response.data || []);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load debts');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the tab gains focus so debts added from the
  // assessment summary or elsewhere show up immediately.
  useFocusEffect(
    useCallback(() => {
      fetchDebts();
    }, [fetchDebts])
  );

  async function handleAddDebt() {
    const amount = Number(balance);
    if (!creditor.trim() || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Check the details', 'Enter a creditor name and a balance greater than zero.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/debts', {
        creditor: creditor.trim(),
        balance: amount,
        ...(rate.trim() ? { interestRate: Number(rate) } : {}),
        type,
      });
      setShowForm(false);
      setCreditor('');
      setBalance('');
      setRate('');
      setType('credit_card');
      await fetchDebts();
    } catch (err: any) {
      Alert.alert('Could not save debt', err?.response?.data?.message || err?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function renderDebt({ item }: { item: Debt }) {
    return (
      <Card>
        <View style={styles.debtHeader}>
          <Text style={styles.creditor}>{item.creditor}</Text>
          <Text style={styles.balance}>{currency.format(Number(item.balance) || 0)}</Text>
        </View>
        <View style={styles.debtMeta}>
          <Text style={styles.metaText}>Rate: {item.interestRate ? `${item.interestRate}%` : 'N/A'}</Text>
          <Text style={styles.metaText}>Type: {item.type || 'Other'}</Text>
          <Text style={styles.metaText}>Status: {item.status || 'Active'}</Text>
        </View>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Debts</Text>
        <Button title="Add Debt" onPress={() => setShowForm(true)} variant="outline" />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={debts}
          keyExtractor={(item) => item.id}
          renderItem={renderDebt}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No debts found. Add your first debt to get started.</Text>}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a debt</Text>
            <Input label="Creditor" placeholder="Chase, Capital One..." value={creditor} onChangeText={setCreditor} />
            <Input label="Balance ($)" placeholder="5000" value={balance} onChangeText={setBalance} keyboardType="numeric" />
            <Input label="Interest rate % (optional)" placeholder="24.99" value={rate} onChangeText={setRate} keyboardType="numeric" />
            <Text style={styles.typeLabel}>Type</Text>
            <View style={styles.typeRow}>
              {DEBT_TYPES.map((t) => (
                <Pressable
                  key={t.key}
                  style={[styles.typeChip, type === t.key && styles.typeChipOn]}
                  onPress={() => setType(t.key)}
                >
                  <Text style={[styles.typeChipText, type === t.key && styles.typeChipTextOn]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <Button title={saving ? 'Saving...' : 'Save debt'} onPress={handleAddDebt} disabled={saving} />
            <Pressable onPress={() => setShowForm(false)} style={styles.cancelBtn} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  loader: {
    marginTop: 40,
  },
  error: {
    color: colors.danger,
    marginTop: 20,
  },
  list: {
    paddingBottom: 40,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 40,
  },
  debtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  creditor: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  balance: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.danger,
  },
  debtMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
  typeLabel: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  typeChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  typeChipTextOn: {
    color: colors.white,
  },
  cancelBtn: {
    alignItems: 'center',
    marginTop: 14,
  },
  cancelText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
});
