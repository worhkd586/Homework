import { createPlaceProvider, createRouteProvider } from '../services/places';
import { RuleBasedRecommender } from '../services/recommend/RuleBasedRecommender';

export const placeProvider = createPlaceProvider();
export const recommender = new RuleBasedRecommender(placeProvider, createRouteProvider());

/** 결과 화면 맨 아래 안내: 지금 어떤 데이터를 쓰는지 */
export function dataSourceNote(): string {
  const p = placeProvider as { name: string; lastError?: string };
  if (p.name.startsWith('kakao')) {
    return p.lastError
      ? `실제 장소를 못 불러와서(${p.lastError}) 목업 장소로 보여 드려요.`
      : '장소 정보: 카카오맵. 영업시간은 가게마다 달라서 가기 전에 확인해 주세요. 이동시간은 거리로 어림한 값이에요.';
  }
  return '장소는 아직 목업 데이터예요. 카카오 장소 프록시를 연결하면 실제 장소로 바뀝니다.';
}
