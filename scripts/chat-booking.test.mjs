import assert from 'node:assert/strict'
import test from 'node:test'
import { validateChatBooking } from '../src/lib/chat-booking.ts'

const now = Date.parse('2026-10-17T09:00:00+09:00')
const proposal = { service: '젤 네일 · 아트 추가', startsAt: '2026-10-17T15:00:00+09:00', duration: 60, price: 45000 }

test('proposal preview accepts negotiated details without creating a booking', () => {
  assert.equal(validateChatBooking(proposal, now), null)
  assert.equal(validateChatBooking({ ...proposal, duration: 15, price: 0 }, now), null)
  assert.equal(validateChatBooking({ ...proposal, duration: 480, price: 10000000 }, now), null)
})

test('proposal preview rejects incomplete, invalid or past dates and times', () => {
  for (const startsAt of ['', 'T:00+09:00', '2027-02-29T15:00:00+09:00', '2026-10-17T24:00:00+09:00', '2026-10-17T09:00:00+09:00', '2026-10-16T15:00:00+09:00', '2026-10-17T15:00:00Z']) {
    assert.match(validateChatBooking({ ...proposal, startsAt }, now), /날짜와 시간/, startsAt)
  }
  assert.match(validateChatBooking({ ...proposal, startsAt: '2026-10-17T23:30:00+09:00' }, now), /같은 날짜/)
  assert.match(validateChatBooking({ ...proposal, startsAt: '2026-10-17T23:00:00+09:00' }, now), /같은 날짜/)
})

test('proposal preview validates service, whole minutes and won before formatting the card', () => {
  for (const service of [' ', 'x'.repeat(1001)]) assert.match(validateChatBooking({ ...proposal, service }, now), /시술과 옵션/)
  for (const duration of [NaN, Infinity, 0, 10, 16, 481, 15.5]) assert.match(validateChatBooking({ ...proposal, duration }, now), /소요 시간/)
  for (const price of [NaN, Infinity, -1, 0.5, 10000001]) assert.match(validateChatBooking({ ...proposal, price }, now), /예약 금액/)
})
