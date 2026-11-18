import type {
  Course,
  CourseLeg,
  CourseRequest,
  CourseStop,
  CourseWarning,
  LatLng,
  PinnedPlace,
  Place,
  PlaceCategory,
} from '../../domain/types';
import { CATEGORY_LABEL, formatMinute, getTimeSlot } from '../../domain/timeSlots';
import type { PlaceProvider, RouteProvider } from '../places/PlaceProvider';
import { defaultStayMinutes } from '../places/mockData';
import type { CourseRecommender } from './CourseRecommender';

/** 시간 배분 단계에서 쓰는 이동시간 어림값 */
const TRAVEL_BUFFER = 15;
/** 체류시간을 줄일 수 있는 하한 (기본값 대비) */
const MIN_STAY_RATIO = 0.6;
/** 시간이 모자랄 때 먼저 빼는 가벼운 일정 */
const LIGHT: PlaceCategory[] = ['walk', 'shop'];
/** 대체 카테고리도 없을 때 마지막으로 찾아볼 카테고리 (늦은 시간에도 열려 있는 곳) */
const LAST_RESORT: PlaceCategory[] = ['walk', 'bar', 'cafe'];
/** 같은 카테고리 후보가 없을 때 대신 찾아볼 카테고리 */
const ALTERNATES: Partial<Record<PlaceCategory, PlaceCategory[]>> = {
  culture: ['activity', 'shop'],
  activity: ['culture', 'shop'],
  shop: ['walk', 'culture'],
  walk: ['shop', 'cafe'],
  cafe: ['walk'],
  bar: ['walk'],
};

type Item =
  | { kind: 'pin'; pin: PinnedPlace }
  | { kind: 'fill'; category: PlaceCategory };

interface Planned {
  place: Place;
  pin?: PinnedPlace;
  reason: string;
}

const stayOf = (place: Place) => place.stayMinutes ?? defaultStayMinutes(place.category);
const itemStay = (item: Item) => (item.kind === 'pin' ? stayOf(item.pin.place) : defaultStayMinutes(item.category));
const minStay = (stay: number) => Math.round(stay * MIN_STAY_RATIO);

export function isOpenDuring(place: Place, from: number, to: number): boolean {
  const open = place.openMinute;
  let close = place.closeMinute;
  if (close <= open) close += 1440;
  if (open === 0 && close >= 1440) return true;
  for (const shift of [0, 1440, -1440]) {
    if (from + shift >= open && to + shift <= close) return true;
  }
  return false;
}

export class RuleBasedRecommender implements CourseRecommender {
  constructor(
    private readonly places: PlaceProvider,
    private readonly routes: RouteProvider,
  ) {}

