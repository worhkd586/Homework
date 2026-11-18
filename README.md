# 오늘어디가 — 데이트 코스 추천 앱

지역과 시간대만 고르면 데이트 코스를 짜 주는 앱입니다. 여자친구가 정해둔 "꼭 갈 곳"이 있으면 넣을 수 있고, 예약 시간이 있으면 그 시각에 맞춰 앞뒤를 채워요.

**Expo(React Native)** 로 만들어서 코드 하나로 **아이폰(App Store)과 안드로이드(Google Play)** 에 모두 올릴 수 있어요. Mac 없이 Windows에서 개발할 수 있습니다.

## 화면은 두 개

1. **코스 만들기 (한 화면)**: 어디서? → 언제? (점심/오후/저녁/밤) → 꼭 갈 곳 (선택, 예약 시간 지정 가능) → **코스 짜줘**
2. **결과**: 시간표 + 구간별 이동시간, 빠듯하면 경고

## Windows에서 아이폰으로 실행해 보기 (Expo Go)

1. [Node.js LTS](https://nodejs.org)를 설치합니다.
2. 아이폰 App Store에서 **Expo Go** 앱을 설치합니다. (안드로이드는 Play 스토어에서 같은 앱)
3. 이 저장소를 받은 뒤 PowerShell에서:
   ```powershell
   cd app
   npm install
   npx expo start
   ```
4. 터미널에 QR 코드가 나오면 **아이폰 기본 카메라**로 찍습니다 (안드로이드는 Expo Go 앱 안에서 스캔). 앱이 바로 열려요.
   - PC와 폰이 **같은 와이파이**여야 합니다.
   - 안 열리면 `npx expo start --tunnel`로 다시 실행해 보세요.
5. 코드를 저장하면 폰 화면이 바로 바뀝니다.

브라우저로 보고 싶으면 `npx expo start` 후 터미널에서 `w`를 누르세요.

## 스토어에 올릴 때 (나중에)

Mac 없이 클라우드에서 빌드합니다 (EAS).
```powershell
npx eas-cli@latest build --platform all     # iOS·Android 빌드
npx eas-cli@latest submit --platform ios     # App Store 제출 (Apple 개발자 계정 연 $99)
npx eas-cli@latest submit --platform android # Google Play 제출 (개발자 계정 1회 $25)
```

## 기타 명령

```powershell
npm test            # 코스 추천 로직 테스트
npm run typecheck   # 타입 체크
```

## 구조

```
app/
├─ App.tsx                          두 화면 전환 (선택 ↔ 결과)
└─ src/
   ├─ screens/                      SetupScreen · ResultScreen
   ├─ domain/                       타입, 시간대와 시간대별 흐름
   └─ services/
      ├─ places/
      │  ├─ PlaceProvider.ts        PlaceProvider(장소) · RouteProvider(이동시간) 인터페이스
      │  ├─ MockPlaceProvider.ts    목업 장소 (가상의 50곳, 5개 지역)
      │  ├─ StraightLineRouteProvider.ts  직선거리 기반 도보 추정
      │  └─ NaverPlaceProvider.ts   네이버 지도 API 자리 (미구현)
      └─ recommend/                 코스 추천 엔진 (규칙 기반) + 테스트
```

## 네이버 지도 연동 시

- `NaverPlaceProvider`를 채우고 `EXPO_PUBLIC_PLACES_PROVIDER=naver`로 전환합니다.
- 네이버 Directions는 자동차 경로만 주므로, 이동시간(`RouteProvider`)은 도보는 직선거리 추정, 먼 구간은 대중교통 API(예: ODsay)로 바꿉니다.
- API 키는 앱에 넣지 말고 작은 서버를 거쳐 호출하세요.

## 아직 안 한 것

- 캘린더에 추가 (마지막 단계)
- 실제 장소 데이터 (네이버 지도)
- 기획 문서: [docs/01-기획-벤치마크.md](docs/01-기획-벤치마크.md)
