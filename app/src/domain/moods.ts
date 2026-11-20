import type { PlaceCategory, TimeSlotId } from './types';

export type MoodId = 'talk' | 'new' | 'food' | 'active';

export interface CourseTemplate {
  name: string;
  flow: PlaceCategory[];
}

/** "뭘 할지" 고민을 기분 카드 하나로: 기분마다 느낌이 다른 코스 3개 */
export interface Mood {
  id: MoodId;
  label: string;
  emoji: string;
  hint: string;
  /** 장소 고를 때 가산점을 줄 태그 */
  preferences: string[];
  templates: [CourseTemplate, CourseTemplate, CourseTemplate];
}

export const MOODS: Mood[] = [
  {
    id: 'talk',
    label: '조용히 대화',
    emoji: '💬',
    hint: '카페·산책·와인바',
    preferences: ['조용한', '분위기'],
    templates: [
      { name: '카페에서 오래 수다', flow: ['cafe', 'walk', 'bar'] },
      { name: '전시 보고 이야기', flow: ['culture', 'cafe', 'walk'] },
      { name: '걷다가 한잔', flow: ['walk', 'cafe', 'bar'] },
    ],
  },
  {
    id: 'new',
    label: '새로운 체험',
    emoji: '🎨',
    hint: '공방·전시·방탈출',
    preferences: ['체험', '실내'],
    templates: [
      { name: '둘이 만드는 원데이 클래스', flow: ['activity', 'cafe', 'culture'] },
      { name: '전시 + 체험', flow: ['culture', 'activity', 'cafe'] },
      { name: '놀거리 가득', flow: ['activity', 'shop', 'bar'] },
    ],
  },
  {
    id: 'food',
    label: '맛집 탐방',
    emoji: '🍜',
    hint: '식사·디저트·2차',
    preferences: ['디저트', '노포'],
    templates: [
      { name: '밥 → 디저트 → 2차', flow: ['restaurant', 'cafe', 'bar'] },
      { name: '디저트로 시작', flow: ['cafe', 'restaurant', 'walk'] },
      { name: '먹고 걷고 또 먹고', flow: ['restaurant', 'walk', 'restaurant'] },
    ],
  },
  {
    id: 'active',
    label: '활동적으로',
    emoji: '🏃',
    hint: '놀거리·산책·쇼핑',
    preferences: ['활기찬', '야외'],
    templates: [
      { name: '신나게 놀기', flow: ['activity', 'walk', 'shop'] },
      { name: '걷고 노는 하루', flow: ['walk', 'activity', 'cafe'] },
      { name: '구경하고 놀기', flow: ['shop', 'activity', 'walk'] },
    ],
  },
];

export function getMood(id: MoodId): Mood {
  const mood = MOODS.find((m) => m.id === id);
  if (!mood) throw new Error(`unknown mood: ${id}`);
  return mood;
}

/** 식사 시간대(점심·저녁·밤)에는 식사가 없으면 끼워 넣는다 */
export function withMeal(flow: PlaceCategory[], slotId: TimeSlotId): PlaceCategory[] {
  if (slotId === 'afternoon' || flow.includes('restaurant')) return flow;
  const at = slotId === 'evening' ? 1 : 0;
  return [...flow.slice(0, at), 'restaurant', ...flow.slice(at)];
}
