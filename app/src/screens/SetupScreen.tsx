import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import Text from '../ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Course, PinnedPlace, Place, Region, TimeSlotId, TravelChoice } from '../domain/types';
import { BUDGETS, VIBES, type CoursePrefs } from '../domain/prefs';
import { recommendOptions, suggestRegion } from '../services/recommend/courseOptions';
import { placeVerdicts, type SavedCourse } from '../lib/savedCourses';
import { ACTIVITY_EXAMPLES, parseActivity, type Activity } from '../domain/activities';
import { CATEGORY_EMOJI, CATEGORY_LABEL, MIN_RANGE, RANGE_FIRST, RANGE_LAST, TIME_SLOTS, formatDuration, formatMinute, isSlotRange, slotForRange } from '../domain/timeSlots';
import { placeProvider, recommender } from '../lib/services';
import { colors, radius } from '../ui/theme';
import PlacePhoto from '../ui/PlacePhoto';
import Segmented from '../ui/Segmented';
import Photo from '../ui/Photo';
import { popularityLabel } from '../services/recommend/RuleBasedRecommender';

export interface CourseOptions {
  options: Course[];
  /** 지역을 추천받았을 때 그 이유 */
  note?: string;
}

const AUTO = 'auto';
const TRAVEL_CHOICES: Array<{ id: TravelChoice; emoji: string; label: string; hint: string }> = [
  { id: 'walk', emoji: '🚶', label: '걸어서', hint: '가까운 곳만' },
  { id: 'transit', emoji: '🚇', label: '대중교통', hint: '가까우면 도보' },
  { id: 'car', emoji: '🚗', label: '차로', hint: '주차 5분 포함' },
];
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
  const [prefs, setPrefs] = useState<CoursePrefs>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [wish, setWish] = useState('');
  const [wishHint, setWishHint] = useState<string>();
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<string>();
  const [group, setGroup] = useState<'서울' | '경기' | '제주'>('서울');
  // 이동 방법. 직접 고르기 전에는 지역에 맞춰 (제주는 차, 나머지는 대중교통)
  const [travel, setTravel] = useState<TravelChoice>('transit');
  const [travelPicked, setTravelPicked] = useState(false);
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
  const ready = !!regionId && !loading && !pickingEnd;

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
    if (!regionId || travelPicked) return;
    const g = regionId === AUTO ? group : regions.find((r) => r.id === regionId)?.group;
    setTravel(g === '제주' ? 'car' : 'transit');
  }, [regionId, group]);

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
    if (!regionId) return;
    setLoading(true);
    setError(undefined);
    try {
      let region = regions.find((r) => r.id === regionId);
      let note: string | undefined;
      if (regionId === AUTO) {
        const suggestion = await suggestRegion(placeProvider, undefined, activities, group);
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
          prefs,
          travel,
          ...placeVerdicts(saved),
        },
        undefined,
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
        <Text style={styles.brand}>● 오늘어디가 · COURSE CURATION</Text>
        <Text style={styles.title}>어떤 데이트를 할까요?</Text>
        <Text style={styles.subtitle}>하고 싶은 거·지역·시간만 고르면 코스를 짜 드려요.</Text>

        {hasCurrent && (
          <Pressable style={[styles.card, styles.resume]} onPress={onResume}>
            <Text style={styles.text}>‹ 보던 코스로 돌아가기</Text>
          </Pressable>
        )}

        {saved.length > 0 && (
          <>
            <Text style={styles.h2}>{saved.some((s) => s.log) ? '내 코스 · 데이트 로그' : '내 코스'}</Text>
            {saved.map((item) => {
              const c = item.course;
              const first = c.stops[0];
              return (
                <Pressable key={item.id} style={styles.savedRow} onPress={() => onOpenSaved(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tileTitle} numberOfLines={1}>
                      {c.title}
                    </Text>
                    {item.log ? (
                      <Text style={styles.small} numberOfLines={1}>
                        📒 {item.log.visitedOn.slice(5).replace('-', '/')} 다녀옴 · 👍 {Object.values(item.log.ratings).filter((v) => v === 'good').length} · 👎{' '}
                        {Object.values(item.log.ratings).filter((v) => v === 'bad').length}
                        {item.log.memo ? ` · ${item.log.memo}` : ''}
                      </Text>
                    ) : (
                      <Text style={styles.small} numberOfLines={1}>
                        {c.request.date} · {first ? formatMinute(first.arriveMinute) : '--:--'} 시작 · {c.stops.length}곳 · 탭해서 수정
                      </Text>
                    )}
                  </View>
                  <Pressable hitSlop={10} onPress={() => onDeleteSaved(item.id)} accessibilityLabel={`${c.title} 삭제`}>
                    <Text style={styles.muted}>✕</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </>
        )}

        <Text style={styles.h2}>{saved.length > 0 ? '새 코스 · 하고 싶은 거' : '하고 싶은 거'}</Text>
        <View style={styles.wishRow}>
          <TextInput
            style={[styles.input, { flex: 1, minWidth: 0, marginBottom: 0 }]}
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
        <View style={styles.chips}>
          {activities
            .filter((a) => !ACTIVITY_EXAMPLES.some((x) => x.label === a.label))
            .map((a) => (
              <Pressable key={a.label} style={[styles.chip, styles.chipOn]} onPress={() => toggleActivity(a)} accessibilityLabel={`${a.label} 빼기`} hitSlop={4}>
                <Text style={[styles.chipText, styles.chipOnText]}>{a.label} ✕</Text>
              </Pressable>
            ))}
          {ACTIVITY_EXAMPLES.map((a) => {
            const on = activities.some((x) => x.label === a.label);
            return (
              <Pressable key={a.label} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleActivity(a)} accessibilityState={{ selected: on }} hitSlop={4}>
                <Text style={[styles.chipText, on && styles.chipOnText]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {wishHint && <Text style={styles.small}>{wishHint}</Text>}

        <Text style={styles.h2}>어디서 만나요?</Text>
        <Segmented options={(['서울', '경기', '제주'] as const).map((g) => ({ id: g, label: g }))} value={group} onChange={setGroup} role="tab" />
        <View style={{ height: 12 }} />
        <View style={styles.grid}>
          <Pressable
            style={[styles.regionCard, styles.autoCard, regionId === AUTO && styles.regionOn]}
            onPress={() => setRegionId(AUTO)}
            accessibilityRole="button"
            accessibilityState={{ selected: regionId === AUTO }}
          >
            <Text style={styles.autoBadge}>AUTO</Text>
            <View>
              <Text style={styles.regionName}>✨ 추천해 줘</Text>
              <Text style={styles.regionTag} numberOfLines={1}>
                고른 것에 맞는 동네로
              </Text>
            </View>
          </Pressable>
          {shownRegions.map((r) => (
            <Pressable
              key={r.id}
              style={[styles.regionCard, regionId === r.id && styles.regionOn]}
              onPress={() => setRegionId(r.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: regionId === r.id }}
              accessibilityLabel={`${r.name}, ${r.tagline}`}
            >
              <Photo style={styles.regionPhoto} loadKey={r.id} load={() => placeProvider.photoFor?.(`${r.name.split('·')[0]} 데이트`, r.name.split('·')[0]) ?? Promise.resolve(undefined)}>
                <Text style={styles.regionName}>{r.name}</Text>
                <Text style={styles.regionTag} numberOfLines={1}>
                  {r.tagline}
                </Text>
              </Photo>
            </Pressable>
          ))}
        </View>
        {(hiddenCount > 0 || allRegions) && (
          <Pressable style={styles.more} onPress={() => setAllRegions(!allRegions)}>
            <Text style={styles.moreLink}>{allRegions ? '접기 ▴' : `${group} 더 보기 (${hiddenCount}곳)`}</Text>
          </Pressable>
        )}

        <Text style={styles.h2}>언제 만나요?</Text>
        <Segmented
          options={TIME_SLOTS.map((s) => ({ id: s.id, label: s.label }))}
          value={pickingEnd ? undefined : TIME_SLOTS.find((s) => isSlotRange(s, range.start, range.end))?.id}
          onChange={pickSlot}
        />
        <View style={[styles.between, { marginTop: 6 }]}>
          <Text style={styles.rangeText} accessibilityLabel="고른 시간">
            {pickingEnd
              ? `${formatMinute(range.start)} ~ 끝 시간을 눌러 주세요`
              : `${clock(range.start)} ~ ${clock(range.end)} · ${formatDuration(range.end - range.start)}`}
          </Text>
          {!pickingEnd && (
            <Pressable style={styles.linkButton} onPress={() => setShowGrid(!showGrid)} hitSlop={6}>
              <Text style={styles.link}>{showGrid ? '접기' : '직접 고르기'}</Text>
            </Pressable>
          )}
        </View>
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
                        <Text style={[styles.timeCellText, edge && { color: colors.onAccent, fontWeight: '700' }]}>{clock(m)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.h2}>
          이런 곳이 좋아요 <Text style={styles.optional}>선택</Text>
        </Text>
        <View style={styles.chips}>
          {VIBES.map((v) => {
            const on = prefs.vibe === v.id;
            return (
              <Pressable key={v.id} style={[styles.chip, on && styles.chipOn]} onPress={() => setPrefs({ ...prefs, vibe: on ? undefined : v.id })} accessibilityState={{ selected: on }} hitSlop={4}>
                <Text style={[styles.chipText, on && styles.chipOnText]}>
                  {v.label}
                </Text>
              </Pressable>
            );
          })}
          {BUDGETS.map((b) => {
            const on = prefs.budget === b.id;
            return (
              <Pressable key={b.id} style={[styles.chip, on && styles.chipOn]} onPress={() => setPrefs({ ...prefs, budget: on ? undefined : b.id })} accessibilityState={{ selected: on }} hitSlop={4}>
                <Text style={[styles.chipText, on && styles.chipOnText]}>
                  {b.label}
                </Text>
              </Pressable>
            );
          })}
          {([
            ['indoor', '실내 위주'],
            ['outdoor', '야외 위주'],
          ] as const).map(([id, label]) => {
            const on = prefs.space === id;
            return (
              <Pressable key={id} style={[styles.chip, on && styles.chipOn]} onPress={() => setPrefs({ ...prefs, space: on ? undefined : id })} accessibilityState={{ selected: on }} hitSlop={4}>
                <Text style={[styles.chipText, on && styles.chipOnText]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.h2}>어떻게 이동해요?</Text>
        <Segmented
          options={TRAVEL_CHOICES.map((t) => ({ id: t.id, label: t.label, sub: t.hint }))}
          value={travel}
          onChange={(id) => {
            setTravel(id);
            setTravelPicked(true);
          }}
        />

        <Text style={styles.h2}>
          꼭 갈 곳 <Text style={styles.optional}>선택</Text>
        </Text>
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
                thumbColor={colors.onAccent}
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
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.buttonText}>{!regionId ? '지역을 골라 주세요' : pickingEnd ? '끝 시간을 골라 주세요' : '✨ 코스 3개 추천받기'}</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  regionTag: { color: 'rgba(255,255,255,0.88)', fontSize: 12, marginTop: 2 },
  regionName: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  autoBadge: { alignSelf: 'flex-start', color: colors.onAccent, backgroundColor: colors.accentStrong, fontSize: 11, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', letterSpacing: 0.5 },
  autoCard: { backgroundColor: colors.text, padding: 12, justifyContent: 'space-between' },
  regionPhoto: { flex: 1 },
  regionOn: { borderColor: colors.accentStrong },
  regionCard: { width: '48%', flexGrow: 1, aspectRatio: 4 / 3, borderRadius: radius.card, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  brand: { fontSize: 12, fontWeight: '800', color: colors.accentStrong, letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.8, marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 15, marginTop: 6 },
  h2: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.3, marginTop: 36, marginBottom: 14 },
  optional: { fontSize: 13, fontWeight: '600', color: colors.muted },
  text: { color: colors.text, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 15, marginTop: 4 },
  small: { color: colors.muted, fontSize: 13, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexGrow: 1, paddingVertical: 14, paddingHorizontal: 14, borderRadius: radius.tile, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  tileTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  selected: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: 8 },
  rangeText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  timeGrid: { gap: 6, marginTop: 10 },
  timeRow: { flexDirection: 'row', gap: 6 },
  timeCell: { flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: 10, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  timeCellEmpty: { flex: 1 },
  timeCellIn: { backgroundColor: colors.surface, borderColor: colors.surface },
  timeCellEdge: { backgroundColor: colors.accent, borderColor: colors.accent },
  timeCellText: { color: colors.text, fontSize: 14 },
  more: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  moreLink: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  linkButton: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.text, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  card: { padding: 16, borderRadius: radius.card, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: '#dcdce0' },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '500' },
  chipOnText: { color: colors.onAccent, fontWeight: '700' },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: 10, paddingHorizontal: 14, minHeight: 44, paddingVertical: 10, fontSize: 15, marginBottom: 8 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  resume: { marginTop: 16 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.tile, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, marginBottom: 8 },
  wishRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  wishButton: { backgroundColor: colors.text, borderRadius: 10, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' },
  wishButtonOff: { backgroundColor: colors.disabled },
  buttonTextSmall: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  button: { backgroundColor: colors.text, borderRadius: 12, paddingVertical: 17, alignItems: 'center', marginBottom: 8 },
  buttonOff: { backgroundColor: colors.disabled },
  buttonText: { color: colors.onAccent, fontSize: 17, fontWeight: '800' },
});
