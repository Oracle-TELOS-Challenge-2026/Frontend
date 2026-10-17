import assert from 'node:assert/strict'
import test from 'node:test'
import { createOwnerService, parseVacancy, publishVacancy, readOwnerReservation, readOwnerReservationRequests, readOwnerStoreSettings, readOwnerTimetable, readOwnerVacancies, updateOwnerReservationStatus, updateOwnerService, updateOwnerStore, vacancyPublishInput, withdrawVacancy } from '../src/lib/owner-api.ts'

const success = (data) => Response.json({ resultType: 'SUCCESS', success: { data }, error: null })
const vacancy = { id: 'vacancy_1', storeId: 'store_1', resourceId: 'staff_1', reason: 'CANCELLATION', status: 'DRAFT', availableFrom: '2026-10-20T17:00:00+09:00', availableUntil: '2026-10-20T18:00:00+09:00', originalServiceId: 'service_1', originalPrice: 60000, publishedAt: null, occurredAt: '2026-10-20T12:00:00+09:00', version: 3 }
const service = { id: 'service_2', name: '젤 네일', category: 'NAIL', durationMinutes: 30, basePrice: 50000, active: true, version: 1 }
const now = Date.parse('2026-10-20T16:00:00+09:00')
const booking = { id: 'reservation_1', resourceId: 'staff_1', status: 'NO_SHOW', startAt: '2026-10-20T17:00:00+09:00', endAt: '2026-10-20T18:00:00+09:00', customer: { id: 'customer_1', displayName: '고객' }, service: { id: 'service_1', name: '젤 네일', durationMinutes: 60 }, price: { original: 60000, payable: 50000 } }
const slot = { id: 'slot_1', storeId: 'store/1', serviceId: service.id, startAt: '2026-10-20T17:30:00+09:00', endAt: '2026-10-20T18:00:00+09:00', price: { original: 50000, payable: 50000 } }

test('owner policy defaults are compatible and manual publication sends false explicitly', async (t) => {
  assert.equal(parseVacancy(vacancy).instantBooking, true)
  assert.equal(parseVacancy({ ...vacancy, instantBooking: null }).instantBooking, true)
  assert.equal(parseVacancy({ ...vacancy, instantBooking: false }).instantBooking, false)
  assert.throws(() => parseVacancy({ ...vacancy, instantBooking: 'false' }), { code: 'INVALID_RESPONSE' })
  const input = vacancyPublishInput(vacancy, service, vacancy.availableFrom, 'percent', 20, false, now)
  assert.equal(input.instantBooking, false)
  const republished = vacancyPublishInput({ ...vacancy, status: 'WITHDRAWN', version: 5 }, service, vacancy.availableFrom, 'percent', 20, false, now)
  assert.equal(republished.instantBooking, false)
  assert.equal(republished.expectedVersion, 5)
  assert.throws(() => vacancyPublishInput(vacancy, service, vacancy.availableFrom, 'percent', 20, 'false', now))
  let responsePolicy = false
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/csrf')) return success({ csrfToken: 'csrf' })
    assert.equal(JSON.parse(options.body).instantBooking, false)
    return success({ vacancy: { ...vacancy, status: 'PUBLISHED', instantBooking: responsePolicy } })
  })
  assert.equal((await publishVacancy(vacancy, input, 'key')).instantBooking, false)
  responsePolicy = true
  await assert.rejects(publishVacancy(vacancy, input, 'key'), { code: 'INVALID_RESPONSE' })
})

