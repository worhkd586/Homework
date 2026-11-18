import type { LatLng, Place, Region, TravelEstimate } from '../../domain/types';

/**
 * 장소 데이터의 경계(interface).
 * 지금은 MockPlaceProvider, 나중에 네이버 검색 API(지역)를 쓰는 NaverPlaceProvider로 교체한다.
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
 * MVP는 직선거리 기반 도보 추정(StraightLineRouteProvider). 네이버 Directions는 자동차 경로만
 * 주므로, 먼 구간의 대중교통은 이후 ODsay 같은 API를 붙이는 구현으로 교체한다.
 */
export interface RouteProvider {
  readonly name: string;
  estimateTravel(from: LatLng, to: LatLng): Promise<TravelEstimate>;
}