  async recommend(request: CourseRequest): Promise<Course> {
    const slot = getTimeSlot(request.slotId);
    const regions = await this.places.listRegions();
    const region = regions.find((r) => r.id === request.regionId);
    if (!region) throw new Error(`unknown region: ${request.regionId}`);
    const candidates = await this.places.listPlaces(region.id);
    const warnings: CourseWarning[] = [];

    for (const pin of request.pins) {
      if (pin.place.regionId !== region.id) {
        const other = regions.find((r) => r.id === pin.place.regionId);
        warnings.push({
          kind: 'outside-region',
          message: `‘${pin.place.name}’은(는) ${other?.name ?? '다른 지역'}에 있어요. 코스 범위를 ${other?.name ?? '그 지역'}까지 넓혀서 짰어요.`,
        });
      }
    }

    // 1) 시간대 흐름(식사 → 카페 → …)을 뼈대로, 꼭 갈 곳이 같은 카테고리 자리를 대신 차지한다.
    const fixedPins = request.pins
      .filter((p) => p.fixedMinute !== undefined)
      .sort((a, b) => a.fixedMinute! - b.fixedMinute!);
    const freePins = request.pins.filter((p) => p.fixedMinute === undefined);

    const flow = [...(request.flow ?? slot.flow)];
    const consume = (category: PlaceCategory) => {
      const i = flow.indexOf(category);
      if (i >= 0) flow[i] = 'consumed' as PlaceCategory;
      return i;
    };
    fixedPins.forEach((p) => consume(p.place.category));
    const freeAt = new Map<number, PinnedPlace>();
    const extraFree: PinnedPlace[] = [];
    for (const p of freePins) {
      const i = consume(p.place.category);
      if (i >= 0) freeAt.set(i, p);
      else extraFree.push(p);
    }
    let items: Item[] = [];
    flow.forEach((category, i) => {
      const pin = freeAt.get(i);
      if (pin) items.push({ kind: 'pin', pin });
      else if (category !== ('consumed' as PlaceCategory)) items.push({ kind: 'fill', category });
    });
    // 흐름에 자리가 없는 꼭 갈 곳은 중간에 끼워 넣는다 (동선은 아래에서 다시 맞춘다)
    for (const p of extraFree) items.splice(Math.ceil(items.length / 2), 0, { kind: 'pin', pin: p });

    // 2) 시간 고정 핀을 기준으로 구간을 나누고, 구간마다 들어갈 만큼 배분한다.
    let segments = distribute(items, fixedPins, request.startMinute, request.endMinute);
    const isLight = (it: Item) => it.kind === 'fill' && LIGHT.includes(it.category);
    for (;;) {
      const pinOverflow = segments.overflow.some((it) => it.kind === 'pin');
      const mainOverflow = segments.overflow.some((it) => it.kind === 'fill' && !LIGHT.includes(it.category));
      // 꼭 갈 곳이 넘치면 채움 일정을, 식사·카페 같은 주요 일정이 넘치면 산책·쇼핑을 먼저 뺀다
      let drop = -1;
      if (pinOverflow || mainOverflow) drop = items.findLastIndex(isLight);
      if (drop < 0 && pinOverflow) drop = items.map((it) => it.kind).lastIndexOf('fill');
      if (drop < 0) break;
      items = items.filter((_, i) => i !== drop);
      segments = distribute(items, fixedPins, request.startMinute, request.endMinute);
    }
    for (const it of segments.overflow) {
      if (it.kind === 'pin') {
        // 핀은 버리지 않는다: 마지막 구간 끝에 붙이고 시간표 단계에서 경고한다.
        segments.buckets[segments.buckets.length - 1].push(it);
      }
    }

    const sequence: Item[] = [];
    segments.buckets.forEach((bucket, i) => {
      sequence.push(...bucket);
      if (i < fixedPins.length) sequence.push({ kind: 'pin', pin: fixedPins[i] });
    });

    // 3) 빈 자리에 실제 장소를 고른다: 평점·취향은 높게, 앞뒤 이동시간은 짧게.
    const used = new Set<string>(request.pins.map((p) => p.place.id));
    const excluded = new Set(request.excludePlaceIds ?? []);
    const avoided = new Set(request.avoidPlaceIds ?? []);
    const planned: Planned[] = [];
    let clock = request.startMinute;
    let prevLoc: LatLng = sequence[0]?.kind === 'pin' ? sequence[0].pin.place.location : region.center;

    for (let i = 0; i < sequence.length; i++) {
      const item = sequence[i];
      if (item.kind === 'pin') {
        const { pin } = item;
        if (planned.length) clock += (await this.routes.estimateTravel(prevLoc, pin.place.location)).minutes;
        if (pin.fixedMinute !== undefined) clock = Math.max(clock, pin.fixedMinute);
        planned.push({
          place: pin.place,
          pin,
          reason:
            pin.fixedMinute !== undefined
              ? `${formatMinute(pin.fixedMinute)}에 맞춰 고정한 꼭 갈 곳`
              : '꼭 갈 곳 · 동선에 맞춰 순서를 정했어요',
        });
        clock += stayOf(pin.place);
        prevLoc = pin.place.location;
        continue;
      }

      const nextPin = sequence.slice(i + 1).find((it): it is Extract<Item, { kind: 'pin' }> => it.kind === 'pin');
      const stay = defaultStayMinutes(item.category);
      let best: { place: Place; score: number; travel: number; mode: string } | undefined;
      for (const category of [item.category, ...(ALTERNATES[item.category] ?? []), ...LAST_RESORT]) {
        if (best) break;
        const pool = candidates.filter((p) => p.category === category && !used.has(p.id) && !excluded.has(p.id));
        for (const place of pool) {
          const toHere = await this.routes.estimateTravel(prevLoc, place.location);
          const arrive = clock + (planned.length ? toHere.minutes : 0);
          if (!isOpenDuring(place, arrive, arrive + minStay(stay))) continue;
          const toNext = nextPin ? (await this.routes.estimateTravel(place.location, nextPin.pin.place.location)).minutes : 0;
          const prefHits = place.tags.filter((t) => request.preferences.includes(t)).length;
          const score = place.rating * 12 + prefHits * 8 - toHere.minutes * 0.8 - toNext * 0.4 - (avoided.has(place.id) ? 40 : 0);
          if (!best || score > best.score) best = { place, score, travel: toHere.minutes, mode: toHere.mode };
        }
      }
      if (!best) {
        warnings.push({
          kind: 'unfilled',
          message: `${formatMinute(clock)}쯤 열려 있는 ${CATEGORY_LABEL[item.category]} 장소를 찾지 못해 건너뛰었어요.`,
        });
        continue;
      }
      used.add(best.place.id);
      const prefs = best.place.tags.filter((t) => request.preferences.includes(t));
      const parts = [`${CATEGORY_LABEL[best.place.category]} · ★${best.place.rating.toFixed(1)}`];
      if (prefs.length) parts.push(prefs.map((t) => `‘${t}’`).join(' ') + ' 취향');
      planned.push({ place: best.place, reason: parts.join(' · ') });
      clock += (planned.length > 1 ? best.travel : 0) + stay;
      prevLoc = best.place.location;
    }

    // 4) 실제 이동시간으로 시간표를 확정하고 충돌을 알린다.
    //    30분 단위로 맞추다 끝 시각을 넘기면, 꼭 갈 곳이 아닌 일정을 (산책·쇼핑 먼저) 하나씩 뺀다.
    let legs: CourseLeg[] = [];
    let stops: CourseStop[] = [];
    let scheduleWarnings: CourseWarning[] = [];
    for (;;) {
      legs = [];
      for (let i = 1; i < planned.length; i++) {
        legs.push({
          fromPlaceId: planned[i - 1].place.id,
          toPlaceId: planned[i].place.id,
          travel: await this.routes.estimateTravel(planned[i - 1].place.location, planned[i].place.location),
        });
      }
      scheduleWarnings = [];
      stops = schedule(planned, legs, request, scheduleWarnings);
      const overEnd = stops.length > 0 && stops[stops.length - 1].leaveMinute > request.endMinute;
      if (!overEnd) break;
      let drop = planned.findLastIndex((p) => !p.pin && LIGHT.includes(p.place.category));
      if (drop < 0) drop = planned.findLastIndex((p) => !p.pin);
      if (drop < 0) break;
      planned.splice(drop, 1);
    }
    warnings.push(...scheduleWarnings);

    return {
      title: request.title ?? `${region.name} ${slot.label} 코스`,
      request,
      stops,
      legs,
      warnings,
      totalTravelMinutes: legs.reduce((sum, l) => sum + l.travel.minutes, 0),
    };
  }

