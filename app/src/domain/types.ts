/** 위경도 좌표 */
export interface LatLng {
  lat: number;
  lng: number;
}

export type PlaceCategory =
  | 'restaurant' // 식사
  | 'cafe' // 카페·디저트
  | 'activity' // 체험·액티비티
  | 'culture' // 전시·공연
  | 'shop' // 소품샵·쇼핑
  | 'walk' // 산책·야경
  | 'bar'; // 술집·바

export interface Region {
  id: string;
  name: string;
  tagline: string;
  center: LatLng;
  /** 지역 고르기 화면의 묶음 */
  group?: '서울' | '경기' | '제주';
  /** 장소를 찾을 반경(m). 교외는 넓게 */
  radius?: number;
  /** 이 동네가 잘하는 것 (지역 추천의 1차 후보를 고를 때 씀) */
  strengths?: string[];
  /** 이 동네의 이름난 데이트 명소. 카카오에서 이름으로 찾아 후보에 더하고 가산점을 준다 */
  picks?: string[];
  /** 해시태그처럼 블로그에서 함께 검색할 동네 이름 (없으면 이름에서 만든다) */
  hashtags?: string[];
}

export interface Place {
  id: string;
  name: string;
  regionId: string;
  category: PlaceCategory;
  location: LatLng;
  /** 0~5. 실제 데이터에서는 블로그 후기 수로 계산한 인기 점수 */
  rating: number;
  /** 블로그 후기 수 (실제 데이터일 때) */
  reviewCount?: number;
  /** 최근 3개월 블로그 글 수 (최신 글 50개 중). 많을수록 '요즘' 인기 */
  recentCount?: number;
  /** 영업 시작/종료, 분 단위 (0 = 00:00). close가 open보다 작으면 자정을 넘김 */
  openMinute: number;
  closeMinute: number;
  /** 평균 체류 시간(분) */
  stayMinutes?: number;
  tags: string[];
  description: string;
  /** 지도 앱에서 열 링크 (실제 데이터일 때) */
  url?: string;
  /** 동네별로 골라 둔 데이트 명소 (regions.ts의 picks) */
  pick?: boolean;
  /** 동네 해시태그 글(‘행궁동 데이트’, ‘행궁동 핫플’ 등 블로그 글 최대 300개)에 이름이 나온 글 수 */
  buzz?: number;
  /** buzz를 센 해시태그 (예: '행궁동') */
  buzzTag?: string;
  /** '동네 + 블루리본' 블로그 글에 이름이 나온 글 수 (블루리본 선정 여부 자체는 아님) */
  ribbon?: number;
}

export type TimeSlotId = 'lunch' | 'afternoon' | 'evening' | 'night';

export interface TimeSlot {
  id: TimeSlotId;
  label: string;
  emoji: string;
  /** 기본 시작/종료 (분) */
  defaultStart: number;
  defaultEnd: number;
  /** 이 시간대의 자연스러운 흐름 (식사 → 카페 → 액티비티 → 술 등) */
  flow: PlaceCategory[];
}

export type TravelMode = 'walk' | 'transit' | 'car';

/** 설정 화면에서 고르는 이동 방법. transit = 가까우면 걷고 멀면 대중교통 */
export type TravelChoice = 'walk' | 'transit' | 'car';

export interface TravelEstimate {
  mode: TravelMode;
  minutes: number;
  distanceMeters: number;
}

/** 사용자가(또는 여자친구가) 미리 정해둔 "꼭 갈 곳" */
export interface PinnedPlace {
  place: Place;
  /** 시간 고정이면 도착 시각(분), 아니면 undefined → AI가 동선상 자연스러운 위치에 배치 */
  fixedMinute?: number;
}

export interface CourseRequest {
  regionId: string;
  date: string; // YYYY-MM-DD
  slotId: TimeSlotId;
  startMinute: number;
  endMinute: number;
  pins: PinnedPlace[];
  /** 취향 태그 (예: '조용한', '뷰맛집') */
  preferences: string[];
  /** 이미 다른 코스에 쓴 장소 등, 빼고 고를 장소들 */
  excludePlaceIds?: string[];
  /** 되도록 피할 장소들 (다른 추천 코스에 이미 나온 곳) */
  avoidPlaceIds?: string[];
  /** 이 말이 장소 이름·설명·태그에 들어가면 우선 (하고 싶은 것 직접 입력 등) */
  keywords?: string[];
  /** 고른 주제: 이 종류 자리에는 match 말이 이름·분류에 들어간 곳만 (있을 때) 넣는다 */
  wishes?: Array<{ category: PlaceCategory; match: string[] }>;
  /** 데이트 로그에서 좋았던 곳 (다시 추천할 때 가산점) / 별로였던 곳 (추천에서 뺌) */
  liked?: string[];
  disliked?: string[];
  /** 이동 방법 (없으면 대중교통) */
  travel?: TravelChoice;
  /** 내 취향 (분위기·가격대·실내외) */
  prefs?: import('./prefs').CoursePrefs;
  /** 시간대 기본 흐름 대신 쓸 흐름 (기분별 코스 템플릿) */
  flow?: PlaceCategory[];
  /** 코스 이름 (없으면 "지역 시간대 코스") */
  title?: string;
}

export interface CourseStop {
  place: Place;
  arriveMinute: number;
  leaveMinute: number;
  pinned: boolean;
  fixedTime: boolean;
  /** 다음 일정 전까지 남는 여유 시간 */
  slackMinutes: number;
  reason: string;
}

export interface CourseLeg {
  fromPlaceId: string;
  toPlaceId: string;
  travel: TravelEstimate;
}

export type CourseWarningKind = 'tight' | 'outside-region' | 'dropped' | 'closed' | 'unfilled';

export interface CourseWarning {
  kind: CourseWarningKind;
  message: string;
}

export interface Course {
  title: string;
  request: CourseRequest;
  stops: CourseStop[];
  legs: CourseLeg[];
  warnings: CourseWarning[];
  totalTravelMinutes: number;
}
