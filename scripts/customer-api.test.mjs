import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { prepareReservation, reserveSlot, readCategories, readItems, readReservations, readStore, readWaitlist, saveWaitlist, cancelWaitlist, storeSearchPath, searchStores } from '../src/lib/customer-api.ts'

const spec = JSON.parse(readFileSync(new URL('../docs/openapi.snapshot.json', import.meta.url)))
const example = (path) => structuredClone(spec.paths[path].get.responses['200'].content['application/json'].examples.success.value.success.data)
const success = (data) => Response.json({ resultType: 'SUCCESS', success: { data }, error: null })
const currentSlot = { id: 'slot-1', storeId: 'store', serviceId: 'service-1', startAt: '2028-10-17T08:00:00Z', endAt: '2028-10-17T09:00:00Z', bookable: true, version: 3, price: { payable: 35000 } }
const displayedSlot = { id: 'slot-1', serviceId: 'service-1', startsAt: '2028-10-17T17:00:00+09:00', endsAt: '2028-10-17T18:00:00+09:00', price: 35000, version: 3 }

test('search sends center, radius and encoded filters to the API', () => {
  const path = storeSearchPath(' 네일 & ? ', 'NAIL', { south: 37.5, north: 37.52, west: 126.92, east: 126.94 })
  const query = new URL(path, 'https://example.org').searchParams
  assert.ok(Math.abs(Number(query.get('latitude')) - 37.51) < 1e-10)
  assert.equal(query.get('keyword'), '네일 & ?')
  assert.equal(query.get('category'), 'NAIL')
  assert.ok(Number(query.get('radiusMeters')) >= 100)
  const wide = new URL(storeSearchPath('', '', { south: 30, north: 40, west: 120, east: 140 }), 'https://example.org')
  assert.equal(wide.searchParams.get('radiusMeters'), '10000')
  assert.equal(wide.searchParams.has('category'), false)
})

test('cursor pages are loaded in full and a repeated cursor fails instead of looping', async (t) => {
  const urls = []
  t.mock.method(globalThis, 'fetch', async (url) => { urls.push(url); return success({ items: [urls.length], page: { hasNext: urls.length === 1, nextCursor: urls.length === 1 ? 'next + &' : null } }) })
  assert.deepEqual(await readItems('/api/v1/items?limit=100'), [1, 2])
  assert.equal(new URL(urls[1]).searchParams.get('cursor'), 'next + &')
  t.mock.method(globalThis, 'fetch', async () => success({ items: [], page: { hasNext: true, nextCursor: 'same' } }))
  await assert.rejects(readItems('/api/v1/items'), { code: 'INVALID_RESPONSE' })
})

test('empty real search results stay empty and malformed data is not replaced by samples', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => success({ items: [], page: { hasNext: false, nextCursor: null } }))
  assert.deepEqual(await searchStores('', '', null), [])
  t.mock.method(globalThis, 'fetch', async () => success({ items: [{ store: null }], page: { hasNext: false, nextCursor: null } }))
  await assert.rejects(searchStores('', '', null), { code: 'INVALID_RESPONSE' })
})

test('latest published examples map category, store slots, reservation and waitlist offers', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith('/categories')) return success(example('/api/v1/stores/categories'))
    if (path === '/api/v1/search/stores') return success(example('/api/v1/search/stores'))
    if (path.endsWith('/services')) return success(example('/api/v1/stores/{storeId}/services'))
    if (path.endsWith('/slots')) return success(example('/api/v1/stores/{storeId}/slots'))
    if (path === '/api/v1/reservations/me') return success(example('/api/v1/reservations/me'))
    if (path === '/api/v1/search/waitlists/me') return success(example('/api/v1/search/waitlists/me'))
    return success(example('/api/v1/stores/{storeId}'))
  })
  assert.equal((await readCategories())[0].code, 'NAIL')
  assert.equal((await searchStores('', '', null))[0].category, '네일')
  const shop = await readStore('shop_moment', '2026-10-16')
  assert.equal(shop.slots[0].serviceId, shop.services[0].id)
  assert.equal(shop.slots[0].version, 3)
  const reservation = (await readReservations('UPCOMING'))[0]
  assert.equal(reservation.shopName, '네일 모먼트')
  assert.equal(reservation.price, 35000)
  assert.equal(reservation.status, 'CONFIRMED')
  const waiting = (await readWaitlist())[0]
  assert.equal(waiting.conditions.storeId, null)
  assert.equal(waiting.offers[0].id, 'slot_17_1600')
  assert.equal(waiting.offers[0].version, undefined)
})

