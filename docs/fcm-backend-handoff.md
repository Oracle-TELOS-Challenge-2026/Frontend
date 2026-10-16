# FCM 설정과 FID 등록 해제 API 수정 요청

2026년 10월 16일 기준 빈틈 프론트는 Firebase JavaScript SDK 13의 `register / onRegistered / unregister`를 사용합니다. `onRegistered`에서 받은 **Firebase Installation ID(FID)**를 서버에 등록하고, 서버가 로그인 사용자와 연결해 알림을 발송하도록 구현을 요청드립니다.

기존 Swagger N-04는 Web Push의 `endpoint / keys / expirationTime`을 받으므로 현재 프론트와 맞지 않습니다. **N-04와 N-05의 경로는 유지하고 N-04 입력을 `installationId`로 변경**하는 안입니다. 아래 앱 API 동작은 구현 요청안이며, 현재 서버는 계약 단계이고 프론트의 사용자별 등록·해제 호출도 아직 미연결입니다. 기존 명세는 [OpenAPI 스냅샷](openapi.snapshot.json), 전체 비교는 [API 검토표](backend-api-review.md)를 참고해 주세요.

## 서버 FCM 설정

| 준비 항목 | 값과 처리 |
| --- | --- |
| Firebase 프로젝트 ID | `bintime-33512`. 프론트와 같은 프로젝트를 사용 |
| 서버 인증 | 해당 프로젝트에 FCM 발송 권한이 있는 서비스 계정 사용 |
| 서비스 계정 JSON | Oracle 서버에서 사용할 인증 파일. 서버의 비밀 저장소에 별도 전달·보관 |
| VAPID 공개키 | 이미 프론트의 `register`에서 사용. 서버 발송 인증용으로 사용하지 않음 |
| 프론트 Firebase API 키 | 웹 앱 초기화 설정. 서비스 계정 인증을 대신하지 않음 |
| FID | 사용자 브라우저마다 달라지는 발송 대상. 고정 환경변수나 비밀 발송키가 아님 |

Firebase Console의 **프로젝트 설정 → 서비스 계정 → Firebase Admin SDK → 새 비공개 키 생성**에서 JSON을 발급할 수 있습니다. 실제 키는 이 문서·Swagger·Git·프론트 `VITE_` 변수에 넣지 않고 서버에만 보관합니다. 서버 실행 환경에서 다음처럼 인증 파일 경로를 지정합니다. 경로는 예시입니다.

```sh
export GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/bintime-firebase-admin.json
```

