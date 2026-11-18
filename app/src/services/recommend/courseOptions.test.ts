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
