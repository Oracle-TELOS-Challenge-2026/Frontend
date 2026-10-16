import assert from 'node:assert/strict'
import test from 'node:test'
import { hasSearchAreaChanged } from '../src/lib/shop-search.ts'

const bounds = { south: 37.50, west: 126.92, north: 37.52, east: 126.95 }

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
