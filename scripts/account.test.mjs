import assert from 'node:assert/strict'
import test from 'node:test'
import { accountStartPath, parseAccount, validateShopRegistration } from '../src/lib/account.ts'

const shop = {
  id: 'registered-test', name: '모먼트 네일', category: '네일',
  address: '서울 동작구 노량진로 100', phone: '02-123-4567',
  service: '젤 네일', originalPrice: 50000, duration: 60,
}
const empty = { role: null, shop: null, preferences: '' }

test('saved accounts restore the last role, registered shop, and customer preferences', () => {
  for (const role of ['owner', 'customer']) {
    const account = { role, shop, preferences: '조용한 네일숍을 좋아해요.' }
    assert.deepEqual(parseAccount(JSON.stringify(account)), account)
  }
})

test('missing, corrupt, and incorrectly typed storage values recover safely', () => {
  for (const raw of [null, '', '{', 'null', '[]', '42', 'true', '"owner"']) {
    assert.deepEqual(parseAccount(raw), empty, String(raw))
  }
  assert.deepEqual(parseAccount(JSON.stringify({ role: 'admin', shop: true, preferences: [] })), empty)
  for (const invalidShop of [{ ...shop, id: 'demo-shop' }, { ...shop, phone: 123 }, { ...shop, duration: '60' }, {}]) {
    assert.deepEqual(parseAccount(JSON.stringify({ role: 'owner', shop: invalidShop, preferences: '네일' })), {
      role: 'owner', shop: null, preferences: '네일',
    })
  }
})

test('entry routes require registration for owners and retain the shop when switching roles', () => {
  assert.equal(accountStartPath(empty), '/login')
  assert.equal(accountStartPath({ ...empty, role: 'owner' }), '/owner/register')
  assert.equal(accountStartPath({ ...empty, role: 'customer' }), '/customer')
  for (const role of ['customer', 'owner', 'customer', 'owner']) {
    const restored = parseAccount(JSON.stringify({ role, shop, preferences: '네일' }))
    assert.equal(accountStartPath(restored), `/${role}`)
    assert.deepEqual(restored.shop, shop)
  }
})

test('registration accepts complete details and inclusive text, price, and duration limits', () => {
  assert.equal(validateShopRegistration(shop), null)
  assert.equal(validateShopRegistration({
    ...shop, name: '가'.repeat(60), address: '가'.repeat(200), service: '가'.repeat(100),
    originalPrice: 1, duration: 10,
  }), null)
  assert.equal(validateShopRegistration({ ...shop, originalPrice: 10000000, duration: 480 }), null)
  assert.equal(validateShopRegistration({ ...shop, name: '  모먼트  ', address: '  서울  ', service: '  젤 네일  ' }), null)
})

test('registration rejects blank, oversized, or non-text details and unknown categories', () => {
  for (const [field, limit] of [['name', 60], ['address', 200], ['service', 100]]) {
    for (const value of ['', ' \n ', '가'.repeat(limit + 1), null, 123]) {
      assert.equal(typeof validateShopRegistration({ ...shop, [field]: value }), 'string', `${field}: ${value}`)
    }
  }
  for (const category of ['', '전체', '없는 업종', null]) {
    assert.equal(typeof validateShopRegistration({ ...shop, category }), 'string')
  }
})

test('registration accepts domestic phone formatting and rejects malformed phone numbers', () => {
  for (const phone of ['021234567', '02-1234-5678', '010-1234-5678', '010 1234 5678']) {
    assert.equal(validateShopRegistration({ ...shop, phone }), null, phone)
  }
  for (const phone of ['', '   ', '1234567890', '01012345', '010123456789', '010-ABCD-5678', '+82-10-1234-5678', 1012345678]) {
    assert.equal(typeof validateShopRegistration({ ...shop, phone }), 'string', String(phone))
  }
})

test('registration rejects non-integer, non-numeric, and out-of-range prices and durations', () => {
  for (const originalPrice of [0, -1, 0.5, 10000001, NaN, Infinity, '50000', null]) {
    assert.equal(typeof validateShopRegistration({ ...shop, originalPrice }), 'string', String(originalPrice))
  }
  for (const duration of [0, 9, 10.5, 481, NaN, Infinity, '60', null]) {
    assert.equal(typeof validateShopRegistration({ ...shop, duration }), 'string', String(duration))
  }
})

test('customer preferences restore up to 2,000 characters without losing other account data', () => {
  for (const preferences of ['', '가'.repeat(2000)]) {
    assert.deepEqual(parseAccount(JSON.stringify({ role: 'customer', shop, preferences })), {
      role: 'customer', shop, preferences,
    })
  }
  for (const preferences of ['가'.repeat(2001), null, 123, {}]) {
    assert.deepEqual(parseAccount(JSON.stringify({ role: 'customer', shop, preferences })), {
      role: 'customer', shop, preferences: '',
    })
  }
})
