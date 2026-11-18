import type { Course, CourseRequest, PlaceCategory, Region, TimeSlotId } from '../../domain/types';
import { MOODS, getMood, withMeal, type CourseTemplate, type MoodId } from '../../domain/moods';
import type { Activity } from '../../domain/activities';
import { CATEGORY_LABEL } from '../../domain/timeSlots';
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
): Promise<{ region: Region; reason: string }> {
  const mood = moodId ? getMood(moodId) : undefined;
  const wanted = new Set<PlaceCategory>([...(mood?.templates.flatMap((t) => t.flow) ?? []), ...activities.map((a) => a.category)]);
  const keywords = activities.flatMap((a) => a.keywords).map((k) => k.toLowerCase());
  const label = [mood?.label, ...activities.map((a) => a.label)].filter(Boolean).join(', ');
  let best: { region: Region; score: number; hits: number } | undefined;
  for (const region of await shortlist(await places.listRegions(), moodId, activities)) {
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
      flow: ensureActivities(withMeal(template.flow, base.slotId as TimeSlotId), activities),
      title: `${regionName} · ${template.name}`,
      preferences: mood?.preferences ?? [],
      keywords: activities.flatMap((a) => a.keywords),
      wishes: activities.filter((a) => a.match?.length).map((a) => ({ category: a.category, match: a.match! })),
      avoidPlaceIds: [...used],
    };
    const key = (c: Course) => c.stops.map((s) => s.place.id).join(',');
    let course = await recommender.recommend(request);
    // 앞 코스와 똑같이 나오면, 이미 쓴 곳은 아예 빼고 다시 짠다. 그래도 같거나 너무 짧으면 그 코스는 건너뛴다.
    if (courses.some((c) => key(c) === key(course))) {
      course = await recommender.recommend({ ...request, excludePlaceIds: [...(base.excludePlaceIds ?? []), ...used] });
      if (course.stops.length < 2 || courses.some((c) => key(c) === key(course))) continue;
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
