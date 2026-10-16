# 백엔드 API 초안 검토와 프론트 연결 기준

2026년 10월 16일 기준 [Swagger UI](https://140.238.19.165/swagger-ui/index.html)와 [OpenAPI 원문](https://140.238.19.165/v3/api-docs)의 `v0.1-contract`를 현재 프론트 기능과 비교했다. 검토 기준 원문은 [OpenAPI 스냅샷](./openapi.snapshot.json)에 보관한다. HTTP operation은 **45개**이며, 명세는 전체 Controller가 아직 `501`을 반환한다고 명시한다. 실제 공개 카테고리 조회도 `501 NOT_IMPLEMENTED`였다. 성공 응답 예시는 구현 완료를 뜻하지 않는다.

예약·대기·취소 빈자리·일반 채팅의 기본 흐름은 이미 충분히 잡혀 있다. 우선 공통 스키마와 브라우저 연결 계약을 바로잡고, **가게 최초 등록과 초기 데이터 생성, 고객의 지난 예약 숨김, 채팅 예약 제안과 확정**을 보충하면 현재 화면의 주요 흐름을 연결할 수 있다. 아래의 `유지`는 기능과 경로를 유지한다는 뜻이며 공통 스키마 수정이나 실제 구현이 불필요하다는 뜻은 아니다.

## 먼저 수정할 공통 계약

| 우선순위 | 현재 상태 | 수정 기준 |
| --- | --- | --- |
| P0 | 브라우저 CORS 허용 헤더에 `Idempotency-Key`가 없음 | `Access-Control-Allow-Headers`에 추가. 예약·대기·채팅 등의 쓰기 요청은 이 헤더가 필수이므로 현재 Vercel에서 preflight가 차단됨 |
| P0 | 79곳에서 `type: null`과 객체 `$ref`를 동시에 선언 | 필수 성공 데이터는 `$ref`만 사용. 실제 nullable 객체는 `anyOf: [{ $ref: ... }, { type: 'null' }]`로 표현. 객체와 null을 동시에 만족하도록 선언하면 안 됨 |
| P0 | 내부 S-08·N-06은 내부 인증 필수라고 설명하지만 적용할 security scheme과 operation별 `security`가 없음 | 이미 있는 일반 API의 `sessionCookie` 선언은 유지. 내부 두 API의 인증 방식을 구체화하거나 외부 HTTP 노출 없이 서버 모듈 호출로 처리. 권한과 소유권 검증은 서버에서 수행 |
| P0 | 변경 API 22개는 설명에 CSRF 필수, 헤더는 `required: false` | CSRF 필수 여부를 스키마와 일치시키고 누락/만료 오류를 명시 |
| P0 | U-08은 `expectedVersion` 필수지만 U-04의 `preferences`에는 선호도 버전이 없음 | U-04에서 `preferences.version`을 반환. 프로필 자체의 `version`과 구분 |
| P1 | 숫자 query 13개가 `type: string`이면서 숫자 minimum/maximum 사용 | 위도·경도는 `number`, 반경·limit·sequence는 `integer`로 선언. 문자열 커서/ID는 유지 |
| P1 | 실패 응답이 `resultType: SUCCESS`도 허용하고 `success`를 객체로 선언 | 실패는 `resultType: FAILURE`, `success: null`, 필수 오류 객체로 고정. 성공은 `error: null`. 공통 400/401/403/404/409/429와 실제 코드·재시도 기준을 명시 |
| P1 | nullable enum 4곳이 enum에 null을 허용하지 않음. `NotificationResponse.readAt`은 string만 허용하지만 안 읽은 예시는 null | nullable 타입과 enum을 일치시키고 `readAt`을 nullable date-time으로 수정 |
| P1 | 성공 예시 `meta.timestamp`에는 시간대 오프셋이 없음 | 모든 date-time은 `Z` 또는 명시적 오프셋을 포함. 영업일·시간 UI는 매장 `timezone`에 따라 해석 |
| P1 | WS/SSE payload `oneOf` 후보에 필수 필드와 구별 조건이 부족함 | 이벤트/프레임 타입별 `const`와 `required`를 넣어 하나의 후보만 일치하도록 수정. 빈 ping payload를 모든 메시지와 겹치게 하지 않음 |

숫자 query 수정 대상은 C-02 `limit`, C-03 `beforeSequence/limit`, ST-03·ST-04·ST-07·ST-14·S-04·N-01의 `limit`, S-01의 `latitude/longitude/radiusMeters/limit`이다. nullable enum 대상은 `PartialIntentConditions.category`, `ReservationResponse.cancelReasonCode`, `OwnerReservationResponse.cancelReasonCode`, `ReservationSlotResponse.unavailableReason`이다. 타입·null·조합 스키마 수정 기준은 [OpenAPI 3.1 Schema Object](https://spec.openapis.org/oas/v3.1.0.html#schema-object)를 따른다.

HTTP `:8080` 주소는 HTTPS `443`으로 `308` 리다이렉트된다. OpenAPI의 `servers`는 `https://140.238.19.165`이며, 연결 기준 주소도 HTTPS를 사용한다. Vercel origin과 `http://localhost:5173`은 허용되고, `http://127.0.0.1:5174`에는 허용 origin 응답이 없었다. 호스트명과 포트가 다르면 같은 개발 origin이 아니므로 실제 실행 주소와 서버 허용 목록을 맞춰야 한다. 쓰기 요청은 [Access-Control-Allow-Headers 규칙](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Headers)에 따라 `Idempotency-Key`도 허용해야 한다.

OAuth/세션 구현 시 `HttpOnly`, `Secure`, 적절한 `SameSite`, 쿠키 적용 범위, `credentials: include`와 허용 origin을 함께 확정해야 한다. 교차 사이트 쿠키가 차단되는 브라우저에서는 같은 사이트의 API 도메인 또는 배포 프록시가 필요할 수 있다.

## 기존 API 45개 판정

모든 경로의 공통 접두사는 `/api/v1`이다. `수정`은 아래 필드나 동작을 보충해야 한다는 뜻이다. `유지` API에도 위의 공통 수정은 적용한다.

### 사용자 API 9개

| 코드 | 메서드와 경로 | 판정 | 이유와 적용 기준 |
| --- | --- | --- | --- |
| U-01 | `GET /auth/oauth/kakao/start` | 유지 | 허용된 상대 `returnTo`와 OAuth state 사용이 적절함. 브라우저 이동으로 시작 |
| U-02 | `GET /auth/oauth/kakao/callback` | 수정 | 현재 필수 `code/state`만으로는 사용자의 동의 거절 `error` 콜백을 표현하지 못함. 성공/거절 경로, state 검증, 쿠키 속성, 허용된 앱으로의 303 이동을 명시 |
| U-03 | `POST /auth/logout` | 유지 | 세션·쿠키·실시간 연결 폐기 유지. 사용자 전환 시 이전 계정의 브라우저 푸시 연결도 정리 |
| U-04 | `GET /users/me` | 수정 | `preferences.version` 추가. 현재 취향 원문을 보존할 `preferences.text` 추가. `roles`와 `ownedStoreIds`로 사장 권한·매장 복원 |
| U-05 | `PATCH /users/me` | 유지 | 표시 이름과 낙관적 잠금 구조 유지. 현재 화면에 이름 편집은 없어 연결 우선순위는 낮음 |
| U-06 | `PUT /users/me/location` | 유지 | 관측 시각 기반 오래된 위치 차단이 적절함. 위치 동의는 브라우저에서 받고 전송 |
| U-07 | `DELETE /users/me/location` | 유지 | 최근 위치만 제거하고 기존 대기 조건을 유지하는 동작이 적절함 |
| U-08 | `PUT /users/me/preferences` | 수정 | 현재 프론트의 자유문 취향 입력을 저장할 `text` 0~2,000자 추가, 빈 문자열로 지우기 지원. 배열·가격 조건만으로 원문을 대체하지 않음 |
| U-09 | `GET /auth/csrf` | 유지 | 세션에 연결된 토큰과 만료 시각 유지. 로그인 복원 후 쓰기 요청 전에 획득 |

U-08의 전체 교체 방식은 유지할 수 있다. 프론트는 U-04에서 받은 기존 `categories/keywords/maxPrice/version`을 보존하면서 수정한 `text`를 함께 보낸다. AI 분석·벡터 추출을 취향 저장의 성공 조건으로 추가할 필요는 없다.

### 검색과 대기 API 8개

| 코드 | 메서드와 경로 | 판정 | 이유와 적용 기준 |
| --- | --- | --- | --- |
| S-01 | `GET /search/stores` | 수정 | 가격 기반 검색 설명에 맞는 `maxPrice` query가 없음. `vacancyOnly=false`일 때 빈자리 없는 매장을 포함할지 명시하고, 대기 신청 진입을 위해 포함한다면 `bestSlot: null` 허용 |
| S-02 | `POST /search/intents/analyze` | 유지 | 분석 결과 확인 후 별도 대기 등록, 불명확한 조건 재질문 구조 유지. 현재 수동 대기 화면 연결보다 후순위 |
| S-03 | `POST /search/waitlists` | 유지 | 매장/시술/시간 구간과 중복·개수 제한 유지. 현재 화면은 `source=STORE_DETAIL`로 매장·시술을 명시해 연결 |
| S-04 | `GET /search/waitlists/me` | 유지 | ACTIVE 기본값, 후보 재검증, counts와 cursor 유지. 대기 카드의 가게·시술 요약을 사용 |
| S-05 | `GET /search/waitlists/{waitlistId}` | 유지 | 최신 후보와 상태 구분이 적절함. 후보가 있어도 예약 선점으로 표시하지 않음 |
| S-06 | `PATCH /search/waitlists/{waitlistId}` | 유지 | 조건 전체 교체와 `expectedVersion`, 이전 후보 무효화 유지 |
| S-07 | `POST /search/waitlists/{waitlistId}/cancel` | 유지 | 본인 대기만 취소하고 중복 취소는 같은 결과를 반환하는 구조 유지 |
| S-08 | `POST /internal/search/match-jobs` | 유지 | 외부 프론트 호출 대상 아님. eventId 중복 제거와 필수 조건 우선 매칭 유지. 서버 내부 호출이나 작업 큐로 구현해도 됨 |

현재 대기 UI의 “17:00”은 시작 시각 하나다. 기존 계약을 유지하려면 `serviceId`를 지정하고 `windowStart=17:00`, `windowEnd=17:00+해당 시술 소요시간`으로 보낸다. 넓은 희망 구간으로 임의 변환하지 않는다. 프론트 지도는 사각 bounds이고 S-01은 중심·반경이므로, 화면을 포함하는 반경으로 조회한 뒤 실제 화면 경계로 필터링하거나 UI를 반경 검색으로 맞춘다. 첫 페이지 밖 결과를 전체 검색 결과처럼 표시하지 않는다.

### 매장과 예약 API 17개

| 코드 | 메서드와 경로 | 판정 | 이유와 적용 기준 |
| --- | --- | --- | --- |
| ST-01 | `GET /stores/categories` | 유지 | 현재 4개 업종을 코드와 이름으로 연결하기 충분함 |
| ST-02 | `GET /stores/{storeId}` | 수정 | 가게 등록·사장 프로필에 필요한 `phone` 조회 필드 추가. 기존 이름·업종·주소·좌표·이미지·영업시간 유지 |
| ST-03 | `GET /stores/{storeId}/services` | 유지 | 시술 ID·이름·시간·가격 조회가 적절함. 단일 대표 시술 UI도 ID를 보존 |
| ST-04 | `GET /stores/{storeId}/slots` | 유지 | 공개된 미래 가용 슬롯과 최대 조회 기간 유지. 모든 고객 예약을 프론트에 내려 가용성을 계산할 필요 없음 |
| ST-05 | `GET /stores/{storeId}/slots/{slotId}` | 유지 | 예약 전 가격·버전 재확인 유지. 예약자 정보가 공개되지 않는 구조 유지 |
| ST-06 | `POST /reservations` | 유지 | `slotId/expectedPrice/expectedSlotVersion`, 멱등 키, 자원·고객 시간 동시성 검증 유지. 채팅 제안 확정은 아래 별도 계약에서 같은 예약 검증을 재사용 |
| ST-07 | `GET /reservations/me` | 유지 | UPCOMING/PAST/CANCELED 조회 유지. 아래 고객 숨김 API 구현 후 숨긴 항목을 목록과 counts에서 제외 |
| ST-08 | `GET /reservations/{reservationId}` | 유지 | 고객/소유 사장 접근 구분 유지. OWNER 확장 필드를 올바른 스키마로 표현 |
| ST-09 | `POST /reservations/{reservationId}/cancel` | 유지 | 취소와 빈자리 생성의 일관성, 원예약당 최대 1개 빈자리 유지. 지난 내역 숨김에 이 API를 사용하면 안 됨 |
| ST-10 | `PATCH /owner/stores/{storeId}` | 유지 | 소개·영업시간 수정과 버전 검사 유지. 현재 없는 운영정보 편집 화면까지 추가할 필요 없음 |
| ST-11 | `GET /owner/stores/{storeId}/timetable` | 유지 | 날짜별 예약, 고객 표시 이름, 자원, 요약으로 현재 캘린더 연결 가능 |
| ST-12 | `GET /owner/stores/{storeId}/reservations/{reservationId}` | 유지 | 소유 가게 예약 상세와 고객·자원 정보 유지. ST-08과 겹쳐도 연결을 위해 당장 제거할 필요 없음 |
| ST-13 | `POST /owner/stores/{storeId}/reservations/{reservationId}/status` | 유지 | 완료/노쇼 시점 제약과 남은 구간의 빈자리 생성 유지. 노쇼 발생 경로가 이미 존재함 |
| ST-14 | `GET /owner/stores/{storeId}/vacancies` | 유지 | 취소·노쇼의 상태·잔여 구간·시술 ID·원가를 사용. 시술명은 ST-03과 연결하고 DRAFT 외 상태도 구분 |
| ST-15 | `POST /owner/stores/{storeId}/vacancies/{vacancyId}/publish` | 수정 | 현재 UI는 시술·옵션을 자유문으로 편집하지만 요청에는 등록 `serviceId`만 있음. 등록 시술 선택 UI로 맞추거나 `serviceDescription` 스냅샷을 추가해야 함. 아래 권장안 참고 |
| ST-16 | `POST /owner/stores/{storeId}/vacancies/{vacancyId}/withdraw` | 유지 | 이미 예약된 빈자리 철회 금지와 멱등 처리 유지. 현재 철회 UI가 없어 후순위 연결 |
| ST-17 | `PATCH /owner/stores/{storeId}/services/{serviceId}` | 유지 | 기존 예약 가격 보존과 활성 상태 수정 유지. 최초 시술 생성은 별도 보충 필요 |

ST-15의 최소 권장안은 **등록된 시술을 선택하도록 프론트를 조정**하는 것이다. 현재 자유문 옵션을 반드시 유지한다면 선택한 시술의 가격·소요시간은 서버 기준으로 검증하고, 설명만 `serviceDescription`으로 슬롯·예약에 저장한다. 설명 문자열로 시술이나 가격을 새로 생성하지 않는다. 할인 방식 `PERCENT`와 `FIXED_PRICE`는 적절하다. 프론트 `amount` 값은 차감액이 아니라 최종 판매 가격이므로 `FIXED_PRICE`로 대응한다.

### 채팅 API 5개

| 코드 | 메서드와 경로 | 판정 | 이유와 적용 기준 |
| --- | --- | --- | --- |
| C-01 | `POST /chatting/rooms` | 유지 | 고객·매장당 한 방 생성/재사용 구조가 맞음. 고객의 가게 문의 버튼에서 호출 |
| C-02 | `GET /chatting/rooms` | 수정 | 아래 예약 제안 추가에 맞춰 `lastMessage`가 제안/확정 메시지를 표현하도록 타입·요약 확장 |
| C-03 | `GET /chatting/rooms/{roomId}/messages` | 수정 | 현재 `TEXT`만 허용. 예약 제안의 내용·상태·버전·확정 reservationId를 반환하는 메시지 타입 추가 |
| C-04 | `POST /chatting/rooms/{roomId}/messages` | 유지 | 일반 텍스트 전송은 현재 계약 유지. 제안 생성은 별도 API로 사장 권한 검증하고 일반 메시지 본문으로 위조하지 못하게 처리 |
| C-05 | `PUT /chatting/rooms/{roomId}/read` | 유지 | 사용자별 sequence가 뒤로 가지 않는 읽음 처리 유지. 제안 메시지도 같은 순서에 포함 |

WebSocket은 누락된 API가 아니다. 초안에는 `/api/v1/chatting/ws`, `bintime.chat.v1` 서브프로토콜과 프레임 스키마가 있다. HTTP 45개 집계에는 포함하지 않았다. 일반 메시지·제안·예약 확정은 REST 재조회와 WebSocket 수신이 같은 저장 결과를 보도록 정의한다. 최초 구현은 REST 이력·전송·읽음을 먼저 연결하고 실시간 전송을 이어 붙일 수 있다.

### 알림 API 6개

| 코드 | 메서드와 경로 | 판정 | 이유와 적용 기준 |
| --- | --- | --- | --- |
| N-01 | `GET /notifications` | 유지 | 안 읽은 수·목록·이동 대상 유지. 슬롯 클릭 후 ST-05로 다시 검증 |
| N-02 | `PATCH /notifications/{notificationId}/read` | 유지 | 최초 readAt 유지와 읽음/예약 완료 분리 유지 |
| N-03 | `GET /notifications/stream` | 유지 | SSE 재생·heartbeat·커서 만료 대응 유지. 브라우저 세션 연결과 이벤트 스키마만 공통 수정 |
| N-04 | `POST /notifications/push-subscriptions` | 수정 | 현재는 Web Push `endpoint/keys/expirationTime` 계약, 프론트는 Firebase SDK 13의 FID 등록 방식. FID 등록 계약으로 맞추거나 프론트 전송 방식을 변경해야 함 |
| N-05 | `DELETE /notifications/push-subscriptions/{subscriptionId}` | 유지 | 서버의 구독 ID로 본인 연결만 해제. N-04 응답 ID를 프론트에서 보존 |
| N-06 | `POST /internal/notifications/dispatch` | 유지 | 내부 인증·중복 제거·무효 후보 건너뛰기 유지. 프론트에서 직접 호출하지 않음 |

현재 Firebase 수신 구현을 재사용한다면 N-04는 `installationId`를 받고 서버가 FCM 방식으로 저장하는 계약을 권장한다. FID를 Web Push endpoint로 이름만 바꿔 전송하지 않는다. [FCM 설정과 FID API 수정 요청](fcm-backend-handoff.md)에 서버 인증, 등록·해제, 계정 변경과 `message.fid` 발송 예시를 정리했다. FCM 전용인 이번 계약에 `provider` 옵션이나 기존 Web Push 채널을 함께 추가할 필요는 없다.

판정 합계는 **유지 36개, 수정 9개**다. 수정 대상은 U-02·U-04·U-08·S-01·ST-02·ST-15·C-02·C-03·N-04다. ST-07은 기능 유지에 고객 숨김 필터를 반영하는 항목이다. 기능별 분류와 공통 수정 범위를 구분해 작업한다.

## 현재 화면을 위해 보충할 API

아래 경로와 필드명은 확정 명세가 아니라 최소 제안이다. 기존 U/S/ST/C/N 번호는 변경하지 않고 이후 번호를 배정한다.

추가하는 쓰기 API에도 로그인·소유권/참여자 검증과 CSRF를 적용하고, 가게·슬롯·제안 생성 및 예약 확정에는 동일 동작 재시도를 위한 `Idempotency-Key`를 적용한다.

| 필요한 동작 | 최소 경로 제안 | 요청과 결과 | 지켜야 할 동작 |
| --- | --- | --- | --- |
| 가게 최초 등록 | `POST /owner/stores` | 이름·업종·주소·전화번호·지도 좌표와 대표 시술 `name/basePrice/durationMinutes`; 생성한 `storeId/serviceId/resourceId` 반환 | 인증 사용자에게 소유권 부여, U-04 `ownedStoreIds/roles` 갱신. 현재 1인 가게는 기본 자원 1개와 대표 시술을 함께 생성해 별도 관리 UI를 만들지 않아도 됨 |
| 최초 일반 예약 슬롯 생성 | `POST /owner/stores/{storeId}/slots` | `serviceId/resourceId/startAt` 또는 작은 슬롯 배열; 생성한 슬롯 반환 | 종료 시각·가격은 등록 시술 기준으로 결정. 소유권·영업시간·자원 겹침 검증. ST-15는 취소 빈자리용이므로 일반 슬롯의 최초 생성 경로를 대신하지 못함 |
| 지난 예약 내역 숨김 | `DELETE /reservations/{reservationId}/history` | 본인 예약 ID, 성공 204 | 고객 목록에서만 숨기고 사장 기록·예약 상태·점유·정산 자료는 보존. 허용 대상은 지난 예약으로 제한, 재요청은 204. ST-07 목록/counts에 반영 |
| 사장의 채팅 예약 제안 | `POST /chatting/rooms/{roomId}/booking-proposals` | `sourceMessageId`, 시술/옵션 설명, `startAt`, `durationMinutes`, `price`, 대상 자원; 제안 ID·버전·상태와 메시지 반환 | 소유 사장만 생성. 최신 고객 메시지 기준으로 검토하고, 제안만으로 예약 시간을 점유하지 않음. 재제안은 이전 미확정 제안을 대체 |
| 고객의 제안 최종 확정 | `POST /chatting/rooms/{roomId}/booking-proposals/{proposalId}/confirm` | `expectedVersion`, 멱등 키; 확정 예약과 갱신된 제안 반환 | 해당 고객만 확정. 제안 이후 고객 메시지 변경·대체·중복 확정·자원/고객 시간 겹침을 서버에서 재검사. 예약 생성과 제안 확정을 한 트랜잭션으로 처리 |

시술·자원 데이터의 최초 생성은 필수지만, 현재 화면만을 위해 시술·직원별 관리 CRUD 전체를 추가할 필요는 없다. 가게 등록에서 대표 시술과 기본 자원을 함께 만들고, 데모 검증용 일반 슬롯은 통제된 초기 데이터로 공급하는 방식도 가능하다. 이 경우 새 가게의 첫 슬롯이 생기는 운영 경로는 명시해야 한다. 추가 시술·자원을 직접 관리하는 화면이 생길 때 생성 API를 분리하면 된다.

가게 등록의 좌표는 주소 검색 결과를 사용하거나 서버가 주소를 좌표로 변환해야 한다. 임의 좌표로 지도에 공개하지 않는다. 채팅 제안은 기존 ST-06의 공개 `slotId` 필수 요청으로 직접 대체할 수 없다. 제안 확정 내부에서 동일한 예약 충돌·가격 스냅샷 검증을 재사용하면 된다.

## 프론트 연결 표

| 현재 코드와 화면 | 서버 연결 | 프론트에서 바꿀 부분 |
| --- | --- | --- |
| `useAccount`, 로그인, 역할 선택 | U-01~04·U-09, 매장 등록 추가 | 체험 계정과 서버 세션을 구분. 현재 `registered-` ID만 허용하는 복원 로직을 서버 ID에 사용하지 않음. 사장 화면은 서버 소유권 기준 |
| `PreferencesPage` | U-04·U-08 | 자유문 원문과 선호도 버전 보존. 저장 성공 응답 후 완료 표시 |
| `useShopSearch`, 고객 홈 | ST-01·S-01 | `NAIL/HAIR/EYELASH/SKIN`을 현재 한국어 라벨에 대응. `store`, `location`, `distanceMeters`, `bestSlot` 사용. null 이미지·평점·슬롯은 없는 상태로 표시 |
| `ShopDetail`, `ReservationDialog` | ST-02~06 | 상세·시술·슬롯을 조회하고 `slotId/serviceId/version` 보존. 예약 직전 확인한 가격과 버전으로 확정 |
| `WaitlistDialog`, `WaitlistPage` | S-03~07 | 날짜·시간을 시술 길이를 포함한 구간으로 변환. 응답 `conditions/offers/version` 사용. 대기 목록의 가게 요약은 지도 검색 결과와 독립적으로 보존 |
| `ReservationsPage` | ST-07~08, 내역 숨김 추가 | 서버 예약 상태와 `allowedActions` 사용. 본인 목록이므로 `CUSTOMER_ID='me'`로 재필터링하지 않음. 취소/노쇼를 이용 완료로 바꾸지 않음 |
| `OwnerHome`, `OwnerSchedule` | ST-11~12 | 선택한 날짜 조회, 서버 고객명과 자원 ID 사용. DEMO_DAY 대신 실제 서울 날짜 |
| `OwnerAlerts`, `PublishDialog` | ST-14~15, ST-09·13에서 발생 | DRAFT/PUBLISHED/FILLED/WITHDRAWN/EXPIRED 구분. 등록 시술을 선택하고 잔여 시간에 맞는지 검증. `amount → FIXED_PRICE` 대응 |
| `OwnerChats`, `ChatPage` | C-01~05, 제안·확정 추가 | 방 생성/재사용, sequence와 unreadCount 사용. 서버 sender의 권한·ID를 표시용 역할로 대응. 전송 성공 전 입력을 지우지 않음 |
| `usePushNotifications` | N-04~05 | Firebase 등록 후 로그인 사용자에 연결, 반환 subscriptionId 보존, 해제·로그아웃 시 서버 연결 정리 |
| 토스트와 알림 클릭 | N-01~03 | 같은 앱 origin의 경로만 열기, 알림 중복 제거. 후보 슬롯은 ST-05로 최신 상태 재검증 |

공통적으로 `useDemo`의 boolean/void 콜백을 HTTP 요청으로 바로 교체하면 안 된다. 현재 다이얼로그는 `if (onReserve(...))`처럼 즉시 성공을 판단하므로 Promise가 실패해도 성공으로 처리될 수 있다. 각 호출부를 `await`와 진행 중 상태에 맞추고, 실패 시 입력·모달을 유지하며 성공 응답 뒤 데이터를 갱신한다. 인증 오류, 버전·가격 변경, 중복/시간 충돌, 501을 구분해 안내한다. 멱등 키는 한 사용자 동작과 그 재시도 동안 동일하게 유지하고 새 동작에 새 키를 쓴다.

현재 `DEMO_NOW`, `DEMO_DAY`, `CUSTOMER_ID`, `startsWith(date)`와 문자열 시간 비교는 체험 전용이다. 실제 연결에서는 서버 사용자 ID, 실제 현재 시각, `Asia/Seoul` 날짜 변환을 사용한다. 가용 슬롯은 서버 응답을 사용하고 다른 고객의 예약을 공개 조회해서 프론트에서 계산하지 않는다. 예약·대기 카드에 필요한 가게 데이터도 현재 지도 영역의 검색 결과에 의존시키지 않는다.

## 구현 순서와 완료 기준

1. **계약과 브라우저 통신**: nullable·숫자 query·오류·CSRF·인증 스키마 수정, `Idempotency-Key` CORS 허용, HTTPS 기준 주소 확정. 성공/실패 예시가 OpenAPI 스키마 검증을 통과해야 한다.
2. **공개 조회와 최초 데이터**: ST-01~05·S-01 구현, 매장·시술·자원·일반 슬롯 초기 데이터 공급. 실제 응답으로 지도·상세를 그릴 수 있고 빈 결과·null 필드를 처리해야 한다.
3. **인증과 계정**: 카카오 성공/거절/로그아웃, U-04·U-08·U-09, 가게 등록. 새로고침 후 사용자·가게·취향을 복원하고 다른 계정 데이터에 접근하지 못해야 한다.
4. **예약과 대기**: ST-06~09·S-03~07·지난 내역 숨김. 동시 예약 1건만 성공, 중복 전송 재생, 가격/버전 변경 실패, 고객 숨김 후 사장 기록 보존을 검증한다.
5. **사장 빈자리 운영**: ST-11~15, 취소·노쇼 → 빈자리 → 발행 → 대기 후보 갱신. 시작한 노쇼의 남은 시간에 들어가지 않는 시술은 발행되지 않아야 한다.
6. **채팅과 제안**: C-01~05 후 제안·확정, 이어 WebSocket. 재전송 중복 제거, 최신 요청 재검토, 제안만으로 시간 미점유, 확정 시 겹침 재검사를 검증한다.
7. **실제 알림 전달**: N-04~05의 전송 방식 확정 후 매칭·저장·전달·SSE를 연결한다. 특가 발행 성공과 알림 도착을 별도 상태로 다룬다. 자연어 분석·추천 고도화는 수동 예약·대기 흐름 이후에 진행한다.

현재는 서버 구현이 없는 계약 단계이므로 실제 예약 저장·인증·실시간 채팅·푸시 발송 완료로 표시하지 않는다. 기존 체험 화면은 유지하고 실제 API 응답 확인을 통해 준비 상태를 검증한 뒤, 위 순서대로 기능을 연결한다.
