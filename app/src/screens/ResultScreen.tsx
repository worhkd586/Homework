import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import Text from '../ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Course, Place } from '../domain/types';
import { CATEGORY_EMOJI, CATEGORY_LABEL, formatDuration, formatMinute, getTimeSlot, isSlotRange } from '../domain/timeSlots';
import { dataSourceNote, placeProvider, recommender } from '../lib/services';
import { colors, radius } from '../ui/theme';
import Segmented from '../ui/Segmented';
import Photo from '../ui/Photo';
import type { DateLog, Verdict } from '../lib/savedCourses';
import PlaceSuggestionList from '../ui/PlaceSuggestionList';
import { popularityLabel } from '../services/recommend/RuleBasedRecommender';

interface Props {
  options: Course[];
  note?: string;
  selected: number;
  isSaved: boolean;
  /** 다녀온 코스면 데이트 로그 */
  log?: DateLog;
  onVisited: () => void;
  onRate: (placeId: string, verdict: Verdict) => void;
  onMemo: (memo: string) => void;
  onSelect: (index: number) => void;
  onChange: (course: Course) => void;
  onSave: () => void;
  onBack: () => void;
}

/** 열려 있는 편집 패널: 어느 자리에 무엇을 하는지 */
type Panel =
  | { kind: 'add'; index: number } // index 자리에 새 일정
  | { kind: 'edit'; index: number } // index번째 일정의 메뉴 (시간 / 바꾸기 / 삭제)
  | { kind: 'time'; index: number }
  | { kind: 'replace'; index: number };

const optionName = (c: Course) => c.title.split(' · ').slice(1).join(' · ') || c.title;

