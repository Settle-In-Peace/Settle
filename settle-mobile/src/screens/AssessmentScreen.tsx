import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { api } from '../services/api';
import { colors } from '../theme/colors';

// Guided debt self-assessment — captures the consumer's unsecured-debt
// picture and produces an honest educational summary. Progress persists to
// AsyncStorage so a partially completed questionnaire restores cleanly on
// relaunch. Nothing here is submitted to the lead funnel: this is the
// consumer's own worksheet, not an enrollment or a lead submission.
const STORE_KEY = '@settle_assessment.v1';

const DEBT_TYPES = [
  { key: 'credit_card', label: 'Credit cards' },
  { key: 'personal_loan', label: 'Personal loans' },
  { key: 'medical', label: 'Medical bills' },
  { key: 'collections', label: 'Collections' },
  { key: 'other', label: 'Other unsecured' },
];

const DEBT_RANGES = [
  { key: 'under_5k', label: 'Under $5,000' },
  { key: '5k_10k', label: '$5,000 – $10,000' },
  { key: '10k_25k', label: '$10,000 – $25,000' },
  { key: '25k_50k', label: '$25,000 – $50,000' },
  { key: 'over_50k', label: 'Over $50,000' },
];

const BEHIND_OPTIONS = [
  { key: 'current', label: 'Current on payments' },
  { key: '1_3', label: '1–3 months behind' },
  { key: '4_6', label: '4–6 months behind' },
  { key: '7_plus', label: '7+ months behind' },
];

const HARDSHIP_OPTIONS = [
  { key: 'job_loss', label: 'Job loss / reduced income' },
  { key: 'medical', label: 'Medical hardship' },
  { key: 'family', label: 'Divorce / family change' },
  { key: 'rates', label: 'Rates outpaced income' },
  { key: 'none', label: 'No specific hardship' },
];

interface CreditorEntry {
  name: string;
  balance: string;
}

interface AssessmentState {
  step: number;
  types: string[];
  range: string;
  behind: string;
  hardship: string;
  creditors: CreditorEntry[];
  done: boolean;
}

