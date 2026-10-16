import assert from 'node:assert/strict'
import test from 'node:test'
import { createDemoState, DEMO_DAY } from '../src/data/demo.ts'
import { discountPrice, getAvailableSlots, publishCancellation, reserveSlot, validWaitPreference } from '../src/lib/booking.ts'

test('wait preferences require a real calendar date and a current or future time in Seoul', () => {
  for (const [date, time] of [[DEMO_DAY, '14:20'], [DEMO_DAY, '14:21'], ['2026-10-17', '00:00'], ['2028-02-29', '09:00']]) {
    assert.equal(validWaitPreference(date, time), true, `${date} ${time}`)
  }
  for (const [date, time] of [
    [DEMO_DAY, '14:19'], ['2026-10-15', '23:59'], ['2027-02-29', '15:00'],
    ['2026-11-31', '15:00'], ['2026-13-01', '15:00'], ['2026-10-32', '15:00'],
    ['2026-1-17', '15:00'], ['', '15:00'], [DEMO_DAY, '24:00'],
    [DEMO_DAY, '14:60'], [DEMO_DAY, '9:00'], [DEMO_DAY, ''],
  ]) {
    assert.equal(validWaitPreference(date, time), false, `${date} ${time}`)
  }
})

test('discount prices accept whole positive amounts and percentages below the original price', () => {
  assert.equal(discountPrice(50000, 'percent', 1), 49500)
  assert.equal(discountPrice(50000, 'percent', 30), 35000)
  assert.equal(discountPrice(50000, 'percent', 99), 500)
  assert.equal(discountPrice(50000, 'amount', 1), 1)
  assert.equal(discountPrice(50000, 'amount', 35000), 35000)
  assert.equal(discountPrice(50000, 'amount', 49999), 49999)

  for (const value of [NaN, Infinity, -Infinity, -1, 0, 0.5]) {
    assert.equal(discountPrice(50000, 'percent', value), null)
    assert.equal(discountPrice(50000, 'amount', value), null)
  }
  for (const value of [100, 101]) assert.equal(discountPrice(50000, 'percent', value), null)
  for (const value of [50000, 50001]) assert.equal(discountPrice(50000, 'amount', value), null)
})

test('booking rejects an unavailable slot and a second booking without changing the original state', () => {
  const state = createDemoState()
  const slot = state.shops[0].slots[0]
  const booked = reserveSlot(state, 'moment', slot.startsAt)

  assert.ok(booked)
  assert.equal(booked.reservations.length, state.reservations.length + 1)
  assert.equal(booked.reservations.at(-1).price, slot.price)
  assert.equal(booked.reservations.at(-1).status, 'confirmed')
  assert.equal(state.reservations.length, 7)
  assert.equal(reserveSlot(booked, 'moment', slot.startsAt), null)
  assert.equal(reserveSlot(state, 'missing', slot.startsAt), null)
  assert.equal(reserveSlot(state, 'moment', '2026-10-16T12:00:00+09:00'), null)
})

test('availability rejects overlapping intervals but accepts bookings that just touch', () => {
  const state = createDemoState()
  const shop = state.shops[0]
  const times = ['15:00', '15:30', '16:00', '17:30', '18:00', '18:30', '19:30']
  const slots = times.map((time) => ({ ...shop.slots[0], startsAt: `2026-10-16T${time}:00+09:00` }))

  assert.deepEqual(
    getAvailableSlots({ ...shop, slots }, state.reservations).map((slot) => slot.startsAt.slice(11, 16)),
    ['16:00', '17:30', '19:30'],
  )
})

test('booking removes only the wait request matching the shop, date, and time', () => {
  const state = createDemoState()
  const request = state.waitlist[0]
  state.waitlist.push(
    { ...request, id: 'other-date', preferredDate: '2026-10-17' },
    { ...request, id: 'other-time', preferredTime: '18:00' },
    { ...request, id: 'other-shop', shopId: 'ond' },
  )

  const booked = reserveSlot(state, 'moment', state.shops[0].slots[0].startsAt)
  assert.ok(booked)
  assert.deepEqual(booked.waitlist.map((item) => item.id), ['wait-2', 'other-date', 'other-time', 'other-shop'])
  assert.equal(state.waitlist.length, 5)
})

test('publishing a cancellation creates a bookable discounted slot once', () => {
  const state = createDemoState()
  const published = publishCancellation(state, 'cancel-2', '  젤 네일 + 케어  ', 'percent', 20)
  assert.ok(published)

  const cancellation = published.cancellations.find((item) => item.id === 'cancel-2')
  const slot = published.shops[0].slots.find((item) => item.cancellationId === 'cancel-2')
  assert.ok(cancellation.publishedAt)
  assert.equal(cancellation.price, 40000)
  assert.deepEqual(slot, {
    startsAt: cancellation.startsAt,
    service: '젤 네일 + 케어',
    originalPrice: 50000,
    price: 40000,
    cancellationId: 'cancel-2',
  })
  assert.ok(reserveSlot(published, 'moment', slot.startsAt))
  assert.equal(publishCancellation(published, 'cancel-2', '케어', 'amount', 30000), null)
  assert.equal(state.cancellations[0].publishedAt, undefined)
  assert.equal(state.shops[0].slots.length, 3)
})

test('publishing rejects malformed services, invalid discounts, and past or occupied cancellations', () => {
  const state = createDemoState()
  for (const service of ['', ' \n ', '가'.repeat(161)]) {
    assert.equal(publishCancellation(state, 'cancel-2', service, 'percent', 20), null)
  }
  assert.equal(publishCancellation(state, 'cancel-2', '케어', 'percent', NaN), null)
  assert.equal(publishCancellation(state, 'missing', '케어', 'percent', 20), null)

  for (const startsAt of ['2026-10-15T17:00:00+09:00', '2026-10-16T15:30:00+09:00', 'invalid-date']) {
    const unavailable = { ...state, cancellations: [{ ...state.cancellations[0], startsAt }] }
    assert.equal(publishCancellation(unavailable, 'cancel-2', '케어', 'amount', 30000), null)
  }
})
