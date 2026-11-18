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
          expect(options.length).toBeGreaterThanOrEqual(2);
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
        if (options.length === 3) three++;
      }
  expect(three / total).toBeGreaterThan(0.8);
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
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0].stops.some((s) => s.place.name.includes('테마파크'))).toBe(true);
  });

  it('suggests a region that has the typed wish', async () => {
    const { parseActivity } = await import('../../domain/activities');
    const { region } = await suggestRegion(places, undefined, [parseActivity('석촌호수 야경')]);
    expect(region.id).toBe('jamsil');
  });
});
