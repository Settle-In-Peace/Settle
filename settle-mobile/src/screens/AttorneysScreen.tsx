import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../services/api';
import { colors } from '../theme/colors';

interface AttorneyListing {
  id: string;
  slug: string;
  companyName: string;
  contactName?: string;
  city?: string;
  statesServed?: string[];
  website?: string;
  phone?: string;
  description?: string;
  avgRating?: number;
  featuredTier?: 'founding' | 'featured' | 'exclusive' | null;
}

const TIER_LABEL: Record<string, string> = {
  exclusive: 'Sponsored',
  featured: 'Featured',
  founding: 'Featured',
};

export default function AttorneysScreen() {
  const [items, setItems] = useState<AttorneyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState('');
  const [city, setCity] = useState('');

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/providers/directory', {
        params: {
          type: 'attorney',
          ...(state.trim() ? { state: state.trim().toUpperCase() } : {}),
          ...(city.trim() ? { city: city.trim() } : {}),
        },
      });
      setItems(data?.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // Initial fetch is deferred to a microtask so load()'s setState calls
  // don't run synchronously inside the effect body. `load` intentionally
  // stays out of the deps — it re-runs only when the user taps Go.
  useEffect(() => {
    queueMicrotask(() => { void load(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tap(listing: AttorneyListing, kind: 'site' | 'call') {
    api.post(`/providers/attorneys/${listing.slug}/click`).catch(() => {});
    if (kind === 'site' && listing.website) {
      Linking.openURL(listing.website.startsWith('http') ? listing.website : `https://${listing.website}`);
    } else if (kind === 'call' && listing.phone) {
      Linking.openURL(`tel:${listing.phone}`);
    }
  }

  return (
    <View style={s.c}>
      <Text style={s.title}>Bankruptcy Attorneys</Text>
      <Text style={s.sub}>
        If settlement isn&apos;t the right fit, a bankruptcy attorney may be. Contact is between you and the attorney — listings marked Featured or Sponsored are paid placements.
      </Text>
      <View style={s.filters}>
        <TextInput
          style={s.input}
          placeholder="State (e.g. CA)"
          placeholderTextColor={colors.textMuted}
          value={state}
          onChangeText={setState}
          autoCapitalize="characters"
          maxLength={2}
        />
        <TextInput
          style={[s.input, { flex: 1 }]}
          placeholder="City"
          placeholderTextColor={colors.textMuted}
          value={city}
          onChangeText={setCity}
        />
        <Pressable style={s.searchBtn} onPress={load}>
          <Text style={s.searchBtnT}>Go</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={
            <Text style={s.empty}>
              No attorneys listed here yet{state || city ? ' — try widening the search' : ''}.
            </Text>
          }
          renderItem={({ item: a }) => (
            <View style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.name} numberOfLines={1}>{a.companyName}</Text>
                {a.featuredTier && (
                  <View style={s.tierChip}>
                    <Text style={s.tierT}>{TIER_LABEL[a.featuredTier] ?? 'Featured'}</Text>
                  </View>
                )}
              </View>
              {!!a.contactName && <Text style={s.contact}>{a.contactName}</Text>}
              <Text style={s.loc}>
                {[a.city, (a.statesServed ?? []).slice(0, 3).join(' ')].filter(Boolean).join(' · ')}
              </Text>
              {!!a.avgRating && <Text style={s.rating}>★ {Number(a.avgRating).toFixed(1)}</Text>}
              {!!a.description && (
                <Text style={s.desc} numberOfLines={2}>{a.description}</Text>
              )}
              <View style={s.ctaRow}>
                {!!a.website && (
                  <Pressable style={s.ctaBtn} onPress={() => tap(a, 'site')}>
                    <Text style={s.ctaT}>Website</Text>
                  </Pressable>
                )}
                {!!a.phone && (
                  <Pressable style={s.ctaBtn} onPress={() => tap(a, 'call')}>
                    <Text style={s.ctaT}>Call</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6, marginBottom: 14 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 11, color: colors.text, fontSize: 14, width: 90,
  },
  searchBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnT: { color: '#fff', fontWeight: '800' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },
  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 14, marginBottom: 10,
  },
  name: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  tierChip: {
    backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  tierT: { color: '#F59E0B', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  contact: { color: colors.text, fontSize: 13, marginTop: 2 },
  loc: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  rating: { color: '#F59E0B', fontSize: 12, fontWeight: '700', marginTop: 3 },
  desc: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  ctaBtn: {
    backgroundColor: colors.primary, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  ctaT: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