test('new stores without an optional description still open, while invalid descriptions fail', async (t) => {
  let description = null
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith('/services')) return success(example('/api/v1/stores/{storeId}/services'))
    if (path.endsWith('/slots')) return success(example('/api/v1/stores/{storeId}/slots'))
    return success({ ...example('/api/v1/stores/{storeId}'), description })
  })
  const shop = await readStore('shop_moment', '2026-10-16')
  assert.equal(shop.description, '')
  assert.equal(shop.slots.length, 1)
  description = 123
  await assert.rejects(readStore('shop_moment', '2026-10-16'), { code: 'INVALID_RESPONSE' })
})

test('booking validates latest price, version, service, time and availability before writing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => success(currentSlot))
  assert.deepEqual(await prepareReservation('store', displayedSlot, 'wait-1'), { slotId: 'slot-1', expectedPrice: 35000, expectedSlotVersion: 3, waitlistId: 'wait-1' })
  for (const update of [{ id: 'wrong-slot' }, { storeId: 'wrong-store' }, { price: { payable: -1 } }, { price: { payable: 35.5 } }, { version: 0 }, { bookable: false }, { price: { payable: 36000 } }, { version: 4 }, { serviceId: 'other' }, { startAt: '2028-10-17T08:30:00Z' }, { endAt: '2028-10-17T09:30:00Z' }]) {
    const fetch = t.mock.method(globalThis, 'fetch', async () => success({ ...currentSlot, ...update }))
    await assert.rejects(prepareReservation('store', displayedSlot))
    assert.equal(fetch.mock.callCount(), 1)
  }
  const { version: _version, ...offer } = displayedSlot
  t.mock.method(globalThis, 'fetch', async () => success({ ...currentSlot, serviceId: 'other' }))
  await assert.rejects(prepareReservation('store', offer))
})

test('booking retries a lost response with the exact prepared body and idempotency key', async (t) => {
  const writes = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/csrf')) return success({ csrfToken: 'csrf' })
    writes.push(options)
    if (writes.length === 1) throw new TypeError('response lost after commit')
    return success({ id: 'already-created-reservation' })
  })
  const body = { slotId: 'slot-1', expectedPrice: 35000, expectedSlotVersion: 3 }
  await assert.rejects(reserveSlot(body, 'retry-key'), { code: 'NETWORK_ERROR' })
  await reserveSlot(body, 'retry-key')
  assert.equal(writes.length, 2)
  assert.equal(writes[0].body, writes[1].body)
  assert.equal(writes[0].headers['Idempotency-Key'], writes[1].headers['Idempotency-Key'])
})

test('waitlist create, edit and cancel preserve full conditions and use the current version', async (t) => {
  const writes = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/csrf')) return success({ csrfToken: 'csrf' })
    writes.push({ url, options })
    return success({ id: 'waiting' })
  })
  const conditions = { storeId: 'store', category: 'NAIL', serviceId: null, windowStart: '2028-01-01T17:00:00+09:00', windowEnd: '2028-01-01T20:00:00+09:00', location: null, radiusMeters: null, maxPrice: null, keywords: [] }
  await saveWaitlist(conditions, 'create-key')
  await saveWaitlist(conditions, 'unused', { id: 'waiting', version: 4 })
  await cancelWaitlist({ id: 'waiting', version: 5 }, 'cancel-key')
  assert.deepEqual(JSON.parse(writes[0].options.body), { conditions, notificationConsent: true, source: 'STORE_DETAIL' })
  assert.equal(writes[1].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(writes[1].options.body), { conditions, notificationConsent: true, expectedVersion: 4 })
  assert.deepEqual(JSON.parse(writes[2].options.body), { expectedVersion: 5 })
  assert.equal(writes[2].options.headers['Idempotency-Key'], 'cancel-key')
})

test('individual reservation and waitlist detail validate IDs and preserve agreed service description', async (t) => {
  const { readReservation, readWaitlistItem } = await import('../src/lib/customer-api.ts')
  const reservation = example('/api/v1/reservations/{reservationId}')
  reservation.service.serviceDescription = '젤 네일 + 기존 젤 제거 + 아트 2개'
  const waitlist = example('/api/v1/search/waitlists/{waitlistId}')
  t.mock.method(globalThis, 'fetch', async (url) => success(new URL(url).pathname.includes('/reservations/') ? reservation : waitlist))
  assert.equal((await readReservation(reservation.id)).service, reservation.service.serviceDescription)
  assert.equal((await readWaitlistItem(waitlist.id)).version, waitlist.version)
  await assert.rejects(readReservation('wrong-id'), { code: 'INVALID_RESPONSE' })
  await assert.rejects(readWaitlistItem('wrong-id'), { code: 'INVALID_RESPONSE' })
})
