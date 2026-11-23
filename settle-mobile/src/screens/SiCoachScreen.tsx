import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { getFreshToken, User } from '../services/auth';
import {
  CoachChatMessage,
  CoachingSubscriptionStatus,
  createBillingPortalSession,
  createCoachingCheckout,
  getCoachStatus,
  getCoachingSubscription,
  isCoachingEntitled,
  sendCoachMessage,
} from '../services/coaching';
import { colors } from '../theme/colors';

type Phase = 'loading' | 'signedOut' | 'paywall' | 'chat';
type CoachState = 'probe' | 'ready' | 'unavailable';

const WELCOME: CoachChatMessage = {
  role: 'assistant',
  content:
    "Hi, I'm your SI Coach — an automated coach that knows your budget and goals. Ask me anything about your payoff plan, monthly cash flow, or how to hit your next goal.",
};

const coachingFeatures = [
  'Monthly budget planner with expense tracking',
  'Savings, emergency fund, and debt payoff goals',
  'Debt payoff and debt-to-income calculators',
  'An automated SI coach that knows your plan',
  'Cancel anytime from your billing portal',
];

const statusOf = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

const errMessage = (err: unknown): string | undefined => {
  const data = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data;
  const msg = data?.message;
  return Array.isArray(msg) ? msg[0] : msg;
};

interface SiCoachScreenProps {
  user: User | null;
  setUser: (user: User | null) => void;
}

