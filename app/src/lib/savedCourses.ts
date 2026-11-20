import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Course } from '../domain/types';

export type Verdict = 'good' | 'bad';

/** 데이트 로그: 다녀온 날, 장소마다 좋았어요/별로예요, 한 줄 메모 */
export interface DateLog {
  visitedOn: string; // YYYY-MM-DD
  ratings: Record<string, Verdict>; // placeId → 평가
  memo?: string;
}

export interface SavedCourse {
  id: string;
  savedAt: string;
  course: Course;
  /** 다녀왔어요를 누르면 생긴다 */
  log?: DateLog;
}

/** 로그 전체에서 좋았던 곳 / 별로였던 곳 (같은 곳을 여러 번 평가했으면 가장 최근 것) */
export function placeVerdicts(saved: SavedCourse[]): { liked: string[]; disliked: string[] } {
  const latest = new Map<string, { verdict: Verdict; on: string }>();
  for (const item of saved) {
    if (!item.log) continue;
    for (const [placeId, verdict] of Object.entries(item.log.ratings)) {
      const prev = latest.get(placeId);
      if (!prev || item.log.visitedOn >= prev.on) latest.set(placeId, { verdict, on: item.log.visitedOn });
    }
  }
  const liked: string[] = [];
  const disliked: string[] = [];
  for (const [id, v] of latest) (v.verdict === 'good' ? liked : disliked).push(id);
  return { liked, disliked };
}

/** 오늘 날짜 (기기 시간 기준) YYYY-MM-DD */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const KEY = 'savedCourses.v1';

/** 휴대폰 안에만 저장한다 (서버 없음). 저장소를 못 쓰는 환경에서도 앱은 그대로 동작한다. */
export async function loadSaved(): Promise<SavedCourse[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedCourse[]) : [];
  } catch {
    return [];
  }
}

export async function writeSaved(list: SavedCourse[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 저장 실패해도 화면 상태는 유지
  }
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
