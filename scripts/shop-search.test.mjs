import assert from 'node:assert/strict'
import test from 'node:test'
import { filterShops, hasSearchAreaChanged } from '../src/lib/shop-search.ts'

const bounds = { south: 37.50, west: 126.92, north: 37.52, east: 126.95 }
const shop = {
  id: 'nail', name: 'Moment 네일', category: '네일', service: '젤 케어',
  address: '서울 동작구 노량진로', latitude: 37.51, longitude: 126.94,
}

test('area filtering includes every boundary and excludes shops beyond each edge', () => {
  const inside = [
    shop,
    { ...shop, id: 'south-west', latitude: bounds.south, longitude: bounds.west },
    { ...shop, id: 'north-east', latitude: bounds.north, longitude: bounds.east },
  ]
  const outside = [
    { ...shop, latitude: bounds.south - 0.001 },
    { ...shop, latitude: bounds.north + 0.001 },
    { ...shop, longitude: bounds.west - 0.001 },
    { ...shop, longitude: bounds.east + 0.001 },
  ]
  assert.deepEqual(filterShops([...inside, ...outside], '', '전체', bounds), inside)
})

test('query, category, and area are applied together', () => {
  const shops = [
    shop,
    { ...shop, id: 'outside', latitude: bounds.north + 0.001 },
    { ...shop, id: 'hair', category: '헤어' },
    { ...shop, id: 'other-address', address: '서울 영등포구 여의도동' },
  ]
  assert.deepEqual(filterShops(shops, '노량진', '네일', bounds), [shop])
})

test('null bounds retain text and category search with trimmed case-insensitive queries', () => {
  const outside = { ...shop, id: 'outside', latitude: bounds.north + 0.001 }
  const shops = [shop, outside]
  assert.deepEqual(filterShops(shops, '  MOMENT  ', '전체', null), shops)
  for (const query of ['네일', '젤 케어', '동작구', '   ']) {
    assert.deepEqual(filterShops(shops, query, '전체', null), shops)
  }
  assert.deepEqual(filterShops(shops, '', '헤어', null), [])
  assert.deepEqual(filterShops(shops, '속눈썹', '전체', null), [])
  assert.deepEqual(filterShops([], '', '전체', bounds), [])
})

test('area changes ignore small pans and exactly 25 percent of the last searched span', () => {
  const previous = bounds
  assert.equal(hasSearchAreaChanged(previous, previous, 5, 5), false)
  for (const [start, end] of [['south', 'north'], ['west', 'east']]) {
    const span = previous[end] - previous[start]
    for (const direction of [-1, 1]) {
      for (const fraction of [0.01, 0.25, 0.26]) {
        const offset = span * fraction * direction
        const current = { ...previous, [start]: previous[start] + offset, [end]: previous[end] + offset }
        assert.equal(hasSearchAreaChanged(previous, current, 5, 5), fraction > 0.25, `${start} ${fraction} ${direction}`)
      }
    }
  }
})

test('changing the zoom level requires searching again even with the same center', () => {
  const zoomedIn = { south: 37.505, west: 126.9275, north: 37.515, east: 126.9425 }
  assert.equal(hasSearchAreaChanged(bounds, zoomedIn, 5, 4), true)
  assert.equal(hasSearchAreaChanged(zoomedIn, bounds, 4, 5), true)
})
