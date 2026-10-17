# 빈틈 BinTime

**비어 있던 시간에, 새로운 가치를.**

우리 동네 뷰티샵의 취소 빈자리를 찾고 예약하는 모바일 중심 서비스입니다.
매장·예약·대기·채팅·계정은 실제 백엔드 API를 사용합니다.
React + TypeScript + Vite 프로젝트입니다.
스타일은 Tailwind CSS 4, 라우팅은 react-router-dom 7을 사용합니다.
Tailwind는 Vite 플러그인과 `src/index.css`에서 연결하고, 라우트는 `src/App.tsx`에 정의합니다.

## 화면과 API 연결

카카오 로그인 후 서버 세션과 사용자 권한을 확인합니다. 고객·사장님 전환은 양방향 확인창을 거치며, 고객은 가게 등록을 시작할 수 있습니다. 가게 생성 시 서버가 `OWNER` 권한을 부여합니다. 생성 직후 `GET /users/me`를 다시 조회해 권한과 보유 매장을 반영합니다. 등록된 매장은 `ownedStoreIds`로 복원하며, 현재 사장님 화면은 첫 번째 보유 매장을 사용합니다.

| 역할 | 화면 |
| --- | --- |
| 고객 | 지도·매장 검색, 날짜별 조회 전용 시간표, 빈자리 알림을 통한 예약·취소, 대기 알림 신청·변경·취소, 예약내역, 가게 채팅·예약 제안 확정, 알림함, 취향·이름·위치 저장 |
| 사장님 | 매장·대표 시술 등록, 미래 예약 시간 등록·조회, 날짜별 예약 타임테이블·취소·완료·노쇼 처리, 빈자리 할인 발행·철회, 고객 채팅·예약 제안, 매장·시술 관리 |

