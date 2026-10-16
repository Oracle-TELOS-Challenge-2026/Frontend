# 빈틈 BinTime

**비어 있던 시간에, 새로운 가치를.**

우리 동네 뷰티샵의 취소 빈자리를 찾고 예약하는 모바일 중심 화면 시연입니다.
React + TypeScript + Vite 프로젝트입니다.
스타일은 Tailwind CSS 4, 라우팅은 react-router-dom 7을 사용합니다.
Tailwind는 Vite 플러그인과 `src/index.css`에서 연결하고, 라우트는 `src/App.tsx`에 정의합니다.

## 화면과 시연 범위

처음에는 스플래시 → 빈틈 시작하기 → 고객/사장 선택 순서로 진입합니다.
이후에는 마지막 역할을 복원하며, 상단의 고객/사장님 전환 버튼으로 바로 전환합니다.
사장님을 처음 선택하거나 미등록 상태에서 사장님으로 전환하면 가게 등록(기본 정보 → 대표 시술 → 확인)을 시작합니다.

| 역할 | 화면 |
| --- | --- |
| 고객 | 지도·검색, 가게 상세·예약, 대기 알림 신청·변경·취소, 예약내역, 가게 채팅, 마이페이지·취향 입력 |
| 사장 | 가게 등록, 날짜별 예약 타임테이블, 취소·노쇼 빈자리 할인 등록, 고객 채팅, 마이페이지·등록 정보 |

- 마지막 역할·등록 가게·고객 취향은 `localStorage`의 `bintime.account.v1`에 저장되어 앱을 닫거나 새로고침해도 유지됩니다. 현재 인증 전 체험 계정이므로 **이 브라우저에서만** 유지되며, 브라우저 저장 데이터를 지우면 초기화됩니다. 저장 불가 시 오류를 표시하고 완료 처리하지 않습니다.
- 가게 등록은 최종 확인에서 완료됩니다. 취소하면 고객 화면으로 돌아가며, 등록하지 않은 상태로 다시 열면 등록을 시작합니다. 신규 가게는 고유 ID를 가지며 샘플 가게의 예약·채팅·취소 내역을 가져오지 않습니다. 주소 검색·지도 좌표·서버 공개 기능은 미연결이므로 등록 정보는 사장님 화면에만 반영됩니다.
- 상단 **마이페이지 → 정보 입력하기**에서 고객 취향을 최대 2,000자로 입력·수정·지울 수 있습니다. 지금은 브라우저 저장만 지원합니다. **AI 분석·서버 벡터 추출·추천 순위 반영은 아직 연결되지 않았으며**, 완료 상태나 임의 추천 점수를 표시하지 않습니다. 카카오 로그인도 기존 체험 진입을 유지합니다.
- 시연 기준 시각은 **2026년 10월 16일 14:20, Asia/Seoul**로 고정됩니다. `src/data/demo.ts`에서 변경할 수 있습니다.
- 예약·대기·할인 등록·메시지는 현재 탭의 React 메모리에 저장됩니다. 역할을 바꿔도 유지되며, 새로고침하면 초기 샘플 데이터로 돌아갑니다. 다른 탭이나 기기와 공유되지 않습니다.
- 대기는 예약 확정이 아닙니다. 신청한 가게·날짜·시간에 빈자리가 생기면 대기내역에서 직접 예약할 수 있습니다.
- 상세 화면과 대기내역의 예약 버튼은 가게·시술·날짜·시간·금액 확인 모달을 먼저 엽니다. **예약 확정하기**를 눌러야 예약되고, 돌아가기·닫기·ESC·바깥 클릭은 예약 없이 모달만 닫습니다.
- 대기 취소와 지난 예약내역 삭제는 확인 모달에서 삭제를 확정해야 처리합니다. 지난 예약은 고객 목록에서만 숨기며 사장님 기록과 예약 시간 점유는 유지합니다. 새로고침하면 삭제한 시연 내역도 초기화됩니다.
- 할인 빈자리의 고객 지도·대기내역 반영과 중복 예약 방지 로직은 유지합니다. 신규 등록 가게에는 예약·취소 샘플이 없으므로 서버 연동 전 사장님 화면은 빈 상태로 시작합니다.
- 고객 홈은 Kakao Maps Web SDK를 사용합니다. 지도 중심 화면에서 가격 핀을 누르면 하단에 가게 요약이 나오고, 요약 카드를 누르면 상세로 이동합니다. 검색·카테고리를 유지하며 목록 보기와 지도 보기를 전환하고, 시트 손잡이를 누르거나 위아래로 끌어 목록을 펼치고 접을 수 있습니다. 마지막 검색 영역에서 가로·세로 폭의 25%를 넘게 이동하거나 확대 수준을 바꾸면 나타나는 **이 지역 재검색** 버튼으로 현재 지도 영역의 샘플을 다시 검색합니다. 검색어·카테고리는 유지됩니다. 업종은 Lucide 라인 아이콘으로, 특가는 굵은 코랄색 테두리로 표시합니다. 키가 없거나 지도 로딩에 실패해도 가게 목록은 사용할 수 있습니다.
- 기준 위치는 **청년취업사관학교 동작캠퍼스(서울 동작구 노량진로 10)**입니다. 중심 좌표 37.51243, 126.92727에서 반경 5km 안에 업종별 5곳씩 총 20개 가상 가게를 배치했습니다. 거리는 캠퍼스 기준 직선거리이며, 가게·주소·좌표·사진·예약 정보는 시연용입니다. 검색은 현재 영역의 샘플 가게를 필터링하며 카카오 장소 검색, 카카오 인증, 서버 저장, 실시간 채팅은 아직 연결하지 않았습니다.

