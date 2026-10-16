import { validWaitPreference } from './booking.ts'

export interface ChatBookingInput {
  service: string
  startsAt: string
  duration: number
  price: number
}

export function validateChatBooking(input: ChatBookingInput, now = Date.now()): string | null {
  if (!input.service.trim() || input.service.trim().length > 1000) return '시술과 옵션을 1000자 이내로 입력해 주세요.'
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(input.startsAt) || !validWaitPreference(input.startsAt.slice(0, 10), input.startsAt.slice(11, 16), now)) return '현재 이후의 올바른 날짜와 시간을 입력해 주세요.'
  if (!Number.isInteger(input.duration) || input.duration < 15 || input.duration > 480 || input.duration % 5 !== 0) return '소요 시간을 15분부터 480분 사이의 5분 단위로 입력해 주세요.'
  if (!Number.isInteger(input.price) || input.price < 0 || input.price > 10000000) return '예약 금액을 0원부터 1,000만 원 사이로 입력해 주세요.'
  // 서버 영업시간은 시작과 종료가 같은 날짜인 예약만 허용한다.
  if (Number(input.startsAt.slice(11, 13)) * 60 + Number(input.startsAt.slice(14, 16)) + input.duration >= 1440) return '예약이 같은 날짜 안에 끝나도록 시간과 소요 시간을 조정해 주세요.'
  return null
}
