import type { Course, CourseRequest, Place } from '../../domain/types';

/**
 * 코스 추천 엔진의 경계. 지금은 규칙 기반(RuleBasedRecommender)이고,
 * 나중에 LLM(예: Claude)으로 후보 선택·설명 문구를 맡기는 구현으로 바꿀 수 있다.
 * 이동시간 계산과 시간표 검증은 어느 구현이든 PlaceProvider·RouteProvider를 통해 한다.
 */
export interface CourseRecommender {
  recommend(request: CourseRequest): Promise<Course>;
  /**
   * 결과 코스의 index 자리(0 = 맨 앞, stops.length = 맨 뒤)에 일정을 하나 끼워 넣는다.
   * place를 주면 그곳을, 없으면 그 자리에 어울리는 곳을 추천해서 넣는다. 시간표는 다시 계산한다.
   */
  insertStop(course: Course, index: number, place?: Place): Promise<Course>;
}
