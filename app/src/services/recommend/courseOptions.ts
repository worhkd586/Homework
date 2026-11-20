import type { Course, CourseRequest, PlaceCategory, Region, TimeSlotId } from '../../domain/types';
import { MOODS, getMood, withMeal, type CourseTemplate, type MoodId } from '../../domain/moods';
import type { Activity } from '../../domain/activities';
import { CATEGORY_LABEL, TIME_SLOTS } from '../../domain/timeSlots';
import { defaultStayMinutes } from '../places/mockData';
import type { PlaceProvider } from '../places/PlaceProvider';
import type { CourseRecommender } from './CourseRecommender';

/**
 * "어디 갈지" 고민 덜기: 기분에 맞는 장소가 가장 알찬 지역을 고른다.
 * (나중에 두 사람의 출발지를 받으면 "둘 다 가기 편한 곳" 점수를 더한다)
 */
export async function suggestRegion(
  places: PlaceProvider,
  moodId: MoodId | undefined,
  activities: Activity[] = [],
  group?: Region['group'],
): Promise<{ region: Region; reason: string }> {
  const mood = moodId ? getMood(moodId) : undefined;
  const wanted = new Set<PlaceCategory>([...(mood?.templates.flatMap((t) => t.flow) ?? []), ...activities.map((a) => a.category)]);
  const keywords = activities.flatMap((a) => a.keywords).map((k) => k.toLowerCase());
  const label = [mood?.label, ...activities.map((a) => a.label)].filter(Boolean).join(', ');
  let best: { region: Region; score: number; hits: number } | undefined;
  for (const region of await shortlist((await places.listRegions()).filter((r) => !group || (r.group ?? '서울') === group), moodId, activities)) {
    const list = await places.listPlaces(region.id);
    const matches = list.filter((p) => wanted.has(p.category));
    const keywordHits = list.filter((p) => keywords.some((k) => `${p.name} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(k))).length;
    const score =
      matches.reduce((sum, p) => sum + p.rating, 0) +
      list.filter((p) => p.tags.some((t) => mood?.preferences.includes(t))).length * 2 +
      keywordHits * 5;
    if (!best || score > best.score) best = { region, score, hits: matches.length };
  }
  if (!best) throw new Error('지역 정보가 없어요');
  return { region: best.region, reason: `‘${label}’에 맞는 곳이 ${best.hits}곳 모여 있어요` };
}

/** 기분별로 잘 맞는 동네 특징 */
const MOOD_WORDS: Record<MoodId, string[]> = {
  talk: ['카페', '산책', '한옥', '술', '와인', '호수'],
  new: ['전시', '미술관', '공방', '체험', '팝업', '박물관'],
  food: ['맛집', '카페', '노포', '술'],
  active: ['방탈출', '놀이공원', '게임', '레저', '보드게임', '테마파크'],
};

/**
 * 지역이 많아서 전부 실제 장소를 불러오면 느리고 쿼터도 많이 쓴다.
 * 동네 특징(strengths)으로 먼저 3곳만 추린 뒤, 그 3곳만 실제 장소로 점수를 매긴다.
 */
export function shortlist(regions: Region[], moodId: MoodId | undefined, activities: Activity[], size = 3): Region[] {
  if (regions.length <= size) return regions;
  const words = [
    ...(moodId ? MOOD_WORDS[moodId] : []),
    ...activities.flatMap((a) => [a.label, ...a.keywords, ...(a.match ?? [])]),
  ].map((w) => w.toLowerCase());
  const scored = regions.map((r, i) => {
    const text = `${r.name} ${r.tagline}`.toLowerCase();
    const strengths = (r.strengths ?? []).map((s) => s.toLowerCase());
    const hits = strengths.filter((s) => words.some((w) => w.includes(s) || s.includes(w))).length;
    const named = words.some((w) => w.length >= 2 && text.includes(w)) ? 3 : 0; // '석촌호수 야경'처럼 동네 이름을 말하면
    const nameHit = activities.some((a) => a.label.split(' ').some((part) => part.length >= 2 && text.includes(part.toLowerCase()))) ? 5 : 0;
    return { r, score: hits + named + nameHit, i };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, size)
    .map((x) => x.r);
}

/** 기분을 안 골랐을 때 쓰는 기본 코스 3개 */
const MIXED: CourseTemplate[] = [MOODS[0].templates[0], MOODS[1].templates[0], MOODS[2].templates[0]];

/** 식사 시각: 이 사이에 시계가 오면 식사를 넣는다 */
const LUNCH: [number, number] = [11 * 60, 12 * 60 + 30];
const DINNER: [number, number] = [17 * 60, 19 * 60 + 30];

/**
 * 고른 시간에 맞춰 일정 순서를 짠다 (짧든 길든 항상).
 * - 점심(11:00~12:30)·저녁(17:00~19:30) 시각이 되면 식사를 넣고, 그 밖의 시각엔 식사를 넣지 않는다
 * - 나머지는 원래 흐름 순서대로 쓰되, 술은 18시 이후 · 저녁 먹은 뒤, 전시는 16시 반 전에만
 * - 같은 종류는 한 번만 (카페는 8시간 넘으면 두 번, 산책은 7시간 넘으면 두 번)
 * - 원래 흐름을 다 쓰면 그 시각의 시간대 흐름에서 아직 안 쓴 종류로 채운다 (최대 7곳)
 * - 맛집을 원했는데 식사 시각이 없으면 맨 앞에 식사를 넣는다
 */
export function fitFlowToRange(flow: PlaceCategory[], start: number, end: number, must: PlaceCategory[] = []): PlaceCategory[] {
  const span = end - start;
  const limit = (c: PlaceCategory) => (c === 'restaurant' ? 2 : c === 'cafe' && span >= 8 * 60 ? 2 : c === 'walk' && span >= 7 * 60 ? 2 : 1);
  const queue = flow.filter((c) => c !== 'restaurant');
  const out: PlaceCategory[] = [];
  const count = (c: PlaceCategory) => out.filter((x) => x === c).length;
  const dinnerPlanned = () => DINNER[1] <= start || out.includes('restaurant') || end < DINNER[0] + 60;
  const fits = (c: PlaceCategory, clock: number) =>
    c !== 'restaurant' &&
    c !== out[out.length - 1] &&
    count(c) < limit(c) &&
    (c !== 'bar' || (clock >= 18 * 60 && dinnerPlanned())) &&
    (c !== 'culture' || clock <= 16 * 60 + 30);
  let clock = start;
  let lunch = false;
  let dinner = false;
  while (out.length < 7 && end - clock > 60) {
    let next: PlaceCategory | undefined;
    if (!lunch && clock >= LUNCH[0] && clock <= LUNCH[1]) {
      next = 'restaurant';
      lunch = true;
    } else if (!dinner && clock >= DINNER[0] && clock <= DINNER[1]) {
      next = 'restaurant';
      dinner = true;
    } else {
      const i = queue.findIndex((c) => fits(c, clock));
      if (i >= 0) next = queue.splice(i, 1)[0];
      else {
        const slot = TIME_SLOTS.find((t) => clock >= t.defaultStart && clock < t.defaultEnd) ?? TIME_SLOTS[TIME_SLOTS.length - 1];
        next = [...slot.flow, 'cafe', 'walk', 'shop'].filter((c) => fits(c as PlaceCategory, clock)).sort((x, y) => count(x as PlaceCategory) - count(y as PlaceCategory))[0] as PlaceCategory | undefined;
      }
    }
    if (!next) {
      // 지금 시각엔 넣을 게 없으면 (예: 17시 전인데 남은 게 술뿐) 30분 기다렸다가 다시 본다
      clock += 30;
      continue;
    }
    out.push(next);
    clock += defaultStayMinutes(next) + 15;
  }
  if (flow.includes('restaurant') && !out.includes('restaurant')) out.unshift('restaurant');
  // 꼭 하고 싶다고 고른 것은 시간이 안 맞아도 넣는다: 전시·체험은 맨 앞(일찍 닫으니까), 나머지는 술 앞
  for (const c of must) {
    if (out.includes(c)) continue;
    if (c === 'culture' || c === 'activity') out.unshift(c);
    else {
      const bar = out.indexOf('bar');
      out.splice(bar >= 0 ? bar : out.length, 0, c);
    }
  }
  return out.length ? out : flow;
}

/** 하고 싶은 것(활동)이 흐름에 없으면 넣는다: 식사·이미 원하는 것 말고 앞쪽 하나를 바꾸고, 없으면 덧붙인다 */
export function ensureActivities(flow: PlaceCategory[], activities: Activity[]): PlaceCategory[] {
  const out = [...flow];
  const wanted = [...new Set(activities.map((a) => a.category))];
  for (const category of wanted) {
    if (out.includes(category)) continue;
    // 앞쪽부터 바꾼다: 전시·체험은 늦으면 문을 닫는 곳이 많다
    const swap = out.map((c, i) => ({ c, i })).find(({ c }) => c !== 'restaurant' && !wanted.includes(c));
    if (swap) out[swap.i] = category;
    else out.push(category);
  }
  return out;
}

/** "뭘 할지" 고민 덜기: 기분·하고 싶은 것에 맞춰 느낌이 다른 완성 코스 (최대 3개). 서로 장소가 되도록 겹치지 않게 고른다. */
export async function recommendOptions(
  recommender: CourseRecommender,
  base: Omit<CourseRequest, 'flow' | 'title' | 'preferences'>,
  moodId: MoodId | undefined,
  regionName: string,
  activities: Activity[] = [],
): Promise<Course[]> {
  const mood = moodId ? getMood(moodId) : undefined;
  const used = new Set<string>(base.excludePlaceIds ?? []);
  const courses: Course[] = [];
  for (const template of mood?.templates ?? MIXED) {
    const request: CourseRequest = {
      ...base,
      flow: fitFlowToRange(
        ensureActivities(withMeal(template.flow, base.slotId as TimeSlotId), activities),
        base.startMinute,
        base.endMinute,
        activities.map((a) => a.category),
      ),
      title: `${regionName} · ${template.name}`,
      preferences: mood?.preferences ?? [],
      keywords: activities.flatMap((a) => a.keywords),
      wishes: activities.filter((a) => a.match?.length).map((a) => ({ category: a.category, match: a.match! })),
      avoidPlaceIds: [...used],
      // 앞 코스에 나온 곳은 다른 코스에 다시 넣지 않는다 (같은 곳은 한 코스에만)
      excludePlaceIds: [...(base.excludePlaceIds ?? []), ...used],
    };
    const key = (c: Course) => c.stops.map((s) => s.place.id).join(',');
    let course = await recommender.recommend(request);
    // 겹치지 않는 곳으로는 제대로 된 코스가 안 나오면 (너무 짧거나, 하고 싶은 걸 못 넣으면) 그 안은 빼고 보여 준다
    if (courses.length) {
      const tooShort = course.stops.length < Math.max(2, Math.ceil(courses[0].stops.length * 0.6));
      const missesWish = activities.some((a) => !course.stops.some((st) => st.place.category === a.category));
      if (tooShort || missesWish || courses.some((c) => key(c) === key(course))) continue;
    }
    // 하고 싶은 것으로 흐름을 바꿨으면, 템플릿 이름 대신 실제 순서를 이름으로 쓴다 (예: 전시 → 식사 → 체험)
    if (activities.length > 0) {
      let title = `${regionName} · ${course.stops.map((st) => CATEGORY_LABEL[st.place.category]).join(' → ')}`;
      if (courses.some((c) => c.title === title)) title += ` (${courses.length + 1})`;
      course.title = title;
    }
    course.stops.filter((s) => !s.pinned).forEach((s) => used.add(s.place.id));
    courses.push(course);
  }
  return courses;
}
