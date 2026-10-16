import { CUSTOMER_ID, DEMO_NOW } from '../data/demo.ts'
import { isBookingTimeAvailable, validWaitPreference } from './booking.ts'
import type { ChatBookingInput, DemoState, RegisteredShop, Reservation } from '../types.ts'

export function startDemoConversation(state: DemoState, shop: RegisteredShop): DemoState {
  if (state.conversations.some((item) => item.shopId === shop.id && item.customerId === CUSTOMER_ID)) return state
  return { ...state, conversations: [...state.conversations, {
    id: `${shop.id}-${CUSTOMER_ID}`, shopId: shop.id, customerId: CUSTOMER_ID, customerName: '나', avatar: '🍑', unread: 1,
    messages: [{ id: crypto.randomUUID(), sender: 'customer', body: `내일 오후 3시에 ${shop.service} 예약 가능할까요?`, sentAt: DEMO_NOW }],
  }] }
}

export function validateChatBooking(input: ChatBookingInput): string | null {
  if (!input.service.trim() || input.service.trim().length > 160) return '시술과 옵션을 160자 이내로 입력해 주세요.'
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(input.startsAt) || !validWaitPreference(input.startsAt.slice(0, 10), input.startsAt.slice(11, 16))) return '시연 기준일 이후의 올바른 날짜와 시간을 입력해 주세요.'
  if (!Number.isInteger(input.duration) || input.duration < 10 || input.duration > 480) return '소요 시간을 10분부터 480분 사이로 입력해 주세요.'
  if (!Number.isInteger(input.price) || input.price < 1 || input.price > 10000000) return '예약 금액을 1원부터 1,000만 원 사이로 입력해 주세요.'
  // shortcut: 현재 타임테이블은 하루 안의 예약만 표시한다. 야간 영업 지원 시 날짜를 넘는 일정을 함께 처리한다.
  if (Number(input.startsAt.slice(11, 13)) * 60 + Number(input.startsAt.slice(14, 16)) + input.duration > 1440) return '예약이 같은 날짜 안에 끝나도록 시간과 소요 시간을 조정해 주세요.'
  return null
}

export function proposeChatBooking(state: DemoState, ownerShopId: string, conversationId: string, sourceMessageId: string, input: ChatBookingInput): DemoState | null {
  const conversation = state.conversations.find((item) => item.id === conversationId && item.shopId === ownerShopId)
  const source = conversation?.messages.filter((item) => item.sender === 'customer').at(-1)
  if (!conversation || !source || source.id !== sourceMessageId || validateChatBooking(input) || !isBookingTimeAvailable(state.reservations, conversation.shopId, input.startsAt, input.duration)) return null
  if (conversation.messages.some((item) => item.proposal?.sourceMessageId === sourceMessageId && item.proposal.reservationId)) return null
  const message = {
    id: crypto.randomUUID(), sender: 'owner' as const, body: '예약 내용을 확인해 주세요.', sentAt: new Date().toISOString(),
    proposal: { ...input, service: input.service.trim(), sourceMessageId },
  }
  return { ...state, conversations: state.conversations.map((item) => item.id === conversationId ? { ...item, messages: [...item.messages, message] } : item) }
}

export function confirmChatBooking(state: DemoState, conversationId: string, messageId: string): DemoState | null {
  const conversation = state.conversations.find((item) => item.id === conversationId && item.customerId === CUSTOMER_ID)
  const message = conversation?.messages.filter((item) => item.proposal).at(-1)
  const proposal = message?.proposal
  const source = conversation?.messages.filter((item) => item.sender === 'customer').at(-1)
  if (!conversation || message?.id !== messageId || !proposal || proposal.reservationId || source?.id !== proposal.sourceMessageId || validateChatBooking(proposal) || !isBookingTimeAvailable(state.reservations, conversation.shopId, proposal.startsAt, proposal.duration)) return null
  const reservation: Reservation = {
    id: crypto.randomUUID(), shopId: conversation.shopId, customerId: conversation.customerId, customerName: conversation.customerName,
    service: proposal.service, startsAt: proposal.startsAt, duration: proposal.duration, price: proposal.price, originalPrice: proposal.price,
    status: 'confirmed', createdAt: new Date().toISOString(),
  }
  return {
    ...state,
    reservations: [...state.reservations, reservation],
    waitlist: state.waitlist.filter((item) => !(item.shopId === conversation.shopId && proposal.startsAt.startsWith(item.preferredDate) && proposal.startsAt.slice(11, 16) === item.preferredTime)),
    conversations: state.conversations.map((item) => item.id === conversationId ? {
      ...item, unread: item.unread + 1,
      messages: item.messages.map((entry) => entry.id === messageId ? { ...entry, proposal: { ...proposal, reservationId: reservation.id } } : entry),
    } : item),
  }
}
