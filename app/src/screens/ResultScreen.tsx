import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import Text from '../ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Course, Place } from '../domain/types';
import { CATEGORY_LABEL, formatDuration, formatMinute, getTimeSlot, isSlotRange } from '../domain/timeSlots';
import { dataSourceNote, placeProvider, recommender } from '../lib/services';
import { colors } from '../ui/theme';
import PlacePhoto from '../ui/PlacePhoto';
import PlaceSuggestionList from '../ui/PlaceSuggestionList';
import { popularityLabel } from '../services/recommend/RuleBasedRecommender';

interface Props {
  options: Course[];
  note?: string;
  selected: number;
  isSaved: boolean;
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
export default function ResultScreen({ options, note, selected, isSaved, onSelect, onChange, onSave, onBack }: Props) {
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
        <Text style={styles.addRoundText}>＋</Text>
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
                  <Text style={[styles.text, on && { color: colors.bg, fontWeight: '700' }]}>{formatMinute(m)}</Text>
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
          <Text style={styles.headerTitle}>추천 코스</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaPill} numberOfLines={1}>
            📍 {course.title.split(' · ')[0]} · {isSlotRange(slot, course.request.startMinute, course.request.endMinute) ? slot.label : '직접 고른 시간'}
          </Text>
          <Text style={styles.metaPill}>
            🕒 {formatMinute(course.request.startMinute)}–{course.request.endMinute === 1440 ? '24:00' : formatMinute(course.request.endMinute)} · {formatDuration(course.request.endMinute - course.request.startMinute)}
          </Text>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{options.length > 1 ? '추천 데이트 코스' : '내 코스'}</Text>
          <Text style={styles.count}>{course.stops.length}개 장소</Text>
        </View>
        {note && <Text style={styles.note}>{note}</Text>}

        {options.length > 1 && (
          <View style={styles.tabs}>
            {options.map((o, i) => (
              <Pressable
                key={o.title}
                style={[styles.tab, i === selected && styles.tabOn]}
                onPress={() => {
                  onSelect(i);
                  setPanel(null);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: i === selected }}
              >
                <Text style={[styles.tabText, i === selected && styles.tabTextOn]}>코스 {String.fromCharCode(65 + i)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{optionName(course)}</Text>
          <Text style={styles.small}>
            총 이동 {course.totalTravelMinutes}분 · 탭해서 바꾸기
          </Text>
        </View>

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
                  <View style={styles.time}>
                    <Text style={styles.timeMain}>{formatMinute(s.arriveMinute)}</Text>
                    <View style={styles.dot} />
                  </View>
                  <Pressable style={[styles.card, editing && styles.cardOn]} onPress={() => open({ kind: 'edit', index: i })} accessibilityLabel={`${s.place.name} 수정`}>
                    <View style={styles.cardHead}>
                      <PlacePhoto place={s.place} size={64} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.tagRow}>
                          <Text style={styles.tag}>{CATEGORY_LABEL[s.place.category]}</Text>
                          <Text style={styles.small} numberOfLines={1}>
                            ~{formatMinute(s.leaveMinute)}
                          </Text>
                        </View>
                        <Text style={styles.name} numberOfLines={2}>
                          {s.place.name}
                        </Text>
                        <Text style={styles.small} numberOfLines={1}>
                          {s.place.description}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.remove}
                        hitSlop={8}
                        onPress={() => run(() => recommender.removeStop(course, i))}
                        accessibilityLabel={`${s.place.name} 빼기`}
                      >
                        <Text style={styles.removeText}>✕</Text>
                      </Pressable>
                    </View>
                    {s.pinned && <Text style={styles.badge}>{s.fixedTime ? '🔒 시간 고정' : s.reason === '직접 추가한 곳' ? '📍 직접 추가' : '📌 꼭 갈 곳'}</Text>}
                    {!s.pinned && s.fixedTime && <Text style={styles.badge}>🔒 시간 고정</Text>}
                    {editing && <Text style={styles.reason}>{s.reason}</Text>}
                    {stopPanel(i)}
                  </Pressable>
                </View>
                {leg ? (
                  <View style={styles.legRow}>
                    <Text style={styles.legPill}>
                      {leg.travel.mode === 'walk' ? '🚶 도보' : '🚇 대중교통(어림)'} {leg.travel.minutes}분 · {(leg.travel.distanceMeters / 1000).toFixed(1)}km
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

        <Text style={[styles.small, { marginTop: 24 }]}>{dataSourceNote()}</Text>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {isSaved ? (
          <Text style={styles.savedNote}>✓ 내 코스에 저장됨 · 고치면 자동으로 저장돼요</Text>
        ) : (
          <View style={styles.footerRow}>
            <Pressable style={styles.secondary} onPress={onBack}>
              <Text style={styles.secondaryText}>↻ 조건 바꾸기</Text>
            </Pressable>
            <Pressable style={[styles.button, { flex: 1 }]} onPress={onSave}>
              <Text style={styles.buttonText}>♡ 이 코스 저장</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -8, marginBottom: 8 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.text, fontSize: 30, lineHeight: 34 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaPill: { color: colors.muted, fontSize: 13, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14 },
  count: { color: colors.accent, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 16 },
  tab: { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  tabOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  tabText: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  tabTextOn: { color: colors.text },
  summary: { marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: colors.card },
  summaryTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, marginTop: 8, marginRight: 4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { color: colors.text, fontSize: 12, fontWeight: '700', backgroundColor: colors.accentStrong, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  remove: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#26262f', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.muted, fontSize: 14 },
  legRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 64, marginVertical: 8, gap: 8 },
  legPill: { flexShrink: 1, color: colors.muted, fontSize: 13, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  addRound: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#26262f', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  addRoundText: { color: colors.text, fontSize: 20, fontWeight: '700' },
  footerRow: { flexDirection: 'row', gap: 10 },
  secondary: { paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
  note: { color: colors.ok, fontSize: 13, marginTop: 6 },
  text: { color: colors.text, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 15, marginTop: 4 },
  small: { color: colors.muted, fontSize: 13, marginTop: 2 },
  warning: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: colors.warnSoft },
  warningText: { color: colors.warn, fontSize: 13 },
  stop: { flexDirection: 'row', gap: 12 },
  time: { width: 52, alignItems: 'flex-end', paddingTop: 14 },
  timeMain: { color: colors.text, fontSize: 17, fontWeight: '700' },
  card: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  cardOn: { borderColor: colors.accent },
  cardHead: { flexDirection: 'row', gap: 10 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.accentSoft, color: '#ff9aac', fontSize: 13 },
  reason: { color: '#cfcfd6', fontSize: 13, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  action: { flexGrow: 1, flexBasis: '45%', minHeight: 44, justifyContent: 'center', borderRadius: 10, alignItems: 'center', backgroundColor: '#26262f' },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#26262f', borderWidth: 1, borderColor: colors.line, marginRight: 8 },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  panel: { marginLeft: 64, marginVertical: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choices: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choice: { flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: 10, alignItems: 'center', backgroundColor: '#26262f' },
  choicePrimary: { backgroundColor: colors.accentStrong },
  choiceOn: { borderWidth: 1, borderColor: colors.text },
  choiceText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: '#26262f', color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 6 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.bg },
  button: { backgroundColor: colors.accentStrong, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 8 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  savedNote: { color: colors.ok, fontSize: 14, textAlign: 'center', paddingVertical: 14 },
});
