# Oracle 해커톤 프론트엔드

우리 동네 뷰티샵의 취소 빈자리를 찾고 예약하는 모바일 중심 화면 시연입니다.
React + TypeScript + Vite 프로젝트입니다.
스타일은 Tailwind CSS 4, 라우팅은 react-router-dom 7을 사용합니다.
Tailwind는 Vite 플러그인과 `src/index.css`에서 연결하고, 라우트는 `src/App.tsx`에 정의합니다.

## 화면과 시연 범위

스플래시 → 카카오 시작 버튼 → 임시 고객/사장 선택 순서로 진입합니다.
상단의 역할 전환으로 같은 시연 데이터를 양쪽 화면에서 확인할 수 있습니다.

| 역할 | 화면 |
| --- | --- |
| 고객 | 지도·검색, 가게 상세·예약, 대기 알림 신청·변경·취소, 예약내역, 가게 채팅 |
| 사장 | 날짜별 예약 타임테이블, 취소·노쇼 빈자리 할인 등록, 고객 채팅 |

- 시연 기준 시각은 **2026년 10월 16일 14:20, Asia/Seoul**로 고정됩니다. `src/data/demo.ts`에서 변경할 수 있습니다.
- 예약·대기·할인 등록·메시지는 현재 탭의 React 메모리에 저장됩니다. 역할을 바꿔도 유지되며, 새로고침하면 초기 샘플 데이터로 돌아갑니다. 다른 탭이나 기기와 공유되지 않습니다.
- 대기는 예약 확정이 아닙니다. 신청한 가게·날짜·시간에 빈자리가 생기면 대기내역에서 직접 예약할 수 있습니다.
- 사장이 등록한 할인 빈자리는 고객 지도와 해당 대기내역에 반영됩니다. 같은 가게에서 예약 시간이 겹치는 경우 중복 예약을 막습니다.
- 고객 홈은 Kakao Maps Web SDK를 사용합니다. 지도 이동·확대와 예약 가능/할인 말풍선을 지원하며, 말풍선을 누르면 가게 상세로 이동합니다. 키가 없거나 지도 로딩에 실패해도 가게 목록은 사용할 수 있습니다.
- 가게·좌표·거리·사진·예약 정보는 시연용입니다. 검색은 샘플 가게를 필터링하며 카카오 장소 검색, 현재 위치, 카카오 인증, 서버 저장, 실시간 채팅, 푸시 알림은 아직 연결하지 않았습니다.

## 소스 구조

```text
src/
  App.tsx              라우트와 화면 연결
  pages/
    auth/              스플래시, 로그인, 역할 선택
    customer/          고객 지도, 상세, 대기, 예약 화면
    owner/             사장 타임테이블, 빈자리 알림, 채팅 목록
    ChatPage.tsx       고객·사장 공통 채팅 화면
  components/          내비게이션, 모달, 아이콘 등 공통 UI
    customer/          지도, 가게 카드, 대기 신청 UI
    owner/             타임테이블, 할인 등록 UI
  hooks/               시연 상태, 모달, 검색, 지도 초기화(useKakaoMap)
  data/demo.ts         시연 데이터와 기준 날짜·역할 상수
  lib/booking.ts       예약 가능 여부, 할인, 대기 날짜 검증
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
`vercel.json`의 rewrite는 하위 경로 직접 접속과 새로고침을 React Router로 연결합니다.
API 연결 시 필요한 공개 설정은 Vercel 프로젝트의 Environment Variables에 등록합니다.
`VITE_` 변수는 브라우저에 공개되므로 비밀 인증키나 DB 비밀번호를 넣지 않습니다. 카카오맵에는 브라우저 공개용 JavaScript 키만 사용합니다.

공식 문서: [Vite 배포](https://vercel.com/docs/frameworks/frontend/vite),
[패키지 매니저 자동 감지](https://vercel.com/docs/package-managers),
[Vite 환경변수](https://vite.dev/guide/env-and-mode).
