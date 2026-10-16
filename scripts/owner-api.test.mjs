import assert from 'node:assert/strict'
import test from 'node:test'
import { createOwnerService, createOwnerSlot, ownerSlotInput, parseVacancy, publishVacancy, readOwnerReservation, readOwnerStoreSettings, readOwnerTimetable, readOwnerVacancies, updateOwnerReservationStatus, updateOwnerService, updateOwnerStore, vacancyPublishInput, withdrawVacancy } from '../src/lib/owner-api.ts'

const success = (data) => Response.json({ resultType: 'SUCCESS', success: { data }, error: null })
const vacancy = { id: 'vacancy_1', storeId: 'store_1', resourceId: 'staff_1', reason: 'CANCELLATION', status: 'DRAFT', availableFrom: '2026-10-20T17:00:00+09:00', availableUntil: '2026-10-20T18:00:00+09:00', originalServiceId: 'service_1', originalPrice: 60000, publishedAt: null, occurredAt: '2026-10-20T12:00:00+09:00', version: 3 }
const service = { id: 'service_2', name: '젤 네일', category: 'NAIL', durationMinutes: 30, basePrice: 50000, active: true, version: 1 }
const now = Date.parse('2026-10-20T16:00:00+09:00')
const booking = { id: 'reservation_1', resourceId: 'staff_1', status: 'NO_SHOW', startAt: '2026-10-20T17:00:00+09:00', endAt: '2026-10-20T18:00:00+09:00', customer: { id: 'customer_1', displayName: '고객' }, service: { id: 'service_1', name: '젤 네일', durationMinutes: 60 }, price: { original: 60000, payable: 50000 } }
const slot = { id: 'slot_1', storeId: 'store/1', serviceId: service.id, startAt: '2026-10-20T17:30:00+09:00', endAt: '2026-10-20T18:00:00+09:00', price: { original: 50000, payable: 50000 } }
const shop = { openingHours: [{ dayOfWeek: 'TUE', opensAt: '09:00', closesAt: '18:00', closed: false }] }

test('timetable preserves server summary, resource, customer and all reservation statuses', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').pathname, '/api/v1/owner/stores/store%2F1/timetable')
    assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').searchParams.get('date'), '2026-10-20')
    assert.equal(options.method, 'GET')
    return success({ date: '2026-10-20', summary: { total: 8, remainingConfirmed: 2 }, resources: [{ id: 'staff_1', label: '기본 예약 자원' }], reservations: [booking], availableSlots: [slot] })
  })
  const data = await readOwnerTimetable('store/1', '2026-10-20')
  assert.equal(data.summary.total, 8)
  assert.deepEqual(data.reservations, [booking])
  assert.deepEqual(data.availableSlots, [slot])
})

test('invalid dates and malformed reservation responses do not become an empty schedule', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => success({ date: '2026-10-20', summary: { total: 1, remainingConfirmed: 0 }, resources: [], reservations: [{ ...booking, status: 'UNKNOWN' }], availableSlots: [] }))
  await assert.rejects(readOwnerTimetable('store_1', '2026-02-30'))
  assert.equal(fetch.mock.callCount(), 0)
  await assert.rejects(readOwnerTimetable('store_1', '2026-10-20'), { code: 'INVALID_RESPONSE' })
})

test('vacancy history follows cursors and keeps withdrawn, filled and expired states', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    const cursor = new URL(url, 'https://frontend-oracle.vercel.app').searchParams.get('cursor')
    return success({ items: cursor ? [{ ...vacancy, id: 'vacancy_2', status: 'FILLED' }, { ...vacancy, id: 'vacancy_3', status: 'EXPIRED' }] : [{ ...vacancy, status: 'WITHDRAWN' }], page: { hasNext: !cursor, nextCursor: cursor ? null : 'cursor/2' } })
  })
  assert.deepEqual((await readOwnerVacancies('store_1')).map((item) => item.status), ['WITHDRAWN', 'FILLED', 'EXPIRED'])
  assert.equal(fetch.mock.callCount(), 2)
  assert.throws(() => parseVacancy({ ...vacancy, version: 0 }), { code: 'INVALID_RESPONSE' })
})

