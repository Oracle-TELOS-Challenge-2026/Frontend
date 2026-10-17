import assert from 'node:assert/strict'
import test from 'node:test'
import { accountStartPath, createRegisteredService, createRegisteredShop, readRegisteredShop, restoreAccountRole, validateShopRegistration, WEEK_DAYS } from '../src/lib/account.ts'

const shop = {
  id: 'store-1', serviceId: 'service-1', version: 1, name: '모먼트 네일', category: '네일',
  address: '서울 동작구 노량진로 100', latitude: 37.5, longitude: 127,
  openingHours: WEEK_DAYS.map((dayOfWeek) => ({ dayOfWeek, opensAt: '09:00', closesAt: '20:00', closed: false })),
  service: '젤 네일', originalPrice: 50000, duration: 60,
}
const storeResponse = { id: shop.id, name: shop.name, category: 'NAIL', address: shop.address, location: { latitude: shop.latitude, longitude: shop.longitude }, openingHours: shop.openingHours, version: 1 }
const serviceResponse = { id: 'service-1', storeId: shop.id, name: shop.service, category: 'NAIL', durationMinutes: shop.duration, basePrice: shop.originalPrice, active: true, version: 1 }
const success = (data, status = 200) => Response.json({ resultType: 'SUCCESS', success: { data }, error: null }, { status })

function mockRequests(t, responses) {
  const pending = [...responses]
  return t.mock.method(globalThis, 'fetch', async () => {
    assert.ok(pending.length, 'unexpected request')
    return pending.shift()
  })
}

test('entry requires a server-registered service before opening the owner account', () => {
  assert.equal(accountStartPath({ role: null, shop: null }), '/choose-role')
  assert.equal(accountStartPath({ role: 'owner', shop: null }), '/owner/register')
  assert.equal(accountStartPath({ role: 'owner', shop: { ...shop, serviceId: undefined } }), '/owner/register')
  assert.equal(accountStartPath({ role: 'owner', shop }), '/owner')
  assert.equal(accountStartPath({ role: 'customer', shop, customerRegistered: true }), '/customer')
})

test('customer entry requires a saved name even when switching from an owner account', () => {
  for (const ownedShop of [null, shop]) {
    assert.equal(accountStartPath({ role: 'customer', shop: ownedShop, customerRegistered: false }), '/customer/register')
    assert.equal(accountStartPath({ role: 'customer', shop: ownedShop, customerRegistered: true }), '/customer')
  }
  assert.equal(accountStartPath({ role: 'owner', shop, customerRegistered: false }), '/owner')
})

test('registration matches server text, location, price and five-minute duration constraints', () => {
  assert.equal(validateShopRegistration(shop), null)
  assert.equal(validateShopRegistration({ ...shop, name: '가'.repeat(100), address: '가'.repeat(300), service: '가'.repeat(100), originalPrice: 0, duration: 15 }), null)
  assert.equal(validateShopRegistration({ ...shop, originalPrice: 10000000, duration: 480 }), null)
  for (const [field, values] of Object.entries({
    name: ['', '가'.repeat(101), null], address: ['', '가'.repeat(301), null], service: ['', '가'.repeat(101), null],
    category: ['전체', '없는 업종'], originalPrice: [-1, 0.5, 10000001, NaN, Infinity, '50000'],
    duration: [10, 16, 481, NaN, '60'], latitude: [91, NaN, '37'], longitude: [-181, Infinity],
  })) for (const value of values) assert.equal(typeof validateShopRegistration({ ...shop, [field]: value }), 'string', `${field}: ${value}`)
})

test('registration requires all seven days once and rejects invalid or reversed opening hours', () => {
  for (const openingHours of [[], shop.openingHours.slice(1), Array(7).fill(shop.openingHours[0]),
    shop.openingHours.map((day) => ({ ...day, opensAt: '25:00' })),
    shop.openingHours.map((day) => ({ ...day, closesAt: '08:00' })),
    shop.openingHours.map((day) => ({ ...day, closed: true })),
  ]) assert.equal(typeof validateShopRegistration({ ...shop, openingHours }), 'string')
  assert.equal(validateShopRegistration({ ...shop, openingHours: shop.openingHours.map((day) => ({ ...day, closed: true, opensAt: null, closesAt: null })) }), null)
})

test('owned store restores from server detail and services, including incomplete registrations', async (t) => {
  mockRequests(t, [success(storeResponse), success({ items: [serviceResponse], page: { hasNext: false, nextCursor: null } })])
  assert.deepEqual(await readRegisteredShop(shop.id), shop)
  mockRequests(t, [success(storeResponse), success({ items: [], page: { hasNext: false, nextCursor: null } })])
  const incomplete = await readRegisteredShop(shop.id)
  assert.equal(incomplete.id, shop.id)
  assert.equal(incomplete.serviceId, undefined)
  assert.equal(accountStartPath({ role: 'owner', shop: incomplete }), '/owner/register')
})

test('server time values normalize zero seconds and restore weekday order', async (t) => {
  const openingHours = [...shop.openingHours].reverse().map((day) => ({ ...day, opensAt: `${day.opensAt}:00`, closesAt: `${day.closesAt}:00` }))
  mockRequests(t, [success({ ...storeResponse, openingHours }), success({ items: [serviceResponse], page: { hasNext: false, nextCursor: null } })])
  assert.deepEqual((await readRegisteredShop(shop.id)).openingHours, shop.openingHours)
})

