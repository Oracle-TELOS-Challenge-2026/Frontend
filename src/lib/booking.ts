import type { DiscountMode, Shop } from '../types.ts'
import { isCalendarDate } from './format.ts'

export function validWaitPreference(date: string, time: string, now = Date.now()): boolean {
  if (!isCalendarDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false
  return Date.parse(`${date}T${time}:00+09:00`) > now
}

export function getAvailableSlots(shop: Shop) {
  return shop.slots.filter((slot) => Date.parse(slot.startsAt) > Date.now()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
}

export function discountPrice(originalPrice: number, mode: DiscountMode, value: number): number | null {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) return null
  if (mode === 'percent') return value < 100 ? Math.round(originalPrice * (100 - value) / 100) : null
  return value < originalPrice ? value : null
}
