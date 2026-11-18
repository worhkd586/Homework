import { Fragment, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Course, Place } from '../domain/types';
import { CATEGORY_EMOJI, CATEGORY_LABEL, formatMinute, getTimeSlot } from '../domain/timeSlots';
import { placeProvider, recommender } from '../lib/services';
import { colors } from '../ui/theme';

/** 추천 결과: 시간표 + 구간별 이동시간 */
interface Props {
  course: Course;
  onChange: (course: Course) => void;
  onBack: () => void;
}

export default function ResultScreen({ course, onChange, onBack }: Props) {
  const slot = getTimeSlot(course.request.slotId);
  // 일정 추가: addingAt = 끼워 넣을 자리, picking = 직접 고르기 목록 열림
  const [addingAt, setAddingAt] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    placeProvider.listPlaces(course.request.regionId).then(setPlaces);
  }, [course.request.regionId]);

  function openAdd(index: number) {
    setAddingAt(addingAt === index ? null : index);
    setPicking(false);
    setQuery('');
  }

  async function remove(index: number) {
    setBusy(true);
    try {
      onChange(await recommender.removeStop(course, index));
      setAddingAt(null);
    } finally {
      setBusy(false);
    }
  }

  async function add(place?: Place) {
    if (addingAt === null) return;
    setBusy(true);
    try {
      onChange(await recommender.insertStop(course, addingAt, place));
      setAddingAt(null);
      setPicking(false);
    } finally {
      setBusy(false);
    }
  }

  const inCourse = new Set(course.stops.map((s) => s.place.id));
  const choices = places.filter((p) => !inCourse.has(p.id) && (!query || p.name.includes(query) || p.description.includes(query)));

  const addPanel = (index: number) =>
    addingAt !== index ? (
      <Pressable style={styles.addButton} onPress={() => openAdd(index)} hitSlop={6}>
        <Text style={styles.addButtonText}>＋ 여기에 일정 추가</Text>
      </Pressable>
    ) : (
      <View style={styles.addPanel}>
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <View style={styles.addChoices}>
              <Pressable style={[styles.addChoice, styles.addChoicePrimary]} onPress={() => add()}>
                <Text style={styles.addChoiceText}>✨ 추천받기</Text>
              </Pressable>
              <Pressable style={[styles.addChoice, picking && styles.addChoiceOn]} onPress={() => setPicking(!picking)}>
                <Text style={styles.addChoiceText}>📍 직접 고르기</Text>
              </Pressable>
              <Pressable onPress={() => setAddingAt(null)} hitSlop={10}>
                <Text style={styles.muted}>✕</Text>
              </Pressable>
            </View>
            {picking && (
              <View style={{ marginTop: 10 }}>
                <TextInput style={styles.input} placeholder="장소 이름 검색" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} />
                {choices.map((p) => (
                  <Pressable key={p.id} style={styles.placeRow} onPress={() => add(p)}>
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
        )}
      </View>
    );
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ 다시 고르기</Text>
        </Pressable>
        <Text style={styles.eyebrow}>
          {slot.emoji} {slot.label} {formatMinute(course.request.startMinute)}–{formatMinute(course.request.endMinute)}
        </Text>
        <Text style={styles.title}>{course.title}</Text>
        <Text style={styles.muted}>
          {course.stops.length}곳 · 총 이동 {course.totalTravelMinutes}분
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
              {addPanel(0)}
            </>
          )}
          {course.stops.map((s, i) => {
            const leg = course.legs[i];
            return (
              <Fragment key={s.place.id}>
                <View style={styles.stop}>
                  <View style={styles.time}>
                    <Text style={styles.timeMain}>{formatMinute(s.arriveMinute)}</Text>
                    <Text style={styles.small}>{formatMinute(s.leaveMinute)}</Text>
                  </View>
                  <View style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.emoji}>{CATEGORY_EMOJI[s.place.category]}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{s.place.name}</Text>
                        <Text style={styles.small}>{s.place.description}</Text>
                      </View>
                      <Pressable onPress={() => remove(i)} disabled={busy} hitSlop={10} accessibilityLabel={`${s.place.name} 삭제`}>
                        <Text style={styles.remove}>✕</Text>
                      </Pressable>
                    </View>
                    {s.pinned && (
                      <Text style={styles.badge}>{s.fixedTime ? '🔒 시간 고정' : s.reason === '직접 추가한 곳' ? '📍 직접 추가' : '📌 꼭 갈 곳'}</Text>
                    )}
                    <Text style={styles.reason}>{s.reason}</Text>
                  </View>
                </View>
                {leg && (
                  <Text style={styles.leg}>
                    {leg.travel.mode === 'walk' ? '🚶 도보' : '🚇 대중교통(어림)'} {leg.travel.minutes}분 · {(leg.travel.distanceMeters / 1000).toFixed(1)}km
                    {s.slackMinutes > 0 ? <Text style={{ color: colors.ok }}> · 여유 {s.slackMinutes}분</Text> : null}
                  </Text>
                )}
                {addPanel(i + 1)}
              </Fragment>
            );
          })}
        </View>

        <Text style={[styles.small, { marginTop: 24 }]}>장소는 아직 목업 데이터예요. 네이버 지도를 연결하면 실제 장소로 바뀝니다.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  back: { color: colors.muted, fontSize: 16, marginBottom: 16 },
  eyebrow: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
  muted: { color: colors.muted, fontSize: 15, marginTop: 4 },
  small: { color: colors.muted, fontSize: 12, marginTop: 2 },
  warning: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: colors.warnSoft },
  warningText: { color: colors.warn, fontSize: 13 },
  stop: { flexDirection: 'row', gap: 12 },
  time: { width: 52, alignItems: 'flex-end', paddingTop: 12 },
  timeMain: { color: colors.text, fontSize: 17, fontWeight: '700' },
  card: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.card },
  cardHead: { flexDirection: 'row', gap: 10 },
  emoji: { fontSize: 24 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.accentSoft, color: '#ff9aac', fontSize: 12 },
  reason: { color: '#cfcfd6', fontSize: 13, marginTop: 8 },
  leg: { color: colors.muted, fontSize: 13, marginLeft: 64, paddingTop: 10 },
  remove: { color: colors.muted, fontSize: 16, paddingHorizontal: 2 },
  addButton: { marginLeft: 64, paddingVertical: 8 },
  addButtonText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  addPanel: { marginLeft: 64, marginVertical: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft },
  addChoices: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addChoice: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: colors.card },
  addChoicePrimary: { backgroundColor: colors.accent },
  addChoiceOn: { borderWidth: 1, borderColor: colors.text },
  addChoiceText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 6 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
