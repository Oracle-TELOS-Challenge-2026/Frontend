# FCM 등록·해제 계약

2026년 10월 17일 [OpenAPI 스냅샷](openapi.snapshot.json)과 현재 프론트 구현을 기준으로 한다. 프론트는 Firebase JavaScript SDK 13의 `register`, `onRegistered`, `unregister`를 사용한다. `onRegistered`에서 받은 Firebase Installation ID(FID)를 로그인 계정의 서버 구독에 연결한다. 이전의 Web Push `endpoint/keys/expirationTime` 입력 제안은 사용하지 않는다.

## 브라우저 등록

```http
POST /api/v1/notifications/push-subscriptions
Content-Type: application/json
X-CSRF-Token: <로그인 세션의 CSRF 토큰>
```

```json
{
  "installationId": "<onRegistered에서 받은 FID>"
}
```

- `credentials: include`로 세션 쿠키를 전달한다. 사용자 ID는 요청에 넣지 않는다.
- FID는 1~128자 문자열이며 공백·제어문자를 허용하지 않는다. FID 자체는 인증 수단이 아니다.
- 성공 데이터는 `success.data`의 `id`, `createdAt`, `expiresAt`이다. 프론트는 반환된 구독 ID를 사용자별로 보관한다.
- 동일 계정과 FID를 다시 등록하면 기존 ID와 생성 시각을 유지한다. 다른 계정의 활성 FID는 `409 SUBSCRIPTION_IN_USE`다.
- 서버는 현재 로그인 세션의 FID만 교체하고 다른 세션은 유지한다. `expiresAt: null`은 정확한 만료 시각을 알 수 없다는 뜻이다.
- 등록 성공은 발송·수신 완료를 의미하지 않는다.

## 브라우저 해제

```http
DELETE /api/v1/notifications/push-subscriptions/{subscriptionId}
X-CSRF-Token: <로그인 세션의 CSRF 토큰>
```

경로에는 FID가 아닌 등록 응답의 구독 ID를 사용한다. 성공은 본문 없는 `204`다. 이미 해제되었거나 없는 구독도 `204`, 타인의 활성 구독은 `404`다. 다른 FID의 구독은 유지한다.

마이페이지의 **알림 끄기**는 서버 구독 해제와 Firebase `unregister()`를 수행한다. 실패하면 완료로 표시하지 않고 재시도를 안내한다. 브라우저의 알림 권한 자체는 사이트 설정에서 변경한다. 이미 FCM에 제출되었거나 표시된 알림은 해제로 회수하지 않는다.

로그아웃은 `POST /api/v1/auth/logout`을 사용합니다. 서버가 현재 세션의 구독을 해제하고 쿠키를 폐기하며 같은 FID의 다른 유효 세션은 유지합니다. Firebase 해제 성공을 로그아웃의 전제로 두지 않습니다.

## 프론트 설정과 수신

필요한 공개 환경변수는 아래 다섯 개이며 자세한 설정은 [README](../README.md#firebase-푸시-알림-설정)에 있다.

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

서비스 계정 JSON, `private_key`, VAPID 비공개키는 프론트·Git·`VITE_` 변수에 넣지 않는다. 서버의 FCM 인증 정보는 서버 비밀 저장소에서 관리하고 프론트와 같은 Firebase 프로젝트를 사용한다.

- 활성 탭에서는 SSE와 FCM `onMessage`로 알림함을 갱신하고, 같은 알림 ID의 토스트는 중복 표시하지 않는다. FCM 시스템 알림은 토스트 중복 판정과 별도로 서비스 워커에서 표시한다.
- 시스템 알림은 서비스 워커의 공통 큐와 최근 500개 ID 캐시로 중복을 판정한다. 채팅은 `messageId`, 나머지는 `notificationId`가 우선이며, 없으면 FCM 메시지 ID를 사용한다.
- 일반 알림 클릭 시 `notificationId`로 알림함 읽음 처리하고 연결된 화면으로 이동한다. `CHAT_MESSAGE`는 메시지 ID를 알림함 읽음 API에 보내지 않는다. 실제 채팅방을 연 뒤 기존 채팅 읽음 API를 사용한다.
- 서비스 워커는 열린 창 메시지와 새 창 URL에 `notificationType`, `roomId`, `messageId`, `notificationId`를 보존한다. `/chat?roomId=...`는 로그인 후 채팅 목록에서 방과 소유 가게를 검증해 역할별 화면으로 이동한다. 로그인 전 목적지도 보관한다.
- 백그라운드 수신은 `public/firebase-messaging-sw.js`가 처리한다. 알림 payload가 있으면 SDK 표시와 중복 생성하지 않는다.
- `data.url` 또는 `webpush.fcm_options.link`에는 배포 앱과 동일한 origin의 주소를 사용한다. `data` 값은 문자열이다. 기본 빈자리 이동 경로는 `/customer/waitlist`다.
- 알림 아이콘은 퍼즐 마크를 사용한다. 실제 표시 크기·위치·브라우저 아이콘은 OS와 브라우저가 결정한다.
- 사용자별 알림 설정과 구독 ID를 보관하고, 알림이 켜진 계정으로 다시 접속하면 Firebase 등록과 서버 연결을 확인한다.
- iPhone·iPad 일반 탭은 설치 안내를 표시한다. iOS·iPadOS 16.4 이상에서 홈 화면 웹 앱으로 실행한 뒤 알림 켜기 버튼을 눌러야 권한을 요청한다. 실제 지원 여부는 브라우저 API와 Firebase로 검사한다.

채팅 수신 호환 형식은 문자열 `data.type: "CHAT_MESSAGE"`, `data.roomId`, `data.messageId`, `data.url: "/chat?roomId=..."`이다. 이 형식에서는 `notificationId`가 메시지 ID여도 처리한다. 현재 로컬 서버에서 확인된 발송 구현은 빈자리 매칭의 `url`, `notificationId`이므로 채팅·예약 이벤트 발송 연결은 서버 담당자가 별도로 확인한다.

## 배포 후 확인할 항목

1. 실제 로그인 계정에서 알림 권한을 허용하고 FID 서버 등록이 성공하는지 확인한다.
2. 같은 브라우저 재접속 시 중복 구독 없이 연결이 유지되는지 확인한다.
3. 테스트 계정의 대기 조건과 빈자리 발행, 채팅 메시지로 활성 탭·백그라운드 수신 및 클릭 이동을 확인한다. 여러 탭에서도 같은 알림은 한 번만 표시되는지 확인한다.
4. 알림 끄기, 로그아웃, 다른 계정 로그인 후 이전 계정의 새 알림이 전달되지 않는지 확인한다.
5. 서버 등록·해제 실패 시 UI가 완료로 표시하지 않고 재시도할 수 있는지 확인한다.
6. Mac Chrome·Safari, Android Chrome, iPhone 홈 화면 웹 앱에서 권한·수신·클릭 이동을 확인한다. OS 알림 차단과 집중 모드는 별도로 확인한다.

현재 자동 테스트는 등록·해제 요청과 응답, 서비스 워커 동작을 모의 검증한다. 실제 FCM 발송·기기 수신 검증을 완료했다는 의미는 아니다. 임시 FID 복사·콘솔 테스트 UI는 제거했다.
