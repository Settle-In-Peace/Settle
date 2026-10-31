import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { listQuestions, createQuestion, QA_CATEGORIES, QaQuestion } from '../services/questions';
import { colors } from '../theme/colors';

export default function QuestionsScreen({ navigation }: any) {
  const [items, setItems] = useState<QaQuestion[]>([]);
  const [category, setCategory] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [body, setBody] = useState('');
  const [cat, setCat] = useState<string>('other');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listQuestions(category));
    } catch {
      /* offline/error → keep stale */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  const ask = async () => {
    if (busy || body.trim().length < 3) return;
    setBusy(true);
    try {
      await createQuestion({ body: body.trim(), category: cat });
      setBody('');
      setAskOpen(false);
      Alert.alert('Question posted', 'It will appear once reviewed.');
      load();
    } catch (e: any) {
      Alert.alert('Could not post', e?.response?.data?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.catBar}>
        <Pressable onPress={() => setCategory(undefined)} style={[styles.chip, !category && styles.chipOn]}>
          <Text style={[styles.chipText, !category && styles.chipTextOn]}>All</Text>
        </Pressable>
        {QA_CATEGORIES.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCategory(c)}
            style={[styles.chip, category === c && styles.chipOn]}
          >
            <Text style={[styles.chipText, category === c && styles.chipTextOn]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      {askOpen ? (
        <View style={styles.askCard}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Ask about probate, debts, taxes, property…"
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.askInput}
          />
          <View style={styles.catBar}>
            {QA_CATEGORIES.map((c) => (
              <Pressable key={c} onPress={() => setCat(c)} style={[styles.chip, cat === c && styles.chipOn]}>
                <Text style={[styles.chipText, cat === c && styles.chipTextOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={ask}
            disabled={busy || body.trim().length < 3}
            style={[styles.postBtn, (busy || body.trim().length < 3) && { opacity: 0.5 }]}
          >
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postBtnText}>Post question</Text>}
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setAskOpen(true)} style={styles.askBanner}>
          <Text style={styles.askBannerText}>+ Ask a question — answers are anonymous</Text>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(q) => q.id}
          contentContainerStyle={{ paddingBottom: 32 }}
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
          ListEmptyComponent={
            <Text style={styles.empty}>No questions in this category yet.</Text>
          }
          renderItem={({ item: q }) => (
            <Pressable
              onPress={() => navigation.navigate('QuestionDetail', { id: q.id })}
              style={styles.row}
            >
              <Text style={styles.rowBody} numberOfLines={3}>{q.body}</Text>
              <Text style={styles.rowMeta}>
                {q.category ?? 'general'} · {q.answersCount ?? 0} answer{(q.answersCount ?? 0) === 1 ? '' : 's'} ·{' '}
                {new Date(q.createdAt).toLocaleDateString()}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  catBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.slateLight, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'capitalize' },
  chipTextOn: { color: colors.primary },
  askBanner: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.slateLight,
  },
  askBannerText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  askCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  askInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 70,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.slateLight,
    marginBottom: 10,
  },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  postBtnText: { color: '#fff', fontWeight: '800' },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.card,
  },
  rowBody: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
  rowMeta: { fontSize: 11, color: colors.textMuted, marginTop: 6, textTransform: 'capitalize' },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 12,
    padding: 24,
    fontSize: 13,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 8,
  },
});
