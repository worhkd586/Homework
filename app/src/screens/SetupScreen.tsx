import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Course, PinnedPlace, Place, Region, TimeSlotId } from '../domain/types';
import { MOODS, type MoodId } from '../domain/moods';
import { recommendOptions, suggestRegion } from '../services/recommend/courseOptions';
import type { SavedCourse } from '../lib/savedCourses';
import { CATEGORY_EMOJI, CATEGORY_LABEL, TIME_SLOTS, formatMinute, getTimeSlot } from '../domain/timeSlots';
import { placeProvider, recommender } from '../lib/services';
import { colors } from '../ui/theme';

export interface CourseOptions {
  options: Course[];
  /** 지역을 추천받았을 때 그 이유 */
  note?: string;
}

const AUTO = 'auto';

/** 한 화면에서 끝나는 코스 만들기: 기분 → 지역(추천 가능) → 시간대 → (선택) 꼭 갈 곳 → 코스 3개 보기 */
interface Props {
  saved: SavedCourse[];
  hasCurrent: boolean;
  onResume: () => void;
  onOpenSaved: (item: SavedCourse) => void;
  onDeleteSaved: (id: string) => void;
  onResult: (result: CourseOptions) => void;
}

export default function SetupScreen({ saved, hasCurrent, onResume, onOpenSaved, onDeleteSaved, onResult }: Props) {
  const [moodId, setMoodId] = useState<MoodId>();
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<string>();
  const [slotId, setSlotId] = useState<TimeSlotId>('evening');
  const [places, setPlaces] = useState<Place[]>([]);
  const [mustGo, setMustGo] = useState<PinnedPlace | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const slot = getTimeSlot(slotId);
  const ready = !!moodId && !!regionId && !loading;

  useEffect(() => {
    placeProvider.listRegions().then(setRegions);
  }, []);

  useEffect(() => {
    setMustGo(null);
    setPicking(false);
    if (regionId && regionId !== AUTO) placeProvider.listPlaces(regionId).then(setPlaces);
  }, [regionId]);

  const filtered = useMemo(() => places.filter((p) => !query || p.name.includes(query) || p.description.includes(query)), [places, query]);

  // 시간 고정용 선택지: 시간대 안에서 30분 간격
  const timeOptions = useMemo(() => {
    const out: number[] = [];
    for (let m = slot.defaultStart; m <= slot.defaultEnd - 60; m += 30) out.push(m);
    return out;
  }, [slot]);

  function pickSlot(id: TimeSlotId) {
    setSlotId(id);
    if (mustGo?.fixedMinute !== undefined) setMustGo({ place: mustGo.place });
  }

  async function makeCourses() {
    if (!regionId || !moodId) return;
    setLoading(true);
    setError(undefined);
    try {
      let region = regions.find((r) => r.id === regionId);
      let note: string | undefined;
      if (regionId === AUTO) {
        const suggestion = await suggestRegion(placeProvider, moodId);
        region = suggestion.region;
        note = `✨ ${region.name} 추천 · ${suggestion.reason}`;
      }
      if (!region) return;
      const options = await recommendOptions(
        recommender,
        {
          regionId: region.id,
          slotId,
          date: new Date().toISOString().slice(0, 10),
          startMinute: slot.defaultStart,
          endMinute: slot.defaultEnd,
          pins: mustGo ? [mustGo] : [],
        },
        moodId,
        region.name,
      );
      onResult({ options, note });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>
          <Text style={{ color: colors.accent }}>오늘</Text>어디가
        </Text>
        <Text style={styles.muted}>기분만 고르면 할 것과 갈 곳은 골라 드려요.</Text>

        {hasCurrent && (
          <Pressable style={[styles.card, styles.resume]} onPress={onResume}>
            <Text style={styles.text}>‹ 보던 코스로 돌아가기</Text>
          </Pressable>
        )}

        {saved.length > 0 && (
          <>
            <Text style={styles.h2}>내 코스</Text>
            {saved.map((item) => {
              const c = item.course;
              const first = c.stops[0];
              return (
                <Pressable key={item.id} style={styles.savedRow} onPress={() => onOpenSaved(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tileTitle} numberOfLines={1}>
                      {c.title}
                    </Text>
                    <Text style={styles.small} numberOfLines={1}>
                      {c.request.date} · {first ? formatMinute(first.arriveMinute) : '--:--'} 시작 · {c.stops.length}곳 · 탭해서 수정
                    </Text>
                  </View>
                  <Pressable hitSlop={10} onPress={() => onDeleteSaved(item.id)} accessibilityLabel={`${c.title} 삭제`}>
                    <Text style={styles.muted}>✕</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </>
        )}

        <Text style={styles.h2}>{saved.length > 0 ? '새 코스 만들기' : '오늘은 어떤 데이트?'}</Text>
        {saved.length > 0 && <Text style={[styles.muted, { marginTop: -6, marginBottom: 10 }]}>오늘은 어떤 데이트?</Text>}
        <View style={styles.grid}>
          {MOODS.map((m) => (
            <Pressable key={m.id} style={[styles.tile, moodId === m.id && styles.selected]} onPress={() => setMoodId(m.id)}>
              <Text style={styles.slotEmoji}>{m.emoji}</Text>
              <Text style={styles.tileTitle}>{m.label}</Text>
              <Text style={styles.small}>{m.hint}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.h2}>어디서 만나요?</Text>
        <View style={styles.grid}>
          <Pressable style={[styles.tile, regionId === AUTO && styles.selected]} onPress={() => setRegionId(AUTO)}>
            <Text style={styles.tileTitle}>✨ 추천해 줘</Text>
            <Text style={styles.small} numberOfLines={1}>
              기분에 맞는 동네로
            </Text>
          </Pressable>
          {regions.map((r) => (
            <Pressable key={r.id} style={[styles.tile, regionId === r.id && styles.selected]} onPress={() => setRegionId(r.id)}>
              <Text style={styles.tileTitle}>{r.name}</Text>
              <Text style={styles.small} numberOfLines={1}>
                {r.tagline}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.h2}>언제 만나요?</Text>
        <View style={styles.row}>
          {TIME_SLOTS.map((s) => (
            <Pressable key={s.id} style={[styles.slot, slotId === s.id && styles.selected]} onPress={() => pickSlot(s.id)}>
              <Text style={styles.slotEmoji}>{s.emoji}</Text>
              <Text style={styles.tileTitle}>{s.label}</Text>
              <Text style={styles.small}>{formatMinute(s.defaultStart)}~</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.h2}>꼭 갈 곳 있어요? (선택)</Text>
        {!regionId || regionId === AUTO ? (
          <Text style={styles.muted}>{regionId === AUTO ? '지역을 직접 고르면 꼭 갈 곳을 넣을 수 있어요.' : '지역을 먼저 골라 주세요.'}</Text>
        ) : mustGo ? (
          <View style={[styles.card, styles.selected]}>
            <View style={styles.between}>
              <Text style={styles.tileTitle}>
                {CATEGORY_EMOJI[mustGo.place.category]} {mustGo.place.name}
              </Text>
              <Pressable hitSlop={12} onPress={() => setMustGo(null)}>
                <Text style={styles.muted}>✕</Text>
              </Pressable>
            </View>
            <View style={[styles.between, { marginTop: 12 }]}>
              <Text style={styles.text}>시간이 정해져 있어요 (예약 등)</Text>
              <Switch
                value={mustGo.fixedMinute !== undefined}
                onValueChange={(on) => setMustGo({ place: mustGo.place, fixedMinute: on ? timeOptions[Math.min(4, timeOptions.length - 1)] : undefined })}
                trackColor={{ true: colors.accent, false: colors.line }}
                thumbColor="#ffffff"
              />
            </View>
            {mustGo.fixedMinute !== undefined && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                {timeOptions.map((m) => (
                  <Pressable key={m} style={[styles.chip, mustGo.fixedMinute === m && styles.chipOn]} onPress={() => setMustGo({ ...mustGo, fixedMinute: m })}>
                    <Text style={[styles.text, mustGo.fixedMinute === m && { color: colors.bg, fontWeight: '700' }]}>{formatMinute(m)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ) : picking ? (
          <View>
            <TextInput style={styles.input} placeholder="장소 이름 검색" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} />
            {filtered.map((p) => (
              <Pressable
                key={p.id}
                style={styles.placeRow}
                onPress={() => {
                  setMustGo({ place: p });
                  setPicking(false);
                  setQuery('');
                }}
              >
                <Text style={styles.slotEmoji}>{CATEGORY_EMOJI[p.category]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tileTitle}>{p.name}</Text>
                  <Text style={styles.small} numberOfLines={1}>
                    {CATEGORY_LABEL[p.category]} · ★{p.rating.toFixed(1)} · {p.description}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Pressable style={styles.card} onPress={() => setPicking(true)}>
            <Text style={[styles.text, { textAlign: 'center' }]}>+ 장소 추가</Text>
          </Pressable>
        )}

        {error && <Text style={[styles.small, { color: colors.accent, marginTop: 12 }]}>{error}</Text>}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <Pressable style={[styles.button, !ready && styles.buttonOff]} disabled={!ready} onPress={makeCourses}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{!moodId ? '어떤 데이트인지 골라 주세요' : !regionId ? '지역을 골라 주세요' : '코스 3개 보기'}</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  brand: { fontSize: 30, fontWeight: '900', color: colors.text, letterSpacing: -1 },
  h2: { fontSize: 19, fontWeight: '700', color: colors.text, marginTop: 28, marginBottom: 12 },
  text: { color: colors.text, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 15, marginTop: 4 },
  small: { color: colors.muted, fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  tileTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  row: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  slotEmoji: { fontSize: 22 },
  card: { padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, marginRight: 8 },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 8 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  resume: { marginTop: 16, borderColor: colors.line },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.card, marginBottom: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.bg },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 8 },
  buttonOff: { backgroundColor: '#3a3a44' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
