import type { LatLng, TravelEstimate } from '../../domain/types';
import type { RouteProvider } from './PlaceProvider';
import { roughTravel } from './geo';

/** 직선거리로 도보 시간을 추정한다. 먼 구간은 대중교통 어림값(실제 API 연동 전 임시). */
export class StraightLineRouteProvider implements RouteProvider {
  readonly name = 'straight-line';

  async estimateTravel(from: LatLng, to: LatLng): Promise<TravelEstimate> {
    return roughTravel(from, to);
  }
}