- 매장·시술·예약·대기·메시지·취향은 서버가 관리합니다. 실패 응답을 샘플 데이터로 대체하지 않습니다. 날짜는 현재 `Asia/Seoul` 기준입니다.
- 역할 선택과 브라우저 알림 설정만 사용자별로 브라우저에 보관합니다. 역할 선택은 서버 권한을 바꾸지 않습니다. 기존 체험 계정 데이터는 사용하지 않습니다.
- 매장 등록은 이름·업종·도로명주소·주간 영업시간과 선택 사항인 가게 설명(최대 1,000자)을 입력하고 대표 시술을 별도로 등록합니다. 주소 입력란 하나에서 Kakao 주소 검색 결과를 선택하면 지도 좌표를 자동 저장합니다. 영업시간은 요일별 영업·휴무와 시·분 버튼으로 설정하고, 다른 영업일에 같은 시간을 적용할 수 있습니다. 일부만 성공하면 완료된 매장을 재사용해 시술 등록을 다시 시도합니다.
- 사장님 홈의 **예약 시간 등록**에서 활성 시술과 한국 시간 기준 날짜·시작 시간을 선택합니다. 시술 전체가 영업시간 안에 들어가야 하며, 가격과 종료 시각은 서버가 시술 정보로 결정합니다. 등록 후 해당 날짜의 예약 가능 시간을 다시 조회합니다. 일인샵 기준으로 담당자 선택은 표시하지 않습니다.
- 가게 상세의 시간표는 `GET /api/v1/stores/{storeId}/timetable?date=YYYY-MM-DD`로 예약자 정보 없이 시간만 조회합니다. 확정 예약은 **예약 불가**, 공개된 유효 빈자리는 **예약 가능**, 그 외 영업시간은 **확인 필요**로 표시하며 시간 선택·예약 버튼은 없습니다. 화면 표시 중 30초마다, 화면 복귀·네트워크 복구·수동 새로고침 때 다시 조회하여 취소·노쇼·빈자리 발행을 반영합니다. 조회 실패 시 이전 정보임을 표시합니다. 이 API를 제공하는 서버와 함께 배포해야 합니다.
- 빈자리 예약은 확인 창에서 시술·시간·금액·확정 방식을 확인합니다. 슬롯의 `instantBooking`이 false이면 예약 신청을 보내고, 응답이 `PENDING`이면 **사장님 확인 대기**로 표시합니다. 신청만으로 시간을 선점하지 않습니다. 최신 슬롯 조건을 검사하고 `expectedPrice`, `expectedSlotVersion`, `Idempotency-Key`를 유지합니다. `PENDING`은 신청 철회, `REJECTED`·`WITHDRAWN`·`EXPIRED`는 종료 내역으로 표시합니다.
- 대기는 예약 확정이 아닙니다. 방문 가능 시작과 시술 종료 기한, 알림 동의를 입력하고 서버가 반환한 예약 후보를 직접 선택합니다.
- 사장님 타임테이블은 선택한 날짜의 서버 예약·고객명·요약을 표시합니다. 예약 상세에서 서버가 허용한 취소·완료·노쇼를 확인 후 처리하고 시간표를 갱신합니다. 취소는 매장 사유로 요청하며 남은 시간은 빈자리 알림에서 발행할 수 있습니다. 빈자리 발행에는 등록된 활성 시술, 시작 시각, 할인 방식과 현재 빈자리 버전을 사용합니다.
- 빈자리 발행에서 **즉시확정 / 신청 확인 후 선택**을 선택해 `instantBooking` boolean을 보냅니다. 사장님 홈은 `GET /api/v1/owner/stores/{storeId}/reservation-requests?limit=20`의 다음 커서까지 읽어 빈자리별 신청순으로 표시하고, `APPROVE`·`REJECT`가 허용된 신청을 확인 후 승인·거절합니다. 성공 또는 409 충돌 후 신청·슬롯·일정을 다시 조회합니다. 미확정 신청은 시간표를 점유하지 않습니다. 알림은 발행 당시 정책을 보여주고 실제 예약은 현재 슬롯을 확인합니다. 이 흐름은 채팅 예약 제안과 별개입니다.
- **배포 조건:** 사장님 선택 기능은 백엔드의 해당 계약 및 DB 마이그레이션 적용과 함께 운영 전환해야 합니다. 프런트 구현만으로 서버·DB 적용을 완료한 것은 아니며, 준비 전에는 `instantBooking: false` 모집을 사용하지 않습니다.
- 채팅은 연결된 WebSocket으로 메시지를 보내고 받습니다. 말풍선을 즉시 표시하고 입력창을 비워 연속 입력을 지원합니다. 전송 확인이 1초 넘게 걸릴 때만 '전송 중…'을 표시하며, 실패하면 오류와 재전송 버튼을 즉시 보여주고 같은 ID로 재전송합니다. 연결이 끊기거나 전송 확인이 지연되면 REST 전송·조회로 복구합니다. 가장 최근에 저장된 고객 TEXT를 C-08로 분석하며, 예약 의사가 확인된 경우에만 예약 제안 작성을 안내합니다. 사장님이 원문과 AI 초안, 실제 등록 시술·시간·가격을 확인해 C-06 제안을 보내고, 고객이 C-07로 최종 확인하면 서버에서 예약을 확정합니다. 분석 실패는 원문 전송에 영향을 주지 않습니다.
- 알림함에서 저장된 알림·미읽음 수를 확인하고 읽음 처리할 수 있습니다. SSE와 FCM이 알림함을 갱신합니다. 화면을 보는 동안에는 푸시 구독과 관계없이 대기 후보를 3초마다 조회해 같은 빈자리의 토스트를 한 번 표시합니다. 2026-10-17 서버 인계에 따르면 고객 TEXT 저장이 채팅 FCM을 발생시키며 C-08 분석은 추가 푸시를 만들지 않습니다. 브라우저·운영체제의 실제 알림 수신은 별도 확인이 필요합니다.
- 마이페이지에서 이름 변경·위치 저장/삭제를 할 수 있습니다. 대기내역의 조건 입력은 자연어 분석과 수동 입력을 지원하며 최종 확인과 알림 동의 후에만 저장합니다. 사장님 매장·시술 관리에서 설명·영업시간, 시술명·가격·제공 여부를 수정하고 시술을 추가합니다.
- 고객 지도는 Kakao Maps Web SDK를 사용하고, 검색 결과·마커는 서버에서 조회합니다. **이 지역 재검색**은 지도 중심과 반경(최대 10km)을 서버로 전달합니다. 지도 키가 없거나 지도를 불러오지 못해도 검색 목록은 사용할 수 있습니다.
- 선택한 지도 마커의 가격·가게명은 흰색입니다. 일반 가게는 진회색, 특가 가게는 진한 코랄색 배경과 **특가** 표시로 구분합니다.
- 홈 목록·가게 상세에서 서버 이미지가 없는 가게는 카테고리별 예시 이미지 6장 중 하나를 가게 ID로 고정 배정합니다. 신규 가게에도 자동 적용되며 실제 서버 이미지가 생기면 우선 표시합니다. [예시 이미지 출처와 생성 프롬프트](public/images/shops/README.md)를 참고하세요.
- **내 위치** 버튼은 브라우저 위치 권한을 요청합니다. 허용하면 지도에 현재 위치를 표시하고, 최초 수신과 버튼 재클릭 때 해당 위치로 이동합니다. HTTPS 또는 localhost가 필요합니다.
- 취향 원문은 사용자 API에 저장합니다. 저장 성공만으로 AI 분석·추천 반영을 완료했다고 표시하지 않습니다.
- Firebase 설정 후 마이페이지의 **알림 켜기/끄기**로 로그인 계정의 브라우저 FID를 서버에 등록·해제합니다. 빈자리 발행 성공과 실제 푸시 도착은 별개입니다.

