import assert from 'node:assert/strict'
import test from 'node:test'
import { createDemoState, DEMO_AREA_LABEL, DEMO_MAP_CENTER, DEMO_RADIUS_KM, OWNER_SHOP_ID } from '../src/data/demo.ts'

function distanceKm(shop) {
  const radians = Math.PI / 180
  const a = Math.sin((shop.latitude - DEMO_MAP_CENTER.latitude) * radians / 2) ** 2
    + Math.cos(DEMO_MAP_CENTER.latitude * radians) * Math.cos(shop.latitude * radians)
    * Math.sin((shop.longitude - DEMO_MAP_CENTER.longitude) * radians / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

test('demo shops stay within 5km of Dongjak campus and label straight-line distance accurately', () => {
  const { shops } = createDemoState()
  assert.equal(DEMO_AREA_LABEL, '동작캠퍼스')
  assert.equal(DEMO_RADIUS_KM, 5)
  const distances = shops.map(distanceKm)
  assert.ok(distances.some((distance) => distance < 0.3), 'include shops near the campus')
  assert.ok(distances.some((distance) => distance > 4), 'include shops toward the edge of the area')

  for (const shop of shops) {
    const distance = distanceKm(shop)
    assert.ok(Number.isFinite(distance) && distance > 0 && distance <= DEMO_RADIUS_KM, `${shop.id}: ${distance}km`)
    const label = /^직선 (\d+(?:\.\d+)?)(m|km)$/.exec(shop.distance)
    assert.ok(label, `${shop.id}: use straight-line distance, not guessed travel time`)
    const displayedKm = Number(label[1]) / (label[2] === 'm' ? 1000 : 1)
    assert.ok(Math.abs(displayedKm - distance) <= (label[2] === 'm' ? 0.005 : 0.05), `${shop.id}: distance label matches coordinates`)
    assert.match(shop.address, /시연용 위치/)
    assert.match(shop.description, /^시연용 가게입니다\./)
  }
})

test('demo data provides distinct shops across all four service categories', () => {
  const { shops } = createDemoState()
  assert.ok(shops.length >= 16 && shops.length <= 20)
  assert.equal(new Set(shops.map((shop) => shop.id)).size, shops.length)
  assert.deepEqual(new Set(shops.map((shop) => shop.category)), new Set(['네일', '헤어', '속눈썹', '피부관리']))
  for (const category of ['네일', '헤어', '속눈썹', '피부관리']) {
    assert.ok(shops.filter((shop) => shop.category === category).length >= 4, category)
  }
  assert.deepEqual(shops.slice(0, 4).map((shop) => shop.id), ['moment', 'ond', 'bloom', 'slow'])
})

test('existing reservations, waitlists, cancellations and chats still reference valid shops', () => {
  const state = createDemoState()
  const ids = new Set(state.shops.map((shop) => shop.id))
  assert.ok(ids.has(OWNER_SHOP_ID))
  for (const records of [state.reservations, state.waitlist, state.cancellations, state.conversations]) {
    assert.equal(new Set(records.map((record) => record.id)).size, records.length)
    for (const record of records) assert.ok(ids.has(record.shopId), record.id)
  }
  for (const shop of state.shops) {
    for (const slot of shop.slots.filter((item) => item.cancellationId)) {
      const cancellation = state.cancellations.find((item) => item.id === slot.cancellationId)
      assert.equal(cancellation?.shopId, shop.id)
      assert.equal(cancellation?.startsAt, slot.startsAt)
      assert.equal(cancellation?.price, slot.price)
    }
  }
})