test('owner request list follows the cursor, keeps application order and validates ownership and pending state', async (t) => {
  const request = { ...booking, status: 'PENDING', store: { id: 'store/1', name: '네일샵' }, version: 1, allowedActions: ['APPROVE', 'REJECT'], slotId: 'slot_1', createdAt: '2026-10-20T12:00:00+09:00' }
  let malformed = null
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url, 'https://example.test')
    assert.equal(parsed.pathname, '/api/v1/owner/stores/store%2F1/reservation-requests')
    assert.equal(parsed.searchParams.get('limit'), '20')
    const cursor = parsed.searchParams.get('cursor')
    return success({ items: [malformed ?? { ...request, id: cursor ? 'reservation_2' : 'reservation_1' }], page: { hasNext: !cursor, nextCursor: cursor ? null : 'next / +' } })
  })
  assert.deepEqual((await readOwnerReservationRequests('store/1')).map((item) => item.id), ['reservation_1', 'reservation_2'])
  assert.equal(fetch.mock.callCount(), 2)
  for (const patch of [{ status: 'CONFIRMED' }, { slotId: '' }, { createdAt: 'bad-date' }, { store: { id: 'other', name: '다른 매장' } }]) {
    malformed = { ...request, ...patch }
    await assert.rejects(readOwnerReservationRequests('store/1'), { code: 'INVALID_RESPONSE' })
  }
})

test('owner approval and rejection enforce pending actions and preserve CSRF, version and retry key', async (t) => {
  const pending = { ...booking, status: 'PENDING', store: { id: 'store/1', name: '네일샵' }, version: 3, allowedActions: ['APPROVE', 'REJECT'] }
  let expectedStatus = 'CONFIRMED', failure = true
  const keys = []
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/csrf')) return success({ csrfToken: 'csrf' })
    assert.equal(url, '/api/v1/owner/stores/store%2F1/reservations/reservation_1/status')
    assert.equal(options.headers['X-CSRF-Token'], 'csrf')
    assert.deepEqual(JSON.parse(options.body), { status: expectedStatus, expectedVersion: 3 })
    keys.push(options.headers['Idempotency-Key'])
    if (failure) throw new TypeError('connection lost')
    return success({ reservation: { ...pending, status: expectedStatus, version: 4, allowedActions: [] } })
  })
  await assert.rejects(updateOwnerReservationStatus('store/1', pending, 'CONFIRMED', 'same-key'), { code: 'NETWORK_ERROR' })
  failure = false
  assert.equal((await updateOwnerReservationStatus('store/1', pending, 'CONFIRMED', 'same-key')).status, 'CONFIRMED')
  assert.deepEqual(keys, ['same-key', 'same-key'])
  expectedStatus = 'REJECTED'
  assert.equal((await updateOwnerReservationStatus('store/1', pending, 'REJECTED', 'reject-key')).status, 'REJECTED')
  const before = fetch.mock.callCount()
  for (const [reservation, status] of [[pending, 'COMPLETED'], [pending, 'NO_SHOW'], [pending, 'CANCELED'], [{ ...pending, allowedActions: [] }, 'CONFIRMED'], [{ ...pending, status: 'EXPIRED' }, 'CONFIRMED'], [{ ...pending, status: 'CONFIRMED' }, 'REJECTED']]) {
    await assert.rejects(updateOwnerReservationStatus('store/1', reservation, status, 'key'))
  }
  assert.equal(fetch.mock.callCount(), before)
})

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
  assert.deepEqual(data.availableSlots, [{ ...slot, instantBooking: true }])
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
  const input = vacancyPublishInput(vacancy, service, '2026-10-20T17:30:00+09:00', 'amount', 49000, true, now)
  assert.deepEqual(input, { serviceId: 'service_2', startAt: '2026-10-20T17:30:00+09:00', discount: { type: 'FIXED_PRICE', value: 49000 }, expectedVersion: 3, instantBooking: true })
  assert.equal(vacancyPublishInput(vacancy, service, vacancy.availableFrom, 'percent', 20, true, now).discount.type, 'PERCENT')
  for (const [candidate, selectedService, start, mode, value] of [
    [{ ...vacancy, status: 'PUBLISHED' }, service, vacancy.availableFrom, 'percent', 20],
    [vacancy, { ...service, active: false }, vacancy.availableFrom, 'percent', 20],
    [vacancy, { ...service, durationMinutes: -1 }, vacancy.availableFrom, 'percent', 20],
    [vacancy, { ...service, basePrice: 0 }, vacancy.availableFrom, 'percent', 20],
    [vacancy, service, '2026-10-20T16:59:00+09:00', 'percent', 20],
    [vacancy, service, '2026-10-20T17:31:00+09:00', 'percent', 20],
    [vacancy, service, vacancy.availableFrom, 'amount', 50000],
    [vacancy, service, vacancy.availableFrom, 'percent', 100],
  ]) assert.throws(() => vacancyPublishInput(candidate, selectedService, start, mode, value, true, now))
  assert.throws(() => vacancyPublishInput(vacancy, service, vacancy.availableFrom, 'percent', 20, true, Date.parse(vacancy.availableUntil)))
})