## 브랜드 UI

- 브랜드명은 **빈틈 BinTime**, 슬로건은 **비어 있던 시간에, 새로운 가치를.**입니다.
- `src/index.css`의 공통 색상 토큰을 사용합니다. 주요 버튼·선택 상태·할인 강조는 코랄 `#EB7373`, 보조 배경은 `#FEF9F9`, 기본 배경과 지도 위 버튼은 흰색입니다. 카테고리·본문 글씨는 차콜 `#333333`이며, 코랄 배경 위에는 대비를 확보한 `#262626`, 작은 강조 글씨에는 진한 코랄 `#B84646`을 사용합니다.
- Pretendard를 우선 사용하고, 설치되지 않은 환경에서는 기존 한글 시스템 폰트로 표시합니다.
- 마스코트는 확정한 퍼즐 캐릭터 원본 `public/images/bintime-puzzle.png`를 공통 `Mascot`에서 사용합니다. 한글·영문 로고는 최종 선택한 3번 시안에서 픽셀 변경 없이 자른 `public/images/bintime-wordmark-03.png`를 공통 `Brand`에서 표시합니다. 한 장으로 묶어 글자 모양·상대 크기·간격을 유지하며, 작은 화면에서는 전체를 같은 비율로 축소합니다. `public/icons/puzzle-mark-*.png`는 팔다리 없는 별도 로고 원본 `public/images/bintime-logo.png`에서 만든 헤더·탭·알림·홈 화면 아이콘이며, 새 파일명으로 이전 아이콘 캐시와 구분합니다.
- PWA 설치 정보는 `public/manifest.webmanifest`에 있습니다. 192·512px 아이콘과 가장자리가 잘리지 않도록 여백을 둔 512px maskable 아이콘을 등록하며, iOS 홈 화면에는 180px Apple touch 아이콘을 사용합니다. 기존 설치 아이콘은 OS 캐시 때문에 바로 바뀌지 않을 수 있습니다. 오프라인 기능은 제공하지 않습니다.
- 아이콘은 Lucide 공식 SVG를 기존 `Icon` 컴포넌트로 사용합니다. 라이선스는 `public/lucide-LICENSE.txt`에 포함합니다.

## 소스 구조

