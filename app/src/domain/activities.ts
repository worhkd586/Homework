import type { PlaceCategory } from './types';

/** "뭘 할지" 예시 칩. 없으면 직접 입력 → 아래 키워드 규칙으로 장소 종류를 찾는다 (유료 AI 없이). */
export interface Activity {
  label: string;
  emoji: string;
  category: PlaceCategory;
  /** 장소 이름·설명·태그에서 찾을 말 (있으면 그 장소를 우선) */
  keywords: string[];
}

export const ACTIVITY_EXAMPLES: Activity[] = [
  { label: '미술관·전시', emoji: '🖼️', category: 'culture', keywords: ['전시', '갤러리', '미디어아트', '사진'] },
  { label: '공방 체험', emoji: '🧪', category: 'activity', keywords: ['공방', '클래스', '만드는'] },
  { label: '방탈출·게임', emoji: '🎮', category: 'activity', keywords: ['방탈출', '게임', 'VR', '오락'] },
  { label: '레저·놀이공원', emoji: '🎢', category: 'activity', keywords: ['놀이공원', '테마파크', '레저'] },
  { label: '맛집', emoji: '🍽️', category: 'restaurant', keywords: [] },
  { label: '카페·디저트', emoji: '🍰', category: 'cafe', keywords: ['디저트', '케이크', '젤라또'] },
  { label: '산책·야경', emoji: '🌉', category: 'walk', keywords: ['야경', '산책', '호수'] },
  { label: '소품샵·쇼핑', emoji: '🛍️', category: 'shop', keywords: ['소품샵', '팝업'] },
  { label: '술 한잔', emoji: '🍷', category: 'bar', keywords: ['와인', '칵테일', '위스키'] },
];

const RULES: Array<{ words: string[]; category: PlaceCategory }> = [
  { words: ['미술', '전시', '갤러리', '박물관', '사진전', '아트', '영화', '공연', '연극', '뮤지컬', '콘서트', '수족관', '아쿠아리움', '전망대'], category: 'culture' },
  { words: ['공방', '클래스', '만들기', '도자기', '향수', '반지', '체험', '방탈출', '보드게임', '게임', '오락', 'vr', '레저', '놀이공원', '테마파크', '볼링', '클라이밍', '서핑', '스케이트', '액티비티', '노래방', '사격', '승마', '카트'], category: 'activity' },
  { words: ['맛집', '밥', '식사', '파스타', '고기', '스시', '초밥', '오마카세', '냉면', '쌀국수', '브런치', '스테이크', '한식', '양식', '일식', '중식'], category: 'restaurant' },
  { words: ['카페', '커피', '디저트', '빵', '베이커리', '케이크', '젤라또', '아이스크림', '차', '찻집'], category: 'cafe' },
  { words: ['산책', '야경', '공원', '호수', '걷기', '한강', '궁', '숲', '노을', '드라이브'], category: 'walk' },
  { words: ['쇼핑', '소품', '팝업', '시장', '편집샵', '구경'], category: 'shop' },
  { words: ['술', '와인', '바', '칵테일', '맥주', '위스키', '이자카야', '포차', '재즈', 'lp'], category: 'bar' },
];

/** 직접 입력한 말을 장소 종류로. 모르는 말이면 known=false로 '체험'에 넣는다. */
export function parseActivity(text: string): Activity & { known: boolean } {
  const t = text.trim().toLowerCase();
  for (const rule of RULES) {
    const hit = rule.words.find((w) => t.includes(w));
    if (hit) return { label: text.trim(), emoji: '✍️', category: rule.category, keywords: [text.trim(), hit], known: true };
  }
  return { label: text.trim(), emoji: '✍️', category: 'activity', keywords: [text.trim()], known: false };
}
