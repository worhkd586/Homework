import type { TimeSlot, TimeSlotId } from './types';

export const TIME_SLOTS: TimeSlot[] = [
  { id: 'lunch', label: '점심', emoji: '🍝', defaultStart: 11 * 60 + 30, defaultEnd: 15 * 60, flow: ['restaurant', 'cafe', 'walk'] },
  { id: 'afternoon', label: '오후', emoji: '☀️', defaultStart: 13 * 60, defaultEnd: 18 * 60, flow: ['activity', 'cafe', 'shop', 'walk'] },
  { id: 'evening', label: '저녁', emoji: '🌆', defaultStart: 17 * 60, defaultEnd: 22 * 60, flow: ['culture', 'restaurant', 'walk', 'bar'] },
  { id: 'night', label: '밤', emoji: '🌙', defaultStart: 19 * 60, defaultEnd: 24 * 60, flow: ['restaurant', 'walk', 'bar'] },
];

export function getTimeSlot(id: TimeSlotId): TimeSlot {
  const slot = TIME_SLOTS.find((s) => s.id === id);
  if (!slot) throw new Error(`unknown time slot: ${id}`);
  return slot;
}

export function formatMinute(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseHHMM(value: string): number {
  const [hh, mm] = value.split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

export const CATEGORY_LABEL: Record<string, string> = {
  restaurant: '식사',
  cafe: '카페',
  activity: '체험',
  culture: '전시·관람',
  shop: '쇼핑',
  walk: '산책',
  bar: '술 한잔',
};

export const CATEGORY_EMOJI: Record<string, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  activity: '🎯',
  culture: '🖼️',
  shop: '🛍️',
  walk: '🌿',
  bar: '🍷',
};

/** 시간 범위로 고를 수 있는 처음과 끝 (30분 단위) */
export const RANGE_FIRST = 10 * 60;
export const RANGE_LAST = 24 * 60;
/** 가장 짧은 데이트 */
export const MIN_RANGE = 60;

/** 고른 시간 범위와 가장 많이 겹치는 시간대 (코스 흐름의 기본값을 정할 때 씀) */
export function slotForRange(start: number, end: number): TimeSlot {
  let best = TIME_SLOTS[0];
  let bestOverlap = -1;
  for (const s of TIME_SLOTS) {
    const overlap = Math.min(end, s.defaultEnd) - Math.max(start, s.defaultStart);
    if (overlap > bestOverlap) {
      best = s;
      bestOverlap = overlap;
    }
  }
  return best;
}

/** 시간대 칩을 누르면 그 시간대의 기본 범위가 고른 범위와 같은지 */
export function isSlotRange(slot: TimeSlot, start: number, end: number): boolean {
  return slot.defaultStart === start && slot.defaultEnd === end;
}

/** "5시간 30분" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ') || '0분';
}
