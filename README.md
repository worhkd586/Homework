# 오늘어디가 — 데이트 코스 추천 앱

지역과 시간대만 고르면 데이트 코스를 짜 주는 앱입니다. 여자친구가 정해둔 "꼭 갈 곳"이 있으면 넣을 수 있고, 예약 시간이 있으면 그 시각에 맞춰 앞뒤를 채워요.

**Expo(React Native)** 로 만들어서 코드 하나로 **아이폰(App Store)과 안드로이드(Google Play)** 에 모두 올릴 수 있어요. Mac 없이 Windows에서 개발할 수 있습니다.

## 화면은 두 개

1. **고르기 (한 화면)**
   - 오늘은 어떤 데이트? (조용히 대화 / 새로운 체험 / 맛집 탐방 / 활동적으로)
   - 하고 싶은 거? 예시 칩(미술관·전시, 공방 체험, 레저·놀이공원 …) 또는 **직접 입력** (예: 도자기, 볼링, 한강) — 키워드 규칙으로 장소 종류를 찾아요
   - 어디서? 직접 고르거나 **✨ 추천해 줘** · 언제? (점심/오후/저녁/밤) · 꼭 갈 곳 (선택)
   - 저장한 **내 코스** 목록, 보던 코스로 돌아가기
2. **코스 (보기 = 고치기)**: 느낌이 다른 완성 코스 3개 중 하나를 고르고, **언제든** 고칠 수 있어요
   - 일정을 탭 → 🕒 시간(30분 단위 고정/해제) · ↻ 다른 곳(추천/직접) · ✕ 삭제
   - ＋ 여기에 일정 추가 (추천/직접)
   - **이 코스 저장** → 내 코스. 저장한 코스는 고치면 자동 저장 (휴대폰 안에 저장)

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
   ├─ domain/                       타입, 시간대, 기분(moods.ts), 하고 싶은 것(activities.ts: 예시 + 직접 입력 키워드 규칙)
   ├─ lib/savedCourses.ts           내 코스 저장 (AsyncStorage)
   └─ services/
      ├─ places/
      │  ├─ PlaceProvider.ts        PlaceProvider(장소) · RouteProvider(이동시간) 인터페이스
      │  ├─ KakaoPlaceProvider.ts   카카오 실제 장소 (프록시 경유) + 실패 시 목업으로 대신
      │  ├─ MockPlaceProvider.ts    목업 장소 (가상의 50곳, 5개 지역)
      │  └─ StraightLineRouteProvider.ts  직선거리 기반 도보 추정
proxy/                              카카오 키를 숨기는 Cloudflare Worker (+ 테스트)
      └─ recommend/                 코스 추천 엔진 (규칙 기반), 코스 3개·지역 추천(courseOptions.ts) + 테스트
```

## 실제 장소 연결 (카카오, 무료)

앱 → **장소 프록시**(Cloudflare Workers, 무료) → 카카오 로컬 API 순서로 연결돼요. 카카오 키는 앱에 넣지 않고 프록시에만 둡니다 (앱 파일은 누구나 열어볼 수 있어서요).

1. **카카오 키 만들기**: [developers.kakao.com](https://developers.kakao.com) 로그인 → 내 애플리케이션 → 애플리케이션 추가 → 앱 키의 **REST API 키**를 확인해요. (키는 채팅이나 코드에 붙여넣지 마세요.) 콘솔에서 카카오맵/로컬 사용 설정을 켜라는 안내가 나오면 켜 주세요.
2. **프록시 올리기**: [Cloudflare](https://dash.cloudflare.com/sign-up) 무료 가입 후 PowerShell에서:
   ```powershell
   cd proxy
   npm install
   npx wrangler login                       # 브라우저에서 Cloudflare 로그인
   npx wrangler secret put KAKAO_REST_KEY   # 물어보면 REST API 키를 붙여넣기 (터미널에만)
   npx wrangler deploy                      # 끝나면 https://date-course-proxy.<내이름>.workers.dev 주소가 나와요
   ```
   확인: 브라우저에서 `https://date-course-proxy.<내이름>.workers.dev/search?q=성수 카페` 를 열면 장소 목록(JSON)이 보여요.
