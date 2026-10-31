import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { colors } from '../theme/colors';

interface Enrollment {
  id: string;
  status: string;
  programType: string;
  enrolledAt: string;
  targetCompletionDate?: string;
  totalDebtEnrolled?: number;
  totalFees?: number;
  monthlyProgramPayment?: number;
}

interface Settlement {
  id: string;
  creditorName: string;
  originalBalance: number;
  settlementAmount: number;
  settlementPercentage: number;
  status: string;
  settledAt?: string;
}

interface Milestone {
  id: string;
  title: string;
  description?: string;
  isReached: boolean;
  reachedAt?: string;
  targetDate?: string;
  sortOrder: number;
}

interface TrustAccount {
  currentBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
}

interface PortalDocument {
  id: string;
  documentType: string;
  title: string;
  fileUrl: string;
  status: string;
  createdAt: string;
}

interface Overview {
  enrollment?: Enrollment | null;
  settlements?: Settlement[];
  milestones?: Milestone[];
  trustAccount?: TrustAccount | null;
  documents?: PortalDocument[];
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const STATUS_COLORS: Record<string, string> = {
  negotiating: colors.warning,
  offer_pending: colors.warning,
  accepted: colors.secondary,
  settled: colors.success,
  paid: colors.success,
  declined: colors.danger,
};

export default function SettlementScreen() {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchOverview() {
      try {
        const response = await api.get<Overview>('/crm/portal/me/overview');
        setData(response.data || {});
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load program');
      } finally {
        setLoading(false);
      }
    }
    fetchOverview();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const enrollment = data?.enrollment;

  if (!enrollment) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.ctaTitle}>Not enrolled yet</Text>
          <Text style={styles.body}>
            Take the free assessment to get matched with a provider who can help you negotiate and
            settle your debts for less than you owe.
          </Text>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <View style={{ marginTop: 16 }}>
            <Button title="Take the assessment" onPress={() => navigation.navigate('Assessment')} />
          </View>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>How it works</Text>
          <Text style={styles.body}>
            1. We match you with a debt settlement provider for your situation.
          </Text>
          <Text style={styles.body}>
            2. Once enrolled, track your settlements, milestones, and payments right here.
          </Text>
        </Card>
      </ScrollView>
    );
  }

  const settlements = data?.settlements ?? [];
  const milestones = (data?.milestones ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const trust = data?.trustAccount;
  const documents = data?.documents ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Program status */}
      <Card>
        <Text style={styles.sectionTitle}>Your Program</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusChip}>{enrollment.status}</Text>
          <Text style={styles.muted}>{enrollment.programType}</Text>
        </View>
        {!!enrollment.totalDebtEnrolled && (
          <Text style={styles.statLine}>
            Debt enrolled: {currency.format(enrollment.totalDebtEnrolled)}
          </Text>
        )}
        {!!enrollment.monthlyProgramPayment && (
          <Text style={styles.statLine}>
            Monthly program payment: {currency.format(enrollment.monthlyProgramPayment)}
          </Text>
        )}
        {!!enrollment.targetCompletionDate && (
          <Text style={styles.muted}>
            Target completion: {new Date(enrollment.targetCompletionDate).toLocaleDateString()}
          </Text>
        )}
      </Card>

      {/* Trust account */}
      {trust && (
        <Card>
          <Text style={styles.sectionTitle}>Dedicated Account</Text>
          <Text style={styles.bigNumber}>{currency.format(trust.currentBalance)}</Text>
          <Text style={styles.muted}>
            Deposited {currency.format(trust.totalDeposited)} · Withdrawn{' '}
            {currency.format(trust.totalWithdrawn)}
          </Text>
        </Card>
      )}

      {/* Settlements */}
      {settlements.length > 0 && (
        <Card>
          <Text style={styles.sectionTitle}>Settlements</Text>
          {settlements.map((s) => (
            <View key={s.id} style={styles.settlementRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.creditorName}>{s.creditorName}</Text>
                <Text style={styles.muted}>
                  {currency.format(s.originalBalance)} → {currency.format(s.settlementAmount)} (
                  {Math.round(s.settlementPercentage)}%)
                </Text>
              </View>
              <Text style={[styles.statusText, { color: STATUS_COLORS[s.status] ?? colors.textMuted }]}>
                {s.status.replace(/_/g, ' ')}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {/* Milestones */}
      {milestones.length > 0 && (
        <Card>
          <Text style={styles.sectionTitle}>Milestones</Text>
          {milestones.map((m) => (
            <View key={m.id} style={styles.milestoneRow}>
              <Text style={[styles.milestoneDot, { color: m.isReached ? colors.success : colors.border }]}>
                {m.isReached ? '●' : '○'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.milestoneTitle, !m.isReached && { color: colors.textMuted }]}>
                  {m.title}
                </Text>
                {!!m.reachedAt && (
                  <Text style={styles.muted}>{new Date(m.reachedAt).toLocaleDateString()}</Text>
                )}
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <Card>
          <Text style={styles.sectionTitle}>Documents</Text>
          {documents.map((d) => (
            <TouchableOpacity
              key={d.id}
              style={styles.docRow}
              onPress={() => Linking.openURL(d.fileUrl).catch(() => {})}
            >
              <Text style={styles.docTitle}>{d.title}</Text>
              <Text style={styles.muted}>
                {d.documentType} · {new Date(d.createdAt).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  statusChip: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.slateLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  statLine: { fontSize: 14, color: colors.text, marginTop: 4 },
  bigNumber: { fontSize: 28, fontWeight: '800', color: colors.text },
  muted: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  settlementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  creditorName: { fontSize: 14, fontWeight: '700', color: colors.text },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  milestoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  milestoneDot: { fontSize: 16, marginTop: -1 },
  milestoneTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  docRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  docTitle: { fontSize: 14, fontWeight: '600', color: colors.primary },
  ctaTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 },
  body: { fontSize: 14, color: colors.textMuted, lineHeight: 21, marginTop: 6 },
  errorText: { fontSize: 12, color: colors.danger, marginTop: 8 },
});
