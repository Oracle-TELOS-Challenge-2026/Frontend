import assert from 'node:assert/strict'
import test from 'node:test'
import { loadKakaoMaps } from '../src/lib/kakao-map.ts'

test('SDK loader rejects missing keys, shares requests, recovers after failure, and waits for initialization', async (t) => {
  const scripts = []
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  globalThis.window = {}
  globalThis.document = {
    createElement: () => ({ remove() { this.removed = true } }),
    head: { appendChild: (script) => scripts.push(script) },
  }
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  })

  await assert.rejects(loadKakaoMaps('  '), /key is missing/)
  assert.equal(scripts.length, 0)

  const first = loadKakaoMaps('test-public-key')
  const duplicate = loadKakaoMaps('test-public-key')
  assert.equal(first, duplicate)
  assert.equal(scripts.length, 1)
  const rejected = assert.rejects(first, /request failed/)
  scripts[0].onerror()
  await rejected
  assert.equal(scripts[0].removed, true)

  const retry = loadKakaoMaps('test-public-key')
  assert.equal(scripts.length, 2)
  assert.equal(new URL(scripts[1].src).searchParams.get('autoload'), 'false')
  let initialize
  const maps = { load: (callback) => { initialize = callback } }
  window.kakao = { maps }
  scripts[1].onload()
  let resolved = false
  retry.then(() => { resolved = true })
  await Promise.resolve()
  assert.equal(resolved, false)
  maps.Map = class {}
  initialize()
  assert.equal(await retry, maps)
  assert.equal(await loadKakaoMaps('test-public-key'), maps)
  assert.equal(scripts.length, 2)
})
