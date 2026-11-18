import { describe, expect, it } from 'vitest';
import type { CourseRequest, Place } from '../../domain/types';
import { MockPlaceProvider } from '../places/MockPlaceProvider';
import { StraightLineRouteProvider } from '../places/StraightLineRouteProvider';
import { PLACES } from '../places/mockData';
import { RuleBasedRecommender, isOpenDuring } from './RuleBasedRecommender';

const recommender = new RuleBasedRecommender(new MockPlaceProvider(), new StraightLineRouteProvider());
const byName = (name: string): Place => {
  const p = PLACES.find((x) => x.name === name);
  if (!p) throw new Error(name);
  return p;
};
const base = (over: Partial<CourseRequest> = {}): CourseRequest => ({
  regionId: 'seongsu',
  date: '2026-11-21',
  slotId: 'evening',
  startMinute: 17 * 60,
  endMinute: 22 * 60,
  pins: [],
  preferences: [],
  ...over,
});

describe('RuleBasedRecommender', () => {
  it('builds a time-ordered course inside the region with travel legs', async () => {
    const course = await recommender.recommend(base());
    expect(course.stops.length).toBeGreaterThanOrEqual(3);
    expect(course.legs).toHaveLength(course.stops.length - 1);
    for (let i = 1; i < course.stops.length; i++) {
      const prev = course.stops[i - 1];
      const cur = course.stops[i];
      expect(cur.arriveMinute).toBeGreaterThanOrEqual(prev.leaveMinute + course.legs[i - 1].travel.minutes);
    }
    expect(course.stops.every((s) => s.place.regionId === 'seongsu')).toBe(true);
    expect(course.stops[0].arriveMinute).toBe(17 * 60);
    expect(new Set(course.stops.map((s) => s.place.id)).size).toBe(course.stops.length);
  });

  it('keeps a time-fixed pin at its exact time and fills around it', async () => {
    const pasta = byName('붉은벽돌 파스타');
    const course = await recommender.recommend(base({ pins: [{ place: pasta, fixedMinute: 19 * 60 }] }));
    const stop = course.stops.find((s) => s.place.id === pasta.id)!;
    expect(stop.arriveMinute).toBe(19 * 60);
    expect(stop.fixedTime).toBe(true);
    expect(course.stops.some((s) => s.arriveMinute < 19 * 60)).toBe(true);
    expect(course.stops.some((s) => s.arriveMinute > 19 * 60)).toBe(true);
    // 같은 카테고리(식사)를 하나 더 넣지 않는다
    expect(course.stops.filter((s) => s.place.category === 'restaurant')).toHaveLength(1);
  });

  it('places a free pin in the course without duplicating its category', async () => {
    const shop = byName('팝업 거리');
    const course = await recommender.recommend(base({ slotId: 'afternoon', startMinute: 13 * 60, endMinute: 18 * 60, pins: [{ place: shop }] }));
    expect(course.stops.some((s) => s.place.id === shop.id && s.pinned && !s.fixedTime)).toBe(true);
    expect(course.stops.filter((s) => s.place.category === 'shop')).toHaveLength(1);
  });

  it('warns when two fixed pins are too far apart in time', async () => {
    const pasta = byName('붉은벽돌 파스타'); // 성수
    const jazz = byName('라이브 재즈 클럽'); // 홍대
    const course = await recommender.recommend(
      base({ endMinute: 23 * 60, pins: [{ place: pasta, fixedMinute: 19 * 60 }, { place: jazz, fixedMinute: 20 * 60 + 25 }] }),
    );
    expect(course.warnings.some((w) => w.kind === 'tight')).toBe(true);
    expect(course.warnings.some((w) => w.kind === 'outside-region')).toBe(true);
  });

  it('respects preferences and exclusions', async () => {
    const first = await recommender.recommend(base({ preferences: ['조용한'] }));
    const swapped = first.stops.find((s) => !s.pinned)!;
    const again = await recommender.recommend(base({ preferences: ['조용한'], excludePlaceIds: [swapped.place.id] }));
    expect(again.stops.some((s) => s.place.id === swapped.place.id)).toBe(false);
  });

  it('only picks places that are open at the planned time', async () => {
    const course = await recommender.recommend(base({ slotId: 'lunch', startMinute: 11 * 60 + 30, endMinute: 15 * 60 }));
    for (const s of course.stops) expect(isOpenDuring(s.place, s.arriveMinute, s.arriveMinute + 30)).toBe(true);
  });
});

