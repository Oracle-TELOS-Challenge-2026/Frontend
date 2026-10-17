import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { CATEGORY_LABELS } from '../src/data/categories.ts'
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
