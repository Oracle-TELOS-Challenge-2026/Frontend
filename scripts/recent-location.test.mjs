import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/hooks/useRecentLocation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const position = { coords: { latitude: 37, longitude: 127, accuracy: 10 }, timestamp: 100000 }

function mount({ userId = 'user-a', visibility = 'visible', save = async () => ({ latitude: 37, longitude: 127, savedAt: '2028-01-01T00:00:00Z' }) } = {}) {
  const calls = { locations: [], saves: [], toasts: [] }
  const timers = new Map()
  let clock = 0
  let nextTimer = 0
  let cleanup
  let previousDeps
  let saved = null
  const document = Object.assign(new EventTarget(), { visibilityState: visibility })
  const notify = (message) => calls.toasts.push(message)
  const exports = {}
  runInContext(compiled, createContext({
    exports, AbortController, document,
    navigator: { geolocation: { getCurrentPosition: (success, error, options) => calls.locations.push({ success, error, options }) } },
    window: {
      setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay, next: clock + delay }); return id },
      clearInterval(id) { timers.delete(id) },
    },
    require(name) {
      if (name === 'react') return { useState: () => [saved, (value) => { saved = value }], useEffect(setup, deps) {
        if (previousDeps?.every((value, index) => Object.is(value, deps[index]))) return
        cleanup?.()
        previousDeps = deps
        cleanup = setup()
      } }
      if (name === '../lib/user-api') return { async saveUserLocation(...args) { calls.saves.push(args); return save(...args) } }
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function render(nextUser = userId) { userId = nextUser; return exports.useRecentLocation(userId, notify) }
  render()
  return {
    calls, timers, render,
    unmount: () => cleanup?.(),
    visibility(value, dispatch = true) { document.visibilityState = value; if (dispatch) document.dispatchEvent(new Event('visibilitychange')) },
    advance(milliseconds) {
      const target = clock + milliseconds
      for (;;) {
        const due = [...timers.values()].filter((timer) => timer.next <= target).sort((a, b) => a.next - b.next)[0]
        if (!due) break
        clock = due.next
        due.next += due.delay
        due.callback()
      }
      clock = target
    },
  }
}

test('visible signed-in user gets fresh location immediately and every 10 seconds', async () => {
  const app = mount()
  assert.equal(app.calls.locations.length, 1)
  assert.equal(app.calls.locations[0].options.maximumAge, 0)
  assert.equal(app.calls.locations[0].options.timeout, 10000)
  await app.calls.locations[0].success(position)
  assert.equal(app.calls.saves[0][0], position)
  assert.equal(app.render().latitude, 37)
  assert.equal(app.render().savedAt, '2028-01-01T00:00:00Z')
  app.advance(9999)
  assert.equal(app.calls.locations.length, 1)
  app.advance(1)
  assert.equal(app.calls.locations.length, 2)
  await app.calls.locations[1].success(position)
  assert.equal(app.calls.saves.length, 2)
})

test('pending geolocation and save requests prevent overlapping updates', async () => {
  let finish
  const app = mount({ save: () => new Promise((resolve) => { finish = resolve }) })
  app.advance(10000)
  assert.equal(app.calls.locations.length, 1)
  const saving = app.calls.locations[0].success(position)
  app.advance(10000)
  assert.equal(app.calls.locations.length, 1)
  finish()
  await saving
  app.advance(10000)
  assert.equal(app.calls.locations.length, 2)
})

test('hidden screens stop updates and discard late positions after returning', async () => {
  const app = mount({ visibility: 'hidden' })
  app.advance(10000)
  assert.equal(app.calls.locations.length, 0)
  app.visibility('visible')
  assert.equal(app.calls.locations.length, 1)
  app.visibility('hidden')
  app.advance(20000)
  assert.equal(app.calls.locations.length, 1)
  app.visibility('visible')
  assert.equal(app.calls.locations.length, 2)
  await app.calls.locations[0].success(position)
  assert.equal(app.calls.saves.length, 0)
  await app.calls.locations[1].success(position)
  assert.equal(app.calls.saves.length, 1)
  app.advance(10000)
  assert.equal(app.calls.locations.length, 3)
})

test('hidden and unmounted screens abort saves and ignore their late failures', async () => {
  for (const stop of [(app) => app.visibility('hidden'), (app) => app.unmount()]) {
    let fail
    const app = mount({ save: () => new Promise((_, reject) => { fail = reject }) })
    const saving = app.calls.locations[0].success(position)
    const signal = app.calls.saves[0][1]
    stop(app)
    assert.equal(signal.aborted, true)
    fail(new Error('cancelled'))
    await saving
    app.advance(10000)
    assert.equal(app.calls.locations.length, 1)
    assert.equal(app.calls.toasts.length, 0)
    assert.equal(app.timers.size, 0)
  }
})

test('a position arriving before the queued visibility event cannot save on a hidden screen', async () => {
  const app = mount()
  app.visibility('hidden', false)
  await app.calls.locations[0].success(position)
  assert.equal(app.calls.saves.length, 0)
})

test('logout and account changes cannot save positions from the previous account', async () => {
  const app = mount()
  app.render(null)
  assert.equal(app.render(null), null)
  await app.calls.locations[0].success(position)
  app.advance(10000)
  assert.equal(app.calls.saves.length, 0)
  assert.equal(app.timers.size, 0)
  app.render('user-b')
  app.render('user-c')
  await app.calls.locations[1].success(position)
  assert.equal(app.calls.saves.length, 0)
  await app.calls.locations[2].success(position)
  assert.equal(app.calls.saves.length, 1)
  app.unmount()
  app.visibility('visible')
  assert.equal(app.timers.size, 0)
})

test('permission denial is explained once and location errors are retried', async () => {
  const app = mount()
  app.calls.locations[0].error({ code: 1 })
  app.advance(10000)
  app.calls.locations[1].error({ code: 1 })
  assert.equal(app.calls.toasts.length, 1)
  assert.match(app.calls.toasts[0], /위치 권한/)
  app.advance(10000)
  app.calls.locations[2].error({ code: 3 })
  app.advance(10000)
  app.calls.locations[3].error({ code: 2 })
  assert.equal(app.calls.toasts.length, 2)
  app.advance(10000)
  await app.calls.locations[4].success(position)
  assert.equal(app.calls.saves.length, 1)
})

test('save failures are reported once and retried without duplicate timers on rerender', async () => {
  const app = mount({ save: async () => { throw new Error('offline') } })
  await app.calls.locations[0].success(position)
  app.render()
  assert.equal(app.timers.size, 1)
  app.advance(10000)
  await app.calls.locations[1].success(position)
  assert.equal(app.calls.toasts.length, 1)
  assert.equal(app.calls.saves.length, 2)
  assert.equal(app.render(), null)
})

test('saved coordinates are exposed only for the account whose save completed', async () => {
  const app = mount()
  await app.calls.locations[0].success(position)
  assert.equal(app.render().latitude, 37)
  assert.equal(app.render('user-b'), null)
  await app.calls.locations[1].success(position)
  assert.equal(app.render().longitude, 127)
})
