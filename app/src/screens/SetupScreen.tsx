import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import Text from '../ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Course, PinnedPlace, Place, Region, TimeSlotId } from '../domain/types';
import { MOODS, type MoodId } from '../domain/moods';
import { recommendOptions, suggestRegion } from '../services/recommend/courseOptions';
import type { SavedCourse } from '../lib/savedCourses';
import { ACTIVITY_EXAMPLES, parseActivity, type Activity } from '../domain/activities';
import { CATEGORY_EMOJI, CATEGORY_LABEL, MIN_RANGE, RANGE_FIRST, RANGE_LAST, TIME_SLOTS, formatDuration, formatMinute, isSlotRange, slotForRange } from '../domain/timeSlots';
import { placeProvider, recommender } from '../lib/services';
import { colors } from '../ui/theme';
import PlacePhoto from '../ui/PlacePhoto';
import { popularityLabel } from '../services/recommend/RuleBasedRecommender';

export interface CourseOptions {
  options: Course[];
  /** 지역을 추천받았을 때 그 이유 */
  note?: string;
}

const AUTO = 'auto';
/** 분위기 카드 배경 사진 (Stitch에서 만든 이미지) */
const MOOD_PHOTOS: Record<MoodId, number> = {
  talk: require('../../assets/moods/talk.jpg'),
  new: require('../../assets/moods/new.jpg'),
  food: require('../../assets/moods/food.jpg'),
  active: require('../../assets/moods/active.jpg'),
};
/** 접힌 상태에서 보이는 지역 수 (✨추천 타일과 함께 2칸 × 4줄) */
const COLLAPSED_REGIONS = 7;
const GRID_COLUMNS = 5;
/** 범위 끝의 자정은 00:00 대신 24:00으로 */
const clock = (m: number) => (m === 24 * 60 ? '24:00' : formatMinute(m));

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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [wish, setWish] = useState('');
  const [wishHint, setWishHint] = useState<string>();
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<string>();
  const [group, setGroup] = useState<'서울' | '경기'>('서울');
  /** 지역은 처음엔 몇 곳만 보이고 '더 보기'로 펼친다 (화면을 짧게) */
  const [allRegions, setAllRegions] = useState(false);
  /** 30분 단위 시간표는 '직접 고르기'를 눌렀을 때만 연다 */
  const [showGrid, setShowGrid] = useState(false);
  // 언제: 시작~끝 범위 (30분 단위). 시간대 칩은 빠른 선택용
  const [range, setRange] = useState({ start: 17 * 60, end: 22 * 60 });
  /** 범위 고르기 중: 시작만 찍고 끝을 기다리는 중이면 true */
  const [pickingEnd, setPickingEnd] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [mustGo, setMustGo] = useState<PinnedPlace | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const slot = slotForRange(range.start, range.end);
  const slotId: TimeSlotId = slot.id;
  const ready = (!!moodId || activities.length > 0) && !!regionId && !loading && !pickingEnd;

  function toggleActivity(a: Activity) {
    setActivities((list) => (list.some((x) => x.label === a.label) ? list.filter((x) => x.label !== a.label) : [...list, a]));
  }

  function addWish() {
    if (!wish.trim()) return;
    const parsed = parseActivity(wish);
    setActivities((list) => [...list.filter((x) => x.label !== parsed.label), parsed]);
    setWishHint(
      parsed.known
        ? undefined
        : `‘${parsed.label}’(으)로 카카오맵에서 직접 찾아서 넣어 볼게요.`,
    );
    setWish('');
  }

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
    for (let m = range.start; m <= range.end - 60; m += 30) out.push(m);
    return out;
  }, [range]);

  // 시간표: 5칸씩 한 줄. 마지막 줄도 칸 폭이 같도록 빈 칸(null)으로 채운다
  const gridRows = useMemo(() => {
    const times: number[] = [];
    for (let m = RANGE_FIRST; m <= RANGE_LAST; m += 30) times.push(m);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < times.length; i += GRID_COLUMNS) {
      const row: (number | null)[] = times.slice(i, i + GRID_COLUMNS);
      while (row.length < GRID_COLUMNS) row.push(null);
      rows.push(row);
    }
    return rows;
  }, []);

  const groupRegions = regions.filter((r) => (r.group ?? '서울') === group);
  const shownRegions = allRegions
    ? groupRegions
    : groupRegions.filter((r, i) => i < COLLAPSED_REGIONS || r.id === regionId);
  const hiddenCount = groupRegions.length - shownRegions.length;

  function changeRange(start: number, end: number) {
    setRange({ start, end });
    // 꼭 갈 곳의 고정 시각이 범위 밖으로 나가면 고정을 푼다
    if (mustGo?.fixedMinute !== undefined && (mustGo.fixedMinute < start || mustGo.fixedMinute > end - 60)) setMustGo({ place: mustGo.place });
  }

  function pickSlot(id: TimeSlotId) {
    const s = TIME_SLOTS.find((x) => x.id === id)!;
    setPickingEnd(false);
    changeRange(s.defaultStart, s.defaultEnd);
  }

  /** 시간표에서 고르기: 처음 누르면 시작, 다음에 누르면 끝 (시작보다 앞을 누르면 그걸 새 시작으로) */
  function pickTime(m: number) {
    if (!pickingEnd) {
      setRange({ start: m, end: m });
      setPickingEnd(true);
      return;
    }
    if (m - range.start < MIN_RANGE) {
      setRange({ start: m, end: m });
      return;
    }
    setPickingEnd(false);
    changeRange(range.start, m);
  }

  async function makeCourses() {
    if (!regionId || (!moodId && activities.length === 0)) return;
    setLoading(true);
    setError(undefined);
    try {
      let region = regions.find((r) => r.id === regionId);
      let note: string | undefined;
      if (regionId === AUTO) {
        const suggestion = await suggestRegion(placeProvider, moodId, activities);
        region = suggestion.region;
        note = `✨ ${region.name} 추천 · ${suggestion.reason}`;
      }
      if (!region) return;
      // 직접 입력한 것은 카카오에서 그 말로 찾아서 후보에 더한다 (예: '도자기', '요트')
      await Promise.all(activities.filter((a) => a.emoji === '✍️').map((a) => placeProvider.addWishPlaces?.(a.label, region!.id)));
      const options = await recommendOptions(
        recommender,
        {
          regionId: region.id,
          slotId,
          date: new Date().toISOString().slice(0, 10),
          startMinute: range.start,
          endMinute: range.end,
          pins: mustGo ? [mustGo] : [],
        },
        moodId,
        region.name,
        activities,
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
        <Text style={styles.brand}>오늘어디가 •</Text>
        <Text style={styles.title}>어떤 데이트를 할까요?</Text>
        <Text style={styles.muted}>기분이나 하고 싶은 걸 고르면, 갈 곳과 순서는 짜 드려요.</Text>

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

        <View style={styles.sectionHead}>
          <Text style={[styles.h2, styles.h2InRow]}>{saved.length > 0 ? '새 코스 · 분위기' : '분위기'}</Text>
          <Text style={styles.small}>하나 고르거나 직접 추가</Text>
        </View>
        <View style={styles.grid}>
          {MOODS.map((m) => {
            const on = moodId === m.id;
            return (
              <Pressable
                key={m.id}
                style={[styles.moodCard, on && styles.moodCardOn]}
                onPress={() => setMoodId(on ? undefined : m.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${m.label} (${m.hint})`}
              >
                <ImageBackground source={MOOD_PHOTOS[m.id]} style={styles.moodImage} imageStyle={styles.moodImageInner} resizeMode="cover">
                  <View style={styles.moodShade} />
                  <Text style={styles.moodLabel} numberOfLines={1}>
                    {m.label}
                  </Text>
                  {on && (
                    <View style={styles.check}>
                      <Text style={styles.checkText}>✓</Text>
                    </View>
                  )}
                </ImageBackground>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.wishRow}>
          <TextInput
            style={[styles.input, { flex: 1, minWidth: 0, marginBottom: 0, minHeight: 44 }]}
            placeholder="직접 추가 (예: 도자기, 볼링, 한강)"
            placeholderTextColor={colors.muted}
            value={wish}
            onChangeText={setWish}
            onSubmitEditing={addWish}
            returnKeyType="done"
          />
          <Pressable style={[styles.wishButton, !wish.trim() && styles.wishButtonOff]} onPress={addWish} disabled={!wish.trim()}>
            <Text style={styles.buttonTextSmall}>추가</Text>
          </Pressable>
        </View>
        <View style={[styles.chips, { marginTop: 12 }]}>
          {activities
            .filter((a) => !ACTIVITY_EXAMPLES.some((x) => x.label === a.label))
            .map((a) => (
              <Pressable key={a.label} style={[styles.chip, styles.chipOn]} onPress={() => toggleActivity(a)} accessibilityLabel={`${a.label} 빼기`}>
                <Text style={[styles.text, styles.chipOnText]}>✍️ {a.label} ✕</Text>
              </Pressable>
            ))}
          {ACTIVITY_EXAMPLES.map((a) => {
            const on = activities.some((x) => x.label === a.label);
            return (
              <Pressable key={a.label} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleActivity(a)}>
                <Text style={[styles.chipText, on && styles.chipOnText]}>
                  {a.emoji} {a.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {wishHint && <Text style={styles.small}>{wishHint}</Text>}

        <Text style={styles.h2}>어디서 만나요?</Text>
        <View style={[styles.row, { marginBottom: 10 }]}>
          {(['서울', '경기'] as const).map((g) => (
            <Pressable key={g} style={[styles.groupTab, group === g && styles.groupTabOn]} onPress={() => setGroup(g)}>
              <Text style={[styles.groupTabText, group === g && { color: colors.bg }]}>{g}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.grid}>
          <Pressable style={[styles.tile, regionId === AUTO && styles.selected]} onPress={() => setRegionId(AUTO)}>
            <Text style={styles.tileTitle}>✨ 추천해 줘</Text>
            <Text style={styles.small} numberOfLines={1}>
              기분에 맞는 동네로
            </Text>
          </Pressable>
          {shownRegions.map((r) => (
            <Pressable key={r.id} style={[styles.tile, regionId === r.id && styles.selected]} onPress={() => setRegionId(r.id)}>
              <Text style={styles.tileTitle}>{r.name}</Text>
              <Text style={styles.small} numberOfLines={1}>
                {r.tagline}
              </Text>
            </Pressable>
          ))}
        </View>
        {(hiddenCount > 0 || allRegions) && (
          <Pressable style={styles.more} onPress={() => setAllRegions(!allRegions)}>
            <Text style={styles.moreLink}>{allRegions ? '접기 ▴' : `${group} 더 보기 (${hiddenCount}곳)`}</Text>
          </Pressable>
        )}

        <View style={styles.sectionHead}>
          <Text style={[styles.h2, styles.h2InRow]}>언제 만나요?</Text>
          {!pickingEnd && (
            <Pressable style={styles.linkButton} onPress={() => setShowGrid(!showGrid)} hitSlop={6}>
              <Text style={styles.link}>{showGrid ? '접기' : '직접 고르기'}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.row}>
          {TIME_SLOTS.map((s) => (
            <Pressable key={s.id} style={[styles.slot, !pickingEnd && isSlotRange(s, range.start, range.end) && styles.selected]} onPress={() => pickSlot(s.id)}>
              <Text style={styles.slotEmoji}>{s.emoji}</Text>
              <Text style={[styles.tileTitle, !pickingEnd && isSlotRange(s, range.start, range.end) && { color: colors.accent }]}>{s.label}</Text>
              <Text style={styles.small}>
                {clock(s.defaultStart)}~{clock(s.defaultEnd)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.rangeText, { marginTop: 12 }]} accessibilityLabel="고른 시간">
          {pickingEnd
            ? `${formatMinute(range.start)} ~ 끝 시간을 눌러 주세요`
            : `${clock(range.start)} ~ ${clock(range.end)} · ${formatDuration(range.end - range.start)}`}
        </Text>
        {(showGrid || pickingEnd) && (
          <>
            <Text style={styles.small}>시작 → 끝 순서로 눌러요 (30분 단위)</Text>
            <View style={styles.timeGrid}>
              {gridRows.map((row, ri) => (
                <View key={ri} style={styles.timeRow}>
                  {row.map((m, ci) => {
                    if (m === null) return <View key={`empty-${ci}`} style={styles.timeCellEmpty} />;
                    const inRange = !pickingEnd && m >= range.start && m <= range.end;
                    const edge = m === range.start || (!pickingEnd && m === range.end);
                    return (
                      <Pressable
                        key={m}
                        style={[styles.timeCell, inRange && styles.timeCellIn, edge && styles.timeCellEdge]}
                        onPress={() => pickTime(m)}
                        accessibilityLabel={`${clock(m)} 선택`}
                      >
                        <Text style={[styles.timeCellText, edge && { color: colors.bg, fontWeight: '700' }]}>{clock(m)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.h2}>꼭 갈 곳 있어요? (선택)</Text>
        {!regionId || regionId === AUTO ? (
          <Text style={styles.muted}>{regionId === AUTO ? '지역을 직접 고르면 꼭 갈 곳을 넣을 수 있어요.' : '지역을 먼저 골라 주세요.'}</Text>
        ) : mustGo ? (
          <View style={[styles.card, styles.selected]}>
            <View style={styles.between}>
              <Text style={styles.tileTitle}>
                {CATEGORY_EMOJI[mustGo.place.category]} {mustGo.place.name}
              </Text>
              <Pressable hitSlop={12} onPress={() => setMustGo(null)} accessibilityLabel={`${mustGo.place.name} 빼기`}>
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
                    <Text style={[styles.text, mustGo.fixedMinute === m && styles.chipOnText]}>{formatMinute(m)}</Text>
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
                <PlacePhoto place={p} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tileTitle}>{p.name}</Text>
                  <Text style={styles.small} numberOfLines={1}>
                    {CATEGORY_LABEL[p.category]} · {popularityLabel(p)} · {p.description}
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
            <Text style={styles.buttonText}>{!moodId && activities.length === 0 ? '어떤 데이트인지 골라 주세요' : !regionId ? '지역을 골라 주세요' : pickingEnd ? '끝 시간을 골라 주세요' : '✨ 코스 3개 추천받기'}</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  brand: { fontSize: 15, fontWeight: '700', color: colors.accent },
  title: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -1, marginTop: 6 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 12 },
  h2InRow: { marginTop: 0, marginBottom: 0 },
  moodCard: { width: '48%', flexGrow: 1, height: 72, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: colors.line },
  moodCardOn: { borderColor: colors.accent },
  moodImage: { flex: 1, justifyContent: 'center', paddingHorizontal: 14 },
  moodImageInner: { borderRadius: 10 },
  moodShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11, 11, 15, 0.55)' },
  moodLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  check: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accentStrong, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  chipText: { color: colors.text, fontSize: 14 },
  moreLink: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  link: { color: colors.muted, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  h2: { fontSize: 19, fontWeight: '700', color: colors.text, marginTop: 28, marginBottom: 12 },
  text: { color: colors.text, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 15, marginTop: 4 },
  small: { color: colors.muted, fontSize: 13, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, padding: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  tileTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  row: { flexDirection: 'row', gap: 8 },
  rangeText: { color: colors.text, fontSize: 17, fontWeight: '700' },
  timeGrid: { gap: 6, marginTop: 10 },
  timeRow: { flexDirection: 'row', gap: 6 },
  timeCell: { flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: 8, alignItems: 'center', backgroundColor: colors.card },
  timeCellEmpty: { flex: 1 },
  timeCellIn: { backgroundColor: colors.accentSoft },
  timeCellEdge: { backgroundColor: colors.accent },
  timeCellText: { color: colors.text, fontSize: 14 },
  more: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  moreText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  groupTab: { paddingHorizontal: 20, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  groupTabOn: { backgroundColor: colors.text, borderColor: colors.text },
  groupTabText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  slot: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  slotEmoji: { fontSize: 22 },
  card: { padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, marginRight: 8 },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 8 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  resume: { marginTop: 16, borderColor: colors.line },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.card, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipOnText: { color: colors.text, fontWeight: '700' },
  wishRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  wishButton: { backgroundColor: colors.line, borderRadius: 12, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' },
  wishButtonOff: { opacity: 0.5 },
  buttonTextSmall: { color: '#fff', fontSize: 15, fontWeight: '800' },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.bg },
  button: { backgroundColor: colors.accentStrong, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 8 },
  buttonOff: { backgroundColor: '#3a3a44' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