```text
src/
  App.tsx                 세션·권한 확인과 라우트 연결
  pages/auth/             로그인, 역할 선택
  pages/customer/         검색, 매장 상세, 대기, 예약
  pages/owner/            매장 등록, 타임테이블, 빈자리, 채팅 목록
  pages/ChatPage.tsx      고객·사장님 채팅
  components/             공통 UI와 예약·대기·빈자리 확인 창
  hooks/                  계정, 채팅, 푸시, 검색, 지도 상태
  lib/backend-api.ts      JSON 응답, CSRF, 인증 쿠키, 오류·타임아웃
  lib/customer-api.ts     매장·예약·대기 API
  lib/owner-api.ts        타임테이블·빈자리 API
  lib/account.ts          매장 등록과 서버 정보 복원
  lib/chat.ts             채팅 API와 메시지 정렬
  lib/push.ts             Firebase 설정과 서버 구독 API
  lib/format.ts          한국 날짜·시간·금액 표시
  data/categories.ts     업종 코드·표시 이름
  types.ts                화면 데이터 타입
  styles/                 화면 스타일
scripts/*.test.mjs         API 계약과 입력 경계·오류 처리 테스트
api/chat-ws.ts             Vercel에서 Oracle 채팅 WebSocket을 중계하는 함수
public/                   브랜드 이미지, PWA, 알림 서비스 워커
```

## 로컬 실행

Node.js 22.12 이상인 22.x와 pnpm 10을 사용합니다.
로컬 검증 버전은 Node.js 22.19.0, pnpm 10.17.0입니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

## 카카오 로그인 · 서버 세션

- API 주소는 `src/lib/backend-api.ts`의 `BACKEND_API_ORIGIN = ''`로, 현재 프론트 주소의 `/api`를 사용합니다. Vercel과 Vite의 프록시가 Oracle API로 전달합니다. 프론트에는 로그인용 카카오 REST API 키나 Client Secret을 넣지 않습니다.
- 로그인 버튼은 `/api/v1/auth/oauth/kakao/start`로 브라우저를 이동합니다. 콜백·코드 교환·`bt_session` 발급은 백엔드가 처리합니다.
- `GET /api/v1/users/me`에서 사용자·역할·보유 매장·취향·버전을 조회합니다. `401`은 비로그인, 네트워크·서버·응답 형식 오류는 재시도할 수 있는 오류로 처리합니다.
- 모든 API 요청은 `credentials: 'include'`를 사용합니다. 변경 요청은 `GET /api/v1/auth/csrf`로 받은 `X-CSRF-Token`을 보내고, 해당 계약이 요구하면 멱등 키를 포함합니다. 세션·CSRF 토큰은 브라우저 저장소에 저장하지 않습니다.
- 로그아웃은 서버 API를 호출하고 성공한 뒤 계정 상태를 정리합니다. `204` 응답은 JSON으로 파싱하지 않습니다. `/login?error=OAUTH_FAILED`에서는 로그인 실패와 재시도를 안내합니다.

로그인 완료 후 마지막으로 이용한 역할을 복원하며, 저장된 역할이 없으면 고객 권한을 우선합니다. 고객으로 처음 시작하면 이름을 입력하고 `PATCH /api/v1/users/me`로 저장한 뒤 고객 홈이나 알림에서 열려던 화면으로 이동합니다. 이름 입력 완료 여부는 계정별로 현재 브라우저에 보관하므로 다른 브라우저나 저장 공간 삭제 후에는 다시 입력합니다. 이름 자체는 서버에 저장되며, 채팅에서 사장님에게는 고객 이름, 고객에게는 가게 이름이 표시됩니다. 사장님 권한만 있으면 사장님 화면으로 이동하고, 매장 등록이 필요한 경우 등록 화면으로 연결합니다. 로그아웃은 마이페이지에서 할 수 있습니다.

로그인한 사용자는 위치 권한을 허용하면 화면이 보일 때 즉시, 이후 10초마다 기기 위치를 조회해 `PUT /api/v1/users/me/location`으로 저장합니다. 숨긴 탭과 로그아웃 상태에서는 갱신을 멈추며, 화면으로 돌아오면 즉시 다시 조회합니다. 위치 조회나 저장 중에는 중복 요청을 보내지 않습니다. 위치 권한 거부나 기기·네트워크 오류가 있으면 저장할 수 없습니다. 내 정보에서 위치를 삭제해도 다음 자동 갱신 때 다시 저장되므로, 자동 저장을 멈추려면 브라우저 위치 권한을 해제합니다.