  async insertStop(course: Course, index: number, place?: Place): Promise<Course> {
    const request = course.request;
    const planned = toPlanned(course);
    const at = Math.max(0, Math.min(index, planned.length));
    const prev = planned[at - 1];
    const next = planned[at];

    if (place) {
      planned.splice(at, 0, { place, pin: { place }, reason: '직접 추가한 곳' });
    } else {
      // 그 자리에 어울리는 곳: 영업 중이고, 앞뒤 이동이 짧고, 코스에 없던 종류면 가산점
      const candidates = await this.places.listPlaces(request.regionId);
      const used = new Set(planned.map((p) => p.place.id));
      const usedCategories = new Set(planned.map((p) => p.place.category));
      const prevStop = course.stops[at - 1];
      const clock = prevStop ? prevStop.leaveMinute : request.startMinute;
      let best: { place: Place; score: number; travel?: number; mode?: string } | undefined;
      for (const candidate of candidates) {
        if (used.has(candidate.id)) continue;
        const toHere = prev ? await this.routes.estimateTravel(prev.place.location, candidate.location) : undefined;
        const arrive = clock + (toHere?.minutes ?? 0);
        if (!isOpenDuring(candidate, arrive, arrive + minStay(stayOf(candidate)))) continue;
        const toNext = next ? (await this.routes.estimateTravel(candidate.location, next.place.location)).minutes : 0;
        const score =
          candidate.rating * 12 + (usedCategories.has(candidate.category) ? 0 : 10) - (toHere?.minutes ?? 0) * 0.8 - toNext * 0.8;
        if (!best || score > best.score) best = { place: candidate, score, travel: toHere?.minutes, mode: toHere?.mode };
      }
      if (!best) {
        return { ...course, warnings: [...course.warnings, { kind: 'unfilled', message: '그 시간에 열려 있는 추천 장소를 찾지 못했어요.' }] };
      }
      const parts = [`추천 · ${CATEGORY_LABEL[best.place.category]} · ★${best.place.rating.toFixed(1)}`];
      planned.splice(at, 0, { place: best.place, reason: parts.join(' · ') });
    }

    return this.reschedule(course, planned);
  }

  async removeStop(course: Course, index: number): Promise<Course> {
    const planned = toPlanned(course).filter((_, i) => i !== index);
    return this.reschedule(course, planned);
  }

  /** 정해진 순서 그대로 이동시간을 다시 재고 30분 단위 시간표를 다시 짠다 */
  private async reschedule(course: Course, planned: Planned[]): Promise<Course> {
    const legs: CourseLeg[] = [];
    for (let i = 1; i < planned.length; i++) {
      legs.push({
        fromPlaceId: planned[i - 1].place.id,
        toPlaceId: planned[i].place.id,
        travel: await this.routes.estimateTravel(planned[i - 1].place.location, planned[i].place.location),
      });
    }
    const keptIds = new Set(planned.map((p) => p.place.id));
    const warnings: CourseWarning[] = course.warnings.filter(
      (w) => w.kind === 'outside-region' && course.request.pins.some((p) => keptIds.has(p.place.id) && w.message.includes(p.place.name)),
    );
    const stops = schedule(planned, legs, course.request, warnings);
    return { ...course, stops, legs, warnings, totalTravelMinutes: legs.reduce((sum, l) => sum + l.travel.minutes, 0) };
  }
}

