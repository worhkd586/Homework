import type { Course, CourseRequest, PlaceCategory, Region, TimeSlotId } from '../../domain/types';
import { getMood, withMeal, type MoodId } from '../../domain/moods';
import type { PlaceProvider } from '../places/PlaceProvider';
import type { CourseRecommender } from './CourseRecommender';

/**
 * "어디 갈지" 고민 덜기: 기분에 맞는 장소가 가장 알찬 지역을 고른다.
 * (나중에 두 사람의 출발지를 받으면 "둘 다 가기 편한 곳" 점수를 더한다)
 */
export async function suggestRegion(places: PlaceProvider, moodId: MoodId): Promise<{ region: Region; reason: string }> {
  const mood = getMood(moodId);
  const wanted = new Set<PlaceCategory>(mood.templates.flatMap((t) => t.flow));
  let best: { region: Region; score: number; hits: number } | undefined;
  for (const region of await places.listRegions()) {
    const list = await places.listPlaces(region.id);
    const matches = list.filter((p) => wanted.has(p.category));
    const score =
      matches.reduce((sum, p) => sum + p.rating, 0) + list.filter((p) => p.tags.some((t) => mood.preferences.includes(t))).length * 2;
    if (!best || score > best.score) best = { region, score, hits: matches.length };
  }
  if (!best) throw new Error('지역 정보가 없어요');
  return { region: best.region, reason: `‘${mood.label}’에 맞는 곳이 ${best.hits}곳 모여 있어요` };
}

/** "뭘 할지" 고민 덜기: 기분별로 느낌이 다른 완성 코스 (최대 3개). 서로 장소가 되도록 겹치지 않게 고른다. */
export async function recommendOptions(
  recommender: CourseRecommender,
  base: Omit<CourseRequest, 'flow' | 'title' | 'preferences'>,
  moodId: MoodId,
  regionName: string,
): Promise<Course[]> {
  const mood = getMood(moodId);
  const used = new Set<string>(base.excludePlaceIds ?? []);
  const courses: Course[] = [];
  for (const template of mood.templates) {
    const request: CourseRequest = {
      ...base,
      flow: withMeal(template.flow, base.slotId as TimeSlotId),
      title: `${regionName} · ${template.name}`,
      preferences: mood.preferences,
      avoidPlaceIds: [...used],
    };
    const key = (c: Course) => c.stops.map((s) => s.place.id).join(',');
    let course = await recommender.recommend(request);
    // 앞 코스와 똑같이 나오면, 이미 쓴 곳은 아예 빼고 다시 짠다. 그래도 같거나 너무 짧으면 그 코스는 건너뛴다.
    if (courses.some((c) => key(c) === key(course))) {
      course = await recommender.recommend({ ...request, excludePlaceIds: [...(base.excludePlaceIds ?? []), ...used] });
      if (course.stops.length < 2 || courses.some((c) => key(c) === key(course))) continue;
    }
    course.stops.filter((s) => !s.pinned).forEach((s) => used.add(s.place.id));
    courses.push(course);
  }
  return courses;
}
