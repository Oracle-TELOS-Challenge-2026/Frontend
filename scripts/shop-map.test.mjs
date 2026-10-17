import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { hasSearchAreaChanged } from '../src/lib/shop-search.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/customer/ShopMap.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const initialBounds = { south: 37, north: 37.125, west: 127, east: 127.125 }
const shop = { id: 'shop-1', latitude: 37.0625, longitude: 127.0625 }
const shifted = (amount) => ({ south: 37 + amount, north: 37.125 + amount, west: 127, east: 127.125 })

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements)
  return node?.props ? [node, ...elements(node.props.children)] : []
}
const searchButton = (tree) => elements(tree).find((node) => node.type === 'button' && node.props.className === 'map-search-area')
const marker = (tree) => elements(tree).find((node) => node.type === 'ShopMapMarker')

function mount() {
  const slots = [], effects = [], searches = [], selections = [], centers = []
  const listeners = new Map()
  let cursor = 0, level = 5, relayouts = 0
  let bounds = { ...initialBounds }
  class LatLng {
    constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude }
    getLat() { return this.latitude }
    getLng() { return this.longitude }
  }
  const map = {
    getBounds: () => ({ getSouthWest: () => new LatLng(bounds.south, bounds.west), getNorthEast: () => new LatLng(bounds.north, bounds.east) }),
    getCenter: () => new LatLng((bounds.south + bounds.north) / 2, (bounds.west + bounds.east) / 2),
    getLevel: () => level,
    relayout: () => { relayouts++ },
    setCenter(position) {
      const center = map.getCenter()
      const latitude = position.getLat() - center.getLat(), longitude = position.getLng() - center.getLng()
      bounds = { south: bounds.south + latitude, north: bounds.north + latitude, west: bounds.west + longitude, east: bounds.east + longitude }
      centers.push([position.getLat(), position.getLng()])
    },
  }
  const instance = { map, maps: { LatLng, event: {
    addListener(_map, type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler) },
    removeListener: (_map, type, handler) => listeners.get(type)?.delete(handler),
  } } }
  let props = {
    shops: [shop], expanded: false, selectedId: undefined,
    onSelect: (id) => { selections.push(id); props = { ...props, selectedId: id ?? undefined } },
    onSearchArea: (value) => searches.push({ ...value }),
  }
  const exports = {}, jsx = (type, props, key) => ({ type, props, key })
  runInContext(compiled, createContext({
    exports,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
      if (name === 'react') return {
        useState(initial) {
          const index = cursor++
          slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
          return [slots[index].value, (value) => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
        },
        useRef: (current) => slots[cursor++] ??= { current },
        useCallback(callback, deps) {
          const index = cursor++
          if (!slots[index]?.deps.every((value, position) => Object.is(value, deps[position]))) slots[index] = { deps, callback }
          return slots[index].callback
        },
        useEffect(setup, deps) {
          const index = cursor++
          if (!slots[index]?.deps.every((value, position) => Object.is(value, deps[position]))) effects.push(() => {
            slots[index]?.cleanup?.()
            slots[index] = { deps, cleanup: setup() }
          })
        },
      }
      if (name === 'react-dom') return { flushSync: (callback) => callback() }
      if (name === '../../hooks/useKakaoMap') return { useKakaoMap: () => ({ containerRef: { current: null }, instance, status: 'ready', retry() {} }) }
      if (name === '../../lib/shop-search') return { hasSearchAreaChanged }
      if (name === '../../model') return { getAvailableSlots: () => [] }
      if (['../Icon', './ShopMapMarker', './UserLocation'].includes(name)) return new Proxy({}, { get: (_, name) => name })
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function render(changes = {}) {
    props = { ...props, ...changes }; cursor = 0
    const tree = exports.ShopMap(props)
    effects.splice(0).forEach((effect) => effect())
    return tree
  }
  render()
  return {
    render, searches, selections, centers, bounds: () => ({ ...bounds }), relayouts: () => relayouts,
    move(type, nextBounds = bounds, nextLevel = level) {
      bounds = { ...nextBounds }; level = nextLevel
      listeners.get(type)?.forEach((handler) => handler())
    },
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
  }
}

test('initial map search runs once and shop selection does not repeat the search', () => {
  const app = mount()
  assert.deepEqual(app.searches, [initialBounds])
  assert.equal(searchButton(app.render()), undefined)
  marker(app.render()).props.onSelect(shop.id)
  assert.equal(searchButton(app.render()), undefined)
  assert.deepEqual(app.centers, [[shop.latitude, shop.longitude]])
  assert.equal(app.relayouts(), 1)
  app.render({ selectedId: undefined })
  app.render({ selectedId: shop.id })
  app.render()
  assert.deepEqual(app.searches, [initialBounds])
  app.unmount()
})

test('user movement exposes search, while marker selection and automatic centering hide it', () => {
  const app = mount()
  app.move('dragend', shifted(0.0625))
  assert.ok(searchButton(app.render()))
  marker(app.render()).props.onSelect(shop.id)
  assert.equal(searchButton(app.render()), undefined)
  assert.equal(marker(app.render()).props.selected, true)
  assert.deepEqual(app.centers.at(-1), [shop.latitude, shop.longitude])
  assert.deepEqual(app.bounds(), initialBounds)
  assert.equal(searchButton(app.render()), undefined)
  assert.equal(searchButton(app.render({ selectedId: undefined })), undefined)
  assert.equal(app.searches.length, 1)
  app.unmount()
})

test('a selected shop is cleared by a small drag or zoom and searching sends the current bounds once', () => {
  for (const type of ['dragend', 'zoom_changed']) {
    const app = mount()
    marker(app.render()).props.onSelect(shop.id)
    app.render()
    const current = shifted(0.001)
    assert.equal(hasSearchAreaChanged(initialBounds, current, 5, 5), false)
    app.move(type, current, type === 'zoom_changed' ? 4 : 5)
    let tree = app.render()
    assert.equal(marker(tree).props.selected, false)
    assert.equal(app.selections.at(-1), null)
    assert.ok(searchButton(tree))
    assert.equal(app.searches.length, 1)
    searchButton(tree).props.onClick()
    tree = app.render()
    assert.equal(searchButton(tree), undefined)
    assert.deepEqual(app.searches, [initialBounds, current])
    app.move('dragend')
    assert.equal(searchButton(app.render()), undefined)
    assert.equal(app.searches.length, 2)
    app.unmount()
  }
})
