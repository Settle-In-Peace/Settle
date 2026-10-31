import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Budget,
  createBudget,
  createGoal,
  deleteBudget,
  deleteGoal,
  Goal,
  listBudgets,
  listGoals,
} from '../services/questions';
import { colors } from '../theme/colors';

const money = (v?: number) =>
  v == null ? '' : `$${(Math.abs(v) >= 10000 ? v / 100 : v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function CoachingScreen() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bName, setBName] = useState('');
  const [bAmt, setBAmt] = useState('');
  const [gTitle, setGTitle] = useState('');
  const [gAmt, GAmt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, g] = await Promise.all([listBudgets(), listGoals()]);
      setBudgets(b);
      setGoals(g);
    } catch {
      /* keep stale */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addBudget = async () => {
    const amt = parseFloat(bAmt.replace(/[^0-9.]/g, ''));
    if (busy || !bName.trim() || !amt) return;
    setBusy(true);
    try {
      await createBudget({ name: bName.trim(), amount: amt });
      setBName('');
      setBAmt('');
      load();
    } catch (e: any) {
      Alert.alert('Could not add budget', e?.response?.data?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const addGoal = async () => {
    const amt = parseFloat(gAmt.replace(/[^0-9.]/g, ''));
    if (busy || !gTitle.trim() || !amt) return;
    setBusy(true);
    try {
      await createGoal({ title: gTitle.trim(), targetAmount: amt });
      setGTitle('');
      GAmt('');
      load();
    } catch (e: any) {
      Alert.alert('Could not add goal', e?.response?.data?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (kind: 'budget' | 'goal', id: string) =>
    Alert.alert('Remove?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            if (kind === 'budget') await deleteBudget(id);
            else await deleteGoal(id);
            load();
          } catch {
            Alert.alert('Could not remove');
          }
        },
      },
    ]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.section}>BUDGETS</Text>
      {budgets.length === 0 && <Text style={styles.empty}>No budgets yet — set one below.</Text>}
      {budgets.map((b) => (
        <View key={b.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{b.name ?? b.category ?? 'Budget'}</Text>
            {!!b.period && <Text style={styles.rowSub}>{b.period}</Text>}
          </View>
          <Text style={styles.rowAmt}>{money(b.amount ?? (b.amountCents as number | undefined))}</Text>
          <Pressable onPress={() => remove('budget', b.id)} hitSlop={10}>
            <Text style={styles.remove}>×</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.addCard}>
        <TextInput value={bName} onChangeText={setBName} placeholder="Budget name — e.g. Groceries" placeholderTextColor={colors.textMuted} style={styles.input} />
        <View style={styles.inline}>
          <TextInput
            value={bAmt}
            onChangeText={setBAmt}
            placeholder="Monthly amount ($)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable onPress={addBudget} disabled={busy || !bName.trim() || !bAmt.trim()} style={[styles.smallBtn, (!bName.trim() || !bAmt.trim()) && { opacity: 0.5 }]}>
            <Text style={styles.smallBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.section}>GOALS</Text>
      {goals.length === 0 && <Text style={styles.empty}>No goals yet — set a payoff or savings target.</Text>}
      {goals.map((g) => {
        const target = g.targetAmount ?? (g.targetCents as number | undefined);
        const current = g.currentAmount ?? (g.currentCents as number | undefined) ?? 0;
        const pct = target ? Math.min(100, Math.round((current / target) * 100)) : 0;
        return (
          <View key={g.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{g.title ?? g.name ?? 'Goal'}</Text>
              <Text style={styles.rowSub}>
                {money(current)} of {money(target)} · {pct}%
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
            </View>
            <Pressable onPress={() => remove('goal', g.id)} hitSlop={10}>
              <Text style={styles.remove}>×</Text>
            </Pressable>
          </View>
        );
      })}
      <View style={styles.addCard}>
        <TextInput value={gTitle} onChangeText={setGTitle} placeholder="Goal — e.g. Pay off Visa" placeholderTextColor={colors.textMuted} style={styles.input} />
        <View style={styles.inline}>
          <TextInput
            value={gAmt}
            onChangeText={GAmt}
            placeholder="Target amount ($)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable onPress={addGoal} disabled={busy || !gTitle.trim() || !gAmt.trim()} style={[styles.smallBtn, (!gTitle.trim() || !gAmt.trim()) && { opacity: 0.5 }]}>
            <Text style={styles.smallBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  section: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1, marginTop: 10, marginBottom: 10 },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  rowAmt: { fontSize: 16, fontWeight: '800', color: colors.primary },
  remove: { fontSize: 22, color: colors.textMuted, paddingHorizontal: 4 },
  addCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.card,
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.slateLight,
    marginBottom: 8,
  },
  inline: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  smallBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  smallBtnText: { color: '#fff', fontWeight: '800' },
  track: { height: 5, borderRadius: 99, backgroundColor: colors.slateLight, marginTop: 8, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 99 },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 12,
    padding: 20,
    fontSize: 13,
    textAlign: 'center',
    color: colors.textMuted,
    marginBottom: 12,
  },
});
