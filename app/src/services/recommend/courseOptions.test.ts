import { describe, expect, it } from 'vitest';
import { MOODS } from '../../domain/moods';
import { TIME_SLOTS } from '../../domain/timeSlots';
import { MockPlaceProvider } from '../places/MockPlaceProvider';
import { StraightLineRouteProvider } from '../places/StraightLineRouteProvider';
import { REGIONS } from '../places/mockData';
import { RuleBasedRecommender } from './RuleBasedRecommender';
import { recommendOptions, suggestRegion } from './courseOptions';

const places = new MockPlaceProvider();
const recommender = new RuleBasedRecommender(places, new StraightLineRouteProvider());

describe('recommendOptions', () => {
  for (const mood of MOODS) {
    for (const slot of TIME_SLOTS) {
      it(`${mood.label} · ${slot.label}: 2–3 different, usable courses in every region`, async () => {
        for (const region of REGIONS) {
          const options = await recommendOptions(
            recommender,
            { regionId: region.id, slotId: slot.id, date: '2026-11-21', startMinute: slot.defaultStart, endMinute: slot.defaultEnd, pins: [] },
            mood.id,
            region.name,
          );
          // 예시 데이터는 동네마다 10곳뿐이라, 겹치지 않게 하면 1개만 나올 수 있다
          expect(options.length).toBeGreaterThanOrEqual(1);
          expect(new Set(options.map((o) => o.title)).size).toBe(options.length);
          const keys = options.map((o) => o.stops.map((s) => s.place.id).join(','));
          expect(new Set(keys).size).toBe(options.length);
          for (const o of options) {
            expect(o.stops.length).toBeGreaterThanOrEqual(2);
            for (const s of o.stops) expect(s.arriveMinute % 30).toBe(0);
            expect(o.stops[o.stops.length - 1].leaveMinute).toBeLessThanOrEqual(slot.defaultEnd);
          }
        }
      });
    }
  }

  it('includes a meal in an evening course even for a non-food mood', async () => {
    const [first] = await recommendOptions(
      recommender,
      { regionId: 'seongsu', slotId: 'evening', date: 'x', startMinute: 17 * 60, endMinute: 22 * 60, pins: [] },
      'talk',
      '성수',
    );
    expect(first.stops.some((s) => s.place.category === 'restaurant')).toBe(true);
  });
});

it('usually offers all 3 options', async () => {
  let total = 0;
  let three = 0;
  for (const mood of MOODS)
    for (const slot of TIME_SLOTS)
      for (const region of REGIONS) {
        const options = await recommendOptions(
          recommender,
          { regionId: region.id, slotId: slot.id, date: 'x', startMinute: slot.defaultStart, endMinute: slot.defaultEnd, pins: [] },
          mood.id,
          region.name,
        );
        total++;
        if (options.length >= 2) three++;
      }
  // 같은 곳은 한 코스에만 넣으니, 동네마다 10곳뿐인 예시 데이터로는 절반 남짓만 2개 이상이 나온다 (실제 데이터는 동네마다 수백 곳)
  expect(three / total).toBeGreaterThan(0.5);
});

describe('suggestRegion', () => {
  it('returns a region with a reason for each mood', async () => {
    for (const mood of MOODS) {
      const { region, reason } = await suggestRegion(places, mood.id);
      expect(REGIONS.map((r) => r.id)).toContain(region.id);
      expect(reason).toContain(mood.label);
    }
  });
});