- Firebase 설정 후 마이페이지에서 **알림 켜기/끄기**로 이 브라우저의 FCM 수신을 관리합니다. 화면을 보고 있으면 기존 토스트, 백그라운드에서는 시스템 알림을 표시합니다. **로그인 사용자와 수신 기기를 연결하는 API 및 빈자리 조건 매칭·자동 발송은 미연결**이므로, 대기 신청만으로 실제 푸시가 발송되지는 않습니다.

- **내 위치** 버튼을 누르면 브라우저 위치 권한을 요청합니다. 허용하면 코랄 점으로 현재 위치를 표시하고, 화면을 떠날 때까지 위치를 갱신합니다. 최초 수신과 버튼 재클릭 때만 지도를 내 위치로 옮기며, 지도를 둘러보는 동안에는 점만 갱신합니다. 거부·시간 초과·수신 불가 시 안내를 표시합니다. 실제 위치가 샘플 지역 밖이면 가게가 없을 수 있습니다. 위치 기능은 HTTPS 또는 localhost에서 사용합니다.

기준 위치 출처: [서울시 동작캠퍼스 안내](https://mediahub.seoul.go.kr/archives/2006552), [스페이스살림 지도 좌표](https://mapcarta.com/W1113246888).

## 브랜드 UI

- 브랜드명은 **빈틈 BinTime**, 슬로건은 **비어 있던 시간에, 새로운 가치를.**입니다.
- `src/index.css`의 공통 색상 토큰을 사용합니다. 주요 버튼·선택 상태·할인 강조는 코랄 `#EB7373`, 보조 배경은 `#FEF9F9`, 기본 배경과 지도 위 버튼은 흰색입니다. 카테고리·본문 글씨는 차콜 `#333333`이며, 코랄 배경 위에는 대비를 확보한 `#262626`, 작은 강조 글씨에는 진한 코랄 `#B84646`을 사용합니다.
- Pretendard를 우선 사용하고, 설치되지 않은 환경에서는 기존 한글 시스템 폰트로 표시합니다.
- 마스코트는 원본 점선 실루엣의 색상을 코랄로 조정한 `public/images/bintime-mascot-coral.png`입니다. 공통 `Mascot`에서 사용하며, 작은 브랜드 마크는 `public/favicon.svg`입니다. 탭 아이콘은 색상 버전 쿼리를 붙여 이전 아이콘 캐시를 갱신합니다.
- 아이콘은 Lucide 공식 SVG를 기존 `Icon` 컴포넌트로 사용합니다. 라이선스는 `public/lucide-LICENSE.txt`에 포함합니다.

## 소스 구조

```text
src/
  App.tsx              라우트와 화면 연결
  pages/
    auth/              스플래시, 로그인, 역할 선택
    customer/          고객 지도, 상세, 대기, 예약 화면
    owner/             가게 등록, 사장 타임테이블, 빈자리 알림, 채팅 목록
    ChatPage.tsx       고객·사장 공통 채팅 화면
    ProfilePage.tsx    역할별 마이페이지
    PreferencesPage.tsx 고객 취향 입력
  components/          내비게이션, 모달, 아이콘 등 공통 UI
    customer/          지도, 가게 카드, 대기 신청 UI
    owner/             타임테이블, 할인 등록 UI
  hooks/               계정 로컬 저장(useAccount), 시연 상태, 모달, 검색, 지도 초기화(useKakaoMap)
  data/demo.ts         시연 데이터와 기준 날짜·역할 상수
  lib/booking.ts       예약 가능 여부, 할인, 대기 날짜 검증
  lib/account.ts       저장 상태 복원, 역할별 진입 경로, 가게 등록 검증
  lib/format.ts        날짜·시간·금액 표시
  lib/kakao-map.ts     Kakao Maps SDK 로딩·중복 방지·실패 재시도
  types/kakao-map.ts   사용하는 Kakao Maps SDK API의 타입
  types.ts             공통 데이터 타입
  model.ts             공통 데이터·로직의 재내보내기
  styles/              고객·사장 화면 스타일
  index.css            공통 스타일
scripts/*.test.mjs      예약·할인·대기 로직과 지도 SDK 로더 테스트
public/images/         시연용 가게 사진
```

## 로컬 실행

Node.js 22.12 이상인 22.x와 pnpm 10을 사용합니다.
로컬 검증 버전은 Node.js 22.19.0, pnpm 10.17.0입니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

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

### 수신 테스트

1. `pnpm dev` 후 일반 Chrome 창에서 `http://localhost:5173`을 엽니다. 배포 환경에서는 HTTPS를 사용합니다.
2. 고객 또는 사장님 **마이페이지 → 알림 켜기**를 누르고 브라우저 알림 권한을 허용합니다. 권한을 차단한 경우 주소창의 사이트 설정에서 알림 권한을 변경합니다.
3. 마이페이지의 **Firebase 수신 테스트 → 수신 ID 복사**로 **Firebase Installation ID(FID)**를 복사합니다. 로컬과 배포 사이트 모두 해당 브라우저의 수신 ID를 확인할 수 있습니다.
4. Firebase Console의 **Messaging → 캠페인 만들기 → Firebase 알림 메시지**에서 제목·본문을 입력하고 **테스트 메시지 전송**을 선택합니다. **Firebase Installation ID 또는 FCM 등록 토큰 추가** 입력란에 복사한 FID를 넣고 테스트를 전송합니다. [공식 콘솔 테스트 절차](https://firebase.google.com/docs/cloud-messaging/flutter/get-started#send_a_test_notification_message)
5. 앱 탭을 보고 있으면 토스트, 다른 탭을 보고 있으면 시스템 알림이 도착하는지 각각 확인합니다. 시스템 알림이 보이지 않으면 OS의 Chrome 알림 허용 상태와 집중 모드도 확인합니다.

Firebase JS SDK 13의 `register`/`onRegistered`/`unregister`로 등록을 관리하며, 구형 `getToken` 방식과 혼용하지 않습니다. `public/firebase-messaging-sw.js`는 같은 버전의 compat SDK를 사용하며 공개 설정을 등록 URL에서 받으므로 파일에 키를 직접 복사할 필요가 없습니다. 알림 끄기는 이 브라우저의 FCM 등록을 해제하며, 브라우저 자체의 알림 권한은 사이트 설정에서 관리합니다.

### 백엔드 연결 시 계약

실제 로그인 연결 후에는 `onRegistered`로 받은 FID를 **인증된 사용자**에 연결하는 등록·갱신 API와 로그아웃·알림 해제 시 연결을 삭제하는 API가 필요합니다. 현재 프런트에는 이 API 요청이 없고, 체험 계정을 서버 사용자로 등록하지 않습니다. 백엔드는 FID 대상을 지원하는 FCM 발송 API를 사용해 빈자리 저장·조건 매칭·발송 기록·재시도를 처리해야 합니다.

| 필드 | 용도 |
| --- | --- |
| `notification.title`, `notification.body` | 알림 제목·본문 |
| `data.url` | 앱 내부 이동 경로. 예: `/customer/waitlist` |
| `data.shopId` | `url`이 없을 때 `/customer/shops/{shopId}`로 이동 |
| `data.notificationId` | 알림 식별자. 문자열로 전달 |
| `webpush.fcm_options.link` | 배포 앱과 동일한 origin의 전체 HTTPS URL |

`data` 값은 문자열로 전송합니다. `notification`이 있으면 백그라운드 표시를 FCM SDK에 맡겨 중복 알림을 피합니다. 데이터 전용 메시지는 `data.title`·`data.body`를 사용해 서비스 워커에서 표시합니다. 클릭 이동은 같은 origin만 허용하며, 새로고침 후에도 접근 가능한 앱 경로를 전달해야 합니다. [FCM 웹 수신·클릭 처리](https://firebase.google.com/docs/cloud-messaging/web/receive-messages)

## 배포 전 확인

```sh
pnpm lint
pnpm test
pnpm build
pnpm preview
```

`pnpm test`는 Node 기본 테스트 도구로 할인 입력 경계, 예약 중복과 시간 겹침,
일치하는 대기만 해제되는지, 취소 빈자리 발행, 대기 날짜·시간 검증을 확인합니다.
지도 로더는 키 누락, 중복 요청 방지, 네트워크 실패 후 재시도, SDK 초기화 완료 대기를 확인합니다.
하단 시트는 클릭·드래그 전환, 드래그 뒤 중복 클릭 방지, 드래그 취소 시 상태 초기화를 확인합니다.
지역 검색은 영역 경계 포함·제외, 검색어·업종·영역 교집합을 검증하고, 시연 데이터는 반경 5km·업종 분포·예약 참조 무결성을 확인합니다.
계정 테스트는 마지막 역할·등록 가게·취향 복원, 손상된 저장 데이터, 최초/미등록/등록 역할별 진입 경로, 가게 입력과 취향 길이의 경계값을 확인합니다.

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
`vercel.json`의 rewrite는 하위 경로 직접 접속과 새로고침을 React Router로 연결합니다.
API 연결 시 필요한 공개 설정은 Vercel 프로젝트의 Environment Variables에 등록합니다.
`VITE_` 변수는 브라우저에 공개되므로 비밀 인증키나 DB 비밀번호를 넣지 않습니다. 카카오맵에는 브라우저 공개용 JavaScript 키만 사용합니다.

공식 문서: [Vite 배포](https://vercel.com/docs/frameworks/frontend/vite),
[패키지 매니저 자동 감지](https://vercel.com/docs/package-managers),
[Vite 환경변수](https://vite.dev/guide/env-and-mode).
