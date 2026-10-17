import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { BackendApiError } from '../src/lib/backend-api.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/hooks/useVacancyAlerts.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))
const here = { latitude: 37.5, longitude: 127 }
const elsewhere = { latitude: 36.5, longitude: 126 }
const slot = { id: 'slot-1', shopName: '가게', startsAt: '2026-10-19T10:00:00+09:00', price: 10000 }
const item = (overrides = {}) => ({
  id: 'wait-1', version: 1, status: 'ACTIVE', availability: 'AVAILABLE', offers: [slot],
  conditions: { storeId: null, serviceId: null, category: 'NAIL', location: here, radiusMeters: 3000, maxPrice: 30000, keywords: ['젤'], windowStart: '2026-10-19T09:00:00+09:00', windowEnd: '2026-10-19T12:00:00+09:00' },
  ...overrides,
})
function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function mount({ userId = 'user-a', location = here, visibility = 'visible', read = async () => [item()], save = async () => {} } = {}) {
  const slots = [], effects = [], timers = new Map()
  const calls = { reads: [], saves: [], toasts: [] }
  let cursor = 0, clock = 0, nextTimer = 0
  const document = Object.assign(new EventTarget(), { visibilityState: visibility })
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, (value) => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useEffect(setup, deps) {
      const index = cursor++
      if (!slots[index]?.deps.every((value, position) => Object.is(value, deps[position]))) effects.push(() => {
        slots[index]?.cleanup?.()
        slots[index] = { deps, cleanup: setup() }
      })
    },
  }
  const exports = {}
  runInContext(compiled, createContext({
    exports, AbortController, Error, document,
    window: {
      setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay, next: clock + delay }); return id },
      clearInterval(id) { timers.delete(id) },
    },
    require(name) {
      if (name === 'react') return react
      if (name === '../lib/backend-api') return { BackendApiError }
      if (name === '../lib/customer-api') return {
        async readWaitlist(...args) { calls.reads.push(args); return read(...args) },
        async saveWaitlist(...args) { calls.saves.push(args); return save(...args) },
      }
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  const notify = (text) => calls.toasts.push(text)
  function render(nextUser = userId, nextLocation = location) {
    userId = nextUser; location = nextLocation; cursor = 0
    const revision = exports.useVacancyAlerts(userId, location, notify)
    effects.splice(0).forEach((effect) => effect())
    return revision
  }
  render()
  return {
    render, calls, timers,
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
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

test('visible users receive vacancy toasts without push APIs and poll every 3 seconds', async () => {
  let rows = [item(), item({ id: 'wait-2' })]
  const app = mount({ read: async () => rows })
  await tick()
  assert.equal(app.calls.reads.length, 1)
  assert.equal(app.calls.saves.length, 0)
  assert.equal(app.calls.toasts.length, 1)
  assert.match(app.calls.toasts[0], /가게에서 조건에 맞는 빈자리/)
  const firstRevision = app.render()
  app.advance(2999)
  assert.equal(app.calls.reads.length, 1)
  app.advance(1)
  await tick()
  assert.equal(app.calls.reads.length, 2)
  assert.equal(app.calls.toasts.length, 1)
  assert.equal(app.render(), firstRevision)
  rows = [item({ offers: [{ ...slot, price: 9000 }, { ...slot, id: 'slot-2' }] })]
  app.advance(3000)
  await tick()
  assert.equal(app.calls.toasts.length, 2)
  assert.ok(app.render() > firstRevision)
})

test('location updates preserve every other condition and wait for rematched offers', async () => {
  const original = item({ conditions: { ...item().conditions, storeId: 'store-1', serviceId: 'service-1', location: elsewhere } })
  let rows = [original]
  const app = mount({ read: async () => rows })
  await tick()
  assert.equal(app.calls.saves.length, 1)
  const [conditions, key, previous, source, signal] = app.calls.saves[0]
  assert.equal(JSON.stringify(conditions), JSON.stringify({ ...original.conditions, location: here }))
  assert.equal(previous, original)
  assert.equal(key, '')
  assert.equal(source, 'MANUAL')
  assert.equal(signal.aborted, false)
  assert.equal(app.calls.toasts.length, 0)
  rows = [item({ ...original, version: 2, conditions })]
  app.advance(3000)
  await tick()
  assert.equal(app.calls.saves.length, 1)
  assert.equal(app.calls.toasts.length, 1)
})

test('missing recent location suppresses range offers but leaves store-only waits usable', async () => {
  const store = item({ id: 'store-wait', conditions: { ...item().conditions, storeId: 'store-1', location: null, radiusMeters: null }, offers: [{ ...slot, id: 'store-slot' }] })
  const app = mount({ location: null, read: async () => [item(), store] })
  await tick()
  assert.equal(app.calls.saves.length, 0)
  assert.equal(app.calls.toasts.length, 1)
  app.render('user-a', here)
  await tick()
  assert.equal(app.calls.toasts.length, 2)
  app.render('user-a', { ...here })
  await tick()
  assert.equal(app.calls.reads.length, 2)
  app.render('user-b', here)
  await tick()
  assert.equal(app.calls.toasts.length, 3)
})

test('pending polls do not overlap and location changes discard old responses', async () => {
  const pending = deferred()
  let count = 0
  const app = mount({ read: () => ++count === 1 ? pending.promise : Promise.resolve([]) })
  app.advance(9000)
  assert.equal(app.calls.reads.length, 1)
  app.render('user-a', elsewhere)
  assert.equal(app.calls.reads[0][0].aborted, true)
  pending.resolve([item()])
  await tick()
  assert.equal(app.calls.toasts.length, 0)
  assert.equal(app.calls.saves.length, 0)
  assert.equal(app.calls.reads.length, 2)
})

test('hidden, logged-out and unmounted screens abort pending mutations and ignore late failures', async () => {
  for (const stop of [(app) => app.visibility('hidden'), (app) => app.render(null), (app) => app.unmount()]) {
    const pending = deferred()
    const app = mount({ location: elsewhere, save: () => pending.promise })
    await tick()
    app.advance(9000)
    assert.equal(app.calls.reads.length, 1)
    assert.equal(app.calls.saves.length, 1)
    stop(app)
    assert.equal(app.calls.saves[0][4].aborted, true)
    pending.reject(new Error('stale failure'))
    await tick()
    app.advance(9000)
    assert.equal(app.calls.toasts.length, 0)
    assert.equal(app.timers.size, 0)
  }
  const app = mount({ visibility: 'hidden' })
  assert.equal(app.calls.reads.length, 0)
  app.visibility('visible')
  await tick()
  assert.equal(app.calls.reads.length, 1)
  app.visibility('hidden')
  app.advance(6000)
  assert.equal(app.calls.reads.length, 1)
  app.visibility('visible')
  await tick()
  assert.equal(app.calls.reads.length, 2)
  assert.equal(app.calls.toasts.length, 1)
})

test('failed updates skip stale offers and do not block other waits or overwrite a concurrent edit', async () => {
  let version = 1
  const app = mount({
    read: async () => [item({ version, conditions: { ...item().conditions, location: elsewhere } }), item({ id: 'other', offers: [{ ...slot, id: 'other-slot' }] })],
    save: async (_, __, previous) => { if (previous.version === 1) throw new BackendApiError(409, 'VERSION_CONFLICT', 'changed'); throw new BackendApiError(409, 'DUPLICATE_WAITLIST', 'duplicate') },
  })
  await tick()
  assert.equal(app.calls.toasts.length, 1)
  version = 2
  app.advance(3000)
  await tick()
  assert.equal(app.calls.saves[1][2].version, 2)
  assert.equal(app.calls.toasts.length, 2)
  assert.match(app.calls.toasts[1], /같은 조건의 대기/)
  app.advance(3000)
  await tick()
  assert.equal(app.calls.toasts.length, 2)
})

test('poll errors are retried once per interval and authorization failures stop polling', async () => {
  let failure = new BackendApiError(503, 'SERVICE_UNAVAILABLE', '서버에 연결하지 못했어요.')
  const app = mount({ read: async () => { throw failure } })
  await tick()
  app.advance(3000)
  await tick()
  assert.equal(app.calls.reads.length, 2)
  assert.equal(app.calls.toasts.length, 1)
  failure = new BackendApiError(401, 'UNAUTHORIZED', '다시 로그인해 주세요.')
  app.advance(3000)
  await tick()
  assert.equal(app.calls.toasts.length, 2)
  assert.equal(app.timers.size, 0)
  app.visibility('hidden'); app.visibility('visible')
  app.render('user-a', elsewhere)
  app.advance(6000)
  assert.equal(app.calls.reads.length, 3)
  assert.equal(app.timers.size, 0)
})
