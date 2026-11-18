import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Course } from '../domain/types';
import { CATEGORY_EMOJI, formatMinute, getTimeSlot } from '../domain/timeSlots';
import { colors } from '../ui/theme';

/** 추천 결과: 시간표 + 구간별 이동시간 */
export default function ResultScreen({ course, onBack }: { course: Course; onBack: () => void }) {
  const slot = getTimeSlot(course.request.slotId);
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
                    </View>
                    {s.pinned && (
                      <Text style={styles.badge}>{s.fixedTime ? '🔒 시간 고정' : '📌 꼭 갈 곳'}</Text>
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
  leg: { color: colors.muted, fontSize: 13, marginLeft: 64, paddingVertical: 10 },
});