test('publishing uses registered service, its price, explicit time, discount and vacancy version', () => {
  const input = vacancyPublishInput(vacancy, service, '2026-10-20T17:30:00+09:00', 'amount', 49000, now)
  assert.deepEqual(input, { serviceId: 'service_2', startAt: '2026-10-20T17:30:00+09:00', discount: { type: 'FIXED_PRICE', value: 49000 }, expectedVersion: 3 })
  assert.equal(vacancyPublishInput(vacancy, service, vacancy.availableFrom, 'percent', 20, now).discount.type, 'PERCENT')
  for (const [candidate, selectedService, start, mode, value] of [
    [{ ...vacancy, status: 'PUBLISHED' }, service, vacancy.availableFrom, 'percent', 20],
    [vacancy, { ...service, active: false }, vacancy.availableFrom, 'percent', 20],
    [vacancy, { ...service, durationMinutes: -1 }, vacancy.availableFrom, 'percent', 20],
    [vacancy, { ...service, basePrice: 0 }, vacancy.availableFrom, 'percent', 20],
    [vacancy, service, '2026-10-20T16:59:00+09:00', 'percent', 20],
    [vacancy, service, '2026-10-20T17:31:00+09:00', 'percent', 20],
    [vacancy, service, vacancy.availableFrom, 'amount', 50000],
    [vacancy, service, vacancy.availableFrom, 'percent', 100],
  ]) assert.throws(() => vacancyPublishInput(candidate, selectedService, start, mode, value, now))
  assert.throws(() => vacancyPublishInput(vacancy, service, vacancy.availableFrom, 'percent', 20, Date.parse(vacancy.availableUntil)))
})

test('publication sends CSRF, stable idempotency key and version; server conflicts remain failures', async (t) => {
  const input = vacancyPublishInput(vacancy, service, vacancy.availableFrom, 'percent', 20, now)
  const published = { ...vacancy, status: 'PUBLISHED', publishedAt: '2026-10-20T16:00:00+09:00', version: 4 }
  let conflict = false
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url, 'https://frontend-oracle.vercel.app').pathname === '/api/v1/auth/csrf') return success({ csrfToken: 'csrf-token' })
    assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').pathname, '/api/v1/owner/stores/store_1/vacancies/vacancy_1/publish')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-token')
    assert.equal(options.headers['Idempotency-Key'], 'retry-key')
    assert.deepEqual(JSON.parse(options.body), input)
    return conflict ? Response.json({ resultType: 'FAILURE', error: { code: 'VERSION_CONFLICT' } }, { status: 409 }) : success({ vacancy: published })
  })
  assert.deepEqual(await publishVacancy(vacancy, input, 'retry-key'), published)
  conflict = true
  await assert.rejects(publishVacancy(vacancy, input, 'retry-key'), { code: 'VERSION_CONFLICT', status: 409 })
})

test('slot input requires a future Seoul time and the full active service within opening hours', () => {
  assert.deepEqual(ownerSlotInput(shop, service, '2026-10-20', '17:30', now), { serviceId: service.id, startAt: slot.startAt })
  assert.equal(ownerSlotInput(shop, service, '2026-10-20', '09:00', Date.parse('2026-10-19T23:00:00Z')).startAt, '2026-10-20T09:00:00+09:00')
  for (const [selectedShop, selectedService, date, time] of [
    [shop, service, '2026-10-20', '16:00'],
    [shop, service, '2026-10-20', '15:59'],
    [shop, service, '2026-10-20', '17:31'],
    [shop, service, '2026-10-20', '24:00'],
    [shop, service, '2026-10-20', '17:60'],
    [shop, service, '2026-02-30', '17:00'],
    [shop, service, '2026-10-21', '17:00'],
    [{ openingHours: [{ ...shop.openingHours[0], closed: true }] }, service, '2026-10-20', '17:00'],
    [shop, { ...service, active: false }, '2026-10-20', '17:00'],
    ...[0, 10, 16, 485, NaN].map((durationMinutes) => [shop, { ...service, durationMinutes }, '2026-10-20', '17:00']),
  ]) assert.throws(() => ownerSlotInput(selectedShop, selectedService, date, time, now))
  assert.throws(() => ownerSlotInput(shop, service, '2026-10-20', '08:59', Date.parse('2026-10-19T00:00:00Z')))
})

