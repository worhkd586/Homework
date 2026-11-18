# 오늘어디가 — 데이트 코스 추천 앱

지역과 시간대만 고르면, 시간 순서와 이동 동선을 맞춘 데이트 코스를 짜 주는 앱입니다.
여자친구가 미리 찜해둔 곳(꼭 갈 곳)은 시간 고정 또는 순서 자유로 코스에 넣을 수 있어요.

- 기획·벤치마크: [docs/01-기획-벤치마크.md](docs/01-기획-벤치마크.md)
- 앱 코드: [app/](app/)

## 실행

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm test         # 추천 엔진 테스트
npm run build    # 타입 체크 + 프로덕션 빌드
```

## 구조

```
app/src
├─ domain/                 타입, 시간대(점심/오후/저녁/밤)와 시간대별 흐름
├─ services/
│  ├─ places/
│  │  ├─ PlaceProvider.ts  PlaceProvider(장소) · RouteProvider(이동시간) 인터페이스
│  │  ├─ MockPlaceProvider.ts / mockData.ts   목업 장소 (가상의 장소 50곳, 5개 지역)
│  │  ├─ StraightLineRouteProvider.ts         직선거리 기반 도보 추정
│  │  └─ NaverPlaceProvider.ts                네이버 지도 API 자리 (미구현)
│  └─ recommend/
│     ├─ CourseRecommender.ts                 추천 엔진 인터페이스
│     └─ RuleBasedRecommender.ts              규칙 기반 추천 (+ 테스트)
├─ screens/                홈(넷플릭스형) · 코스 만들기 3단계 · 결과
└─ components/             코스 카드, 동선 미리보기
```

## 추천은 이렇게 짜요

1. 시간대마다 정해진 흐름을 뼈대로 씁니다. 예: 저녁 = 전시 → 식사 → 산책 → 술.
2. 꼭 갈 곳이 같은 카테고리 자리를 대신 차지합니다 (파스타집을 넣으면 식사를 하나 더 넣지 않음).
3. 시간 고정 핀(🔒) 앞뒤로 구간을 나누고, 구간마다 들어갈 만큼 일정을 배분합니다. 시간이 모자라면 산책·쇼핑부터 뺍니다.
4. 빈 자리는 평점·취향은 높고, 앞뒤 이동시간은 짧은 곳으로 채웁니다. 그 시각에 영업 중인 곳만 고릅니다.
5. 실제 이동시간으로 시간표를 확정하고, 빠듯한 구간·지역 밖 장소·영업시간 문제를 경고합니다.

지금은 규칙 기반이고, `CourseRecommender` 인터페이스 뒤에서 LLM 기반 구현으로 바꿀 수 있게 해 두었습니다.

## 네이버 지도 연동 시

- `PlaceProvider`를 구현한 `NaverPlaceProvider`를 채우고 `VITE_PLACES_PROVIDER=naver`로 전환합니다 (`app/.env.example`).
- 네이버 Directions는 자동차 경로만 주므로, 이동시간은 `RouteProvider`로 분리해 두었습니다. 도보는 직선거리 추정, 먼 구간 대중교통은 ODsay 같은 API를 붙이는 구현으로 교체합니다.
- API 키는 브라우저에 노출하지 말고 작은 서버(프록시)에서 호출하세요.
- 결과 화면의 동선 미리보기(`RouteMap`)를 실제 지도 컴포넌트로 바꿉니다.

## 아직 안 한 것

- 캘린더 내보내기 (마지막 단계, 버튼만 자리 잡아 둠)
- 여자친구에게 링크로 물어보기·스와이프 매칭, 링크 붙여넣기로 장소 추가
