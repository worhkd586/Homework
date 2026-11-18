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
}

export interface Place {
  id: string;
  name: string;
  regionId: string;
  category: PlaceCategory;
  location: LatLng;
  /** 0~5 */
  rating: number;
  /** 영업 시작/종료, 분 단위 (0 = 00:00). close가 open보다 작으면 자정을 넘김 */
  openMinute: number;
  closeMinute: number;
  /** 평균 체류 시간(분) */
  stayMinutes?: number;
  tags: string[];
  description: string;
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

export type TravelMode = 'walk' | 'transit';

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
