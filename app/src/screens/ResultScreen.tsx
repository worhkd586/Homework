import { Fragment, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Course, Place } from '../domain/types';
import { CATEGORY_EMOJI, CATEGORY_LABEL, formatMinute, getTimeSlot } from '../domain/timeSlots';
import { dataSourceNote, placeProvider, recommender } from '../lib/services';
import { colors } from '../ui/theme';

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

  const inCourse = new Set(course.stops.map((s) => s.place.id));
  const choices = places.filter((p) => !inCourse.has(p.id) && (!query || p.name.includes(query) || p.description.includes(query)));

  /** 추천받기 / 직접 고르기 (새 일정 추가, 다른 곳으로 바꾸기 공용) */
  const placeChooser = (onPick: (place?: Place) => void) => (
    <>
      <View style={styles.choices}>
        <Pressable style={[styles.choice, styles.choicePrimary]} onPress={() => onPick()}>
          <Text style={styles.choiceText}>✨ 추천받기</Text>
        </Pressable>
        <Pressable style={[styles.choice, picking && styles.choiceOn]} onPress={() => setPicking(!picking)}>
          <Text style={styles.choiceText}>📍 직접 고르기</Text>
        </Pressable>
        <Pressable onPress={() => setPanel(null)} hitSlop={10}>
          <Text style={styles.muted}>✕</Text>
        </Pressable>
      </View>
      {picking && (
        <View style={{ marginTop: 10 }}>
          <TextInput style={styles.input} placeholder="장소 이름 검색" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} />
          {choices.map((p) => (
            <Pressable key={p.id} style={styles.placeRow} onPress={() => onPick(p)}>
              <Text style={styles.emoji}>{CATEGORY_EMOJI[p.category]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.small} numberOfLines={1}>
                  {CATEGORY_LABEL[p.category]} · ★{p.rating.toFixed(1)} · {p.description}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );

  const addSlot = (index: number) =>
    panel?.kind === 'add' && panel.index === index ? (
      <View style={styles.panel}>{busy ? <ActivityIndicator color={colors.accent} /> : placeChooser((p) => run(() => recommender.insertStop(course, index, p)))}</View>
    ) : (
      <Pressable style={styles.addButton} onPress={() => open({ kind: 'add', index })} hitSlop={6}>
        <Text style={styles.addButtonText}>＋ 여기에 일정 추가</Text>
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
    return <View style={{ marginTop: 10 }}>{placeChooser((p) => run(() => recommender.replaceStop(course, index, p)))}</View>;
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ 조건 바꾸기 · 내 코스</Text>
        </Pressable>
        <Text style={styles.eyebrow}>
          {course.request.date} · {slot.emoji} {slot.label} {formatMinute(course.request.startMinute)}–{formatMinute(course.request.endMinute)}
        </Text>
        <Text style={styles.title}>{options.length > 1 ? '마음에 드는 코스를 골라요' : '내 코스'}</Text>
        {note && <Text style={styles.note}>{note}</Text>}

        {options.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.options} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
            {options.map((o, i) => (
              <Pressable
                key={o.title}
                style={[styles.option, i === selected && styles.optionOn]}
                onPress={() => {
                  onSelect(i);
                  setPanel(null);
                }}
              >
                <Text style={styles.optionEmoji}>{o.stops.map((s) => CATEGORY_EMOJI[s.place.category]).join(' ')}</Text>
                <Text style={styles.name} numberOfLines={2}>
                  {optionName(o)}
                </Text>
                <Text style={styles.small} numberOfLines={2}>
                  {o.stops.map((s) => s.place.name).join(' → ')}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Text style={styles.courseTitle}>{course.title}</Text>
        <Text style={styles.muted}>
          {course.stops.length}곳 · 총 이동 {course.totalTravelMinutes}분 · 일정을 탭하면 고칠 수 있어요
        </Text>

        {course.warnings.map((w, i) => (
          <View key={i} style={styles.warning}>
            <Text style={styles.warningText}>⚠️ {w.message}</Text>
          </View>
        ))}

        <View style={{ marginTop: 20 }}>
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
                <View style={styles.stop}>
                  <View style={styles.time}>
                    <Text style={styles.timeMain}>{formatMinute(s.arriveMinute)}</Text>
                    <Text style={styles.small}>{formatMinute(s.leaveMinute)}</Text>
                  </View>
                  <Pressable style={[styles.card, editing && styles.cardOn]} onPress={() => open({ kind: 'edit', index: i })} accessibilityLabel={`${s.place.name} 수정`}>
                    <View style={styles.cardHead}>
                      <Text style={styles.emoji}>{CATEGORY_EMOJI[s.place.category]}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{s.place.name}</Text>
                        <Text style={styles.small}>{s.place.description}</Text>
                      </View>
                      <Text style={styles.editHint}>{editing ? '닫기' : '수정'}</Text>
                    </View>
                    {s.pinned && <Text style={styles.badge}>{s.fixedTime ? '🔒 시간 고정' : s.reason === '직접 추가한 곳' ? '📍 직접 추가' : '📌 꼭 갈 곳'}</Text>}
                    {!s.pinned && s.fixedTime && <Text style={styles.badge}>🔒 시간 고정</Text>}
                    <Text style={styles.reason}>{s.reason}</Text>
                    {stopPanel(i)}
                  </Pressable>
                </View>
                {leg && (
                  <Text style={styles.leg}>
                    {leg.travel.mode === 'walk' ? '🚶 도보' : '🚇 대중교통(어림)'} {leg.travel.minutes}분 · {(leg.travel.distanceMeters / 1000).toFixed(1)}km
                    {s.slackMinutes > 0 ? <Text style={{ color: colors.ok }}> · 여유 {s.slackMinutes}분</Text> : null}
                  </Text>
                )}
                {addSlot(i + 1)}
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
          <Pressable style={styles.button} onPress={onSave}>
            <Text style={styles.buttonText}>이 코스 저장</Text>
          </Pressable>
        )}
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  back: { color: colors.muted, fontSize: 16, marginBottom: 16 },
  eyebrow: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
  note: { color: colors.ok, fontSize: 13, marginTop: 6 },
  options: { marginTop: 16, marginHorizontal: -20, flexGrow: 0 },
  option: { width: 200, padding: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent', gap: 4 },
  optionOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionEmoji: { fontSize: 18, letterSpacing: 2 },
  courseTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 22 },
  text: { color: colors.text, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 15, marginTop: 4 },
  small: { color: colors.muted, fontSize: 12, marginTop: 2 },
  warning: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: colors.warnSoft },
  warningText: { color: colors.warn, fontSize: 13 },
  stop: { flexDirection: 'row', gap: 12 },
  time: { width: 52, alignItems: 'flex-end', paddingTop: 12 },
  timeMain: { color: colors.text, fontSize: 17, fontWeight: '700' },
  card: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  cardOn: { borderColor: colors.accent },
  cardHead: { flexDirection: 'row', gap: 10 },
  emoji: { fontSize: 24 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  editHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  badge: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.accentSoft, color: '#ff9aac', fontSize: 12 },
  reason: { color: '#cfcfd6', fontSize: 13, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#26262f' },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#26262f', borderWidth: 1, borderColor: colors.line, marginRight: 8 },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  leg: { color: colors.muted, fontSize: 13, marginLeft: 64, paddingTop: 10 },
  addButton: { marginLeft: 64, paddingVertical: 8 },
  addButtonText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  panel: { marginLeft: 64, marginVertical: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choices: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choice: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#26262f' },
  choicePrimary: { backgroundColor: colors.accent },
  choiceOn: { borderWidth: 1, borderColor: colors.text },
  choiceText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: '#26262f', color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 6 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.bg },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 8 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  savedNote: { color: colors.ok, fontSize: 14, textAlign: 'center', paddingVertical: 14 },
});
