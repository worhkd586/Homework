import type { PlaceCategory } from './types';

/** "뭘 할지" 예시 칩. 없으면 직접 입력 → 아래 키워드 규칙으로 장소 종류를 찾는다 (유료 AI 없이). */
export interface Activity {
  label: string;
  emoji: string;
  category: PlaceCategory;
  /** 장소 이름·설명·태그에서 찾을 말 (있으면 그 장소를 우선) */
  keywords: string[];
  /**
   * 이 말 중 하나가 장소 이름이나 카카오 분류에 꼭 들어가야 '이 주제'로 친다.
   * 예: 미술관 → 미술관·박물관만 (화방·공방·화랑은 제외). 비어 있으면 종류만 맞으면 된다.
   */
  match?: string[];
}

export const ACTIVITY_EXAMPLES: Activity[] = [
  { label: '미술관·박물관', emoji: '🖼️', category: 'culture', keywords: ['미술관', '박물관', '전시'], match: ['미술관', '박물관', '뮤지엄', '아트센터', '전시관', '기념관'] },
  { label: '공방 체험', emoji: '🧪', category: 'activity', keywords: ['공방', '클래스', '만드는'], match: ['공방', '공예', '클래스', '도자기', '향수', '반지', '체험'] },
  { label: '방탈출·게임', emoji: '🎮', category: 'activity', keywords: ['방탈출', '게임', 'VR', '오락'], match: ['방탈출', '보드', '게임', 'VR', '오락'] },
  { label: '레저·놀이공원', emoji: '🎢', category: 'activity', keywords: ['놀이공원', '테마파크', '레저'], match: ['테마파크', '놀이', '볼링', '클라이밍', '레저', '스포츠', 'VR', '아쿠아리움', '동물원'] },
  { label: '맛집', emoji: '🍽️', category: 'restaurant', keywords: [] },
  { label: '카페·디저트', emoji: '🍰', category: 'cafe', keywords: ['디저트', '케이크', '젤라또'] },
  { label: '산책·야경', emoji: '🌉', category: 'walk', keywords: ['야경', '산책', '호수'], match: ['공원', '야경', '전망', '호수', '한강', '산책', '궁', '숲', '거리', '타워', '길'] },
  { label: '소품샵·쇼핑', emoji: '🛍️', category: 'shop', keywords: ['소품샵', '팝업'], match: ['소품', '잡화', '편집', '문구', '선물', '팝업', '백화점', '쇼핑'] },
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
    if (hit) {
      // 예시와 같은 주제면 그 주제의 기준을 그대로 쓴다 (예: '미술관 가고 싶어' → 미술관·박물관)
      const example = ACTIVITY_EXAMPLES.find((a) => a.category === rule.category && a.match?.some((m) => m.toLowerCase() === hit || hit.startsWith(m.toLowerCase()) || m.toLowerCase().startsWith(hit)));
      return { label: text.trim(), emoji: '✍️', category: rule.category, keywords: [text.trim(), hit], match: example?.match ?? [hit], known: true };
    }
  }
  return { label: text.trim(), emoji: '✍️', category: 'activity', keywords: [text.trim()], match: [text.trim()], known: false };
}
