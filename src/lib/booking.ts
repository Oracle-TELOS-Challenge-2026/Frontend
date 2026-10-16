import { CUSTOMER_ID, DEMO_NOW } from '../data/demo.ts'
import type { DemoState, DiscountMode, Reservation, Shop, Slot } from '../types.ts'

export function validWaitPreference(date: string, time: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false
  const day = new Date(`${date}T00:00:00Z`)
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === date && new Date(`${date}T${time}:00+09:00`) >= new Date(DEMO_NOW)
}

export function getAvailableSlots(shop: Shop, reservations: Reservation[]) {
  return shop.slots.filter((slot) => isBookingTimeAvailable(reservations, shop.id, slot.startsAt, shop.duration)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

export function isBookingTimeAvailable(reservations: Reservation[], shopId: string, startsAt: string, duration: number): boolean {
  const start = Date.parse(startsAt)
  return Number.isFinite(start) && start >= Date.parse(DEMO_NOW) && Number.isInteger(duration) && duration > 0 && !reservations.some((reservation) => reservation.shopId === shopId && reservation.status === 'confirmed' && start < Date.parse(reservation.startsAt) + reservation.duration * 60000 && start + duration * 60000 > Date.parse(reservation.startsAt))
}

export function discountPrice(originalPrice: number, mode: DiscountMode, value: number): number | null {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) return null
  if (mode === 'percent') return value < 100 ? Math.round(originalPrice * (100 - value) / 100) : null
  return value < originalPrice ? value : null
}

export function reserveSlot(state: DemoState, shopId: string, startsAt: string): DemoState | null {
  const shop = state.shops.find((item) => item.id === shopId)
  const slot = shop && getAvailableSlots(shop, state.reservations).find((item) => item.startsAt === startsAt)
  if (!shop || !slot) return null
  const reservation: Reservation = { ...slot, id: crypto.randomUUID(), shopId, customerId: CUSTOMER_ID, customerName: '나', duration: shop.duration, status: 'confirmed', createdAt: new Date().toISOString() }
  return { ...state, reservations: [...state.reservations, reservation], waitlist: state.waitlist.filter((item) => !(item.shopId === shopId && startsAt.startsWith(item.preferredDate) && startsAt.slice(11, 16) === item.preferredTime)) }
}

export function removeReservationHistory(state: DemoState, id: string): DemoState | null {
  const reservation = state.reservations.find((item) => item.id === id)
  if (!reservation || reservation.customerId !== CUSTOMER_ID || reservation.hiddenFromCustomer || !(reservation.status === 'completed' || reservation.startsAt < DEMO_NOW)) return null
  // 고객 내역을 지워도 사장님 예약 기록과 시간 점유 정보는 보존한다.
  return { ...state, reservations: state.reservations.map((item) => item.id === id ? { ...item, hiddenFromCustomer: true } : item) }
}

export function publishCancellation(state: DemoState, id: string, service: string, mode: DiscountMode, value: number): DemoState | null {
  const cancellation = state.cancellations.find((item) => item.id === id)
  if (!cancellation || cancellation.publishedAt || !service.trim() || service.trim().length > 160 || new Date(cancellation.startsAt) < new Date(DEMO_NOW)) return null
  const price = discountPrice(cancellation.originalPrice, mode, value)
  if (price === null) return null
  const slot: Slot = { startsAt: cancellation.startsAt, service: service.trim(), originalPrice: cancellation.originalPrice, price, cancellationId: id }
  const shop = state.shops.find((item) => item.id === cancellation.shopId)
  if (!shop || !getAvailableSlots({ ...shop, slots: [slot] }, state.reservations).length) return null
  return {
    ...state,
    cancellations: state.cancellations.map((item) => item.id === id ? { ...item, service: service.trim(), price, publishedAt: new Date().toISOString() } : item),
    shops: state.shops.map((item) => item.id === cancellation.shopId ? { ...item, slots: [...item.slots.filter((existing) => existing.startsAt !== slot.startsAt), slot] } : item),
  }
}
