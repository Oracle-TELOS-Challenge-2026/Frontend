# 백엔드 API 연결 현황

2026년 10월 17일 [Swagger UI](https://140.238.19.165/swagger-ui/index.html)의 [OpenAPI 원문](https://140.238.19.165/v3/api-docs)을 기준으로 프론트의 샘플 데이터를 실제 API로 교체했다. 기준 원문은 [OpenAPI 스냅샷](openapi.snapshot.json)에 보관한다. 경로 45개, HTTP operation 50개이며 서버 문서의 버전 표기는 `v0.1-contract`이다. 버전 이름과 별개로 최신 설명은 사용자·매장·검색·알림·채팅 API가 구현되었다고 명시한다.

## 화면별 연결

아래 경로의 공통 접두사는 `/api/v1`이다.

| 화면 | 사용하는 API와 동작 |
| --- | --- |
| 로그인·계정 | `GET /auth/oauth/kakao/start`로 이동, `GET /users/me`로 세션·권한·매장 복원, `POST /auth/logout` |
| 취향 | `PUT /users/me/preferences`; 기존 조건을 보존하고 원문과 사용자 최상위 `version`을 전달 |
| 매장 등록 | `POST /owner/stores`, `POST /owner/stores/{storeId}/services`; 매장만 성공한 경우 그 매장의 시술 등록을 재시도 |
| 고객 지도·검색 | `GET /stores/categories`, `GET /search/stores`; 지도 중심과 반경, 검색어·업종 전달 |
| 매장 상세 | `GET /stores/{storeId}`, `/services`, `/slots`; 선택 날짜의 실제 시술·가격·가용 시간 표시 |
| 예약 | `GET /stores/{storeId}/slots/{slotId}`로 최신 조건 확인 후 `POST /reservations`; 가격·슬롯 버전·멱등 키 전달 |
| 예약내역·취소 | `GET /reservations/me`의 UPCOMING/PAST/CANCELED 범위, `POST /reservations/{reservationId}/cancel` |
| 대기 | `/search/waitlists` 등록, `/me` 조회, `/{waitlistId}` 변경, `/{waitlistId}/cancel` 취소; 서버 Offer를 예약 확인 창에 연결 |
| 사장님 타임테이블 | `GET /owner/stores/{storeId}/timetable?date=...`; 서버 요약·고객·모든 예약 상태와 예약 가능 시간을 표시; 일인샵 전체 일정 사용 |
| 사장님 예약 시간 등록 | `POST /owner/stores/{storeId}/slots`; 활성 시술·미래 시작 시각·멱등 키 전달 후 해당 날짜 다시 조회 |
| 사장님 빈자리 | `GET /owner/stores/{storeId}/vacancies`, `POST /owner/stores/{storeId}/vacancies/{vacancyId}/publish`; 등록 시술·시작 시각·할인·버전 전달 |
| 채팅 | `/chatting/rooms` 조회·생성, 방별 `/messages` 조회·전송, `/read` 갱신; 메시지 sequence로 병합·정렬 |
| 알림함·실시간 알림 | `GET /notifications`, `PATCH /notifications/{notificationId}/read`, `GET /notifications/stream`; 미읽음 배지·페이지네이션·SSE 재연결과 푸시 클릭 읽음 처리 |
| 채팅 예약 제안 | `POST /chatting/rooms/{roomId}/booking-proposals`와 `/{proposalId}/confirm`; 상태·버전·멱등 키를 보존하고 고객 확인 후 예약 확정 |
| 사장님 관리 | 예약 단건 조회·완료·노쇼 처리, 빈자리 철회, 매장 설명·영업시간 수정, 시술 추가·가격·제공 여부 수정 |
| 계정·조건 입력 | 사용자 이름 변경, 기기 위치 저장·삭제, 자연어 조건 분석 후 사용자 확인·동의로 대기 등록 |
| 개별 내역 | 예약·대기 단건 상세 조회와 상세 경로 |
| 브라우저 알림 | `/notifications/push-subscriptions`로 FID 등록, `/{subscriptionId}`로 해제 |

목록 조회는 서버의 커서를 따라 읽는다. 날짜는 현재 한국 날짜를 사용한다. 기존 데모 계정·가상 가게·고정 날짜·메모리 예약·가짜 채팅 응답은 사용하지 않는다. 임시 `/backend` 연결 점검 화면도 제거했다.

## 변경 요청과 오류 처리

- API origin은 `https://140.238.19.165`이며 모든 요청에 `credentials: include`를 사용한다.
- 변경 요청 전에 `/auth/csrf`에서 토큰을 받아 `X-CSRF-Token`을 보낸다. 계약이 요구하는 생성·취소·발행에는 `Idempotency-Key`를 사용한다.
- 예약은 사용자가 확인한 가격·시술·시간을 최신 슬롯과 비교하고, 확인한 요청 본문과 멱등 키를 재시도 때 유지한다. 실제 점유 충돌은 서버가 처리한다.
- 변경 API의 `expectedVersion`은 서버에서 받은 값을 사용한다. 가격·시간·버전 충돌을 성공으로 처리하거나 임의 덮어쓰지 않는다.
- `success.data`와 사용 필드의 형식을 검사한다. 실패 응답·네트워크·15초 타임아웃을 안내하고 샘플 데이터로 대체하지 않는다. `204` 응답에는 JSON 본문을 요구하지 않는다.
- 빈자리 상태는 DRAFT/PUBLISHED/FILLED/WITHDRAWN/EXPIRED를 구분한다. 발행 성공은 알림의 실제 전달 완료를 뜻하지 않는다.

## 현재 범위

- 사장님 화면은 `ownedStoreIds`의 첫 매장을 사용한다. 여러 매장 선택 화면은 없다.
- 채팅은 기존 REST 전송·이력과 WebSocket 수신·읽음 표시를 함께 사용한다. WS 연결 실패 시 5초 REST 조회로 복구하며 이미 조회한 과거 제안도 갱신한다. 고객 채팅 목록·미읽음 배지, 사장님 제안 전송, 고객 확인·예약 확정을 연결했다. 재전송은 같은 멱등 키를 사용하고 제안의 낮은 version이 최신 상태를 덮어쓰지 않는다.
- Swagger 50개 operation 중 프런트 대상 47개를 연결했다. OAuth 콜백 1개와 내부 매칭·발송 2개는 서버 흐름에서 사용한다. 위치 저장은 마이페이지에서 사용자가 눌렀을 때만 수행한다. 자연어 분석은 저장하지 않으며 확인·수정과 알림 동의 후 대기를 등록한다. 가게 설명은 등록 시 선택 입력(최대 1,000자)이며 관리 화면에서 수정할 수 있다.
- 지난 예약 기록을 브라우저에서만 숨기던 기능과 가짜 예약 생성은 제거했다. 채팅 상대 날짜는 메시지 발송일의 한국 시간 기준으로 해석하며, 취소·거절과 마지막 고객 메시지가 아닌 요청은 제안 안내에서 제외한다.
- 신규 매장은 사장님 홈에서 일반 예약 슬롯을 등록한다. 활성 시술과 미래 시각, 시술 전체의 영업시간 포함을 검증하며 기존 슬롯·확정 예약 충돌은 서버가 판정한다. 응답이 유실되면 같은 본문·멱등 키로 재확인한다.
- 현재 서버는 빈자리 매칭 알림만 지원하며 채팅 FCM은 구현되어 있지 않다. 활성 푸시 구독이 없는 사용자의 빈자리 알림 저장을 건너뛰는 서버 정책은 유지한다.
- 내부 매칭·발송 API는 프론트에서 호출하지 않는다. 조건 매칭과 FCM 발송은 서버 책임이다. 외부 의존 기능의 `503`은 화면에 오류로 표시한다.

## 검증과 배포 확인

공개 카테고리·매장 검색의 성공 응답과 `Idempotency-Key`를 포함한 CORS 허용을 확인했다. 로컬 테스트는 모의 응답으로 요청 형식, 충돌, 재시도와 오류 처리를 검증한다.

실제 인증 계정의 로그인·예약 저장·빈자리 공개·FCM 도착까지 운영 데이터로 실행한 것은 아니다. 배포 후 테스트 계정으로 확인해야 한다. 프론트 origin을 바꾸면 백엔드 CORS·OAuth 리다이렉트와 카카오맵 도메인을 함께 맞춘다.

최신 OpenAPI에는 일부 객체의 `type: null`/`$ref` 조합 등 문서 표현 문제가 남아 있다. 프론트는 사용 필드를 명시적으로 검증하며, 이 스냅샷을 코드 생성용으로 사용할 경우 실제 응답과 nullable 정의를 먼저 대조해야 한다.

## 가게 상세 오류 회귀 확인

설명이 없는 신규 매장은 `description: null`을 반환한다. 배포 이전 프런트의 문자열 전용 파서가 이를 거부해 상세 화면이 실패했다. null은 빈 설명으로 표시하며, 다른 형식의 잘못된 설명은 계속 오류로 처리한다. 실제 공개 매장의 상세·시술·슬롯 응답을 로컬 파서에 넣어 정상 조회를 확인했다.