화면 표시 중 거리 조건이 있는 활성 대기는 최근 저장한 좌표로 `PATCH /api/v1/search/waitlists/{id}`를 호출해 재매칭합니다. 좌표가 같으면 쓰지 않으며 지정 가게·시술·시간·반경·가격은 유지합니다. 서버 매칭 작업이 끝나 새 후보가 조회되면 토스트가 표시됩니다. 푸시가 없는 사용자의 알림함 기록을 생략하는 서버 정책과 FCM 발송은 그대로이며, 화면 내 토스트에는 푸시 구독이 필요하지 않습니다. 화면을 닫거나 숨기면 위치 동기화와 후보 조회를 중단하므로 FCM은 마지막으로 동기화된 대기 조건을 사용합니다.

운영 전환 시 서버의 `KAKAO_REDIRECT_URI`와 카카오 콘솔의 콜백을 `https://frontend-oracle.vercel.app/api/v1/auth/oauth/kakao/callback`으로 함께 맞춥니다. `FRONTEND_URL`은 `https://frontend-oracle.vercel.app`을 유지합니다. 로그인 시작·콜백·API가 같은 호스트를 사용해야 Safari에서도 로그인 세션을 이어갈 수 있습니다.

프론트 배포만으로 서버 환경변수와 카카오 콜백 설정까지 완료되지는 않습니다. [서버·카카오 설정 전달 문서](docs/same-origin-login-handoff.md)에 따라 두 설정의 반영 여부와 실제 브라우저 로그인 결과를 확인합니다. Vite 프록시만으로 localhost·Preview 로그인이 준비되지는 않으며, WebSocket·SSE의 운영 프록시 연결도 별도 확인이 필요합니다.

## 카카오맵 설정

