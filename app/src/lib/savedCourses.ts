import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Course } from '../domain/types';

export interface SavedCourse {
  id: string;
  savedAt: string;
  course: Course;
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
