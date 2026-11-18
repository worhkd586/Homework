import type { Place, Region } from '../../domain/types';
import type { PlaceProvider } from './PlaceProvider';

/**
 * 네이버 지도 API 연동 자리. 아직 구현하지 않았다.
 * - searchPlaces / listPlaces: 네이버 검색 API(지역) → Place로 변환
 * - 키는 브라우저에 노출하지 말고 작은 서버(프록시)에서 호출한다.
 * 이동시간은 RouteProvider 쪽 일이다 (Directions는 자동차 전용, 대중교통은 ODsay 등).
 */
export class NaverPlaceProvider implements PlaceProvider {
  readonly name = 'naver';

  constructor(private readonly clientId: string) {}

  private notYet(): never {
    throw new Error(`NaverPlaceProvider는 아직 구현되지 않았습니다 (clientId: ${this.clientId ? '설정됨' : '없음'})`);
  }

  async listRegions(): Promise<Region[]> {
    return this.notYet();
  }
  async listPlaces(_regionId: string): Promise<Place[]> {
    return this.notYet();
  }
  async searchPlaces(_query: string, _regionId?: string): Promise<Place[]> {
    return this.notYet();
  }
}
