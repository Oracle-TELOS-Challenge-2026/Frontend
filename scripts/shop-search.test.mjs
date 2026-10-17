import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { CATEGORY_LABELS, SHOP_CATEGORIES } from '../src/data/categories.ts'
import { money } from '../src/lib/format.ts'
import { hasSearchAreaChanged } from '../src/lib/shop-search.ts'

const bounds = { south: 37.50, west: 126.92, north: 37.52, east: 126.95 }

test('all customer categories are available on the first render before API loading', () => {
  const compiled = ts.transpileModule(readFileSync(new URL('../src/hooks/useShopSearch.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  runInContext(compiled, createContext({ exports, require: (name) => {
    if (name === 'react') return React
    if (name === '../data/categories') return { CATEGORY_LABELS }
    if (name === '../lib/customer-api') return {}
    throw new Error(`Unexpected import: ${name}`)
  } }))
  function Capture() {
    const search = exports.useShopSearch()
    assert.equal(search.loading, true)
    assert.deepEqual(Array.from(search.categories, ({ code, label }) => [code, label]), [
      ['NAIL', '네일'], ['HAIR', '헤어'], ['EYELASH', '속눈썹'], ['SKIN', '피부관리'],
    ])
    return null
  }
  renderToStaticMarkup(React.createElement(Capture))
})

test('map markers show service prices and preserve the available booking action', () => {
  const compiled = ts.transpileModule(readFileSync(new URL('../src/components/customer/ShopMapMarker.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  runInContext(compiled, createContext({ exports, document: { createElement: () => ({}) }, require: (name) => {
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return jsxRuntime
    if (name === 'react-dom') return { createPortal: (children) => children }
    if (name === '../Icon') return { Icon: () => null }
    if (name === '../../model') return { money }
    if (name === '../../data/categories') return { SHOP_CATEGORIES }
    throw new Error(`Unexpected import: ${name}`)
  } }))
  for (const { originalPrice, slot, price, action } of [
    { originalPrice: 50000, price: '50,000원', action: '빈자리 알림 신청 가능' },
    { originalPrice: 0, price: '0원', action: '빈자리 알림 신청 가능' },
    { originalPrice: null, price: '가격 문의', action: '빈자리 알림 신청 가능' },
    { originalPrice: 50000, slot: { price: 35000, originalPrice: 50000 }, price: '35,000원', action: '빈자리 특가' },
    { originalPrice: 50000, slot: { price: 50000, originalPrice: 50000 }, price: '50,000원', action: '예약 가능' },
    { originalPrice: 50000, slot: { price: 0, originalPrice: 50000 }, price: '0원', action: '빈자리 특가' },
  ]) {
    const html = renderToStaticMarkup(React.createElement(exports.ShopMapMarker, {
      instance: {}, shop: { id: 'shop-1', name: '새 가게', category: '네일', originalPrice, latitude: 37.5, longitude: 126.9 },
      slot, selected: false, onSelect: () => {},
    }))
    assert.equal(html.match(/<strong>(.*?)<\/strong>/)?.[1], price)
    const label = html.match(/aria-label="(.*?)"/)?.[1]
    assert.ok(label?.includes(price), html)
    assert.ok(label.includes(action), html)
    assert.ok(label.includes('새 가게') && label.includes('네일'), html)
  }
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

test('selecting a place moves the map before requesting nearby stores', () => {
  const effects = [], calls = []
  const point = (latitude, longitude) => ({ getLat: () => latitude, getLng: () => longitude })
  let center = point(37.56, 126.97), level = 8
  const map = {
    relayout() {},
    getCenter: () => center,
    setCenter(value) { center = value; calls.push('center') },
    setLevel(value) { level = value },
    getLevel: () => level,
    getBounds: () => ({ getSouthWest: () => point(center.getLat() - .01, center.getLng() - .01), getNorthEast: () => point(center.getLat() + .01, center.getLng() + .01) }),
  }
  const instance = { map, maps: { LatLng: function (lat, lng) { return point(lat, lng) }, event: { addListener() {}, removeListener() {} } } }
  const compiled = ts.transpileModule(readFileSync(new URL('../src/components/customer/ShopMap.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  runInContext(compiled, createContext({ exports, require: (name) => {
    if (name === 'react') return { useCallback: (fn) => fn, useEffect: (fn) => effects.push(fn), useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}] }
    if (name === 'react/jsx-runtime') return jsxRuntime
    if (name === 'react-dom') return { flushSync: (fn) => fn() }
    if (name === '../../hooks/useKakaoMap') return { useKakaoMap: () => ({ instance, status: 'ready', containerRef: {} }) }
    if (name === '../../lib/shop-search') return { hasSearchAreaChanged }
    if (name === '../../model') return { getAvailableSlots: () => [] }
    if (name === '../Icon') return { Icon: () => null }
    if (name === './ShopMapMarker') return { ShopMapMarker: () => null }
    if (name === './UserLocation') return { UserLocation: () => null }
    throw new Error(`Unexpected import: ${name}`)
  } }))
  exports.ShopMap({ shops: [], expanded: false, place: { latitude: 37.4979, longitude: 127.0276 }, onSelect() {}, onSearchArea(bounds) {
    calls.push('search')
    assert.equal((bounds.north + bounds.south) / 2, 37.4979)
    assert.equal((bounds.east + bounds.west) / 2, 127.0276)
    assert.equal(level, 5)
  } })
  effects.forEach((effect) => effect())
  assert.deepEqual(calls, ['center', 'search'])
})
