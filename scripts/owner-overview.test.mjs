import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const compiled = Object.fromEntries(['Home', 'Alerts'].map((page) => [page, ts.transpileModule(readFileSync(new URL(`../src/pages/owner/${page}Page.tsx`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText]))
const tick = () => new Promise((resolve) => setImmediate(resolve))
const today = '2026-10-19'
const shop = { id: 'store-a', name: '첫 번째 가게' }
const timetable = (date = today, total = 2) => ({ date, summary: { total, remainingConfirmed: total }, resources: [], reservations: [], availableSlots: [] })
const vacancy = (id = 'vacancy-a') => ({ id, storeId: shop.id, originalServiceId: 'service-a', reason: 'CANCELLATION', status: 'DRAFT', availableFrom: '2099-10-19T10:00:00+09:00', availableUntil: '2099-10-19T12:00:00+09:00', occurredAt: '2099-10-18T10:00:00+09:00', originalPrice: 30000 })

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : []
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('')
  if (tree && typeof tree === 'object') return text(tree.props?.children)
  return tree == null || typeof tree === 'boolean' ? '' : String(tree)
}
function find(tree, predicate) {
  const found = nodes(tree).find(predicate)
  assert.ok(found, 'expected rendered element')
  return found
}
const button = (tree, label) => find(tree, (node) => node.type === 'button' && (node.props['aria-label'] ?? text(node)) === label)
const summary = (tree) => nodes(find(tree, (node) => node.props?.className === 'owner-summary')).filter((node) => node.type === 'strong').map(text)

function mount({ page = 'Home', cache = new Map(), visibility = 'visible', read = async (_, date) => timetable(date) } = {}) {
  const slots = [], effects = [], timers = new Map(), calls = []
  let cursor = 0, clock = 0, nextTimer = 0
  let props = { ownerShop: shop, cache, refreshKey: '', notify() {} }
  const document = Object.assign(new EventTarget(), { visibilityState: visibility })
  const window = Object.assign(new EventTarget(), {
    setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay, next: clock + delay }); return id },
    clearInterval(id) { timers.delete(id) },
  })
  const jsx = (type, props, key) => ({ type, props, key })
  const exports = {}
  runInContext(compiled[page], createContext({
    exports, AbortController, Error, document, window, queueMicrotask, crypto,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
      if (name === 'react') return {
        useState(initial) {
          const index = cursor++
          slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
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
      if (name === 'react-router-dom') return { useSearchParams: () => [new URLSearchParams()] }
      if (name === '../../lib/format') return { dateLabel: (value) => value.slice(0, 10), timeLabel: (value) => value.slice(11, 16), money: String, todayInSeoul: (value) => value ? value.toISOString().slice(0, 10) : today }
      if (name === '../../lib/customer-api') return { readStoreServices: async () => [{ id: 'service-a', name: '젤 네일', active: true }] }
      if (name === '../../lib/owner-api') return {
        readOwnerTimetable(...args) { calls.push(args); return read(...args) },
        readOwnerVacancies(...args) { calls.push(args); return read(...args) },
      }
      const component = { '../../components/Icon': 'Icon', '../../components/LoadingIndicator': 'LoadingIndicator', '../../components/Modal': 'Modal', '../../components/owner/Schedule': 'OwnerSchedule', '../../components/owner/SlotDialog': 'SlotDialog', '../../components/owner/ReservationRequests': 'ReservationRequests', '../../components/owner/PublishDialog': 'PublishDialog' }[name]
      if (component) return { [component]: component }
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function render(next = {}) {
    props = { ...props, ...next }; cursor = 0
    const tree = exports[`Owner${page}`](props)
    effects.splice(0).forEach((effect) => effect())
    return tree
  }
  render()
  return {
    render, calls, cache, timers,
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
    visibility(value) { document.visibilityState = value; document.dispatchEvent(new Event('visibilitychange')) },
    online() { window.dispatchEvent(new Event('online')) },
    advance(milliseconds) {
      const target = clock + milliseconds
      for (;;) {
        const due = [...timers.values()].filter((timer) => timer.next <= target).sort((a, b) => a.next - b.next)[0]
        if (!due) break
        clock = due.next; due.next += due.delay; due.callback()
      }
      clock = target
    },
  }
}

test('closing an untouched slot dialog preserves the summary without another request', async () => {
  const app = mount()
  await tick()
  assert.deepEqual(summary(app.render()), ['2건', '2건'])
  button(app.render(), '예약 시간 등록').props.onClick()
  find(app.render(), (node) => node.type === 'SlotDialog').props.onClose(false)
  assert.deepEqual(summary(app.render()), ['2건', '2건'])
  await tick()
  assert.equal(app.calls.length, 1)
  app.unmount()
})

test('saved and uncertain slot results revalidate without clearing the current summary', async () => {
  const pending = deferred()
  let reads = 0
  const app = mount({ read: (_, date) => ++reads === 1 ? Promise.resolve(timetable(date)) : pending.promise })
  await tick()
  const scheduleKey = find(app.render(), (node) => node.type === 'OwnerSchedule').key
  button(app.render(), '예약 시간 등록').props.onClick()
  find(app.render(), (node) => node.type === 'SlotDialog').props.onCreated({ startAt: `${today}T10:00:00+09:00`, endAt: `${today}T11:00:00+09:00` })
  assert.deepEqual(summary(app.render()), ['2건', '2건'])
  assert.equal(find(app.render(), (node) => node.type === 'OwnerSchedule').key, scheduleKey)
  await tick()
  assert.equal(app.calls.length, 2)
  pending.resolve(timetable(today, 3))
  await tick()
  assert.deepEqual(summary(app.render()), ['3건', '3건'])
  button(app.render(), '예약 시간 등록').props.onClick()
  find(app.render(), (node) => node.type === 'SlotDialog').props.onClose(true)
  assert.deepEqual(summary(app.render()), ['3건', '3건'])
  await tick()
  assert.equal(app.calls.length, 3)
  app.unmount()
})

test('date caches restore immediately across navigation while stores and account caches stay separate', async () => {
  const requests = []
  const read = () => { const request = deferred(); requests.push(request); return request.promise }
  const app = mount({ read })
  await tick()
  requests[0].resolve(timetable())
  await tick()
  const choose = (date) => find(app.render(), (node) => node.type === 'button' && node.props?.['aria-label'] === date).props.onClick()
  choose('2026-10-20')
  assert.deepEqual(summary(app.render()), ['—건', '—건'])
  await tick()
  requests[1].resolve(timetable('2026-10-20', 7))
  await tick()
  assert.deepEqual(summary(app.render()), ['7건', '7건'])
  choose(today)
  assert.deepEqual(summary(app.render()), ['2건', '2건'])
  await tick()
  app.unmount()
  const returned = mount({ cache: app.cache, read })
  assert.deepEqual(summary(returned.render()), ['2건', '2건'])
  assert.deepEqual(summary(returned.render({ ownerShop: { id: 'store-b', name: '다른 가게' } })), ['—건', '—건'])
  returned.unmount()
  const otherAccount = mount({ cache: new Map(), read })
  assert.deepEqual(summary(otherAccount.render()), ['—건', '—건'])
  otherAccount.unmount()
  for (const request of requests.slice(2)) request.resolve(timetable(today, 99))
  await tick()
  const restored = mount({ cache: app.cache, read })
  assert.deepEqual(summary(restored.render()), ['2건', '2건'])
  restored.unmount()
})

test('background refresh errors keep the timetable visible and allow notification-triggered recovery', async () => {
  let read = async () => timetable()
  const app = mount({ read: (...args) => read(...args) })
  await tick()
  read = async () => { throw new Error('일시적인 조회 실패') }
  app.render({ refreshKey: 'notification-a' })
  await tick()
  assert.deepEqual(summary(app.render()), ['2건', '2건'])
  assert.ok(nodes(app.render()).some((node) => node.type === 'OwnerSchedule'))
  assert.match(text(app.render()), /일시적인 조회 실패/)
  read = async () => timetable(today, 4)
  app.render({ refreshKey: 'notification-b' })
  await tick()
  assert.deepEqual(summary(app.render()), ['4건', '4건'])
  assert.doesNotMatch(text(app.render()), /일시적인 조회 실패/)
  app.unmount()
})

test('canceling an owner reservation refreshes the timetable and reports cancellation', async () => {
  const app = mount()
  await tick()
  find(app.render(), (node) => node.type === 'OwnerSchedule').props.onUpdated({ status: 'CANCELED' })
  assert.match(text(app.render()), /예약을 취소했어요/)
  assert.doesNotMatch(text(app.render()), /시술 완료로 처리/)
  await tick()
  assert.equal(app.calls.length, 2)
  app.unmount()
})

test('visible polling avoids overlapping requests, resumes on return and ignores unmounted responses', async () => {
  const requests = []
  const app = mount({ visibility: 'hidden', read: () => { const request = deferred(); requests.push(request); return request.promise } })
  await tick()
  app.advance(60000)
  assert.equal(app.calls.length, 0)
  app.visibility('visible')
  await tick()
  assert.equal(app.calls.length, 1)
  app.advance(60000); app.online()
  await tick()
  assert.equal(app.calls.length, 1)
  requests[0].resolve(timetable())
  await tick()
  app.render()
  app.advance(30000)
  await tick()
  assert.equal(app.calls.length, 2)
  app.visibility('hidden')
  app.advance(60000)
  assert.equal(app.calls.length, 2)
  requests[1].resolve(timetable(today, 8))
  await tick()
  assert.deepEqual(summary(app.render()), ['2건', '2건'])
  app.visibility('visible')
  await tick()
  assert.equal(app.calls.length, 3)
  app.unmount()
  assert.equal(app.calls[2][2].aborted, true)
  assert.equal(app.timers.size, 0)
  requests[2].resolve(timetable(today, 99))
  await tick()
  const returned = mount({ cache: app.cache, visibility: 'hidden' })
  assert.deepEqual(summary(returned.render()), ['2건', '2건'])
  returned.unmount()
})

test('vacancy refresh preserves cached entries while pending and after a failure', async () => {
  const pending = deferred()
  let reads = 0
  const app = mount({ page: 'Alerts', read: () => ++reads === 1 ? Promise.resolve([vacancy()]) : pending.promise })
  await tick()
  assert.equal(nodes(app.render()).filter((node) => node.type === 'article').length, 1)
  button(app.render(), '새로고침').props.onClick()
  assert.equal(nodes(app.render()).filter((node) => node.type === 'article').length, 1)
  await tick()
  assert.equal(app.calls.length, 2)
  pending.reject(new Error('빈자리 조회 실패'))
  await tick()
  assert.equal(nodes(app.render()).filter((node) => node.type === 'article').length, 1)
  assert.match(text(app.render()), /빈자리 조회 실패/)
  app.unmount()
})


test('a withdrawn vacancy with time remaining can be republished with new conditions', async () => {
  const withdrawn = { ...vacancy(), status: 'WITHDRAWN' }
  const app = mount({ page: 'Alerts', read: async () => [withdrawn] })
  await tick()
  button(app.render(), '다시 발행하기').props.onClick()
  const dialog = find(app.render(), (node) => node.type === 'PublishDialog')
  assert.equal(dialog.props.vacancy.status, 'WITHDRAWN')
  app.unmount()
  const expired = mount({ page: 'Alerts', read: async () => [{ ...withdrawn, availableUntil: '2000-10-19T12:00:00+09:00' }] })
  await tick()
  assert.equal(nodes(expired.render()).some((node) => node.type === 'button' && text(node) === '다시 발행하기'), false)
  expired.unmount()
})