describe('30분 단위 시간표', () => {
  it('snaps every arrival and departure to :00 or :30', async () => {
    const pasta = byName('붉은벽돌 파스타');
    for (const req of [
      base(),
      base({ pins: [{ place: pasta, fixedMinute: 19 * 60 }] }),
      base({ regionId: 'jamsil', slotId: 'night', startMinute: 19 * 60, endMinute: 24 * 60 }),
      base({ regionId: 'hongdae', slotId: 'lunch', startMinute: 11 * 60 + 30, endMinute: 15 * 60 }),
    ]) {
      const course = await recommender.recommend(req);
      for (const s of course.stops) {
        expect(s.arriveMinute % 30).toBe(0);
        expect(s.leaveMinute % 30).toBe(0);
      }
    }
  });
});

describe('isOpenDuring', () => {
  it('handles places open past midnight', () => {
    const bar = byName('을지로 LP바'); // 18:00–02:00
    expect(isOpenDuring(bar, 23 * 60, 25 * 60)).toBe(true);
    expect(isOpenDuring(bar, 15 * 60, 16 * 60)).toBe(false);
  });
});

describe('replacing a stop', () => {
  it('falls back to a similar category when the region has no other candidate', async () => {
    const first = await recommender.recommend(base());
    const gallery = first.stops.find((s) => s.place.category === 'culture');
    expect(gallery).toBeDefined();
    const again = await recommender.recommend(base({ excludePlaceIds: [gallery!.place.id] }));
    expect(again.stops.length).toBe(first.stops.length);
    expect(again.stops.some((s) => s.place.id === gallery!.place.id)).toBe(false);
  });

  it('drops a light stop (walk) before a main one (bar) when time is short', async () => {
    const pasta = byName('붉은벽돌 파스타');
    const course = await recommender.recommend(base({ pins: [{ place: pasta, fixedMinute: 19 * 60 }] }));
    expect(course.stops.some((s) => s.place.category === 'bar')).toBe(true);
    expect(course.stops[course.stops.length - 1].leaveMinute).toBeLessThanOrEqual(22 * 60);
  });
});

describe('insertStop', () => {
  it('adds a place I picked between two stops and keeps 30-minute steps', async () => {
    const course = await recommender.recommend(base());
    const cafe = byName('로스터리 창고');
    const updated = await recommender.insertStop(course, 1, cafe);
    expect(updated.stops).toHaveLength(course.stops.length + 1);
    expect(updated.stops[1].place.id).toBe(cafe.id);
    expect(updated.legs).toHaveLength(updated.stops.length - 1);
    for (const s of updated.stops) expect(s.arriveMinute % 30).toBe(0);
    for (let i = 1; i < updated.stops.length; i++) {
      expect(updated.stops[i].arriveMinute).toBeGreaterThanOrEqual(updated.stops[i - 1].leaveMinute + updated.legs[i - 1].travel.minutes);
    }
  });

  it('recommends a new place for the slot when none is given', async () => {
    const course = await recommender.recommend(base());
    const updated = await recommender.insertStop(course, course.stops.length);
    expect(updated.stops).toHaveLength(course.stops.length + 1);
    const added = updated.stops[updated.stops.length - 1];
    expect(course.stops.some((s) => s.place.id === added.place.id)).toBe(false);
    expect(added.place.regionId).toBe('seongsu');
  });

  it('keeps a fixed-time pin at its time after inserting before it', async () => {
    const pasta = byName('붉은벽돌 파스타');
    const course = await recommender.recommend(base({ pins: [{ place: pasta, fixedMinute: 19 * 60 }] }));
    const idx = course.stops.findIndex((s) => s.place.id === pasta.id);
    const updated = await recommender.insertStop(course, idx);
    expect(updated.stops.find((s) => s.place.id === pasta.id)!.arriveMinute).toBe(19 * 60);
  });
});