test('slot registration sends only service and start, preserves the retry key and rejects conflicts or mismatched responses', async (t) => {
  const input = ownerSlotInput(shop, service, '2026-10-20', '17:30', now)
  let outcome = 'network'
  const keys = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url, 'https://frontend-oracle.vercel.app').pathname === '/api/v1/auth/csrf') return success({ csrfToken: 'csrf-token' })
    assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').pathname, '/api/v1/owner/stores/store%2F1/slots')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-token')
    keys.push(options.headers['Idempotency-Key'])
    assert.deepEqual(JSON.parse(options.body), input)
    if (outcome === 'network') throw new TypeError('connection lost')
    if (outcome === 'conflict') return Response.json({ resultType: 'FAILURE', error: { code: 'SLOT_CONFLICT' } }, { status: 409 })
    return success(outcome === 'invalid' ? { ...slot, serviceId: 'other-service' } : slot)
  })
  await assert.rejects(createOwnerSlot('store/1', input, 'same-key'), { code: 'NETWORK_ERROR' })
  outcome = 'success'
  assert.deepEqual(await createOwnerSlot('store/1', input, 'same-key'), slot)
  assert.deepEqual(keys, ['same-key', 'same-key'])
  outcome = 'conflict'
  await assert.rejects(createOwnerSlot('store/1', input, 'new-key'), { status: 409 })
  outcome = 'invalid'
  await assert.rejects(createOwnerSlot('store/1', input, 'new-key'), { code: 'INVALID_RESPONSE' })
})

test('timetable rejects malformed available slots instead of showing a successful empty list', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => success({ date: '2026-10-20', summary: { total: 0, remainingConfirmed: 0 }, resources: [], reservations: [], availableSlots: [{ ...slot, endAt: slot.startAt }] }))
  await assert.rejects(readOwnerTimetable('store/1', '2026-10-20'), { code: 'INVALID_RESPONSE' })
})

test('owner detail verifies ownership and status updates use fresh version, allowed actions and stable retry key', async (t) => {
  const detail = { ...booking, status: 'CONFIRMED', store: { id: 'store/1', name: '네일샵' }, version: 7, allowedActions: ['COMPLETE', 'NO_SHOW'] }
  let response = detail
  let networkFailure = true
  const keys = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url, 'https://frontend-oracle.vercel.app').pathname
    if (path === '/api/v1/auth/csrf') return success({ csrfToken: 'csrf-token' })
    if (options.method === 'GET') return success(response)
    assert.equal(path, '/api/v1/owner/stores/store%2F1/reservations/reservation_1/status')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-token')
    assert.deepEqual(JSON.parse(options.body), { status: 'NO_SHOW', expectedVersion: 7 })
    keys.push(options.headers['Idempotency-Key'])
    if (networkFailure) throw new TypeError('connection lost')
    return success({ reservation: { ...detail, status: 'NO_SHOW', version: 8, allowedActions: [] }, vacancy })
  })
  assert.deepEqual(await readOwnerReservation('store/1', booking.id), detail)
  await assert.rejects(updateOwnerReservationStatus('store/1', detail, 'NO_SHOW', 'same-key'), { code: 'NETWORK_ERROR' })
  networkFailure = false
  assert.equal((await updateOwnerReservationStatus('store/1', detail, 'NO_SHOW', 'same-key')).version, 8)
  assert.deepEqual(keys, ['same-key', 'same-key'])
  await assert.rejects(updateOwnerReservationStatus('store/1', { ...detail, allowedActions: [] }, 'COMPLETED', 'key'))
  await assert.rejects(updateOwnerReservationStatus('other-store', detail, 'NO_SHOW', 'key'))
  response = { ...detail, version: 0 }
  await assert.rejects(readOwnerReservation('store/1', booking.id), { code: 'INVALID_RESPONSE' })
  response = { ...detail, store: { id: 'other', name: '다른 매장' } }
  await assert.rejects(readOwnerReservation('store/1', booking.id), { code: 'INVALID_RESPONSE' })
})

test('withdrawing sends published vacancy version and does not hide reservation conflicts', async (t) => {
  const published = { ...vacancy, status: 'PUBLISHED', version: 4 }
  let conflict = false
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url, 'https://frontend-oracle.vercel.app').pathname === '/api/v1/auth/csrf') return success({ csrfToken: 'csrf-token' })
    assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').pathname, '/api/v1/owner/stores/store_1/vacancies/vacancy_1/withdraw')
    assert.equal(options.headers['Idempotency-Key'], 'withdraw-key')
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-token')
    assert.deepEqual(JSON.parse(options.body), { expectedVersion: 4 })
    return conflict ? Response.json({ resultType: 'FAILURE', error: { code: 'VACANCY_ALREADY_FILLED' } }, { status: 409 }) : success({ vacancy: { ...published, status: 'WITHDRAWN', version: 5 } })
  })
  assert.equal((await withdrawVacancy(published, 'withdraw-key')).status, 'WITHDRAWN')
  conflict = true
  await assert.rejects(withdrawVacancy(published, 'withdraw-key'), { code: 'VACANCY_ALREADY_FILLED' })
  await assert.rejects(withdrawVacancy(vacancy, 'withdraw-key'))
})