test('publication sends CSRF, stable idempotency key and version; server conflicts remain failures', async (t) => {
  const input = vacancyPublishInput(vacancy, service, vacancy.availableFrom, 'percent', 20, true, now)
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
  assert.deepEqual(await publishVacancy(vacancy, input, 'retry-key'), { ...published, instantBooking: true })
  conflict = true
  await assert.rejects(publishVacancy(vacancy, input, 'retry-key'), { code: 'VERSION_CONFLICT', status: 409 })
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

test('owner cancellation sends store reason and version, retries with the same key and verifies owner detail', async (t) => {
  const detail = { ...booking, status: 'CONFIRMED', store: { id: 'store/1', name: '네일샵' }, version: 7, allowedActions: ['CANCEL'] }
  const canceled = { ...detail, status: 'CANCELED', version: 8, allowedActions: [] }
  const keys = []
  let outcome = 'network', reads = 0
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url, 'https://frontend-oracle.vercel.app').pathname
    if (path === '/api/v1/auth/csrf') return success({ csrfToken: 'csrf-token' })
    if (options.method === 'GET') {
      reads++
      assert.equal(path, '/api/v1/owner/stores/store%2F1/reservations/reservation_1')
      if (outcome === 'read-failure') throw new TypeError('connection lost')
      return success(outcome === 'unchanged' ? detail : canceled)
    }
    assert.equal(path, '/api/v1/reservations/reservation_1/cancel')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-token')
    assert.deepEqual(JSON.parse(options.body), { reasonCode: 'STORE_REQUEST', expectedVersion: 7 })
    keys.push(options.headers['Idempotency-Key'])
    if (outcome === 'network') throw new TypeError('connection lost')
    if (outcome === 'conflict') return Response.json({ resultType: 'FAILURE', error: { code: 'VERSION_CONFLICT' } }, { status: 409 })
    return success({ reservation: { ...canceled, customer: null, resourceId: null }, vacancy })
  })
  await assert.rejects(updateOwnerReservationStatus('store/1', detail, 'CANCELED', 'same-key'), { code: 'NETWORK_ERROR' })
  outcome = 'read-failure'
  await assert.rejects(updateOwnerReservationStatus('store/1', detail, 'CANCELED', 'same-key'), { code: 'NETWORK_ERROR' })
  outcome = 'success'
  assert.deepEqual(await updateOwnerReservationStatus('store/1', detail, 'CANCELED', 'same-key'), canceled)
  assert.deepEqual(keys, ['same-key', 'same-key', 'same-key'])
  outcome = 'conflict'
  await assert.rejects(updateOwnerReservationStatus('store/1', detail, 'CANCELED', 'new-key'), { code: 'VERSION_CONFLICT' })
  assert.equal(reads, 2)
  outcome = 'unchanged'
  await assert.rejects(updateOwnerReservationStatus('store/1', detail, 'CANCELED', 'new-key'), { code: 'INVALID_RESPONSE' })
  const count = fetch.mock.callCount()
  await assert.rejects(updateOwnerReservationStatus('store/1', { ...detail, allowedActions: [] }, 'CANCELED', 'key'))
  await assert.rejects(updateOwnerReservationStatus('other-store', detail, 'CANCELED', 'key'))
  await assert.rejects(updateOwnerReservationStatus('store/1', canceled, 'CANCELED', 'key'))
  assert.equal(fetch.mock.callCount(), count)
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
