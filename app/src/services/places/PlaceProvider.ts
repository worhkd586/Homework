import type { LatLng, Place, Region, TravelEstimate } from '../../domain/types';

/**
 * 장소 데이터의 경계(interface).
 * 목업(MockPlaceProvider)과 카카오 실제 장소(KakaoPlaceProvider, 프록시 경유)가 구현한다.
 */
export interface PlaceProvider {
  readonly name: string;
  listRegions(): Promise<Region[]>;
  /** 해당 지역의 후보 장소 전체 */
  listPlaces(regionId: string): Promise<Place[]>;
  /** 이름·태그 검색 (꼭 갈 곳 추가용). regionId가 없으면 전체 지역 */
  searchPlaces(query: string, regionId?: string): Promise<Place[]>;
}

/**
 * 이동시간의 경계(interface).
 * 지금은 직선거리 기반 추정(StraightLineRouteProvider, 무료). 카카오모빌리티 길찾기는 별도 사용 신청이
 * 필요해서, 승인되면 이 인터페이스를 구현해 교체한다.
 */
export interface RouteProvider {
  readonly name: string;
  estimateTravel(from: LatLng, to: LatLng): Promise<TravelEstimate>;
}
