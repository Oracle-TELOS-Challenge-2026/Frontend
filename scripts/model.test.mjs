import assert from 'node:assert/strict'
import test from 'node:test'
import { discountPrice, getAvailableSlots, validWaitPreference } from '../src/lib/booking.ts'
import { todayInSeoul } from '../src/lib/format.ts'

test('wait preferences require a real future date and time in Seoul', () => {
  const now = Date.parse('2026-10-17T00:00:00+09:00')
  for (const [date, time] of [['2026-10-17', '00:01'], ['2028-02-29', '09:00']]) assert.equal(validWaitPreference(date, time, now), true)
  for (const [date, time] of [['2026-10-17', '00:00'], ['2026-10-16', '23:59'], ['2027-02-29', '15:00'], ['2026-11-31', '15:00'], ['2026-13-01', '15:00'], ['2026-1-17', '15:00'], ['', '15:00'], ['2026-10-17', '24:00'], ['2026-10-17', '14:60']]) assert.equal(validWaitPreference(date, time, now), false)
})

test('the day is based on Seoul regardless of browser timezone', () => {
  assert.equal(todayInSeoul(new Date('2026-10-16T14:59:59Z')), '2026-10-16')
  assert.equal(todayInSeoul(new Date('2026-10-16T15:00:00Z')), '2026-10-17')
})

test('available slots preserve separate resources at the same time and hide expired times', () => {
  const startsAt = new Date(Date.now() + 60000).toISOString()
  const first = { id: 'resource-a', startsAt }, second = { id: 'resource-b', startsAt }
  assert.deepEqual(getAvailableSlots({ slots: [first, second, { id: 'old', startsAt: '2000-01-01T00:00:00Z' }] }), [first, second])
})

test('discounts validate whole amounts and percentages without changing the meaning of amount', () => {
  assert.equal(discountPrice(50000, 'percent', 30), 35000)
  assert.equal(discountPrice(50000, 'amount', 35000), 35000)
  for (const value of [NaN, Infinity, -1, 0, 0.5]) {
    assert.equal(discountPrice(50000, 'percent', value), null)
    assert.equal(discountPrice(50000, 'amount', value), null)
  }
  assert.equal(discountPrice(50000, 'percent', 100), null)
  assert.equal(discountPrice(50000, 'amount', 50000), null)
})