test('store creation and service retry use separate idempotency keys and server IDs', async (t) => {
  const fetch = mockRequests(t, [success({ csrfToken: 'csrf' }), success(storeResponse, 201), success({ csrfToken: 'csrf' }), success(serviceResponse, 201)])
  const created = await createRegisteredShop(shop, 'store-key')
  assert.equal(created.serviceId, undefined)
  assert.equal(created.id, 'store-1')
  const completed = await createRegisteredService(created, shop, 'service-key')
  assert.deepEqual(completed, shop)
  const storeRequest = fetch.mock.calls[1].arguments
  assert.equal(new URL(storeRequest[0], 'https://frontend-oracle.vercel.app').pathname, '/api/v1/owner/stores')
  assert.equal(storeRequest[1].headers['Idempotency-Key'], 'store-key')
  assert.equal(storeRequest[1].headers['X-CSRF-Token'], 'csrf')
  assert.deepEqual(JSON.parse(storeRequest[1].body), { name: shop.name, category: 'NAIL', address: shop.address, location: storeResponse.location, openingHours: shop.openingHours })
  const serviceRequest = fetch.mock.calls[3].arguments
  assert.equal(new URL(serviceRequest[0], 'https://frontend-oracle.vercel.app').pathname, '/api/v1/owner/stores/store-1/services')
  assert.equal(serviceRequest[1].headers['Idempotency-Key'], 'service-key')
  assert.deepEqual(JSON.parse(serviceRequest[1].body), { name: shop.service, durationMinutes: 60, basePrice: 50000, active: true })
})

test('malformed or failed creation responses never become locally registered shops', async (t) => {
  for (const data of [{}, { ...storeResponse, location: null }, { ...storeResponse, category: 'unknown' }]) {
    mockRequests(t, [success({ csrfToken: 'csrf' }), success(data, 201)])
    await assert.rejects(createRegisteredShop(shop, 'store-key'), { code: 'INVALID_RESPONSE' })
  }
  mockRequests(t, [success({ csrfToken: 'csrf' }), Response.json({ resultType: 'FAILURE', success: null, error: { code: 'FORBIDDEN' } }, { status: 403 })])
  await assert.rejects(createRegisteredShop(shop, 'store-key'), { status: 403 })
})


test('customers and owners restore either screen mode while owner entry still requires store registration', () => {
  for (const [roles, saved, expected] of [
    [['CUSTOMER'], null, 'customer'],
    [['CUSTOMER', 'OWNER'], null, 'customer'],
    [['CUSTOMER', 'OWNER'], 'owner', 'owner'],
    [['CUSTOMER', 'OWNER'], 'customer', 'customer'],
    [['OWNER'], null, 'owner'],
    [['CUSTOMER'], 'owner', 'owner'],
    [['OWNER'], 'customer', 'customer'],
    [['CUSTOMER'], 'unknown', 'customer'],
    [[], 'owner', null],
    [[], 'customer', null],
    [['UNKNOWN'], 'customer', null],
  ]) assert.equal(restoreAccountRole(roles, saved), expected)
  assert.equal(accountStartPath({ role: restoreAccountRole(['CUSTOMER'], null), shop: null, customerRegistered: false }), '/customer/register')
  assert.equal(accountStartPath({ role: restoreAccountRole(['OWNER'], null), shop }), '/owner')
  assert.equal(accountStartPath({ role: restoreAccountRole(['OWNER'], null), shop: null }), '/owner/register')
  assert.equal(accountStartPath({ role: restoreAccountRole(['OWNER'], 'customer'), shop, customerRegistered: false }), '/customer/register')
  assert.equal(accountStartPath({ role: restoreAccountRole(['CUSTOMER'], 'owner'), shop: null }), '/owner/register')
  assert.equal(accountStartPath({ role: restoreAccountRole(['OWNER'], 'owner'), shop }), '/owner')
})

test('registration saves optional store description and accepts blank descriptions', async (t) => {
  assert.equal(validateShopRegistration({ ...shop, description: '가'.repeat(1000) }), null)
  assert.equal(typeof validateShopRegistration({ ...shop, description: '가'.repeat(1001) }), 'string')
  assert.equal(typeof validateShopRegistration({ ...shop, description: null }), 'string')
  const fetch = mockRequests(t, [success({ csrfToken: 'csrf' }), success({ ...storeResponse, description: '편안한 공간' }, 201)])
  assert.equal((await createRegisteredShop({ ...shop, description: ' 편안한 공간 ' }, 'desc-key')).description, '편안한 공간')
  assert.equal(JSON.parse(fetch.mock.calls[1].arguments[1].body).description, '편안한 공간')
  const blank = mockRequests(t, [success({ csrfToken: 'csrf' }), success({ ...storeResponse, description: null }, 201)])
  assert.equal((await createRegisteredShop({ ...shop, description: '  ' }, 'blank-key')).description, '')
  assert.equal(Object.hasOwn(JSON.parse(blank.mock.calls[1].arguments[1].body), 'description'), false)
})

test('disabling all services keeps an already registered owner out of registration', async (t) => {
  mockRequests(t, [success(storeResponse), success({ items: [{ ...serviceResponse, active: false }], page: { hasNext: false, nextCursor: null } })])
  const registered = await readRegisteredShop(shop.id)
  assert.equal(registered.serviceId, serviceResponse.id)
  assert.equal(accountStartPath({ role: 'owner', shop: registered }), '/owner')
})
