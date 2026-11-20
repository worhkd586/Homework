import { describe, expect, it } from 'vitest';
import type { CourseRequest, Place } from '../../domain/types';
import { MockPlaceProvider } from '../places/MockPlaceProvider';
import { StraightLineRouteProvider } from '../places/StraightLineRouteProvider';
import { PLACES } from '../places/mockData';
import { RuleBasedRecommender, isOpenDuring, popularityPoints } from './RuleBasedRecommender';

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

describe('removeStop', () => {
  it('removes a stop and pulls the next ones earlier', async () => {
    const course = await recommender.recommend(base({ slotId: 'afternoon', startMinute: 13 * 60, endMinute: 18 * 60 }));
    const updated = await recommender.removeStop(course, 1);
    expect(updated.stops).toHaveLength(course.stops.length - 1);
    expect(updated.stops.some((s) => s.place.id === course.stops[1].place.id)).toBe(false);
    expect(updated.legs).toHaveLength(updated.stops.length - 1);
    expect(updated.stops[1].arriveMinute).toBeLessThan(course.stops[2].arriveMinute);
    for (const s of updated.stops) expect(s.arriveMinute % 30).toBe(0);
  });

  it('clears the over-time warning once enough is removed', async () => {
    const course = await recommender.recommend(base());
    const longer = await recommender.insertStop(course, 1);
    expect(longer.warnings.some((w) => w.kind === 'tight')).toBe(true);
    const back = await recommender.removeStop(longer, 1);
    expect(back.warnings.some((w) => w.kind === 'tight')).toBe(false);
  });
});

describe('editing a planned course', () => {
  it('replaces a stop with a recommendation or a picked place', async () => {
    const course = await recommender.recommend(base());
    const recommended = await recommender.replaceStop(course, 1);
    expect(recommended.stops).toHaveLength(course.stops.length);
    expect(recommended.stops[1].place.id).not.toBe(course.stops[1].place.id);
    const cafe = byName('로스터리 창고');
    const picked = await recommender.replaceStop(course, 0, cafe);
    expect(picked.stops[0].place.id).toBe(cafe.id);
  });

  it('fixes a stop to a new 30-minute time and keeps the order by time', async () => {
    const course = await recommender.recommend(base());
    const last = course.stops.length - 1;
    const moved = await recommender.setStopTime(course, last, 17 * 60);
    expect(moved.stops[0].place.id).toBe(course.stops[last].place.id);
    expect(moved.stops[0].arriveMinute).toBe(17 * 60);
    expect(moved.stops[0].fixedTime).toBe(true);
    for (let i = 1; i < moved.stops.length; i++) expect(moved.stops[i].arriveMinute).toBeGreaterThanOrEqual(moved.stops[i - 1].leaveMinute);
  });

  it('unfixes a time', async () => {
    const pasta = byName('붉은벽돌 파스타');
    const course = await recommender.recommend(base({ pins: [{ place: pasta, fixedMinute: 19 * 60 }] }));
    const idx = course.stops.findIndex((s) => s.place.id === pasta.id);
    const free = await recommender.setStopTime(course, idx, undefined);
    const stop = free.stops.find((s) => s.place.id === pasta.id)!;
    expect(stop.fixedTime).toBe(false);
    expect(stop.pinned).toBe(true);
  });
});

describe('preferences and suggestion list', () => {
  const recommender = new RuleBasedRecommender(new MockPlaceProvider(), new StraightLineRouteProvider());
  const base = { regionId: 'seongsu', slotId: 'evening' as const, date: '2026-11-21', startMinute: 17 * 60, endMinute: 22 * 60, pins: [], preferences: [] };

  it('scores places by vibe, budget and indoor/outdoor', async () => {
    const { prefScore } = await import('../../domain/prefs');
    const place = (name: string, category: Place['category'], tags: string[] = []) =>
      ({ id: name, name, regionId: 'x', category, location: { lat: 0, lng: 0 }, rating: 4, openMinute: 0, closeMinute: 1440, tags, description: '' }) as Place;
    expect(prefScore(place('루프탑 와인바', 'bar'), { vibe: 'romantic' }).score).toBeGreaterThan(0);
    expect(prefScore(place('명동 오마카세', 'restaurant'), { budget: 'cheap' }).score).toBeLessThan(0);
    expect(prefScore(place('엄마손 칼국수', 'restaurant'), { budget: 'cheap' }).reasons).toContain('가성비');
    expect(prefScore(place('서울숲', 'walk'), { space: 'indoor' }).score).toBeLessThan(0);
    expect(prefScore(place('서울숲', 'walk'), undefined).score).toBe(0);
  });

  it('keeps every leg walkable when walking only', async () => {
    const course = await recommender.recommend({ ...base, prefs: { walkOnly: true } });
    for (const leg of course.legs) expect(leg.travel.mode).toBe('walk');
  });

  it('lists ranked alternatives with reasons, filtered by kind', async () => {
    const course = await recommender.recommend(base);
    const list = await recommender.suggestStops(course, 1, { category: 'cafe', limit: 5 });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.place.category === 'cafe')).toBe(true);
    expect(list.every((s) => !course.stops.some((st) => st.place.id === s.place.id))).toBe(true);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].score).toBeGreaterThanOrEqual(list[i].score);
    expect(list[0].reason).toMatch(/분/);
  });
});