3. **앱에 주소 넣기**: 이미 `app/.env`에 `https://date-course-proxy.jayjaydate.workers.dev`가 들어가 있어요. 주소가 바뀌면 이 파일만 고치고 `npx expo start`를 다시 실행해요.

> 카카오가 `403`을 주면 [카카오 디벨로퍼스](https://developers.kakao.com) → 내 애플리케이션 → **제품 설정 › 카카오맵**에서 사용 설정을 **ON**으로 켜야 해요.

`proxy/worker.js`가 바뀌면 `cd proxy` → `npx wrangler deploy`로 다시 올려요 (키는 이미 저장돼 있어서 다시 넣을 필요 없음).

알아둘 것
- 비용: 카카오 로컬 API와 Cloudflare Workers 모두 무료 한도 안에서 써요. 같은 검색은 프록시가 하루 동안 캐시해요.
- 인기: 카카오는 평점을 주지 않아서, 같은 키로 쓸 수 있는 **다음 블로그 검색의 후기 수**로 인기 순위를 매겨요 (예: 국립중앙박물관 후기 수만 건). 후기가 적은 곳(밥집·카페 300개, 술집 200개, 놀거리·소품샵 150개, 전시·산책 100개 미만)은 아예 빼요. 단, `app/src/domain/regions.ts`의 동네별 명소(PICKS)는 예외예요.
- 요즘 인기: 최신 블로그 글 50개 중 최근 3개월 글 수를 같이 세서(호출 수는 그대로) 지금 사람들이 많이 가는 곳을 더 올려요. 요즘 글이 뜸한 곳은 밀려요.
- 해시태그 핫플: 인스타그램 해시태그 검색은 무료 공개 API가 없고(비즈니스 계정·앱 심사 필요, 장소 정보도 안 줌) 긁어 오는 건 약관 위반이라, 대신 같은 카카오 키로 '행궁동 데이트'·'행궁동 핫플'·'행궁동 가볼만한곳' 블로그 글(최대 300개)을 모아서 어느 가게가 많이 나오는지 세요 (프록시 `/buzz`, 하루 캐시).
- 블루리본: 블루리본 서베이 데이터는 공개 API가 없고 저작권이 있어 긁어 오지 않아요. 대신 '동네 + 블루리본' 블로그 글에 자주 나오는 밥집·카페·술집에 가산점을 줘요 (선정 여부를 확인한 건 아니라서 화면에는 '블루리본 언급 글 N'으로만 표시). 동네 해시태그는 `regions.ts`의 `hashtagsOf`.
- 데이트 어울림: 체인점은 다른 곳이 있으면 빼고, 식사는 점심·저녁 시간에, 같은 종류는 한 코스에 한 번만 넣어요.
- 주제 맞추기: '미술관·박물관'을 고르면 이름이나 카카오 분류에 미술관·박물관이 들어간 곳만 넣어요 (화방·화랑·영화관 제외). 대표 명소(국립중앙박물관, 리움, 국립현대미술관 등)는 먼저 골라요.
- 사진: 장소마다 다음 이미지 검색의 첫 사진을 보여 주고, 없으면 종류 아이콘을 보여 줘요.
- 지역: 서울 핫플 20곳 + 경기 11곳. '추천해 줘'는 동네 특징으로 3곳을 먼저 추리고 그 3곳만 실제 장소로 비교해요.
- 영업시간은 카카오가 주지 않아서 종류별로 흔한 시간으로 가정해요. 결과 화면에 "가기 전에 확인" 안내가 나와요. 일정마다 🗺️ 지도로 카카오맵을 열 수 있어요.
- 이동시간은 아직 직선거리 어림값이에요. 카카오모빌리티 길찾기는 별도 사용 신청이 필요해서 다음 단계로 남겨 뒀어요.
- 프록시가 꺼져 있거나 오류가 나면 앱은 목업 장소로 대신 보여 줘요.

## 아직 안 한 것

- 캘린더에 추가 (마지막 단계)
- 실제 길찾기 이동시간 (카카오모빌리티 사용 신청 후)
- 기획 문서: [docs/01-기획-벤치마크.md](docs/01-기획-벤치마크.md)
