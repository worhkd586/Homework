import type { Place } from '../../domain/types';
import type { CoursePrefs } from '../../domain/prefs';

/**
 * "데이트 코스로 어울리는가" 판단.
 * 카카오에는 평점이 없어서 블로그 후기 수로 인기를 보는데, 그것만으로는
 * 체인점·흔한 이름·데이트와 안 맞는 메뉴가 위로 올라온다. 그걸 바로잡는 점수들.
 */

/** 어디에나 있는 프랜차이즈 (데이트 코스로는 특별하지 않다) */
const CHAINS = [
  '스타벅스', '투썸', '이디야', '메가커피', '메가MGC', '컴포즈', '빽다방', '할리스', '파스쿠찌', '엔제리너스', '커피빈', '탐앤탐스',
  '폴바셋', '더벤티', '매머드', '설빙', '디저트39', '배스킨', '던킨', '크리스피', '파리바게뜨', '뚜레쥬르', '공차', '쥬씨',
  '맥도날드', '버거킹', '롯데리아', '맘스터치', 'KFC', '서브웨이', '노브랜드', '판다익스프레스', '아웃백', '빕스', '애슐리',
  '김밥천국', '명랑핫도그', '밥플러스', '본죽', '한솥', '역전우동', '홍콩반점', '새마을식당', '백채', '이삭토스트', '봉구스',
  '도레도레', '노티드', '파이브가이즈', '쉐이크쉑', '슈퍼두퍼', '블루보틀 ', '백미당', '놀숲', '벌툰', '캣툰', '하이디라오', '교촌', 'BBQ', 'bhc', '굽네', '미스터피자', '도미노',
];

/** 데이트 식사로 잘 안 고르는 메뉴 (가성비를 고르면 감점 안 함) */
const PLAIN_MEAL = /칼국수|매운탕|찌개|해물탕|순두부|감자탕|해장국|국밥|순대|기사식당|구내식당|도시락|김밥|분식|뷔페|백반|설렁탕|곰탕|추어탕|패스트푸드|푸드코트|족발|보쌈|치킨|중식|중국요리|돈까스|우동/;
/** 데이트 식사로 많이 고르는 메뉴 */
const DATE_MEAL = /양식|이탈리안|이탈리아|프랑스|파스타|스테이크|브런치|오마카세|스시|초밥|일식|와인|비스트로|다이닝|퓨전|태국|베트남|멕시칸|스페인|타파스|한정식|고기|이자카야|레스토랑/;
/** 분위기 좋은 카페 */
const DATE_CAFE = /디저트|갤러리카페|베이커리|제과|티룸|찻집|전통찻집|북카페|루프탑|테라스|로스터리|브런치/;

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 프랜차이즈 지점인가: 잘 알려진 체인이거나, 카카오 분류 끝에 붙는 브랜드 이름이 가게 이름에 들어 있고 '○○점'이면 */
export function isChain(place: Place): boolean {
  const name = squash(place.name);
  if (CHAINS.some((c) => name.startsWith(squash(c)))) return true;
  const brand = place.tags[place.tags.length - 1];
  const branch = /점$/.test(place.name.trim()) && !/본점$/.test(place.name.trim());
  return branch && !!brand && brand.length >= 2 && name.includes(squash(brand)) && place.tags.length >= 3;
}

/** '○○점'으로 끝나는 지점 (체인일 가능성이 높다). 본점은 아님 */
export function isBranch(place: Place): boolean {
  const name = place.name.trim();
  return /\S점$/.test(name) && !/본점$/.test(name);
}

/** 흔한 말로만 된 이름: 블로그 검색에서 다른 글이 잔뜩 걸려서 후기 수가 부풀려진다 */
const COMMON = ['카페', '까페', '커피', '산책', '바다', '제주', '서울', '식당', '맛집', '거리', '갤러리', '하우스', '이야기', '한잔', '와인', '오늘', '더', '본', '집', '정원', '공원', '시장', '본점', '고기', '횟집', '포차', 'the', 'cafe', 'coffee'];
export function isGenericName(place: Place): boolean {
  // 지점 이름('○○점')과 동네 이름('익선동')은 빼고 본다
  const words = place.name.trim().split(/\s+/).filter((w, i, all) => !(i === all.length - 1 && all.length > 1 && /점$/.test(w)));
  let rest = squash(words.filter((w) => !/^\S{2,3}(동|리|읍)$/.test(w)).join(''));
  for (const w of [...COMMON].sort((a, b) => b.length - a.length)) rest = rest.split(squash(w)).join('');
  return rest.length < 2;
}

/** 인기 점수에 쓸 후기 수: 흔한 이름은 부풀려진 만큼 깎는다 */
export function trustedReviews(place: Place): number | undefined {
  const n = place.reviewCount;
  if (n === undefined) return undefined;
  return isGenericName(place) ? Math.min(n, 300) : n;
}

/**
 * 데이트 코스로 어울림 점수 (+/−) 와 화면에 보일 이유.
 * 체인 −35, 지점 −8, 데이트 메뉴 +12, 평범한 한 끼 −20 (가성비면 0), 분위기 카페 +8, 동네 추천 명소 +40
 */
export function dateFit(place: Place, prefs?: CoursePrefs): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const text = `${place.name} ${place.tags.join(' ')}`;
  if (place.pick) {
    score += 40;
    reasons.push('데이트 명소');
  }
  if (isChain(place)) score -= 35;
  else if (isBranch(place)) score -= 8;
  if (place.category === 'restaurant') {
    if (DATE_MEAL.test(text)) score += 12;
    else if (PLAIN_MEAL.test(text) && prefs?.budget !== 'cheap') score -= 20;
  }
  if (place.category === 'cafe' && DATE_CAFE.test(text)) score += 8;
  return { score, reasons };
}

/** 같은 곳의 일부인가 (예: '롯데월드 어드벤처'와 '롯데월드 월드모노레일') — 한 코스에 둘 다 넣지 않는다 */
export function samePlaceFamily(a: Place, b: Place): boolean {
  const head = (p: Place) => squash(p.name.split(' ')[0]);
  const ha = head(a);
  const hb = head(b);
  if (ha.length < 3 || hb.length < 3) return false;
  return ha === hb || (ha.length >= 4 && hb.startsWith(ha)) || (hb.length >= 4 && ha.startsWith(hb));
}
