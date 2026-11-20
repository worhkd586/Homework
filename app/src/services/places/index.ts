import type { PlaceProvider, RouteProvider } from './PlaceProvider';
import { MockPlaceProvider } from './MockPlaceProvider';
import { FallbackPlaceProvider, KakaoPlaceProvider } from './KakaoPlaceProvider';
import { StraightLineRouteProvider } from './StraightLineRouteProvider';

export type { PlaceProvider, RouteProvider } from './PlaceProvider';

/**
 * EXPO_PUBLIC_PLACES_PROXY_URL(프록시 주소)이 있으면 카카오 실제 장소, 없으면 목업.
 * 실제 데이터가 실패하면 목업으로 대신한다. (프록시 주소는 비밀이 아님. 카카오 키는 프록시에만 있음)
 */
export function createPlaceProvider(): PlaceProvider {
  const proxy = process.env.EXPO_PUBLIC_PLACES_PROXY_URL;
  if (proxy) return new FallbackPlaceProvider(new KakaoPlaceProvider(proxy), new MockPlaceProvider());
  return new MockPlaceProvider();
}

/** 이동시간: 직선거리 추정 (무료, 쿼터 없음). 카카오모빌리티 길찾기는 별도 사용 신청이 필요해 아직 안 씀. */
export function createRouteProvider(): RouteProvider {
  return new StraightLineRouteProvider();
}