function toPlanned(course: Course): Planned[] {
  return course.stops.map((s) => ({
    place: s.place,
    pin: s.pinned ? { place: s.place, fixedMinute: s.fixedTime ? s.arriveMinute : undefined } : undefined,
    reason: s.reason,
  }));
}

function distribute(items: Item[], fixedPins: PinnedPlace[], start: number, end: number) {
  const bounds: Array<[number, number]> = [];
  let from = start;
  for (const pin of fixedPins) {
    bounds.push([from, pin.fixedMinute! - TRAVEL_BUFFER]);
    from = pin.fixedMinute! + stayOf(pin.place) + TRAVEL_BUFFER;
  }
  bounds.push([from, end]);

  const buckets: Item[][] = bounds.map(() => []);
  const overflow: Item[] = [];
  let b = 0;
  let cursor = bounds[0][0];
  for (const item of items) {
    const need = minStay(itemStay(item));
    while (b < bounds.length && cursor + need > bounds[b][1]) {
      b++;
      if (b < bounds.length) cursor = bounds[b][0];
    }
    if (b >= bounds.length) {
      overflow.push(item);
      continue;
    }
    buckets[b].push(item);
    cursor += itemStay(item) + TRAVEL_BUFFER;
  }
  return { buckets, overflow };
}

/** 시간표는 30분 단위(:00 / :30)로 맞춘다 */
const STEP = 30;
const ceilStep = (m: number) => Math.ceil(m / STEP) * STEP;
const floorStep = (m: number) => Math.floor(m / STEP) * STEP;
const roundStep = (m: number) => Math.max(STEP, Math.round(m / STEP) * STEP);

function schedule(planned: Planned[], legs: CourseLeg[], req: CourseRequest, warnings: CourseWarning[]): CourseStop[] {
  const stops: CourseStop[] = [];
  let cursor = ceilStep(req.startMinute);
  for (let i = 0; i < planned.length; i++) {
    const { place, pin, reason } = planned[i];
    const travelIn = i > 0 ? legs[i - 1].travel.minutes : 0;
    const earliest = cursor + travelIn;
    let arrive = ceilStep(earliest);
    const fixed = pin?.fixedMinute;
    if (fixed !== undefined) {
      if (i > 0 && earliest > fixed) {
        const prev = planned[i - 1].place;
        warnings.push({
          kind: 'tight',
          message: `${prev.name} → ${place.name} 이동이 ${travelIn}분이라 ${formatMinute(fixed)} 도착이 빠듯해요. ${place.name}을(를) ${formatMinute(ceilStep(earliest))}로 미룰까요?`,
        });
      }
      arrive = fixed;
    }

    let stay = roundStep(stayOf(place));
    // 다음이 시간 고정이거나 마지막이면, 체류시간을 줄여서라도 맞춘다
    const nextFixed = planned[i + 1]?.pin?.fixedMinute;
    const limit = nextFixed !== undefined ? floorStep(nextFixed - legs[i].travel.minutes) : i === planned.length - 1 ? req.endMinute : undefined;
    if (limit !== undefined && fixed === undefined && arrive + stay > limit) {
      stay = Math.max(roundStep(minStay(stayOf(place))), floorStep(limit - arrive));
    }
    const leave = arrive + stay;
    if (i === planned.length - 1 && leave > req.endMinute) {
      warnings.push({
        kind: 'tight',
        message: `마지막 일정이 끝나는 시각(${formatMinute(leave)})이 원래 종료 시각 ${formatMinute(req.endMinute)}을(를) 넘어요.`,
      });
    }
    if (pin && !isOpenDuring(place, arrive, leave)) {
      warnings.push({
        kind: 'closed',
        message: `‘${place.name}’은(는) ${formatMinute(place.openMinute)}–${formatMinute(place.closeMinute)} 영업이라 ${formatMinute(arrive)} 방문 시간을 확인해 주세요.`,
      });
    }
    stops.push({ place, arriveMinute: arrive, leaveMinute: leave, pinned: !!pin, fixedTime: fixed !== undefined, slackMinutes: 0, reason });
    cursor = leave;
  }
  // 이동하고 남는 시간 = 여유
  for (let i = 0; i < stops.length - 1; i++) {
    stops[i].slackMinutes = Math.max(0, stops[i + 1].arriveMinute - stops[i].leaveMinute - legs[i].travel.minutes);
  }
  return stops;
}
