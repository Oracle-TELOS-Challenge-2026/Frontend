import type { DemoState, Reservation, Shop, Slot } from '../types.ts'

// shortcut: 시연 날짜를 고정한다. API 연결 시 서버 시간과 실제 예약 데이터로 교체한다.
export const DEMO_DAY = '2026-10-16'
export const DEMO_NOW = `${DEMO_DAY}T14:20:00+09:00`
export const OWNER_SHOP_ID = 'moment'
export const CUSTOMER_ID = 'me'

function makeSlot(day: number, time: string, service: string, price: number, originalPrice = price, cancellationId?: string): Slot {
  return { startsAt: `2026-10-${day}T${time}:00+09:00`, service, price, originalPrice, cancellationId }
}

export function createDemoState(): DemoState {
  // shortcut: 성수동의 시연용 좌표다. 실제 가게 API 연결 시 검증된 주소·좌표로 교체한다.
  const shops: Shop[] = [
    { id: 'moment', name: '네일 모먼트', category: '네일', image: '/images/nail.jpg', address: '서울 성동구 연무장길 18, 2층', distance: '도보 3분', rating: '4.9', description: '손끝에 담는 작은 기분 전환. 취향을 함께 고민하는 따뜻한 네일 공간이에요.', service: '원컬러 젤 네일', originalPrice: 50000, duration: 60, latitude: 37.5448, longitude: 127.0521, slots: [makeSlot(16, '17:00', '원컬러 젤 네일', 35000, 50000, 'cancel-1'), makeSlot(17, '11:00', '원컬러 젤 네일', 50000), makeSlot(18, '14:00', '원컬러 젤 네일', 50000)] },
    { id: 'ond', name: '온드 헤어', category: '헤어', image: '/images/hair.jpg', address: '서울 성동구 서울숲길 24, 1층', distance: '도보 5분', rating: '4.8', description: '나에게 가장 자연스러운 스타일을 찾아드려요. 서울숲 옆 작은 헤어 살롱.', service: '디자인 커트', originalPrice: 35000, duration: 60, latitude: 37.5461, longitude: 127.0448, slots: [makeSlot(16, '16:00', '디자인 커트', 35000), makeSlot(17, '13:00', '디자인 커트', 35000)] },
    { id: 'bloom', name: '블룸 래쉬', category: '속눈썹', image: '/images/lash.jpg', address: '서울 성동구 왕십리로 83, 3층', distance: '도보 7분', rating: '4.9', description: '매일 아침이 조금 더 가벼워지도록. 눈매에 꼭 맞는 섬세한 속눈썹 디자인.', service: '케라틴 속눈썹 펌', originalPrice: 45000, duration: 60, latitude: 37.5429, longitude: 127.0441, slots: [makeSlot(16, '18:00', '케라틴 속눈썹 펌', 31500, 45000), makeSlot(17, '15:00', '케라틴 속눈썹 펌', 45000)] },
    { id: 'slow', name: '슬로우 스킨', category: '피부관리', image: '/images/skin.jpg', address: '서울 성동구 성수일로 39, 2층', distance: '도보 10분', rating: '4.8', description: '바쁜 하루 속 잠깐의 쉼. 피부와 마음이 함께 편안해지는 맞춤 케어.', service: '수분 진정 케어', originalPrice: 70000, duration: 60, latitude: 37.5428, longitude: 127.0502, slots: [makeSlot(16, '19:00', '수분 진정 케어', 70000), makeSlot(18, '11:00', '수분 진정 케어', 70000)] },
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
