import type { Course, CourseRequest } from '../../domain/types';

/**
 * 코스 추천 엔진의 경계. 지금은 규칙 기반(RuleBasedRecommender)이고,
 * 나중에 LLM(예: Claude)으로 후보 선택·설명 문구를 맡기는 구현으로 바꿀 수 있다.
 * 이동시간 계산과 시간표 검증은 어느 구현이든 PlaceProvider·RouteProvider를 통해 한다.
 */
export interface CourseRecommender {
  recommend(request: CourseRequest): Promise<Course>;
}
