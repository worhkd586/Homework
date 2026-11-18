import type { PlaceProvider, RouteProvider } from './PlaceProvider';
import { MockPlaceProvider } from './MockPlaceProvider';
import { NaverPlaceProvider } from './NaverPlaceProvider';
import { StraightLineRouteProvider } from './StraightLineRouteProvider';

export type { PlaceProvider, RouteProvider } from './PlaceProvider';

/** 환경변수로 장소 데이터 출처를 고른다. 기본값은 목업. */
export function createPlaceProvider(): PlaceProvider {
  if (import.meta.env.VITE_PLACES_PROVIDER === 'naver') {
    return new NaverPlaceProvider(import.meta.env.VITE_NAVER_MAP_CLIENT_ID ?? '');
  }
  return new MockPlaceProvider();
}

export function createRouteProvider(): RouteProvider {
  return new StraightLineRouteProvider();
}