const openingHours = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((dayOfWeek) => ({ dayOfWeek, closed: false, opensAt: '09:00', closesAt: '18:00' }))
const settings = { id: 'store/1', description: '매장 소개', openingHours, version: 2 }

test('store management normalizes server opening times and patches the full validated week with version', async (t) => {
  let conflicting = false
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url, 'https://frontend-oracle.vercel.app').pathname === '/api/v1/auth/csrf') return success({ csrfToken: 'csrf-token' })
    if (options.method === 'GET') return success({ ...settings, description: null, openingHours: openingHours.toReversed().map((day) => ({ ...day, opensAt: '09:00:00', closesAt: '18:00:00' })) })
    assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').pathname, '/api/v1/owner/stores/store%2F1')
    assert.equal(options.method, 'PATCH')
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-token')
    assert.deepEqual(JSON.parse(options.body), { description: '매장 소개', openingHours, expectedVersion: 2 })
    return conflicting ? Response.json({ resultType: 'FAILURE', error: { code: 'VERSION_CONFLICT' } }, { status: 409 }) : success({ ...settings, version: 3 })
  })
  assert.deepEqual(await readOwnerStoreSettings('store/1'), { ...settings, description: '' })
  assert.equal((await updateOwnerStore({ ...settings, description: '  매장 소개  ' })).version, 3)
  conflicting = true
  await assert.rejects(updateOwnerStore(settings), { code: 'VERSION_CONFLICT' })
  const calls = fetch.mock.callCount()
  for (const openingHours of [settings.openingHours.slice(1), settings.openingHours.map((day) => ({ ...day, opensAt: '20:00' })), settings.openingHours.map((day) => ({ ...day, closed: true }))]) {
    await assert.rejects(updateOwnerStore({ ...settings, openingHours }))
  }
  await assert.rejects(updateOwnerStore({ ...settings, description: 'a'.repeat(1001) }))
  assert.equal(fetch.mock.callCount(), calls)
})

test('service creation validates duration and price and sends one retry key; updates exclude duration', async (t) => {
  const input = { name: '  젤 네일  ', basePrice: 50000, durationMinutes: 30, active: true }
  let networkFailure = true
  let invalidResponse = false
  const keys = []
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url, 'https://frontend-oracle.vercel.app').pathname
    if (path === '/api/v1/auth/csrf') return success({ csrfToken: 'csrf-token' })
    const body = JSON.parse(options.body)
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-token')
    if (options.method === 'POST') {
      assert.equal(path, '/api/v1/owner/stores/store%2F1/services')
      assert.deepEqual(body, { ...input, name: '젤 네일' })
      keys.push(options.headers['Idempotency-Key'])
      if (networkFailure) throw new TypeError('connection lost')
    } else {
      assert.equal(path, '/api/v1/owner/stores/store%2F1/services/service_2')
      assert.equal(options.method, 'PATCH')
      assert.deepEqual(body, { name: '젤 네일', basePrice: 50000, active: true, expectedVersion: 1 })
    }
    return success({ ...service, storeId: invalidResponse ? 'other' : 'store/1', version: 2 })
  })
  await assert.rejects(createOwnerService('store/1', input, 'retry-key'), { code: 'NETWORK_ERROR' })
  networkFailure = false
  assert.equal((await createOwnerService('store/1', input, 'retry-key')).version, 2)
  assert.deepEqual(keys, ['retry-key', 'retry-key'])
  assert.equal((await updateOwnerService('store/1', service, input)).version, 2)
  const calls = fetch.mock.callCount()
  for (const durationMinutes of [0, 16, 485, NaN]) await assert.rejects(createOwnerService('store/1', { ...input, durationMinutes }, 'key'))
  for (const basePrice of [-1, 1.5, 10000001, NaN]) await assert.rejects(updateOwnerService('store/1', service, { ...input, basePrice }))
  await assert.rejects(createOwnerService('store/1', { ...input, name: '  ' }, 'key'))
  assert.equal(fetch.mock.callCount(), calls)
  invalidResponse = true
  await assert.rejects(updateOwnerService('store/1', service, input), { code: 'INVALID_RESPONSE' })
})
