import { useCallback, useEffect, useState } from 'react'
import { createDemoState, publishCancellation, removeReservationHistory, reserveSlot, validWaitPreference } from '../model'
import type { DemoProps, RegisteredShop } from '../model'
import { confirmChatBooking, proposeChatBooking, startDemoConversation } from '../lib/chat-booking'
import { CUSTOMER_ID } from '../data/demo'

export function useDemo(ownerShop: RegisteredShop | null) {
  const [state, setState] = useState(createDemoState)
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const notify = useCallback((text: string) => setToast({ text, id: Date.now() }), [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 3500); return () => window.clearTimeout(timer) }, [toast])
  const props: DemoProps = {
    ...state,
    ownerShop,
    onReserve: (shopId, startsAt) => { const next = reserveSlot(state, shopId, startsAt); if (!next) { notify('예약할 수 없는 시간이에요. 다른 시간을 골라주세요.'); return false } setState(next); notify('예약이 완료됐어요! 예약내역에서 확인해 주세요.'); return true },
    onWaitlist: (shopId, preferredDate, preferredTime) => {
      if (!state.shops.some((shop) => shop.id === shopId) || !validWaitPreference(preferredDate, preferredTime)) { notify('희망 날짜와 시간을 확인해 주세요.'); return false }
      if (state.waitlist.some((item) => item.shopId === shopId && item.preferredDate === preferredDate && item.preferredTime === preferredTime)) { notify('이미 같은 시간에 알림을 신청했어요.'); return false }
      setState((current) => ({ ...current, waitlist: [...current.waitlist, { id: crypto.randomUUID(), shopId, preferredDate, preferredTime, createdAt: new Date().toISOString() }] })); notify('빈자리 알림을 신청했어요. 대기내역에서 확인하세요.'); return true
    },
    onUpdateWaitlist: (id, preferredDate, preferredTime) => {
      const waiting = state.waitlist.find((item) => item.id === id)
      if (!waiting || !validWaitPreference(preferredDate, preferredTime)) { notify('희망 날짜와 시간을 확인해 주세요.'); return false }
      if (state.waitlist.some((item) => item.id !== id && item.shopId === waiting.shopId && item.preferredDate === preferredDate && item.preferredTime === preferredTime)) { notify('이미 같은 시간에 알림을 신청했어요.'); return false }
      setState((current) => ({ ...current, waitlist: current.waitlist.map((item) => item.id === id ? { ...item, preferredDate, preferredTime } : item) })); notify('알림 받을 시간을 변경했어요.'); return true
    },
    onRemoveWaitlist: (id) => { setState((current) => ({ ...current, waitlist: current.waitlist.filter((item) => item.id !== id) })); notify('빈자리 알림 신청을 취소했어요.') },
    onRemoveReservation: (id) => { const next = removeReservationHistory(state, id); if (!next) { notify('삭제할 수 있는 지난 예약내역이 아니에요.'); return } setState(next); notify('지난 예약내역을 삭제했어요.') },
    onPublish: (id, service, mode, value) => { if (!state.cancellations.some((item) => item.id === id && item.shopId === ownerShop?.id)) return false; const next = publishCancellation(state, id, service, mode, value); if (!next) { notify('시술 내용과 할인 금액, 예약 가능 여부를 확인해 주세요.'); return false } setState(next); notify('빈자리를 공개했어요! 고객 지도에서도 볼 수 있어요.'); return true },
    onSendMessage: (conversationId, body, sender) => { if (!body.trim() || body.trim().length > 2000) return; setState((current) => ({ ...current, conversations: current.conversations.map((item) => item.id === conversationId && (sender === 'customer' || item.shopId === ownerShop?.id) ? { ...item, unread: sender === 'customer' ? item.unread + 1 : item.unread, messages: [...item.messages, { id: crypto.randomUUID(), sender, body: body.trim(), sentAt: new Date().toISOString() }] } : item) })) },
    onReadConversation: (id) => setState((current) => ({ ...current, conversations: current.conversations.map((item) => item.id === id && item.shopId === ownerShop?.id && item.unread ? { ...item, unread: 0 } : item) })),
    onStartDemoConversation: () => {
      if (!ownerShop) return null
      const next = startDemoConversation(state, ownerShop)
      setState(next)
      return next.conversations.find((item) => item.shopId === ownerShop.id && item.customerId === CUSTOMER_ID)!.id
    },
    onProposeBooking: (conversationId, sourceMessageId, input) => {
      if (!ownerShop) return false
      const next = proposeChatBooking(state, ownerShop.id, conversationId, sourceMessageId, input)
      if (!next) return false
      setState(next)
      notify('예약 제안을 보냈어요. 고객이 확인하면 예약이 확정돼요.')
      return true
    },
    onConfirmBooking: (conversationId, messageId) => {
      const next = confirmChatBooking(state, conversationId, messageId)
      if (!next) return false
      setState(next)
      notify('예약이 확정됐어요. 예약내역과 사장님 캘린더에 반영했어요.')
      return true
    },
  }
  return { props, toast, notify }
}