export default function SiCoachScreen({ setUser }: SiCoachScreenProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [subscription, setSubscription] = useState<CoachingSubscriptionStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<'basic' | 'pro' | 'portal' | null>(null);

  // Chat state
  const [coachState, setCoachState] = useState<CoachState>('probe');
  const [messages, setMessages] = useState<CoachChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const listRef = useRef<FlatList<CoachChatMessage>>(null);

  // Subscription status drives the whole screen — re-checked on every focus
  // so returning from Stripe Checkout in the browser flips the paywall to
  // the chat once the webhook has landed.
  const load = useCallback(async () => {
    const token = await getFreshToken();
    if (!token) {
      setPhase('signedOut');
      return;
    }
    try {
      const sub = await getCoachingSubscription();
      setSubscription(sub);
      if (isCoachingEntitled(sub)) {
        setPhase('chat');
        getCoachStatus()
          .then((s) => setCoachState(s.configured ? 'ready' : 'unavailable'))
          .catch(() => setCoachState('unavailable'));
      } else {
        setPhase('paywall');
      }
    } catch (err) {
      // 401 after the refresh retry = the session is really dead.
      setPhase(statusOf(err) === 401 ? 'signedOut' : 'paywall');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  const startCheckout = async (tier: 'basic' | 'pro') => {
    if (busy) return;
    setBusy(tier);
    try {
      const session = await createCoachingCheckout(tier);
      if (!session?.url) throw new Error('Missing checkout URL');
      await Linking.openURL(session.url);
    } catch (err) {
      Alert.alert(
        'Could not start checkout',
        errMessage(err) || 'Please try again in a moment.',
      );
    } finally {
      setBusy(null);
    }
  };

  const manageBilling = async () => {
    if (busy) return;
    setBusy('portal');
    try {
      const session = await createBillingPortalSession();
      if (!session?.url) throw new Error('Missing portal URL');
      await Linking.openURL(session.url);
    } catch (err) {
      Alert.alert(
        'Could not open billing',
        errMessage(err) || 'Please try again in a moment.',
      );
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    setChatError('');

    try {
      const res = await sendCoachMessage(next.slice(-30));
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: res.reply || '…' },
      ]);
    } catch (err) {
      const status = statusOf(err);
      if (status === 402 || status === 403) {
        // Gate flipped server-side (lapsed/canceled) — back to the paywall.
        setPhase('paywall');
      } else if (
        status === 503 ||
        status === 502 ||
        (err as { code?: string })?.code === 'ECONNABORTED'
      ) {
        setChatError('The SI coach is temporarily unavailable — please try again in a moment.');
      } else {
        setChatError('Something went wrong sending that message — please try again.');
      }
      // Roll the failed user message back into the composer.
      setMessages((current) => current.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  // ------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------
  if (phase === 'loading' && !refreshing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      </View>
    );
  }

  // ------------------------------------------------------------------
  // Signed out — the Main navigator only mounts for a cached user, so this
  // is the revoked-token path: drop the stale profile to reach the login
  // stack.
  // ------------------------------------------------------------------
  if (phase === 'signedOut') {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.hero}>SI Coach</Text>
        <Text style={styles.muted}>Sign in to chat with your SI-powered coach.</Text>
        <View style={{ height: 20 }} />
        <Button title="Sign In" onPress={() => setUser(null)} />
      </View>
    );
  }

  // ------------------------------------------------------------------
  // Paywall — mirrors settle-web /coaching: $19 Basic + $49 Pro. Checkout
  // is web-hosted Stripe Checkout opened in the system browser; success
  // lands on the site's billing pages and the subscription poll on focus
  // unlocks the chat.
  // ------------------------------------------------------------------
  if (phase === 'paywall') {
    const pastDue = subscription?.status === 'past_due';
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.titleRow}>
          <Text style={styles.eyebrow}>FINANCIAL COACHING</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Powered by SI</Text>
          </View>
        </View>
        <Text style={styles.hero}>Build your path to financial peace</Text>
        <Text style={styles.muted}>
          SI-powered coaching: budgeting tools, goal tracking, and an automated SI coach that knows your plan.
        </Text>

        <Card>
          <Text style={styles.cardTitle}>
            {pastDue ? 'Your coaching payment is past due' : 'Coaching membership'}
          </Text>
          <Text style={styles.muted}>
            {pastDue
              ? 'Update your payment method in the billing portal to keep your coaching tools and SI coach access.'
              : 'Everything runs online — the SI coach answers in chat, anytime. Membership includes:'}
          </Text>
          {!pastDue &&
            coachingFeatures.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <Text style={styles.check}>✓</Text>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}

          {pastDue ? (
            <Button
              title={busy === 'portal' ? 'Opening…' : 'Update payment method'}
              onPress={manageBilling}
              disabled={busy !== null}
            />
          ) : (
            <>
              <View style={styles.tierRow}>
                <View style={styles.tierCard}>
                  <Text style={styles.tierName}>Basic</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.price}>$19</Text>
                    <Text style={styles.perMonth}>/month</Text>
                  </View>
                  <Text style={styles.tierBlurb}>Coaching tools + SI coach chat.</Text>
                  <Button
                    title={busy === 'basic' ? 'Opening…' : 'Start free trial'}
                    variant="outline"
                    onPress={() => void startCheckout('basic')}
                    disabled={busy !== null}
                  />
                </View>
                <View style={[styles.tierCard, styles.tierCardPro]}>
                  <Text style={styles.tierName}>Pro</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.price}>$49</Text>
                    <Text style={styles.perMonth}>/month</Text>
                  </View>
                  <Text style={styles.tierBlurb}>Everything in Basic + priority SI coach responses.</Text>
                  <Button
                    title={busy === 'pro' ? 'Opening…' : 'Start free trial'}
                    onPress={() => void startCheckout('pro')}
                    disabled={busy !== null}
                  />
                </View>
              </View>
              <Text style={styles.footnote}>
                Start with a 30-day free trial — cancel anytime. Checkout opens securely in your
                browser; your access activates here automatically. Pull down to refresh.
              </Text>
            </>
          )}

          {!pastDue && subscription?.stripeSubscriptionId && (
            <>
              <View style={{ height: 12 }} />
              <Button
                title={busy === 'portal' ? 'Opening…' : 'Manage billing'}
                variant="outline"
                onPress={manageBilling}
                disabled={busy !== null}
              />
            </>
          )}
        </Card>
      </ScrollView>
    );
  }

  // ------------------------------------------------------------------
  // Chat — subscribed. Degrades: unconfigured gateway hides the composer;
  // 502/503/timeouts surface inline; 402/403 falls back to the paywall.
  // ------------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.chatHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.chatTitle}>SI Coach</Text>
          <Text style={styles.chatSub}>Automated coaching — it can see your budgets and goals.</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Powered by SI</Text>
        </View>
      </View>

      {coachState === 'unavailable' ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            The SI coach is temporarily unavailable. Your budgets and goals still work — check back soon.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => (
              <View style={[styles.bubbleRow, item.role === 'user' && styles.bubbleRowUser]}>
                <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleCoach]}>
                  <Text style={item.role === 'user' ? styles.bubbleUserText : styles.bubbleCoachText}>
                    {item.content}
                  </Text>
                </View>
              </View>
            )}
            ListFooterComponent={
              sending ? (
                <View style={styles.bubbleRow}>
                  <View style={[styles.bubble, styles.bubbleCoach]}>
                    <Text style={styles.thinking}>SI Coach is thinking…</Text>
                  </View>
                </View>
              ) : null
            }
          />

          {!!chatError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{chatError}</Text>
            </View>
          )}

          <View style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your budget, payoff plan, or goals…"
              placeholderTextColor={colors.textMuted}
              maxLength={4000}
              multiline
              editable={coachState === 'ready' && !sending}
              style={styles.composerInput}
            />
            <Pressable
              onPress={() => void send()}
              disabled={sending || !input.trim() || coachState !== 'ready'}
              style={[styles.sendBtn, (sending || !input.trim() || coachState !== 'ready') && { opacity: 0.5 }]}
            >
              <Text style={styles.sendBtnText}>{sending ? '…' : 'Send'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { padding: 20, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  pill: {
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  hero: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 8, marginBottom: 6 },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 6 },
  featureRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  check: { color: colors.primary, fontWeight: '800' },
  featureText: { flex: 1, fontSize: 14, color: colors.text },
  tierRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  tierCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  tierCardPro: { borderColor: colors.primary, borderWidth: 2 },
  tierName: { fontSize: 14, fontWeight: '700', color: colors.text },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  price: { fontSize: 28, fontWeight: '800', color: colors.text },
  perMonth: { fontSize: 13, color: colors.textMuted },
  tierBlurb: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: 12, minHeight: 32 },
  footnote: { fontSize: 12, color: colors.textMuted, marginTop: 14, lineHeight: 17 },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  chatTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  chatSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  notice: {
    margin: 16,
    backgroundColor: colors.slateLight,
    borderRadius: 12,
    padding: 16,
  },
  noticeText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 10 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: colors.primary },
  bubbleCoach: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleUserText: { color: colors.white, fontSize: 15, lineHeight: 21 },
  bubbleCoachText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  thinking: { color: colors.textMuted, fontSize: 14, fontStyle: 'italic' },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: { color: '#B91C1C', fontSize: 13 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.slateLight,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  sendBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
