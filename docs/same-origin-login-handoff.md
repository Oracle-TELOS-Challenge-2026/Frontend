# Safari 로그인: 같은 주소의 API 프록시로 전환

2026년 10월 17일 기준. 프론트 배포, 서버 환경변수 반영, 카카오 콜백 등록을 함께 확인하는 전환 절차다. 프론트 배포만으로 서버·카카오 설정까지 완료되지는 않는다. 서버 실행 환경과 카카오 콘솔은 담당자가 별도로 반영하고 확인한다.

## 바꾸는 이유와 범위

실기기 Safari에서 새로 로그인한 뒤 API 주소의 `/api/v1/users/me`는 `200`이었지만, Vercel 화면에서 IP API로 요청하면 쿠키가 전달되지 않아 `401`이었다. 서버 세션 생성 후 브라우저의 서로 다른 사이트 간 쿠키 전달이 막힌 상태다. Safari는 기본적으로 타사 쿠키를 차단한다. [WebKit 안내](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)

브라우저는 `https://frontend-oracle.vercel.app/api/...`만 호출하고 Vercel이 Oracle 서버로 전달하게 바꾼다. 기존 Vercel·Oracle을 유지하며 Java 소스 변경은 필요하지 않다. 서버 담당자는 기존 환경변수 두 값과 쿠키 전달을 확인한다.

| 항목 | 전환할 값 또는 동작 |
| --- | --- |
| 프론트 API 기준 주소 | `BACKEND_API_ORIGIN = ''` |
| Vercel rewrite | `/api/:path*` → `https://140.238.19.165/api/:path*` |
| 로그인 시작 | `https://frontend-oracle.vercel.app/api/v1/auth/oauth/kakao/start` |
| 카카오 콜백 | `https://frontend-oracle.vercel.app/api/v1/auth/oauth/kakao/callback` |
| 서버 `KAKAO_REDIRECT_URI` | 위 카카오 콜백 전체 주소 |
| 서버 `FRONTEND_URL` | `https://frontend-oracle.vercel.app` |