const INITIAL: AssessmentState = {
  step: 0,
  types: [],
  range: '',
  behind: '',
  hardship: '',
  creditors: [],
  done: false,
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[s.chip, selected && s.chipOn]} onPress={onPress}>
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function AssessmentScreen() {
  const navigation = useNavigation<any>();
  const [state, setState] = useState<AssessmentState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [saving, setSaving] = useState(false);

  // Restore in-progress answers on relaunch.
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as AssessmentState;
          setState({ ...INITIAL, ...parsed });
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  // Persist every change so partial progress survives an app kill.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  const patch = (p: Partial<AssessmentState>) => setState((prev) => ({ ...prev, ...p }));

  const toggleType = (key: string) =>
    patch({
      types: state.types.includes(key)
        ? state.types.filter((t) => t !== key)
        : [...state.types, key],
    });

  const addCreditor = () => {
    const bal = Number(newBalance);
    if (!newName.trim() || !Number.isFinite(bal) || bal <= 0) return;
    patch({ creditors: [...state.creditors, { name: newName.trim(), balance: newBalance }] });
    setNewName('');
    setNewBalance('');
  };

  const reset = () => setState(INITIAL);

  const typeLabels = DEBT_TYPES.filter((t) => state.types.includes(t.key)).map((t) => t.label);
  const rangeLabel = DEBT_RANGES.find((r) => r.key === state.range)?.label || '—';
  const behindLabel = BEHIND_OPTIONS.find((b) => b.key === state.behind)?.label || '—';
  const hardshipLabel = HARDSHIP_OPTIONS.find((h) => h.key === state.hardship)?.label || '—';
  const creditorTotal = state.creditors.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);

  // Save the entered creditors into My Debts so the worksheet shows up in
  // the tracker. Non-fatal per item — the account copy is best-effort.
  async function saveDebts() {
    if (!state.creditors.length) return;
    setSaving(true);
    let saved = 0;
    for (const c of state.creditors) {
      try {
        await api.post('/debts', {
          creditor: c.name,
          balance: Number(c.balance),
          type: state.types[0] || 'other',
        });
        saved += 1;
      } catch {
        /* keep going — partial save is fine */
      }
    }
    setSaving(false);
    Alert.alert(
      saved === state.creditors.length ? 'Saved' : 'Partially saved',
      `${saved} of ${state.creditors.length} debts added to My Debts.`
    );
  }

  if (!hydrated) return <View style={s.container} />;

  const steps = ['Debt types', 'Amount', 'Status', 'Creditors', 'Summary'];
  const last = state.step === steps.length - 1;

  const canNext =
    (state.step === 0 && state.types.length > 0) ||
    (state.step === 1 && !!state.range) ||
    (state.step === 2 && !!state.behind && !!state.hardship) ||
    state.step === 3 ||
    last;

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.progressRow}>
        {steps.map((label, i) => (
          <View key={label} style={[s.progressDot, i <= state.step && s.progressDotOn]} />
        ))}
      </View>
      <Text style={s.stepLabel}>
        Step {state.step + 1} of {steps.length}
      </Text>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {state.step === 0 && (
          <>
            <Text style={s.q}>What kinds of unsecured debt are you dealing with?</Text>
            <Text style={s.hint}>Select all that apply.</Text>
            <View style={s.chipWrap}>
              {DEBT_TYPES.map((t) => (
                <Chip
                  key={t.key}
                  label={t.label}
                  selected={state.types.includes(t.key)}
                  onPress={() => toggleType(t.key)}
                />
              ))}
            </View>
          </>
        )}

        {state.step === 1 && (
          <>
            <Text style={s.q}>About how much unsecured debt do you owe in total?</Text>
            <View style={s.chipWrap}>
              {DEBT_RANGES.map((r) => (
                <Chip
                  key={r.key}
                  label={r.label}
                  selected={state.range === r.key}
                  onPress={() => patch({ range: r.key })}
                />
              ))}
            </View>
          </>
        )}

        {state.step === 2 && (
          <>
            <Text style={s.q}>Where are you on payments?</Text>
            <View style={s.chipWrap}>
              {BEHIND_OPTIONS.map((b) => (
                <Chip
                  key={b.key}
                  label={b.label}
                  selected={state.behind === b.key}
                  onPress={() => patch({ behind: b.key })}
                />
              ))}
            </View>
            <Text style={[s.q, { marginTop: 24 }]}>What changed? (hardship)</Text>
            <View style={s.chipWrap}>
              {HARDSHIP_OPTIONS.map((h) => (
                <Chip
                  key={h.key}
                  label={h.label}
                  selected={state.hardship === h.key}
                  onPress={() => patch({ hardship: h.key })}
                />
              ))}
            </View>
          </>
        )}

        {state.step === 3 && (
          <>
            <Text style={s.q}>List your top debts (optional)</Text>
            <Text style={s.hint}>Creditor and current balance — you can also skip and add them later in My Debts.</Text>
            {state.creditors.map((c, i) => (
              <View key={`${c.name}-${i}`} style={s.credRow}>
                <Text style={s.credName}>{c.name}</Text>
                <Text style={s.credBal}>{currency.format(Number(c.balance) || 0)}</Text>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    patch({ creditors: state.creditors.filter((_, j) => j !== i) })
                  }
                >
                  <Text style={s.credRemove}>×</Text>
                </Pressable>
              </View>
            ))}
            <Input label="Creditor" placeholder="Chase, Capital One..." value={newName} onChangeText={setNewName} />
            <Input label="Balance ($)" placeholder="5000" value={newBalance} onChangeText={setNewBalance} keyboardType="numeric" />
            <Button title="Add to list" onPress={addCreditor} variant="outline" />
          </>
        )}

        {last && (
          <>
            <Text style={s.q}>Your assessment summary</Text>
            <Card>
              <Text style={s.sumRow}>Debt types: {typeLabels.join(', ') || '—'}</Text>
              <Text style={s.sumRow}>Total unsecured debt: {rangeLabel}</Text>
              <Text style={s.sumRow}>Payment status: {behindLabel}</Text>
              <Text style={s.sumRow}>Hardship: {hardshipLabel}</Text>
              {state.creditors.length > 0 && (
                <Text style={s.sumRow}>
                  Listed creditors: {state.creditors.length} ({currency.format(creditorTotal)})
                </Text>
              )}
            </Card>
            <Card>
              <Text style={s.sumTitle}>What this usually means</Text>
              <Text style={s.body}>
                Consumers in this range typically compare three paths: negotiating settlements for
                less than the full balance (credit impact, but can reduce what is owed), a nonprofit
                debt-management plan (lower rates, repay in full), or consulting a bankruptcy
                attorney for a legal reset.
              </Text>
              <Text style={s.disclaimer}>
                Educational summary only — not a determination, quote, or financial advice. Results
                vary; any program terms come from the provider you choose.
              </Text>
            </Card>
            {state.creditors.length > 0 && (
              <Button
                title={saving ? 'Saving...' : 'Save listed debts to My Debts'}
                onPress={saveDebts}
                disabled={saving}
              />
            )}
            <View style={{ height: 10 }} />
            <Button
              title="Open calculators"
              variant="outline"
              onPress={() => navigation.navigate('Tabs', { screen: 'Calculators' })}
            />
          </>
        )}
      </ScrollView>

      <View style={s.footer}>
        {state.step > 0 ? (
          <Pressable onPress={() => patch({ step: state.step - 1 })} hitSlop={12}>
            <Text style={s.back}>Back</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {last ? (
          <Button title="Done" onPress={() => { patch({ done: true }); reset(); navigation.goBack(); }} />
        ) : (
          <Button title="Next" onPress={() => patch({ step: state.step + 1 })} disabled={!canNext} />
        )}
      </View>
      {state.step > 0 && !last && (
        <Pressable onPress={reset} hitSlop={8} style={s.resetWrap}>
          <Text style={s.reset}>Start over</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  progressDotOn: {
    backgroundColor: colors.primary,
    width: 20,
  },
  stepLabel: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },
  q: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextOn: {
    color: colors.white,
  },
  credRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  credName: { flex: 1, color: colors.text, fontWeight: '600' },
  credBal: { color: colors.textMuted, marginRight: 12 },
  credRemove: { color: colors.danger, fontSize: 20, fontWeight: '700' },
  sumRow: { color: colors.text, fontSize: 14, marginBottom: 8 },
  sumTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  disclaimer: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 10, fontStyle: 'italic' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  back: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  resetWrap: { alignItems: 'center', paddingBottom: 12 },
  reset: { color: colors.textMuted, fontSize: 13 },
});
