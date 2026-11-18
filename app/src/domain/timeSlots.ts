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
