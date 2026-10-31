import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { answerQuestion, getQuestion, QaAnswer, QaQuestion } from '../services/questions';
import { colors } from '../theme/colors';

export default function QuestionDetailScreen({ route }: any) {
  const { id } = route.params as { id: string };
  const [q, setQ] = useState<QaQuestion | null>(null);
  const [answers, setAnswers] = useState<QaAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getQuestion(id);
      setQ(r.question);
      setAnswers(r.answers);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (busy || !draft.trim()) return;
    setBusy(true);
    try {
      await answerQuestion(id, draft.trim());
      setDraft('');
      load();
    } catch (e: any) {
      Alert.alert('Could not answer', e?.response?.data?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      </View>
    );
  }

  if (!q) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Question not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.cat}>{(q.category ?? 'general').toUpperCase()}</Text>
        <Text style={styles.qBody}>{q.body}</Text>
        <Text style={styles.qMeta}>{new Date(q.createdAt).toLocaleDateString()}</Text>

        <Text style={styles.section}>ANSWERS ({answers.length})</Text>
        {answers.length === 0 && <Text style={styles.empty}>No answers yet — be the first.</Text>}
        {answers.map((a) => (
          <View key={a.id} style={styles.answer}>
            <Text style={styles.answerMeta}>
              {a.label ?? 'Community'}
              {a.official ? ' · OFFICIAL' : ''} · {new Date(a.createdAt).toLocaleDateString()}
            </Text>
            <Text style={styles.answerBody}>{a.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Share what you know…"
          placeholderTextColor={colors.textMuted}
          multiline
          style={styles.input}
        />
        <Pressable
          onPress={send}
          disabled={busy || !draft.trim()}
          style={[styles.sendBtn, (busy || !draft.trim()) && { opacity: 0.5 }]}
        >
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  scroll: { padding: 16, paddingBottom: 24 },
  cat: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  qBody: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 6, lineHeight: 25 },
  qMeta: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  section: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1, marginTop: 24, marginBottom: 10 },
  answer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.card,
  },
  answerMeta: { fontSize: 11, color: colors.textMuted },
  answerBody: { fontSize: 14, color: colors.text, lineHeight: 20, marginTop: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    paddingBottom: 26,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: colors.text,
    backgroundColor: colors.slateLight,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 12,
    padding: 20,
    fontSize: 13,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 8,
  },
});
