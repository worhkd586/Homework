import type { PlaceProvider, RouteProvider } from './PlaceProvider';
import { MockPlaceProvider } from './MockPlaceProvider';
import { NaverPlaceProvider } from './NaverPlaceProvider';
import { StraightLineRouteProvider } from './StraightLineRouteProvider';

export type { PlaceProvider, RouteProvider } from './PlaceProvider';

/** 환경변수(EXPO_PUBLIC_PLACES_PROVIDER)로 장소 데이터 출처를 고른다. 기본값은 목업. */
export function createPlaceProvider(): PlaceProvider {
  if (process.env.EXPO_PUBLIC_PLACES_PROVIDER === 'naver') {
    return new NaverPlaceProvider(process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? '');
  }
  return new MockPlaceProvider();
}

export function createRouteProvider(): RouteProvider {
  return new StraightLineRouteProvider();
}