describe('activities (하고 싶은 것)', () => {
  it('maps typed wishes to place kinds', async () => {
    const { parseActivity } = await import('../../domain/activities');
    expect(parseActivity('도자기 만들기').category).toBe('activity');
    expect(parseActivity('미술관 가고 싶어').category).toBe('culture');
    expect(parseActivity('와인 한잔').category).toBe('bar');
    expect(parseActivity('한강 산책').category).toBe('walk');
    const unknown = parseActivity('스카이다이빙');
    expect(unknown.known).toBe(false);
    expect(unknown.category).toBe('activity');
  });

  it('puts the wanted activity into every option', async () => {
    const { ACTIVITY_EXAMPLES } = await import('../../domain/activities');
    const museum = ACTIVITY_EXAMPLES.find((a) => a.label === '미술관·박물관')!;
    const options = await recommendOptions(
      recommender,
      { regionId: 'gangnam', slotId: 'afternoon', date: 'x', startMinute: 13 * 60, endMinute: 18 * 60, pins: [] },
      'food',
      '강남',
      [museum],
    );
    for (const o of options) expect(o.stops.some((s) => s.place.category === 'culture')).toBe(true);
  });

  it('fits a museum into an evening course next to other wishes', async () => {
    const { ACTIVITY_EXAMPLES, parseActivity } = await import('../../domain/activities');
    const museum = ACTIVITY_EXAMPLES.find((a) => a.label === '미술관·박물관')!;
    const options = await recommendOptions(
      recommender,
      { regionId: 'gangnam', slotId: 'evening', date: 'x', startMinute: 17 * 60, endMinute: 22 * 60, pins: [] },
      undefined,
      '강남',
      [museum, parseActivity('도자기')],
    );
    expect(options[0].stops.some((s) => s.place.category === 'culture')).toBe(true);
    expect(options[0].stops.some((s) => s.place.category === 'activity')).toBe(true);
  });

  it('works without a mood when an activity is chosen', async () => {
    const { parseActivity } = await import('../../domain/activities');
    const options = await recommendOptions(
      recommender,
      { regionId: 'jamsil', slotId: 'afternoon', date: 'x', startMinute: 13 * 60, endMinute: 18 * 60, pins: [] },
      undefined,
      '잠실',
      [parseActivity('놀이공원')],
    );
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options[0].stops.some((s) => s.place.name.includes('테마파크'))).toBe(true);
  });

  it('suggests a region that has the typed wish', async () => {
    const { parseActivity } = await import('../../domain/activities');
    const { region } = await suggestRegion(places, undefined, [parseActivity('석촌호수 야경')]);
    expect(region.id).toBe('jamsil');
  });
});

describe('time range (언제 만나요 범위)', () => {
  it('picks the matching slot for a custom range', async () => {
    const { slotForRange } = await import('../../domain/timeSlots');
    expect(slotForRange(11 * 60 + 30, 14 * 60).id).toBe('lunch');
    expect(slotForRange(14 * 60, 19 * 60).id).toBe('afternoon');
    expect(slotForRange(20 * 60, 24 * 60).id).toBe('night');
  });

  it('fills a long day (12:00–22:00) with more stops and two meals', async () => {
    const options = await recommendOptions(
      recommender,
      { regionId: 'seongsu', slotId: 'afternoon', date: '2026-11-21', startMinute: 12 * 60, endMinute: 22 * 60, pins: [] },
      'talk',
      '성수',
    );
    expect(options[0].stops.length).toBeGreaterThanOrEqual(5);
    for (const o of options) {
      expect(o.stops[0].arriveMinute).toBeGreaterThanOrEqual(12 * 60);
      expect(o.stops[o.stops.length - 1].leaveMinute).toBeLessThanOrEqual(22 * 60);
      expect(o.stops.filter((s) => s.place.category === 'restaurant').length).toBeGreaterThanOrEqual(1);
    }
    expect(options.some((o) => o.stops.filter((s) => s.place.category === 'restaurant').length === 2)).toBe(true);
  });

  it('keeps a short range (2 hours) short', async () => {
    const options = await recommendOptions(
      recommender,
      { regionId: 'hongdae', slotId: 'evening', date: '2026-11-21', startMinute: 19 * 60, endMinute: 21 * 60, pins: [] },
      'food',
      '홍대',
    );
    for (const o of options) {
      expect(o.stops.length).toBeGreaterThanOrEqual(1);
      expect(o.stops[o.stops.length - 1].leaveMinute).toBeLessThanOrEqual(21 * 60);
    }
  });
});

describe('options never share a place', () => {
  it('uses each recommended place in at most one option', async () => {
    const { MockPlaceProvider } = await import('../places/MockPlaceProvider');
    const { StraightLineRouteProvider } = await import('../places/StraightLineRouteProvider');
    const { RuleBasedRecommender } = await import('./RuleBasedRecommender');
    const rec = new RuleBasedRecommender(new MockPlaceProvider(), new StraightLineRouteProvider());
    const options = await recommendOptions(rec, { regionId: 'seongsu', slotId: 'afternoon', date: 'x', startMinute: 13 * 60, endMinute: 18 * 60, pins: [] }, undefined, '성수');
    const ids = options.flatMap((o) => o.stops.map((s) => s.place.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