`Firebase Cloud Messaging API (V1)`의 사용 설정과 서비스 계정의 발송 권한을 확인해 주세요. HTTP v1 발송에는 서비스 계정으로 얻은 짧은 수명의 OAuth 2.0 액세스 토큰을 사용하며, scope는 `https://www.googleapis.com/auth/firebase.messaging`입니다. 액세스 토큰 발급·갱신은 서버의 Google 인증 라이브러리 또는 지원되는 Admin SDK에 맡깁니다. [Firebase 서버 인증 안내](https://firebase.google.com/docs/cloud-messaging/send/v1-api#authorize_http_v1_send_requests)

현재 공식 REST 규격은 `message.fid`를 지원합니다. 설치한 Java Admin SDK에 FID 전송 기능이 없다면 인증 라이브러리와 HTTP v1 API를 사용하면 됩니다. 새 구현은 `fid` 필드를 기준으로 작성해 주세요. [FCM Message 규격](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages#Message)

## N04 FID 등록과 갱신

경로는 유지합니다.

```http
POST /api/v1/notifications/push-subscriptions
Content-Type: application/json
X-CSRF-Token: <세션의 CSRF 토큰>
```

브라우저는 로그인 세션 쿠키와 함께 요청합니다. `userId`나 `projectId`는 클라이언트 입력으로 받지 않고 각각 로그인 세션과 서버 설정에서 결정합니다.

```json
{
  "installationId": "<onRegistered에서 받은 FID>"
}
```

요청 DTO의 `endpoint`, `keys`, `expirationTime`을 제거하고 `installationId`를 필수 문자열로 정의해 주세요. 이번 API는 FCM 전용이므로 `provider` 옵션은 필요하지 않습니다. 앱의 입력 제한은 1~128자, 공백·제어문자 금지로 제안합니다. 이는 앱 API 제한이며 FID를 파싱하거나 변형하라는 뜻은 아닙니다. FID 자체를 사용자 인증 수단으로 사용하지 않습니다.

기존 응답의 `id / createdAt / expiresAt`과 공통 응답 형식을 유지합니다. 아래 값은 예시입니다.

```json
{
  "resultType": "SUCCESS",
  "success": {
    "data": {
      "id": "push_001",
      "createdAt": "2026-10-16T19:30:00+09:00",
      "expiresAt": null
    }
  },
  "error": null,
  "meta": {
    "timestamp": "2026-10-16T19:30:00+09:00",
    "path": "/api/v1/notifications/push-subscriptions"
  }
}
```

등록 동작은 다음을 기준으로 합니다.

- 신규 연결은 `201 Created`, 같은 사용자와 같은 FID의 재등록은 `200 OK`와 같은 구독 ID를 반환합니다. 원래 `createdAt`은 유지하고 서버 내부의 마지막 등록 시각은 갱신합니다.
- 프로젝트와 FID를 기준으로 중복 활성 등록을 방지합니다. 반복·동시 요청에도 같은 사용자에게 중복 발송하지 않도록 합니다. 이 등록 API에 별도 `Idempotency-Key`를 추가할 필요는 없습니다.
- 동일 FID가 다른 계정에 활성 연결되어 있으면 `409 SUBSCRIPTION_IN_USE`를 반환합니다. 기존 소유자를 응답에 노출하거나 다른 계정으로 조용히 이전하지 않습니다.
- 등록 시 현재 인증 세션과 구독의 연결을 서버에 보관합니다. 같은 세션에서 새 FID가 오면 이전 FID 연결 해제와 새 연결 등록을 원자적으로 처리합니다. 이전 FID를 사용하는 다른 유효 세션이 있다면 그 연결은 보존합니다.
- 같은 계정이 여러 브라우저를 사용하면 브라우저별 FID를 따로 보관합니다. 사용자당 FID 한 개로 덮어쓰지 않습니다.
- `expiresAt: null`은 Firebase의 정확한 만료 시각을 알 수 없다는 뜻입니다. 무기한 발송을 보장하는 값이 아니며, 세션 상태와 FCM의 유효하지 않은 등록 응답은 따로 처리합니다.
- 등록 성공은 앱 서버에 수신 대상을 저장했다는 뜻입니다. 알림 전송·수신 완료로 처리하지 않습니다.

클라이언트는 `onRegistered`가 실행될 때 받은 FID를 서버에 갱신해야 합니다. Firebase 등록과 기존 `getToken` 등록 방식을 혼용하지 않습니다. [Firebase 웹 등록 안내](https://firebase.google.com/docs/cloud-messaging/web/get-started#access_the_firebase_installation_id)

## N05 FID 연결 해제

경로와 성공 응답을 유지합니다. 경로에는 FID가 아니라 **N-04가 반환한 구독 ID**를 사용합니다.

```http
DELETE /api/v1/notifications/push-subscriptions/push_001
X-CSRF-Token: <세션의 CSRF 토큰>
```

성공은 `204 No Content`이며 응답 본문을 보내지 않습니다.

- 로그인 사용자 소유의 구독만 해제합니다. 다른 사용자의 활성 구독 ID는 `404 NOT_FOUND`로 처리하고 변경하지 않습니다.
- 이미 해제됐거나 존재하지 않는 ID는 `204`로 응답해 안전하게 재시도할 수 있도록 합니다.
- 해당 브라우저의 계정–FID 연결을 비활성화하고 이후 새 발송 대상에서 제외합니다. 같은 사용자의 다른 브라우저 등록은 유지합니다.
- 서버의 구독 해제는 Firebase Installation 전체 삭제가 아닙니다. 프론트의 `unregister()`는 브라우저에서 별도로 실행합니다.
- 발송 작업이 대상 FID를 미리 읽었더라도 FCM 제출 직전에 활성 연결을 다시 확인합니다. 이미 FCM에 제출됐거나 브라우저에 표시된 알림까지 해제로 회수할 수는 없습니다.

## 인증과 오류 명세

N-04와 N-05의 기존 `sessionCookie` 인증은 유지합니다. N-04·N-05·U-03 로그아웃의 `X-CSRF-Token`은 Swagger에서도 `required: true`로 수정해 주세요. 프론트 요청은 `credentials: include`를 사용하고 서버는 허용 origin, credentials, `Content-Type`, `X-CSRF-Token`, POST/DELETE/OPTIONS를 허용해야 합니다. 실제 운영 브라우저에서 교차 사이트 세션 쿠키가 전달되는지도 확인합니다.

| HTTP | 오류 코드 제안 | 처리 |
| --- | --- | --- |
| 400 | `INVALID_INSTALLATION_ID` | 누락·빈 값·입력 제한 위반, 저장하지 않음 |
| 401 | `UNAUTHENTICATED` | 로그인 세션 없음 또는 만료 |
| 403 | `CSRF_INVALID` | CSRF 누락 또는 불일치 |
| 404 | `NOT_FOUND` | N-05에서 타인 소유의 활성 구독 접근 |
| 409 | `SUBSCRIPTION_IN_USE` | 다른 계정에 활성 연결된 FID 등록 |
| 429 | `RATE_LIMITED` | 과도한 요청 제한, 재시도 시점 안내 |

오류 코드는 기존 서버 공통 코드가 있으면 그 이름으로 통일합니다. 실패 응답은 `resultType: FAILURE`, `success: null`, `error: { code, message, details, retryable }`로 정의하고 현재 성공/실패 nullable 스키마 모순도 함께 수정합니다. N-04 성공 응답의 `success.data`는 객체이며 `type: null`로 정의하지 않습니다.

## 프론트와 서버의 등록 해제 순서

| 시점 | 프론트 작업 | 서버 작업 |
| --- | --- | --- |
| 로그인 후 알림 켜기 | 권한 허용 → Firebase `register` → `onRegistered` FID로 N-04 호출 → 구독 ID 보관 | 인증 사용자와 현재 세션에 연결 |
| 재로그인·앱 재진입 | 알림 설정이 켜져 있고 권한이 허용됐으면 등록을 다시 확인하고 N-04 호출 | 같은 FID는 재사용하고 세션 연결 갱신 |
| FID 변경 | 새 FID로 N-04 호출, 반환 구독 ID 갱신 | 현재 세션의 이전 연결을 새 연결로 교체 |
| 알림 끄기 | N-05와 Firebase `unregister()`를 모두 수행. 한쪽이 실패해도 다른 쪽 해제를 시도하고 미완료 부분을 재시도할 정보 보존 | 브라우저 구독 해제, 이후 새 발송 제외 |
| 로그아웃 | 서버 U-03 호출, 사용자별 구독 ID와 화면 상태 정리 | 현재 세션의 구독 연결도 해제한 뒤 세션 폐기 |
| 같은 브라우저에서 계정 변경 | 이전 계정으로 N-05 성공 → U-03 → 새 계정 로그인·N-04 등록. 역할 전환만으로는 해제하지 않음 | N-05로 해당 브라우저의 이전 계정 연결 전체를 해제한 뒤 새 계정에 등록 |

프론트가 구독 ID를 잃어버려도 서버 U-03이 현재 세션과 연결된 구독을 찾아 정리해야 합니다. 동일 FID를 같은 사용자의 여러 유효 세션이 공유하는 경우 로그아웃은 현재 세션의 연결만 제거하고, 유효 연결이 하나도 없을 때 발송 대상에서 제외합니다. N-05의 명시적 알림 끄기는 해당 브라우저 구독 전체를 해제합니다.

계정 전환 전에 구독 ID를 잃어버렸다면 현재 FID로 N-04를 재호출해 같은 구독 ID를 복구한 뒤 N-05를 호출합니다. N-05 실패나 이전 계정 연결의 409는 전환 미완료로 안내하고 재시도하며, 소유권을 강제로 덮어쓰지 않습니다. 해제·계정 변경 중에는 프론트의 자동 재등록을 중단하고 이전 로그인 상태에서 시작한 콜백 결과를 새 계정에 적용하지 않습니다.

**이번 앱의 권장 정책은 로그인 세션이 유효한 동안만 개인화 알림을 발송하는 것입니다.** 마지막 연결 세션이 만료되면 발송 대상에서 제외하고 재등록 시 만료 연결을 정리합니다. 이 정책에서는 자동 로그아웃된 사용자에게 재로그인·재등록 전까지 알림이 가지 않습니다. 이는 FCM 자체의 필수 조건이 아니라 계정 변경 시 오발송을 막기 위한 앱 정책 제안입니다.

## 서버 발송 예시

앱 서버가 알림 대상 사용자의 활성 구독을 조회한 뒤 다음 요청을 FCM에 보냅니다. 사용자 ID만으로 전체 브라우저에 무조건 보내거나 클라이언트가 지정한 임의 수신자에게 발송하지 않습니다.

```http
POST https://fcm.googleapis.com/v1/projects/bintime-33512/messages:send
Authorization: Bearer <서버가 발급한 OAuth 액세스 토큰>
Content-Type: application/json
```

```json
{
  "message": {
    "fid": "<저장된 FID>",
    "notification": {
      "title": "빈자리 알림",
      "body": "신청한 조건에 맞는 빈자리가 생겼어요."
    },
    "data": {
      "url": "/customer/waitlist",
      "notificationId": "noti_001"
    },
    "webpush": {
      "fcm_options": {
        "link": "https://frontend-oracle.vercel.app/customer/waitlist"
      }
    }
  }
}
```

`data` 값은 모두 문자열이고 클릭 주소는 실제 프론트와 같은 origin의 경로를 사용합니다. 위 예시는 운영 배포용이며 로컬 테스트에서는 해당 환경에 맞는 링크를 사용합니다. 현재 서비스 워커는 `notification`이 있는 메시지를 중복 표시하지 않으며, 로고는 프론트에서 지정합니다. [공식 FID 전송 예시](https://github.com/firebase/quickstart-js/blob/master/messaging/README.md#http)

FCM 성공 응답은 발송 요청의 접수입니다. 실제 기기 도착이나 사용자의 읽음을 뜻하지 않습니다. 유효하지 않은 등록임이 확인된 `UNREGISTERED`는 대상 연결을 비활성화하고, `INVALID_ARGUMENT`는 메시지 형식 오류인지 먼저 확인합니다. 일시적 429/5xx는 서버의 재시도 정책으로 처리하며 같은 알림을 중복 생성하지 않습니다. [FCM 오류 코드](https://firebase.google.com/docs/cloud-messaging/error-codes)

## 연결 완료 확인 기준

1. N-04 신규 요청은 201, 동일 FID 반복·동시 요청은 중복 없이 같은 ID로 200.
2. 타계정 FID 등록은 409, 타인 구독 해제는 404. 사용자 ID를 요청 본문으로 위조할 수 없음.
3. N-05 반복 해제는 204. 이후 새 발송에서 제외되며 다른 브라우저 구독은 유지.
4. FID 변경은 해당 세션의 이전 연결을 정리하고 새 FID로만 발송. 유효한 다른 세션 연결은 유지.
5. 로그아웃·계정 변경·세션 만료 정책이 적용되며 이전 계정 알림을 새 계정으로 발송하지 않음.
6. CSRF가 없으면 403, 세션이 없으면 401. 실제 Vercel 화면에서 쿠키와 CSRF 요청이 정상 전달됨.
7. 실제 브라우저 FID로 전송했을 때 활성 탭의 토스트, 백그라운드 시스템 알림, 클릭 후 대기내역 이동을 확인.
8. 네트워크 실패 시 프론트가 서버 등록·해제 완료로 표시하지 않고 재시도할 수 있음.

테스트 FID는 **마이페이지 → 알림 켜기 → Firebase 수신 테스트 → 수신 ID 복사**에서 얻을 수 있습니다. 서비스 계정 키는 이 문서와 별도로 안전하게 전달해 주세요. 위 검증은 구현 완료 기준이며 현재 통과했다는 의미는 아닙니다.
