# 오늘어디가 — 데이트 코스 추천 iOS 앱

지역과 시간대만 고르면 데이트 코스를 짜 주는 아이폰 앱(SwiftUI)입니다.
여자친구가 정해둔 "꼭 갈 곳"이 있으면 넣을 수 있고, 예약 시간이 있으면 그 시각에 맞춰 앞뒤를 채워요.

## 화면은 두 개

1. **코스 만들기 (한 화면)**: 어디서? → 언제? (점심/오후/저녁/밤) → 꼭 갈 곳 (선택) → **코스 짜줘**
2. **결과**: 시간표 + 구간별 이동시간, 빠듯하면 경고

## 실행

- Mac의 **Xcode 15 이상**에서 `DateCourse.swiftpm` 폴더를 열고 ▶ 실행 (iPhone 시뮬레이터)
- 또는 Mac/iPad의 **Swift Playgrounds** 앱에서 `DateCourse.swiftpm`을 열어 실행
- iOS 17 이상

## 구조

```
DateCourse.swiftpm
├─ Package.swift                 앱 설정 (이름, 아이콘, 번들 ID)
├─ DateCourseApp.swift           앱 시작점
├─ Model/Models.swift            지역·장소·시간대·코스 타입
├─ Services/
│  ├─ Providers.swift            PlaceProvider(장소) · RouteProvider(이동시간) + 목업 구현
│  ├─ MockData.swift             가상의 장소 50곳 (5개 지역)
│  └─ CourseRecommender.swift    코스 추천 (규칙 기반)
└─ Views/                        HomeView · MustGoPicker · CourseView
```

## 네이버 지도 연동 시

- `PlaceProvider`를 네이버 지역 검색 API로 구현해서 `MockPlaceProvider` 대신 넣습니다.
- 네이버 Directions는 자동차 경로만 주므로, 이동시간(`RouteProvider`)은 지금처럼 도보는 직선거리 추정, 먼 구간은 대중교통 API(예: ODsay)로 바꿉니다.
- API 키는 앱에 넣지 말고 작은 서버를 거쳐 호출하세요.

## 아직 안 한 것

- 캘린더에 추가 (마지막 단계)
- 실제 장소 데이터 (네이버 지도)
- 여자친구에게 링크로 물어보기
- 기획 문서: [docs/01-기획-벤치마크.md](docs/01-기획-벤치마크.md)
