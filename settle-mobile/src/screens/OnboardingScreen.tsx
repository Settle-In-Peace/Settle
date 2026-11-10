import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../components/Button';
import { colors } from '../theme/colors';

// First-launch flag — set once the slides are finished or skipped.
// Versioned key: bumping to .v2 re-shows onboarding once on installs that
// carried the old '@settle_onboarded' flag forward through app updates.
export const ONBOARD_KEY = '@settle_onboarded.v2';

const SLIDES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'wallet-outline',
    title: 'Every debt, one workspace',
    body: 'Track enrolled debts, settlement offers, and program milestones in a single place — no spreadsheets, no guessing.',
  },
  {
    icon: 'analytics-outline',
    title: 'Know your options first',
    body: 'Run the eligibility assessment and built-in calculators to see a realistic path forward before committing to anything.',
  },
  {
    icon: 'people-outline',
    title: 'Support when it matters',
    body: 'Plain-language guides, a vetted attorney directory, and coaching sessions are built in when you need a human.',
  },
];

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARD_KEY, '1').catch(() => {});
    onDone();
  };

  const slide = SLIDES[i];
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.skipRow}>
        {!last && (
          <Pressable onPress={finish} hitSlop={12}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Ionicons name={slide.icon} size={34} color={colors.primary} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((_, d) => (
          <View key={d} style={[styles.dot, d === i && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.footer}>
        <Button title={last ? 'Get started' : 'Next'} onPress={() => (last ? finish() : setI(i + 1))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  skipRow: {
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  skip: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: colors.slateLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 26,
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 14,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.primary, width: 20 },
  footer: { paddingHorizontal: 20, paddingBottom: 12 },
});