/** 결과 = 편집 화면. 저장 전이든 후든 언제든 일정을 고칠 수 있다. */
export default function ResultScreen({ options, note, selected, isSaved, log, onVisited, onRate, onMemo, onSelect, onChange, onSave, onBack }: Props) {
  const [memo, setMemo] = useState(log?.memo ?? '');
  useEffect(() => setMemo(log?.memo ?? ''), [log?.visitedOn, selected]);
  const course = options[selected];
  const slot = getTimeSlot(course.request.slotId);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  // 일정을 탭하면 열리는 패널이 화면 밖에 열리지 않도록, 그 일정 위치로 스크롤한다
  const scrollRef = useRef<ScrollViewInstance>(null);
  const listY = useRef(0);
  const stopY = useRef<number[]>([]);

  useEffect(() => {
    if (!panel || panel.kind === 'add') return;
    const y = listY.current + (stopY.current[panel.index] ?? 0) - 12;
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true }), 50);
    return () => clearTimeout(t);
  }, [panel?.kind, panel?.index]);

  useEffect(() => {
    placeProvider.listPlaces(course.request.regionId).then(setPlaces);
  }, [course.request.regionId]);

  // 시간 바꾸기 선택지: 시간대 안에서 30분 간격
  const timeOptions = useMemo(() => {
    const out: number[] = [];
    for (let m = course.request.startMinute; m <= course.request.endMinute - 30; m += 30) out.push(m);
    return out;
  }, [course.request.startMinute, course.request.endMinute]);

  function open(next: Panel) {
    const same = panel && panel.kind === next.kind && panel.index === next.index;
    setPanel(same ? null : next);
    setPicking(false);
    setQuery('');
  }

  async function run(change: () => Promise<Course>) {
    setBusy(true);
    try {
      onChange(await change());
      setPanel(null);
      setPicking(false);
    } finally {
      setBusy(false);
    }
  }

  const addSlot = (index: number) =>
    panel?.kind === 'add' && panel.index === index ? (
      <View style={styles.panel}>
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <PlaceSuggestionList course={course} index={index} mode="add" onPick={(p) => run(() => recommender.insertStop(course, index, p))} onClose={() => setPanel(null)} />
        )}
      </View>
    ) : (
      <Pressable style={styles.addRound} onPress={() => open({ kind: 'add', index })} hitSlop={6} accessibilityLabel="여기에 일정 추가">
        <Text style={styles.addRoundText}>＋ 추가</Text>
      </Pressable>
    );

  const stopPanel = (index: number) => {
    if (!panel || panel.index !== index || panel.kind === 'add') return null;
    const stop = course.stops[index];
    if (busy) return <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} />;
    if (panel.kind === 'edit') {
      return (
        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={() => open({ kind: 'time', index })}>
            <Text style={styles.actionText}>🕒 시간</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => open({ kind: 'replace', index })}>
            <Text style={styles.actionText}>↻ 다른 곳</Text>
          </Pressable>
          {stop.place.url && (
            <Pressable style={styles.action} onPress={() => Linking.openURL(stop.place.url!)}>
              <Text style={styles.actionText}>🗺️ 지도</Text>
            </Pressable>
          )}
          <Pressable style={styles.action} onPress={() => run(() => recommender.removeStop(course, index))}>
            <Text style={[styles.actionText, { color: colors.accent }]}>✕ 삭제</Text>
          </Pressable>
        </View>
      );
    }
    if (panel.kind === 'time') {
      return (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.small}>도착 시각을 고르면 그 시간에 고정돼요</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {stop.fixedTime && (
              <Pressable style={styles.chip} onPress={() => run(() => recommender.setStopTime(course, index, undefined))}>
                <Text style={styles.text}>고정 풀기</Text>
              </Pressable>
            )}
            {timeOptions.map((m) => {
              const on = stop.arriveMinute === m;
              return (
                <Pressable key={m} style={[styles.chip, on && styles.chipOn]} onPress={() => run(() => recommender.setStopTime(course, index, m))}>
                  <Text style={[styles.text, on && { color: colors.onAccent, fontWeight: '700' }]}>{formatMinute(m)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      );
    }
    return (
      <View style={{ marginTop: 10 }}>
        <PlaceSuggestionList course={course} index={index} mode="replace" onPick={(p) => run(() => recommender.replaceStop(course, index, p))} onClose={() => setPanel(null)} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.backButton} accessibilityLabel="조건 바꾸기 · 내 코스로 돌아가기">
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.meta} numberOfLines={1}>
            {course.title.split(' · ')[0]} · {isSlotRange(slot, course.request.startMinute, course.request.endMinute) ? `${slot.label} ` : ''}
            {formatMinute(course.request.startMinute)}–{course.request.endMinute === 1440 ? '24:00' : formatMinute(course.request.endMinute)}
          </Text>
        </View>

        {options.length > 1 && (
          <Segmented
            options={options.map((o, i) => ({ id: String(i), label: `코스 ${String.fromCharCode(65 + i)}` }))}
            value={String(selected)}
            onChange={(id) => {
              onSelect(Number(id));
              setPanel(null);
            }}
            role="tab"
          />
        )}

        <Text style={styles.title}>{optionName(course)}</Text>
        <Text style={styles.small}>
          {course.stops.length}곳 · 이동 {course.totalTravelMinutes}분 · 장소를 누르면 바꿀 수 있어요
        </Text>
        {note && <Text style={styles.note}>{note}</Text>}

        {course.warnings.map((w, i) => (
          <View key={i} style={styles.warning}>
            <Text style={styles.warningText}>⚠️ {w.message}</Text>
          </View>
        ))}

        <View style={{ marginTop: 20 }} onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
          {course.stops.length === 0 && (
            <>
              <Text style={styles.muted}>일정이 모두 비었어요. 새로 추가해 보세요.</Text>
              {addSlot(0)}
            </>
          )}
          {course.stops.map((s, i) => {
            const leg = course.legs[i];
            const editing = panel !== null && panel.kind !== 'add' && panel.index === i;
            return (
              <Fragment key={s.place.id}>
                <View style={styles.stop} onLayout={(e) => (stopY.current[i] = e.nativeEvent.layout.y)}>
                  <View style={styles.stopHead}>
                    <View style={styles.dot} />
                    <Text style={styles.timeMain}>{formatMinute(s.arriveMinute)}</Text>
                    <Text style={styles.catLabel}>
                      {CATEGORY_LABEL[s.place.category]} · ~{formatMinute(s.leaveMinute)}
                    </Text>
                    <Pressable
                      style={styles.remove}
                      hitSlop={8}
                      onPress={() => run(() => recommender.removeStop(course, i))}
                      accessibilityLabel={`${s.place.name} 빼기`}
                    >
                      <Text style={styles.removeText}>✕</Text>
                    </Pressable>
                  </View>
                  <Pressable style={[styles.card, editing && styles.cardOn]} onPress={() => open({ kind: 'edit', index: i })} accessibilityLabel={`${s.place.name} 수정`}>
                    <Photo style={styles.stopPhoto} loadKey={s.place.id} load={() => placeProvider.photosOf?.(s.place) ?? Promise.resolve(undefined)} emoji={CATEGORY_EMOJI[s.place.category]} label={`${s.place.name} 사진`} />
                    <View style={styles.cardBody}>
                      <Text style={styles.name} numberOfLines={2}>
                        {s.place.name}
                      </Text>
                      <Text style={styles.desc} numberOfLines={2}>
                        {s.place.description}
                      </Text>
                    {s.pinned && <Text style={styles.badge}>{s.fixedTime ? '🔒 시간 고정' : s.reason === '직접 추가한 곳' ? '📍 직접 추가' : '📌 꼭 갈 곳'}</Text>}
                    {!s.pinned && s.fixedTime && <Text style={styles.badge}>🔒 시간 고정</Text>}
                    {log && (
                      <View style={styles.rateRow}>
                        {(
                          [
                            ['good', '👍 좋았어요'],
                            ['bad', '👎 별로예요'],
                          ] as const
                        ).map(([v, label]) => {
                          const on = log.ratings[s.place.id] === v;
                          return (
                            <Pressable
                              key={v}
                              style={[styles.rate, on && (v === 'good' ? styles.rateGood : styles.rateBad)]}
                              onPress={() => onRate(s.place.id, v)}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={`${s.place.name} ${label}`}
                            >
                              <Text style={[styles.rateText, on && { color: v === 'good' ? colors.onMint : colors.onPink, fontWeight: '800' }]}>{label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                    {editing && <Text style={styles.reason}>{s.reason}</Text>}
                    {stopPanel(i)}
                    </View>
                  </Pressable>
                </View>
                {leg ? (
                  <View style={styles.legRow}>
                    <Text style={styles.legText}>
                      {leg.travel.mode === 'walk' ? '🚶 도보' : leg.travel.mode === 'car' ? '🚗 차(어림)' : '🚇 대중교통(어림)'} {leg.travel.minutes}분 · {(leg.travel.distanceMeters / 1000).toFixed(1)}km
                      {s.slackMinutes > 0 ? <Text style={{ color: colors.ok }}> · 여유 {s.slackMinutes}분</Text> : null}
                    </Text>
                    {!(panel?.kind === 'add' && panel.index === i + 1) && addSlot(i + 1)}
                  </View>
                ) : (
                  !(panel?.kind === 'add' && panel.index === i + 1) && <View style={styles.legRow}>{addSlot(i + 1)}</View>
                )}
                {panel?.kind === 'add' && panel.index === i + 1 && addSlot(i + 1)}
              </Fragment>
            );
          })}
        </View>

        {log && (
          <View style={styles.logCard}>
            <Text style={styles.logTitle}>📒 {log.visitedOn.slice(5).replace('-', '/')} 데이트 기록</Text>
            <Text style={styles.small}>좋았던 곳은 다음 추천에 다시 나오고, 별로였던 곳은 빠져요.</Text>
            <TextInput
              style={styles.memo}
              placeholder="한 줄 메모 (예: 파스타 최고, 웨이팅 길었음)"
              placeholderTextColor={colors.muted}
              value={memo}
              onChangeText={setMemo}
              onEndEditing={() => onMemo(memo.trim())}
              onBlur={() => onMemo(memo.trim())}
              multiline
            />
          </View>
        )}

        <Text style={[styles.small, { marginTop: 24 }]}>{dataSourceNote()}</Text>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {log ? (
          <Text style={styles.savedNote}>📒 데이트 로그에 기록됨 · 장소마다 👍/👎를 눌러 주세요</Text>
        ) : isSaved ? (
          <>
            <Text style={styles.savedNote}>✓ 내 코스에 저장됨 · 고치면 자동으로 저장돼요</Text>
            <Pressable style={styles.button} onPress={onVisited} accessibilityLabel="다녀왔어요, 데이트 기록하기">
              <Text style={styles.buttonText}>✓ 다녀왔어요 · 기록하기</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.footerRow}>
            <Pressable style={styles.secondary} onPress={onBack}>
              <Text style={styles.secondaryText}>조건 바꾸기</Text>
            </Pressable>
            <Pressable style={[styles.button, { flex: 1 }]} onPress={onSave}>
              <Text style={styles.buttonText}>이 코스 저장</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  desc: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  cardBody: { padding: 16 },
  stopPhoto: { width: '100%', aspectRatio: 16 / 9 },
  catLabel: { flex: 1, color: colors.muted, fontSize: 13, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentStrong },
  stopHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  legText: { flexShrink: 1, color: colors.muted, fontSize: 13 },
  meta: { flex: 1, color: colors.muted, fontSize: 14, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -12, marginBottom: 12 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.text, fontSize: 30, lineHeight: 34 },
  remove: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.muted, fontSize: 15 },
  legRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 3, paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: colors.line, minHeight: 52, marginVertical: 6, gap: 8 },
  addRound: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  addRoundText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  footerRow: { flexDirection: 'row', gap: 10 },
  rateRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  rate: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  rateGood: { backgroundColor: colors.mint },
  rateBad: { backgroundColor: colors.pink },
  rateText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  logCard: { marginTop: 24, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
  logTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  memo: { marginTop: 10, minHeight: 64, borderRadius: 14, backgroundColor: colors.surface, color: colors.text, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  secondary: { paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8, marginTop: 22 },
  note: { color: colors.ok, fontSize: 13, marginTop: 6 },
  text: { color: colors.text, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 15, marginTop: 4 },
  small: { color: colors.muted, fontSize: 13, marginTop: 2 },
  warning: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: colors.warnSoft },
  warningText: { color: colors.warn, fontSize: 13 },
  stop: { marginTop: 8 },
  timeMain: { color: colors.accentStrong, fontSize: 17, fontWeight: '800' },
  card: { borderRadius: radius.card, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cardOn: { borderColor: colors.accent, borderWidth: 1.5 },
  name: { color: colors.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  badge: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.pink, color: colors.onPink, fontSize: 12, fontWeight: '700' },
  reason: { color: colors.muted, fontSize: 13, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  action: { flexGrow: 1, flexBasis: '45%', minHeight: 44, justifyContent: 'center', borderRadius: 10, alignItems: 'center', backgroundColor: colors.surface },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginRight: 8 },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  panel: { marginVertical: 8, padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  choices: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choice: { flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: 10, alignItems: 'center', backgroundColor: colors.surface },
  choicePrimary: { backgroundColor: colors.accentStrong },
  choiceOn: { borderWidth: 1, borderColor: colors.text },
  choiceText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 6 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  button: { backgroundColor: colors.accentStrong, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 8 },
  buttonText: { color: colors.onAccent, fontSize: 17, fontWeight: '800' },
  savedNote: { color: colors.ok, fontSize: 14, textAlign: 'center', paddingVertical: 14 },
});