1. [Kakao Developers](https://developers.kakao.com/console/app)에서 프로젝트용 앱을 만들거나 기존 앱을 선택합니다. 다른 서비스와 설정·사용량을 분리하려면 별도 앱을 사용합니다.
2. 해당 앱의 **카카오맵 → 사용 설정 → 상태 ON**을 설정합니다.
3. **앱 설정 → 앱 → 플랫폼 키 → JavaScript 키**에서 키를 확인하고 **JavaScript SDK 도메인**에 아래 주소를 등록합니다.
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `https://frontend-oracle.vercel.app`
4. `.env.example`을 `.env.local`로 복사하고 `VITE_KAKAO_MAP_APP_KEY`에 **JavaScript 키**를 넣습니다. 개발 서버를 다시 실행합니다.

```dotenv
VITE_KAKAO_MAP_APP_KEY=발급받은_JavaScript_키
```

JavaScript 키는 브라우저에서 사용하는 공개용 플랫폼 키입니다. 등록 도메인으로 사용처를 제한하며, `.env.local`은 Git에 포함하지 않습니다. **REST API 키, Admin 키, 비밀번호는 넣지 않습니다.**
키가 비어 있으면 SDK를 요청하지 않습니다. 요청 실패나 15초 안에 SDK 초기화가 끝나지 않으면 다시 시도 버튼을 표시합니다.

Vercel에서는 같은 환경변수를 Production에 등록하고 다시 배포합니다. Preview에서 지도를 쓰려면 Preview 환경변수와 해당 배포 도메인도 별도로 등록해야 합니다. 환경변수는 빌드 시 반영됩니다.

현재 공식 안내상 개발자 계정에서 **처음 카카오맵을 활성화한 앱에만 무료 쿼터**가 제공됩니다. 추가 활성화 앱과 무료 쿼터 초과 사용은 별도 유료 설정 대상이므로, 활성화 전에 콘솔의 무료 쿼터 적용 앱을 확인합니다.
설정 출처: [Web SDK 시작하기](https://apis.map.kakao.com/web/guide/), [카카오맵 사용 방법·무료 쿼터](https://developers.kakao.com/docs/ko/kakaomap/common).

## Firebase 푸시 알림 설정

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 만들거나 선택하고 **프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가(`</>`)**로 앱을 등록합니다. 웹 앱의 Firebase 설정에서 `apiKey`, `projectId`, `messagingSenderId`, `appId`를 확인합니다. Firebase Auth·Firestore·Firebase Hosting은 이 수신 기능에 필요하지 않습니다.
2. **프로젝트 설정 → Cloud Messaging → 웹 구성 → 웹 푸시 인증서 → 키 쌍 생성**에서 VAPID **공개키**를 발급합니다.
3. 같은 프로젝트의 [Google Cloud FCM Registration API](https://console.cloud.google.com/apis/library/fcmregistrations.googleapis.com)가 사용 설정되어 있는지 확인합니다. 새 프로젝트에서는 기본으로 활성화됩니다.
4. 기존 `.env.local`의 카카오맵 설정을 유지하고 아래 값을 추가한 뒤 개발 서버를 다시 실행합니다.

```dotenv
VITE_FIREBASE_API_KEY=웹앱의_apiKey
VITE_FIREBASE_PROJECT_ID=웹앱의_projectId
VITE_FIREBASE_MESSAGING_SENDER_ID=웹앱의_messagingSenderId
VITE_FIREBASE_APP_ID=웹앱의_appId
VITE_FIREBASE_VAPID_KEY=웹_푸시_인증서의_공개키
```

이 값들은 브라우저용 공개 설정입니다. **서비스 계정 JSON·private_key·VAPID 비공개키는 프런트에 넣지 않습니다.** `.env.local`은 Git에 포함하지 않습니다. Vercel의 Environment Variables에도 같은 5개 값을 Production에 등록하고 **다시 배포**합니다. Preview에서 테스트하려면 해당 환경에도 등록합니다. Vite 환경변수는 빌드 시 반영됩니다.

설정 출처: [Firebase 웹 앱 등록](https://firebase.google.com/docs/web/setup#register-app), [FCM 웹 시작하기](https://firebase.google.com/docs/cloud-messaging/web/get-started).

### 알림 연결 확인

1. HTTPS 배포 주소 또는 `http://localhost:5173`에서 실제 계정으로 로그인합니다.
   iPhone·iPad는 iOS·iPadOS 16.4 이상에서 공유 메뉴의 **홈 화면에 추가**로 설치한 뒤, 추가한 아이콘으로 실행합니다. 일반 브라우저 탭에는 설치 안내를 표시하고 권한 요청·등록은 시도하지 않습니다.
2. **마이페이지 → 알림 켜기**를 누르고 브라우저 알림 권한을 허용합니다.
3. Firebase 등록 뒤 서버 구독 API가 성공하고 화면에 연결 완료가 표시되는지 확인합니다.
4. 조건에 맞는 대기를 신청한 테스트 계정으로 빈자리 발행 후, 활성 탭의 토스트·시스템 알림과 백그라운드 시스템 알림을 확인합니다. macOS에서는 시스템 설정의 해당 브라우저 알림 허용·알림 센터 표시도 확인합니다. 실제 데이터가 생성되므로 운영 계정의 임의 예약·발행으로 테스트하지 않습니다.
5. **알림 끄기**에서 서버 구독과 Firebase 등록 해제가 완료되는지 확인합니다.

Firebase JS SDK 13의 `register`/`onRegistered`/`unregister`로 등록을 관리합니다. `public/firebase-messaging-sw.js`는 같은 버전의 compat SDK를 사용하고 공개 설정을 등록 URL에서 받습니다. 브라우저 자체의 알림 권한은 사이트 설정에서 관리합니다.

시스템 알림의 아이콘은 `/icons/puzzle-mark-192.png`, 큰 이미지는 `/icons/puzzle-mark-512.png`, 상태표시 배지는 단색 퍼즐 실루엣 `/icons/puzzle-mark-badge-96.png`로 고정합니다. 서비스 워커에서 SDK 초기화 전에 `showNotification`에 공통 이미지와 중복 방지를 적용하며 제목·본문·클릭 정보는 유지합니다. Firebase/Vercel의 추가 설정은 필요 없으며, 배포 후 사이트를 다시 열어 새 서비스 워커를 적용합니다. 실제 이미지 표시 크기·위치와 브라우저 자체 아이콘은 OS/브라우저가 결정합니다. 배너·소리·잠금 화면 표시는 기기 알림 설정과 집중 모드도 확인합니다.

### 백엔드 알림 계약

[FCM 등록·해제 계약](docs/fcm-backend-handoff.md)에 현재 API와 운영 확인 항목을 정리했습니다. 프론트는 `onRegistered`에서 받은 FID를 `POST /api/v1/notifications/push-subscriptions`로 연결하고, 반환된 구독 ID로 해제합니다.

| 필드 | 용도 |
| --- | --- |
| `notification.title`, `notification.body` | 알림 제목·본문 |
| `data.url` | 앱 내부 이동 경로. 예: `/customer/waitlist` |
| `data.shopId` | `url`이 없을 때 매장 상세로 이동 |
| `data.notificationId` | 알림 식별자 |
| `data.type`, `data.roomId`, `data.messageId` | 채팅 알림은 `CHAT_MESSAGE`, 대상 채팅방 ID, 메시지 ID |
| `webpush.fcm_options.link` | 배포 앱과 동일한 origin의 전체 HTTPS URL |

`data` 값은 문자열입니다. 활성 탭에서 FCM을 받으면 알림함을 갱신하고 서비스 워커에 시스템 알림 표시를 요청합니다. 빈자리 토스트는 대기 후보 조회에서만 표시해 SSE·FCM과 중복되지 않게 합니다. 공통 표시 큐와 최근 500개 ID의 캐시로 여러 탭·재수신·워커 재시작의 중복 표시를 막습니다. 일반 알림은 `notificationId`, 채팅은 `messageId`를 우선 사용합니다. `notification`이 있으면 백그라운드 표시를 FCM SDK에 맡기고, 데이터 전용 메시지만 직접 표시합니다.

클릭 이동은 같은 origin만 허용합니다. `/chat?roomId=...`는 로그인 후 실제 채팅방 목록과 가게 소유 여부를 확인해 고객·사장님 채팅 화면으로 이동합니다. 채팅 알림의 `notificationId`가 메시지 ID여도 알림함 읽음 API에 보내지 않고, 대화를 실제 연 뒤 기존 채팅 읽음 처리를 사용합니다. 로그인이 필요하면 알림 목적지를 보관했다가 복원합니다.

iPhone 지원 조건: [WebKit 홈 화면 웹 앱 푸시 안내](https://webkit.org/blog/13878/). 포그라운드 수신 처리: [Firebase 문서](https://firebase.google.com/docs/cloud-messaging/web/receive-messages).

## 백엔드 명세와 연결 상태

[API 연결 현황](docs/backend-api-review.md)과 [OpenAPI 스냅샷](docs/openapi.snapshot.json)은 2026년 10월 17일 기준으로 갱신했습니다. 최신 계약은 [Swagger UI](https://140.238.19.165/swagger-ui/index.html)에서 확인합니다.

화면은 직접 업무 API를 사용합니다. 임시 `/backend` 점검 화면과 샘플 데이터·데모 진입은 제거했습니다. `src/lib/backend-api.ts`가 성공 데이터 추출, 인증 쿠키, CSRF, 오류, 15초 타임아웃을 공통 처리합니다. 서버 미지원 응답이나 외부 의존성 장애는 오류로 표시합니다.

공개 카테고리·매장 검색 조회와 멱등 키를 포함한 CORS 허용은 확인했습니다. 실제 계정으로 로그인·예약·빈자리 발행·푸시 도착을 한 번에 검증한 결과는 아닙니다. 프론트 origin이 달라지면 서버의 CORS 허용 목록도 확인합니다.

## 배포 전 확인

```sh
pnpm lint
pnpm test
pnpm build
pnpm preview
```

`pnpm test`는 Node 기본 테스트 도구로 API 요청·응답 형식, 버전·가격 충돌, 중복 요청 방지, 날짜·할인·등록 입력 경계, 채팅 이력과 푸시 구독 처리를 검증합니다. 지도 SDK 로딩과 하단 시트 동작 테스트도 포함합니다. 테스트는 모의 HTTP 응답을 사용하며 운영 서버에 예약이나 알림 발행을 생성하지 않습니다.

자동 테스트는 운영 데이터에 쓰지 않습니다. 두 계정 간 실제 예약 확정·채팅 송수신·FCM 도착은 테스트 계정으로 별도 확인합니다.

## Vercel 배포

GitHub에 이 저장소를 푸시한 뒤 Vercel의 Add New → Project에서 가져옵니다.
현재 Git 저장소 루트에 `package.json`이 있으므로 Root Directory는 `.`입니다.

| 설정 | 값 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | . |
| Build Command | pnpm build |
| Output Directory | dist |
| Install Command | 자동 감지 유지 (Override 끄기) |
| Node.js Version | 22.x (`package.json`에 지정) |

`pnpm-lock.yaml`을 커밋해 Vercel이 pnpm을 자동 감지하도록 합니다.
카카오맵 표시는 위의 `VITE_KAKAO_MAP_APP_KEY` 환경변수와 도메인 등록이 필요합니다.
푸시 수신은 위의 Firebase 환경변수 5개와 사용자의 브라우저 알림 허용이 필요합니다.
`vercel.json`은 `/api/v1/chatting/ws`를 `api/chat-ws.ts` 함수로 먼저 연결하고, 나머지 `/api/:path*`는 `https://140.238.19.165/api/:path*`로 전달합니다. 마지막 SPA catch-all은 하위 경로 직접 접속과 새로고침을 React Router로 연결합니다. 이 순서를 유지해야 합니다.

웹소켓 중계 함수는 서울 리전 `icn1`에서 고정 Oracle 주소로만 연결하며, 운영 Origin과 `bintime.chat.v1`을 검사하고 `bt_session` 쿠키만 전달합니다. 기존 서버가 세션·CSRF·방 권한을 검증하며, 인증 프레임과 텍스트·바이너리·Ping/Pong·종료 코드를 양방향으로 전달합니다. 브라우저에는 쿠키 값을 노출하지 않습니다. 로컬 Vite는 기존 `ws: true` 프록시를 사용합니다.

Vercel Functions의 WebSocket 베타와 **Fluid compute**가 필요합니다. 함수 최대 실행 시간은 300초이며 종료 시 기존 채팅 재연결·sequence 복구를 사용합니다. 연결 유지 중 Function 사용량이 발생합니다. 서버·카카오 설정 변경은 필요 없지만, 배포 후 실제 로그인 세션으로 `101 → connection.ready → room.subscribed`를 확인해야 합니다. [Vercel WebSocket 공식 문서](https://vercel.com/docs/functions/websockets)
로그인 전환 배포는 [서버·카카오 설정 전달 문서](docs/same-origin-login-handoff.md)에 따라 서버 담당자와 같은 작업 시간에 진행합니다. 프론트만 먼저 배포하거나 서버 콜백만 먼저 바꾸면 로그인 시작과 콜백의 세션이 분리될 수 있습니다.
API 연결 시 필요한 공개 설정은 Vercel 프로젝트의 Environment Variables에 등록합니다.
`VITE_` 변수는 브라우저에 공개되므로 비밀 인증키나 DB 비밀번호를 넣지 않습니다. 카카오맵에는 브라우저 공개용 JavaScript 키만 사용합니다.

공식 문서: [Vite 배포](https://vercel.com/docs/frameworks/frontend/vite),
[패키지 매니저 자동 감지](https://vercel.com/docs/package-managers),
[Vite 환경변수](https://vite.dev/guide/env-and-mode).
