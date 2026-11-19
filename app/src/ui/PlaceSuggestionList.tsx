import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Text from './Text';
import PlacePhoto from './PlacePhoto';
import Photo from './Photo';
import { colors, radius } from './theme';
import type { Course, Place, PlaceCategory } from '../domain/types';
import { CATEGORY_EMOJI, CATEGORY_LABEL } from '../domain/timeSlots';
import type { StopSuggestion } from '../services/recommend/CourseRecommender';
import { popularityLabel } from '../services/recommend/RuleBasedRecommender';
import { placeProvider, recommender } from '../lib/services';

const CATEGORIES: PlaceCategory[] = ['restaurant', 'cafe', 'culture', 'activity', 'walk', 'shop', 'bar'];
const PAGE = 10;

interface Props {
  course: Course;
  /** 넣을 자리 (바꾸기면 바꿀 일정의 자리) */
  index: number;
  mode: 'add' | 'replace';
  onPick: (place?: Place) => void;
  onClose: () => void;
}

/**
 * 다른 곳 고르기 / 일정 추가: 그 자리에 어울리는 곳을 점수 순 리스트로 보여 준다.
 * 사진 · 후기 수 · 앞 일정에서 걸리는 시간 · 이유가 함께 나오고, 종류로 좁히거나 이름으로 찾을 수 있다.
 */