API rewrite를 `/index.html`로 보내는 SPA catch-all보다 앞에 둔다. `/api` 경로를 제거하지 않는다. REST·CSRF·SSE·WebSocket도 같은 프론트 호스트를 사용한다. [Vercel 외부 rewrite](https://vercel.com/docs/routing/rewrites#rewrites-to-external-origins)

로그인 시작에서 저장한 OAuth 요청과 `state`를 콜백에서 같은 세션으로 찾아야 한다. 시작은 Vercel인데 콜백은 IP인 조합은 사용하지 않는다. IP에 있던 세션 쿠키는 Vercel 호스트로 옮겨지지 않으므로 전환 후에는 새로 로그인한다.

## 서버 설정

서버 담당자는 `KAKAO_REDIRECT_URI`를 아래 값으로 바꾸고 새 환경변수가 적용되도록 서버 프로세스를 재시작한다. 컨테이너 배포라면 바뀐 환경변수로 컨테이너를 재생성한다. `FRONTEND_URL`이 이미 아래 값이면 유지한다. `compose.yaml`의 기본값만 보고 적용됐다고 판단하지 말고 실제 실행 환경을 확인한다.

```dotenv
KAKAO_REDIRECT_URI=https://frontend-oracle.vercel.app/api/v1/auth/oauth/kakao/callback
FRONTEND_URL=https://frontend-oracle.vercel.app
```

- 현재 서버는 이 환경변수로 OAuth 콜백·로그인 완료 주소를 설정한다. REST와 WebSocket의 허용 origin도 현재 프론트 주소와 일치하는지 확인한다. 전체 origin 허용으로 바꾸지 않는다.
- `bt_session`은 **Domain 미지정**, `Secure`, `HttpOnly`, `Path=/`를 유지한다. 현재 운영의 `SameSite=None`도 이번 작업에서 변경하지 않는다. IP나 `.vercel.app`을 Cookie Domain으로 지정하지 않는다.
- Oracle 응답의 `Set-Cookie`가 Vercel을 거쳐 브라우저에 저장되고, 이후 요청의 `Cookie`가 Oracle까지 전달돼야 한다. 인증·사용자별 API 응답을 공유 캐시하지 않는다. `HttpOnly` 쿠키를 자바스크립트나 브라우저 저장소로 옮기는 처리는 추가하지 않는다.
- 로그인 세션과 CSRF 검증은 기존 서버가 담당한다. Java 소스·인증 방식·카카오 REST API 키·Client Secret은 이 전환 때문에 바꾸지 않는다.

## 카카오 콘솔

1. [Kakao Developers 앱 관리](https://developers.kakao.com/console/app)에서 현재 서버가 사용하는 앱을 선택한다.
2. **앱 → 플랫폼 키 → REST API 키**에서 서버가 사용하는 키를 선택한다. 지도용 JavaScript 키의 설정과 구분한다.
3. **카카오 로그인 리다이렉트 URI**에 아래 주소를 추가하고 저장한다.

```text
https://frontend-oracle.vercel.app/api/v1/auth/oauth/kakao/callback
```

프로토콜·호스트·경로·끝 슬래시까지 서버의 `KAKAO_REDIRECT_URI`와 같아야 한다. 기존 `https://140.238.19.165/api/v1/auth/oauth/kakao/callback` 항목은 전환 검증 전에는 삭제하지 않는다. 새 앱이나 새 키를 만들 필요는 없다. [카카오 공식 설정 경로와 URI 규칙](https://developers.kakao.com/docs/ko/app-setting/app#redirect-uri)

## 함께 적용하는 순서

1. 카카오 콘솔에 새 URI를 먼저 추가하되 기존 IP URI를 남긴다. URI 추가만으로 서버가 쓰는 콜백이 변경되지는 않는다.
2. 프론트 테스트·빌드를 통과한 변경을 커밋·푸시하고 배포 결과를 확인한다.
3. 서버의 `KAKAO_REDIRECT_URI`를 반영하고 새 환경변수로 프로세스를 재시작하거나 컨테이너를 재생성한다. 프론트의 `/api` 프록시와 서버 콜백 변경이 모두 반영돼야 한다. 한쪽만 반영된 중간 상태에서는 로그인이 실패할 수 있으며, 프론트 배포 성공을 로그인 전환 완료로 판단하지 않는다.
4. 전환 전에 시작한 로그인은 이어서 사용하지 않고, 운영 Vercel 주소에서 페이지를 새로 열어 로그인한다. 아래 검증을 완료한 뒤 정상 전환으로 판단한다.
5. 되돌려야 한다면 프론트 API 주소와 서버 `KAKAO_REDIRECT_URI`를 함께 이전 상태로 맞춘다. 기존 IP 방식으로 돌아가면 Safari의 원래 쿠키 문제가 다시 남는다.

## 브라우저에서 확인할 결과

Safari의 사이트 간 추적 방지를 켠 기본 설정으로 확인한다. Mac Safari와 실제 iPhone에서 개발자 도구의 네트워크 로그 보존을 켜고 다음 흐름을 본다. 로그를 공유할 때는 쿠키 값·인가 코드·`state`·CSRF 토큰·사용자 정보를 제외한다.

| 단계 | 확인할 결과 |
| --- | --- |
| 로그인 전 `/api/v1/users/me` | `401`은 정상 비로그인 상태 |
| 로그인 버튼 | Vercel 호스트의 `/api/v1/auth/oauth/kakao/start`로 시작 |
| 카카오 인가 요청 | `redirect_uri`가 새 Vercel 콜백 주소 |
| 콜백 | Vercel 콜백으로 돌아와 로그인 성공 시 앱으로 `303` 이동 |
| 쿠키 | Vercel 호스트에 `bt_session` 저장. Domain 미지정, `Secure`, `HttpOnly`, `Path=/` |
| 로그인 직후 `/api/v1/users/me` | 같은 Vercel 호스트로 요청하며 `200`. `Sec-Fetch-Site`는 `same-origin` |
| 페이지 새로고침·재진입 | 세션이 유지되고 로그인 화면으로 반복 복귀하지 않음 |
| CSRF·로그아웃 | CSRF 조회 성공, 로그아웃 성공 후 `/users/me`가 다시 `401` |

로그인 성공 화면이나 콜백 `303`만으로 검증을 끝내지 않는다. 최종 `/users/me`가 `200`인지 확인한다. `KOE006`이면 카카오 등록 URI와 실제 `redirect_uri`를 비교하고, `OAUTH_FAILED`면 시작·콜백 호스트 및 OAuth 세션 연속성을 확인한다. 콜백 후 `401`이면 쿠키 저장·전송과 프록시의 헤더 전달을 확인한다. API 응답이 HTML이면 rewrite 순서를 확인한다.

채팅 WebSocket의 `101 Switching Protocols`, 두 계정 간 실시간 송수신과 읽음, SSE의 `text/event-stream` 지속 수신·재연결도 별도로 확인한다. **Vercel 운영 프록시를 통과하는 WebSocket·SSE는 아직 검증하지 않았다.** 채팅의 기존 REST 복구만 작동하는 경우를 WebSocket 검증 성공으로 기록하지 않는다.

## localhost와 Preview의 제한

Vite의 `/api` 프록시는 로컬에서 상대 API 경로를 Oracle로 연결한다. 그러나 운영 서버는 `KAKAO_REDIRECT_URI`와 `FRONTEND_URL` 한 쌍을 사용하므로 localhost나 Preview에서 로그인을 시작하면 운영 콜백과 세션 호스트가 달라진다. 프록시가 있다는 이유만으로 해당 주소의 OAuth 로그인이 완성되지는 않는다.

실제 로그인 검증은 우선 고정 운영 주소에서 진행한다. 로컬·Preview OAuth가 필요하면 별도 서버 실행 환경에 해당 호스트의 콜백·완료 주소·허용 origin을 맞추고 카카오에도 등록해야 한다. 운영의 `Secure` 쿠키를 사용할 개발 환경은 HTTPS 조건도 확인해야 한다. 임의 Preview 도메인으로 운영 환경변수를 수시 변경하지 않는다.

## 서버 담당자에게 전달할 요청

```text
Safari에서 카카오 로그인 세션은 발급되지만 Vercel → IP API 요청에 쿠키가 빠져
/api/v1/users/me가 401이 되는 문제를 같은 호스트의 /api 프록시로 전환하려고 합니다.
프론트 변경은 Vercel /api → https://140.238.19.165/api 프록시와 상대 API 주소를 사용합니다.
프론트 배포 외에 아래 서버 환경변수 반영과 카카오 콜백 등록이 필요합니다.

서버 실행 환경에서 아래 값을 변경해 주세요.
KAKAO_REDIRECT_URI=https://frontend-oracle.vercel.app/api/v1/auth/oauth/kakao/callback
변경한 환경변수가 적용되도록 서버 프로세스를 재시작해 주세요.
컨테이너 배포라면 새 환경변수로 컨테이너를 재생성해 주세요.

아래 값은 이미 같다면 유지해 주세요.
FRONTEND_URL=https://frontend-oracle.vercel.app

카카오 Developers의 현재 REST API 키 > 카카오 로그인 리다이렉트 URI에는
다음 콜백 URL만 추가해 주세요.
https://frontend-oracle.vercel.app/api/v1/auth/oauth/kakao/callback
기존 IP 콜백 등록은 전환 검증 전까지 유지해 주세요.

Java 소스 수정 없이 기존 환경변수로 반영하는 요청입니다.
bt_session의 Domain 미지정, Secure, HttpOnly, Path=/와 현재 SameSite 설정을 유지하고,
현재 Vercel origin 허용 및 프록시의 Cookie/Set-Cookie 전달을 확인해 주세요.
프론트 배포와 서버 콜백 변경을 함께 완료한 뒤 새 로그인으로 users/me 200을 확인하겠습니다.
WebSocket과 SSE가 Vercel 프록시를 통과하는지도 별도 검증이 필요합니다.
```
