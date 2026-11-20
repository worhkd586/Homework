import type { Place } from './types';

/**
 * "내 취향" (선택). 고르지 않으면 점수에 영향 없음.
 * 카카오는 분위기·가격 정보를 주지 않아서, 장소 이름과 카카오 분류에 들어간 말로 어림한다.
 */
export interface CoursePrefs {
  vibe?: VibeId;
  budget?: BudgetId;
  space?: 'indoor' | 'outdoor';
  /** 걸어서만: 장소 사이를 도보(약 1.2km 이내)로만 잇는다 */
  walkOnly?: boolean;
}

export type VibeId = 'quiet' | 'trendy' | 'romantic' | 'view';
export type BudgetId = 'cheap' | 'special';

export const VIBES: Array<{ id: VibeId; label: string; emoji: string; words: string[] }> = [
  { id: 'quiet', label: '조용한', emoji: '🍵', words: ['북카페', '찻집', '티하우스', '전통찻집', '정원', '한옥', '서점', '미술관', '박물관', '갤러리', '수목원', '숲'] },
  { id: 'trendy', label: '힙한', emoji: '🔥', words: ['팝업', '편집', '루프탑', 'LP', '펍', '브루어리', '내추럴', '와인', '칵테일', '베이커리', '디저트', '전시'] },
  { id: 'romantic', label: '로맨틱', emoji: '🌹', words: ['와인', '루프탑', '야경', '이탈리안', '프렌치', '파스타', '스테이크', '전망', '호수', '한강', '다이닝', '비스트로'] },
  { id: 'view', label: '뷰 좋은', emoji: '🌇', words: ['루프탑', '전망', '야경', '한강', '호수', '뷰', '타워', '스카이', '공원', '테라스'] },
];

export const BUDGETS: Array<{ id: BudgetId; label: string; emoji: string; good: string[]; bad: string[] }> = [
  {
    id: 'cheap',
    label: '가성비',
    emoji: '💰',
    good: ['분식', '국수', '칼국수', '백반', '국밥', '떡볶이', '김밥', '라멘', '쌀국수', '순대', '만두', '포장마차', '시장'],
    bad: ['오마카세', '파인다이닝', '코스요리', '호텔', '한우', '스테이크'],
  },
  {
    id: 'special',
    label: '특별한 날',
    emoji: '🥂',
    good: ['오마카세', '파인다이닝', '코스요리', '다이닝', '스테이크', '프렌치', '이탈리안', '호텔', '한우', '스시', '와인'],
    bad: ['분식', '김밥', '떡볶이', '포장마차', '패스트푸드', '편의점'],
  },
];

const text = (place: Place) => `${place.name} ${place.tags.join(' ')} ${place.description}`.toLowerCase();
const hasAny = (place: Place, words: string[]) => {
  const t = text(place);
  return words.some((w) => t.includes(w.toLowerCase()));
};

/** 취향에 맞으면 +, 안 맞으면 − 점수와, 화면에 보여 줄 이유 */
export function prefScore(place: Place, prefs: CoursePrefs | undefined): { score: number; reasons: string[] } {
  if (!prefs) return { score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  const vibe = VIBES.find((v) => v.id === prefs.vibe);
  if (vibe && hasAny(place, vibe.words)) {
    score += 18;
    reasons.push(`‘${vibe.label}’ 취향`);
  }
  const budget = BUDGETS.find((b) => b.id === prefs.budget);
  if (budget && (place.category === 'restaurant' || place.category === 'bar')) {
    if (hasAny(place, budget.good)) {
      score += 15;
      reasons.push(budget.label);
    } else if (hasAny(place, budget.bad)) score -= 25;
  }
  if (prefs.space === 'indoor' && place.category === 'walk') score -= 30;
  if (prefs.space === 'outdoor') {
    if (place.category === 'walk' || hasAny(place, ['공원', '테라스', '루프탑', '한강', '호수', '숲'])) {
      score += 15;
      reasons.push('야외');
    }
  }
  return { score, reasons };
}

export function hasPrefs(prefs: CoursePrefs | undefined): boolean {
  return !!prefs && !!(prefs.vibe || prefs.budget || prefs.space || prefs.walkOnly);
}