describe('travel choice (이동 방법)', () => {
  const recommender = new RuleBasedRecommender(new MockPlaceProvider(), new StraightLineRouteProvider());
  const base = { regionId: 'seongsu', slotId: 'evening' as const, date: '2026-11-21', startMinute: 17 * 60, endMinute: 22 * 60, pins: [], preferences: [] };

  it('estimates walk, transit and car differently', async () => {
    const { roughTravel } = await import('../places/geo');
    const a = { lat: 37.5445, lng: 127.056 };
    const far = { lat: 37.5665, lng: 126.99 }; // 약 6km
    expect(roughTravel(a, far, 'walk').mode).toBe('walk');
    expect(roughTravel(a, far, 'transit').mode).toBe('transit');
    const car = roughTravel(a, far, 'car');
    expect(car.mode).toBe('car');
    expect(car.minutes).toBeLessThan(roughTravel(a, far, 'walk').minutes);
    expect(roughTravel(a, { lat: 37.5448, lng: 127.0563 }, 'car').mode).toBe('walk'); // 아주 가까우면 걷기
  });

  it('keeps every leg walkable when walking', async () => {
    const course = await recommender.recommend({ ...base, travel: 'walk' });
    for (const leg of course.legs) {
      expect(leg.travel.mode).toBe('walk');
      expect(leg.travel.distanceMeters).toBeLessThanOrEqual(1600);
    }
  });

  it('uses car times when driving, also after editing', async () => {
    const course = await recommender.recommend({ ...base, regionId: 'jamsil', travel: 'car' });
    const edited = await recommender.insertStop(course, course.stops.length);
    for (const leg of edited.legs) expect(['walk', 'car']).toContain(leg.travel.mode);
  });

  it('treats old saved courses with walkOnly as walking', async () => {
    const { travelChoice } = await import('./RuleBasedRecommender');
    expect(travelChoice({ ...base, prefs: { walkOnly: true } })).toBe('walk');
    expect(travelChoice(base)).toBe('transit');
  });
});

describe('Jeju', () => {
  it('has Jeju regions and suggests within the chosen group', async () => {
    const { ALL_REGIONS } = await import('../../domain/regions');
    const jeju = ALL_REGIONS.filter((r) => r.group === '제주');
    expect(jeju.length).toBeGreaterThanOrEqual(6);
    for (const r of jeju) expect(r.center.lat).toBeLessThan(34);
    const { suggestRegion } = await import('./courseOptions');
    const { MockPlaceProvider: Mock } = await import('../places/MockPlaceProvider');
    const { region } = await suggestRegion(new Mock(ALL_REGIONS, PLACES), 'talk', [], '제주');
    expect(region.group).toBe('제주');
  });
});

describe('date log (데이트 로그)', () => {
  const recommender = new RuleBasedRecommender(new MockPlaceProvider(), new StraightLineRouteProvider());
  const base = { regionId: 'seongsu', slotId: 'evening' as const, date: '2026-11-21', startMinute: 17 * 60, endMinute: 22 * 60, pins: [], preferences: [] };

  it('collects the latest verdict per place across logs', async () => {
    const { placeVerdicts } = await import('../../lib/savedCourses');
    const course = await recommender.recommend(base);
    const [a, b] = course.stops.map((s) => s.place.id);
    const v = placeVerdicts([
      { id: '1', savedAt: '', course, log: { visitedOn: '2026-11-01', ratings: { [a]: 'bad', [b]: 'good' } } },
      { id: '2', savedAt: '', course, log: { visitedOn: '2026-11-10', ratings: { [a]: 'good' } } },
      { id: '3', savedAt: '', course },
    ]);
    expect(v.liked.sort()).toEqual([a, b].sort());
    expect(v.disliked).toEqual([]);
  });

  it('drops places marked bad and brings back places marked good', async () => {
    const first = await recommender.recommend(base);
    const bad = first.stops[0].place.id;
    const again = await recommender.recommend({ ...base, disliked: [bad] });
    expect(again.stops.some((s) => s.place.id === bad)).toBe(false);
    const list = await recommender.suggestStops(first, 1, { limit: 50 });
    const pick = list[list.length - 1].place; // 원래 순위가 낮은 곳
    const boosted = await recommender.suggestStops(first, 1, { limit: 50 });
    const withLike = await recommender.suggestStops({ ...first, request: { ...first.request, liked: [pick.id] } }, 1, { limit: 50 });
    expect(withLike.findIndex((s) => s.place.id === pick.id)).toBeLessThan(boosted.findIndex((s) => s.place.id === pick.id));
    expect(withLike.find((s) => s.place.id === pick.id)!.reason).toContain('전에 좋았던 곳');
    const withDislike = await recommender.suggestStops({ ...first, request: { ...first.request, disliked: [pick.id] } }, 1, { limit: 50 });
    expect(withDislike.some((s) => s.place.id === pick.id)).toBe(false);
  });
});

describe('popularityPoints', () => {
  const base = PLACES[0];
  it('후기가 10배 많으면 20점 더 준다 (멀리 있어도 후기 많은 곳이 앞선다)', () => {
    const few = popularityPoints({ ...base, reviewCount: 99 });
    const many = popularityPoints({ ...base, reviewCount: 9999 });
    expect(Math.round(many - few)).toBe(40);
  });
  it('후기 수가 없으면 별점으로 계산한다', () => {
    expect(popularityPoints({ ...base, reviewCount: undefined, rating: 4.5 })).toBe(90);
  });
});
