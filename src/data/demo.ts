import type { DemoState, Reservation, Shop, Slot } from '../types.ts'

// shortcut: 시연 날짜를 고정한다. API 연결 시 서버 시간과 실제 예약 데이터로 교체한다.
export const DEMO_DAY = '2026-10-16'
export const DEMO_NOW = `${DEMO_DAY}T14:20:00+09:00`
export const OWNER_SHOP_ID = 'moment'
export const CUSTOMER_ID = 'me'
export const DEMO_AREA_LABEL = '동작캠퍼스'
export const DEMO_RADIUS_KM = 5
// 동작캠퍼스 주소: https://mediahub.seoul.go.kr/archives/2006552 · 건물 중심: https://mapcarta.com/W1113246888
export const DEMO_MAP_CENTER = { latitude: 37.51243, longitude: 126.92727 }

function makeSlot(day: number, time: string, service: string, price: number, originalPrice = price, cancellationId?: string): Slot {
  return { startsAt: `2026-10-${day}T${time}:00+09:00`, service, price, originalPrice, cancellationId }
}

export function createDemoState(): DemoState {
  // shortcut: 반경 5km 안의 가상 매장·위치·예약 데이터다. 실제 가게 API 연결 시 교체한다.
  const shops: Shop[] = [
    { id: 'moment', name: '네일 모먼트', category: '네일', image: '/images/nail.jpg', address: '서울 동작구 대방동 (시연용 위치)', distance: '직선 180m', rating: '4.9', description: '시연용 가게입니다. 취향을 함께 고민하는 대방동의 작은 네일 공간이에요.', service: '원컬러 젤 네일', originalPrice: 50000, duration: 60, latitude: 37.51315, longitude: 126.9291, slots: [makeSlot(16, '17:00', '원컬러 젤 네일', 35000, 50000, 'cancel-1'), makeSlot(17, '11:00', '원컬러 젤 네일', 50000), makeSlot(18, '14:00', '원컬러 젤 네일', 50000)] },
    { id: 'ond', name: '온드 헤어', category: '헤어', image: '/images/hair.jpg', address: '서울 동작구 대방동 (시연용 위치)', distance: '직선 200m', rating: '4.8', description: '시연용 가게입니다. 동작캠퍼스 수업 뒤 가볍게 들르는 대방동 헤어 살롱이에요.', service: '디자인 커트', originalPrice: 35000, duration: 60, latitude: 37.5112, longitude: 126.9256, slots: [makeSlot(16, '16:00', '디자인 커트', 35000), makeSlot(17, '13:00', '디자인 커트', 35000)] },
    { id: 'bloom', name: '블룸 래쉬', category: '속눈썹', image: '/images/lash.jpg', address: '서울 동작구 노량진동 (시연용 위치)', distance: '직선 840m', rating: '4.9', description: '시연용 가게입니다. 노량진에서 눈매에 맞는 자연스러운 속눈썹을 디자인해요.', service: '케라틴 속눈썹 펌', originalPrice: 45000, duration: 60, latitude: 37.5143, longitude: 126.9365, slots: [makeSlot(16, '18:00', '케라틴 속눈썹 펌', 31500, 45000), makeSlot(17, '15:00', '케라틴 속눈썹 펌', 45000)] },
    { id: 'slow', name: '슬로우 스킨', category: '피부관리', image: '/images/skin.jpg', address: '서울 동작구 대방동 (시연용 위치)', distance: '직선 620m', rating: '4.8', description: '시연용 가게입니다. 바쁜 하루 속 피부와 마음이 함께 편안해지는 맞춤 케어예요.', service: '수분 진정 케어', originalPrice: 70000, duration: 60, latitude: 37.5091, longitude: 126.9329, slots: [makeSlot(16, '19:00', '수분 진정 케어', 70000), makeSlot(18, '11:00', '수분 진정 케어', 70000)] },
    { id: 'nail-yeouido', name: '여의 네일룸', category: '네일', image: '/images/nail.jpg', address: '서울 영등포구 여의도동 (시연용 위치)', distance: '직선 1.0km', rating: '4.8', description: '시연용 가게입니다. 퇴근길에 즐기는 은은한 컬러와 꼼꼼한 손끝 케어.', service: '시럽 젤 네일', originalPrice: 55000, duration: 60, latitude: 37.5213, longitude: 126.9302, slots: [makeSlot(16, '18:30', '시럽 젤 네일', 44000, 55000), makeSlot(17, '12:00', '시럽 젤 네일', 55000)] },
    { id: 'hair-singil', name: '신길 결 헤어', category: '헤어', image: '/images/hair.jpg', address: '서울 영등포구 신길동 (시연용 위치)', distance: '직선 1.2km', rating: '4.7', description: '시연용 가게입니다. 손질하기 편한 커트와 가벼운 스타일링을 제안해요.', service: '커트 + 두피 케어', originalPrice: 45000, duration: 60, latitude: 37.5056, longitude: 126.9165, slots: [makeSlot(16, '15:30', '커트 + 두피 케어', 36000, 45000), makeSlot(17, '10:00', '커트 + 두피 케어', 45000)] },
    { id: 'lash-noryangjin', name: '노량진 눈꽃', category: '속눈썹', image: '/images/lash.jpg', address: '서울 동작구 노량진동 (시연용 위치)', distance: '직선 1.5km', rating: '4.8', description: '시연용 가게입니다. 원하는 컬과 길이를 함께 고르는 속눈썹 공간이에요.', service: '내추럴 속눈썹 연장', originalPrice: 60000, duration: 90, latitude: 37.5137, longitude: 126.944, slots: [makeSlot(16, '16:30', '내추럴 속눈썹 연장', 48000, 60000), makeSlot(17, '14:00', '내추럴 속눈썹 연장', 60000)] },
    { id: 'skin-singil', name: '신길 온 스킨', category: '피부관리', image: '/images/skin.jpg', address: '서울 영등포구 신길동 (시연용 위치)', distance: '직선 1.2km', rating: '4.7', description: '시연용 가게입니다. 피부 컨디션에 맞춰 편안한 관리 시간을 준비해요.', service: '기초 보습 케어', originalPrice: 60000, duration: 60, latitude: 37.5115, longitude: 126.9142, slots: [makeSlot(16, '17:30', '기초 보습 케어', 45000, 60000), makeSlot(17, '11:00', '기초 보습 케어', 60000)] },
    { id: 'nail-sangdo', name: '상도 팔레트', category: '네일', image: '/images/nail.jpg', address: '서울 동작구 상도동 (시연용 위치)', distance: '직선 2.1km', rating: '4.9', description: '시연용 가게입니다. 작은 포인트 아트부터 나만의 컬러 조합까지 함께해요.', service: '포인트 아트 네일', originalPrice: 65000, duration: 90, latitude: 37.5031, longitude: 126.9479, slots: [makeSlot(16, '18:00', '포인트 아트 네일', 52000, 65000), makeSlot(18, '13:00', '포인트 아트 네일', 65000)] },
    { id: 'hair-heukseok', name: '흑석 어반헤어', category: '헤어', image: '/images/hair.jpg', address: '서울 동작구 흑석동 (시연용 위치)', distance: '직선 3.1km', rating: '4.8', description: '시연용 가게입니다. 흑석동에서 찾는 차분한 스타일 변화와 휴식.', service: '커트 + 다운펌', originalPrice: 55000, duration: 60, latitude: 37.5085, longitude: 126.9625, slots: [makeSlot(16, '19:00', '커트 + 다운펌', 55000), makeSlot(17, '15:00', '커트 + 다운펌', 55000)] },
    { id: 'lash-boramae', name: '보라매 라인래쉬', category: '속눈썹', image: '/images/lash.jpg', address: '서울 동작구 신대방동 (시연용 위치)', distance: '직선 1.8km', rating: '4.7', description: '시연용 가게입니다. 아침 준비를 가볍게 해주는 또렷한 컬을 만나보세요.', service: '영양 속눈썹 펌', originalPrice: 45000, duration: 60, latitude: 37.4971, longitude: 126.9205, slots: [makeSlot(16, '15:00', '영양 속눈썹 펌', 36000, 45000), makeSlot(17, '16:00', '영양 속눈썹 펌', 45000)] },
    { id: 'skin-sangdo', name: '상도 고요 에스테틱', category: '피부관리', image: '/images/skin.jpg', address: '서울 동작구 상도동 (시연용 위치)', distance: '직선 1.7km', rating: '4.9', description: '시연용 가게입니다. 조용한 공간에서 잠시 쉬어가는 수분 관리 시간.', service: '수분 집중 케어', originalPrice: 80000, duration: 90, latitude: 37.4994, longitude: 126.9365, slots: [makeSlot(16, '17:00', '수분 집중 케어', 64000, 80000), makeSlot(18, '10:00', '수분 집중 케어', 80000)] },
    { id: 'nail-yeongdeungpo', name: '영등포 피치네일', category: '네일', image: '/images/nail.jpg', address: '서울 영등포구 영등포동 (시연용 위치)', distance: '직선 1.8km', rating: '4.6', description: '시연용 가게입니다. 기분을 바꾸는 선명한 컬러와 깔끔한 케어.', service: '젤 네일 + 케어', originalPrice: 50000, duration: 60, latitude: 37.5167, longitude: 126.9072, slots: [makeSlot(16, '16:00', '젤 네일 + 케어', 40000, 50000), makeSlot(17, '11:30', '젤 네일 + 케어', 50000)] },
    { id: 'hair-yeouido', name: '여의도 무드살롱', category: '헤어', image: '/images/hair.jpg', address: '서울 영등포구 여의도동 (시연용 위치)', distance: '직선 1.9km', rating: '4.9', description: '시연용 가게입니다. 일상에 어울리는 컬러와 결을 함께 찾아드려요.', service: '뿌리 염색', originalPrice: 60000, duration: 90, latitude: 37.5283, longitude: 126.9201, slots: [makeSlot(16, '18:30', '뿌리 염색', 48000, 60000), makeSlot(18, '12:00', '뿌리 염색', 60000)] },
    { id: 'lash-yeongdeungpo', name: '영등포 루나래쉬', category: '속눈썹', image: '/images/lash.jpg', address: '서울 영등포구 영등포동 (시연용 위치)', distance: '직선 2.3km', rating: '4.8', description: '시연용 가게입니다. 눈매에 맞춘 자연스러운 볼륨을 제안해요.', service: '볼륨 속눈썹 연장', originalPrice: 70000, duration: 90, latitude: 37.5216, longitude: 126.9045, slots: [makeSlot(16, '17:00', '볼륨 속눈썹 연장', 70000), makeSlot(17, '13:00', '볼륨 속눈썹 연장', 70000)] },
    { id: 'skin-heukseok', name: '흑석 윤슬스킨', category: '피부관리', image: '/images/skin.jpg', address: '서울 동작구 흑석동 (시연용 위치)', distance: '직선 3.5km', rating: '4.8', description: '시연용 가게입니다. 부드러운 관리로 일상에 작은 휴식을 더해요.', service: '클렌징 + 진정 케어', originalPrice: 65000, duration: 60, latitude: 37.5056, longitude: 126.9658, slots: [makeSlot(16, '16:00', '클렌징 + 진정 케어', 52000, 65000), makeSlot(17, '14:30', '클렌징 + 진정 케어', 65000)] },
    { id: 'nail-mullae', name: '문래 스튜디오네일', category: '네일', image: '/images/nail.jpg', address: '서울 영등포구 문래동 (시연용 위치)', distance: '직선 3.9km', rating: '4.8', description: '시연용 가게입니다. 문래의 색을 닮은 개성 있는 손끝 디자인.', service: '자석 젤 네일', originalPrice: 60000, duration: 90, latitude: 37.5184, longitude: 126.8833, slots: [makeSlot(16, '19:00', '자석 젤 네일', 48000, 60000), makeSlot(18, '14:00', '자석 젤 네일', 60000)] },
    { id: 'hair-daerim', name: '대림 하루헤어', category: '헤어', image: '/images/hair.jpg', address: '서울 영등포구 대림동 (시연용 위치)', distance: '직선 3.3km', rating: '4.7', description: '시연용 가게입니다. 평소 손질 습관을 고려한 편안한 커트를 만나요.', service: '디자인 커트', originalPrice: 30000, duration: 60, latitude: 37.4941, longitude: 126.8985, slots: [makeSlot(16, '17:30', '디자인 커트', 24000, 30000), makeSlot(17, '10:30', '디자인 커트', 30000)] },
    { id: 'lash-yangpyeong', name: '양평 데이래쉬', category: '속눈썹', image: '/images/lash.jpg', address: '서울 영등포구 양평동 (시연용 위치)', distance: '직선 4.3km', rating: '4.9', description: '시연용 가게입니다. 한 올 한 올 정돈하는 자연스러운 속눈썹 케어.', service: '케라틴 속눈썹 펌', originalPrice: 50000, duration: 60, latitude: 37.5324, longitude: 126.8861, slots: [makeSlot(16, '18:00', '케라틴 속눈썹 펌', 40000, 50000), makeSlot(17, '12:00', '케라틴 속눈썹 펌', 50000)] },
    { id: 'skin-sindorim', name: '신도림 담담스킨', category: '피부관리', image: '/images/skin.jpg', address: '서울 구로구 신도림동 (시연용 위치)', distance: '직선 3.4km', rating: '4.7', description: '시연용 가게입니다. 하루의 긴장을 내려놓는 차분한 보습 관리.', service: '페이스 보습 케어', originalPrice: 75000, duration: 90, latitude: 37.5073, longitude: 126.8895, slots: [makeSlot(16, '19:30', '페이스 보습 케어', 60000, 75000), makeSlot(18, '11:30', '페이스 보습 케어', 75000)] },
  ]
  const reservation = (id: string, shop: Shop, day: number, time: string, name: string, customerId: string, status: Reservation['status'] = 'confirmed'): Reservation => ({ ...makeSlot(day, time, shop.service, shop.originalPrice), id, shopId: shop.id, customerName: name, customerId, duration: shop.duration, status, createdAt: '2026-10-15T10:00:00+09:00' })
  return {
    shops,
    reservations: [
      reservation('res-1', shops[0], 17, '14:00', '나', 'me'),
      reservation('res-2', shops[1], 18, '11:00', '나', 'me'),
      reservation('res-3', shops[2], 12, '13:00', '나', 'me', 'completed'),
      reservation('res-4', shops[0], 16, '10:00', '김하은', 'haeun', 'completed'),
      reservation('res-5', shops[0], 16, '11:30', '이서연', 'seoyeon', 'completed'),
      reservation('res-6', shops[0], 16, '15:00', '박지우', 'jiwoo'),
      reservation('res-7', shops[0], 16, '18:30', '최유진', 'yujin'),
    ],
    waitlist: [
      { id: 'wait-1', shopId: 'moment', preferredDate: DEMO_DAY, preferredTime: '17:00', createdAt: '2026-10-16T13:40:00+09:00' },
      { id: 'wait-2', shopId: 'bloom', preferredDate: '2026-10-17', preferredTime: '15:00', createdAt: '2026-10-15T15:00:00+09:00' },
    ],
    cancellations: [
      { id: 'cancel-2', shopId: 'moment', startsAt: '2026-10-17T16:00:00+09:00', service: '원컬러 젤 네일', originalPrice: 50000, reason: '예약 취소', createdAt: '2026-10-16T14:10:00+09:00' },
      { id: 'cancel-3', shopId: 'moment', startsAt: '2026-10-16T16:00:00+09:00', service: '원컬러 젤 네일', originalPrice: 50000, reason: '노쇼', createdAt: '2026-10-16T13:50:00+09:00' },
      { id: 'cancel-1', shopId: 'moment', startsAt: '2026-10-16T17:00:00+09:00', service: '원컬러 젤 네일', originalPrice: 50000, reason: '예약 취소', createdAt: '2026-10-16T12:30:00+09:00', publishedAt: '2026-10-16T12:35:00+09:00', price: 35000 },
    ],
    conversations: [
      ...shops.map((shop) => ({ id: `${shop.id}-me`, shopId: shop.id, customerId: 'me', customerName: '나', avatar: '🍑', unread: 0, messages: [{ id: `${shop.id}-hello`, sender: 'owner' as const, body: `안녕하세요, ${shop.name}입니다 🌷 궁금한 시술이나 시간을 편하게 물어봐 주세요!`, sentAt: '2026-10-16T13:10:00+09:00' }] })),
      { id: 'moment-jiwoo', shopId: 'moment', customerId: 'jiwoo', customerName: '박지우', avatar: '🌼', unread: 2, messages: [{ id: 'msg-1', sender: 'customer', body: '안녕하세요! 오늘 예약한 박지우예요. 디자인 사진 가져가도 될까요?', sentAt: '2026-10-16T14:05:00+09:00' }] },
      { id: 'moment-yujin', shopId: 'moment', customerId: 'yujin', customerName: '최유진', avatar: '🥑', unread: 0, messages: [{ id: 'msg-2', sender: 'owner', body: '네, 오늘 6시 반에 뵐게요 :)', sentAt: '2026-10-16T12:30:00+09:00' }] },
    ],
  }
}