export default function PlaceSuggestionList({ course, index, mode, onPick, onClose }: Props) {
  const current = mode === 'replace' ? course.stops[index] : undefined;
  const [category, setCategory] = useState<PlaceCategory | undefined>(current?.place.category);
  const [items, setItems] = useState<StopSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Place[] | null>(null);
  /** 고른 곳을 바로 넣지 않고 먼저 구경하는 화면 */
  const [preview, setPreview] = useState<{ place: Place; reason?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setShown(PAGE);
    (async () => {
      // 바꾸기면 그 일정을 뺀 코스 기준으로 (앞뒤 이동시간이 맞게)
      const base = mode === 'replace' ? await recommender.removeStop(course, index) : course;
      const list = await recommender.suggestStops(base, index, { category, avoidIds: current ? [current.place.id] : [], limit: 40 });
      if (alive) {
        setItems(list);
        setLoading(false);
      }
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [course, index, mode, category]);

  const filtered = useMemo(
    () => items.filter((s) => !query || s.place.name.includes(query) || s.place.description.includes(query)),
    [items, query],
  );

  async function searchKakao() {
    if (!query.trim()) return;
    setFound(await placeProvider.searchPlaces(query.trim(), course.request.regionId).catch(() => []));
  }

  if (preview) {
    const p = preview.place;
    const mapUrl = p.url ?? `https://map.kakao.com/link/search/${encodeURIComponent(p.name)}`;
    return (
      <View>
        <Pressable onPress={() => setPreview(null)} hitSlop={8} style={styles.back} accessibilityLabel="목록으로">
          <Text style={styles.backText}>‹ 목록으로</Text>
        </Pressable>
        <Photo
          style={styles.previewPhoto}
          loadKey={p.id}
          load={() => placeProvider.photosOf?.(p) ?? Promise.resolve(undefined)}
          emoji={CATEGORY_EMOJI[p.category]}
          label={`${p.name} 사진`}
        />
        <Text style={styles.previewName}>{p.name}</Text>
        <Text style={styles.previewMeta}>
          {CATEGORY_LABEL[p.category]} · {popularityLabel(p)}
        </Text>
        {!!p.description && <Text style={styles.previewDesc}>{p.description}</Text>}
        {!!preview.reason && preview.reason !== popularityLabel(p) && <Text style={styles.reason}>{preview.reason}</Text>}
        <Pressable style={styles.mapLink} onPress={() => Linking.openURL(mapUrl)} accessibilityRole="link" accessibilityLabel="카카오맵에서 별점·후기 보기">
          <Text style={styles.mapLinkText}>카카오맵에서 별점·후기 보기 ↗</Text>
        </Pressable>
        <Pressable style={[styles.confirm]} onPress={() => onPick(p)} accessibilityLabel={mode === 'replace' ? '이걸로 바꾸기' : '여기에 추가'}>
          <Text style={styles.buttonText}>{mode === 'replace' ? '이걸로 바꾸기' : '여기에 추가'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.top}>
        <Pressable style={[styles.button, styles.primary]} onPress={() => onPick()} accessibilityLabel="알아서 골라줘">
          <Text style={styles.buttonText}>✨ 알아서 골라줘</Text>
        </Pressable>
        <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityLabel="닫기">
          <Text style={styles.muted}>✕</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        <Pressable style={[styles.chip, !category && styles.chipOn]} onPress={() => setCategory(undefined)}>
          <Text style={[styles.chipText, !category && styles.chipTextOn]}>전체</Text>
        </Pressable>
        {CATEGORIES.map((c) => (
          <Pressable key={c} style={[styles.chip, category === c && styles.chipOn]} onPress={() => setCategory(c)}>
            <Text style={[styles.chipText, category === c && styles.chipTextOn]}>
              {CATEGORY_EMOJI[c]} {CATEGORY_LABEL[c]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="이름으로 찾기 (예: 어니언)"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setFound(null);
          }}
          onSubmitEditing={searchKakao}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
      ) : (
        <>
          <Text style={styles.small}>
            {filtered.length ? `이 자리에 어울리는 순서예요 · ${filtered.length}곳` : '조건에 맞는 곳이 없어요. 종류를 바꾸거나 이름으로 찾아보세요.'}
          </Text>
          {filtered.slice(0, shown).map((s, i) => (
            <Pressable key={s.place.id} style={styles.row} onPress={() => setPreview({ place: s.place, reason: s.reason })} accessibilityLabel={`${s.place.name} 자세히 보기`}>
              <PlacePhoto place={s.place} size={60} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {i < 3 ? `${i + 1}. ` : ''}
                  {s.place.name}
                </Text>
                <Text style={styles.small} numberOfLines={1}>
                  {CATEGORY_LABEL[s.place.category]} · {s.place.tags[s.place.tags.length - 1] ?? s.place.description}
                </Text>
                <Text style={styles.reason} numberOfLines={2}>
                  {s.reason}
                </Text>
              </View>
            </Pressable>
          ))}
          {filtered.length > shown && (
            <Pressable style={styles.more} onPress={() => setShown(shown + PAGE)}>
              <Text style={styles.chipText}>더 보기 ({filtered.length - shown}곳 더)</Text>
            </Pressable>
          )}
          {!!query.trim() && (
            <Pressable style={styles.more} onPress={searchKakao}>
              <Text style={styles.chipText}>🔎 ‘{query.trim()}’ 카카오맵에서 찾기</Text>
            </Pressable>
          )}
          {found?.map((p) => (
            <Pressable key={`found-${p.id}`} style={styles.row} onPress={() => setPreview({ place: p })} accessibilityLabel={`${p.name} 자세히 보기`}>
              <PlacePhoto place={p} size={60} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.small} numberOfLines={1}>
                  {CATEGORY_LABEL[p.category]} · {popularityLabel(p)} · {p.description}
                </Text>
              </View>
            </Pressable>
          ))}
          {found && found.length === 0 && <Text style={styles.small}>카카오맵에서도 찾지 못했어요.</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.surface },
  primary: { backgroundColor: colors.accentStrong },
  buttonText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.line, marginRight: 6 },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextOn: { color: colors.onAccent, fontWeight: '700' },
  searchRow: { marginTop: 10 },
  input: { borderWidth: 1, borderColor: colors.line, color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, alignItems: 'center' },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  small: { color: colors.muted, fontSize: 12, marginTop: 6 },
  reason: { color: colors.ok, fontSize: 12, marginTop: 3 },
  muted: { color: colors.muted, fontSize: 16 },
  back: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  previewPhoto: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.card, marginTop: 4 },
  previewName: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 14 },
  previewMeta: { color: colors.muted, fontSize: 13, marginTop: 4 },
  previewDesc: { color: colors.text, fontSize: 14, marginTop: 10, lineHeight: 20 },
  mapLink: { marginTop: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.text },
  mapLinkText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  confirm: { marginTop: 8, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.accentStrong },
  more: { marginTop: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.line },
});
