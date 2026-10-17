import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { discountPrice } from '../src/lib/booking.ts'
import { vacancyPublishInput } from '../src/lib/owner-api.ts'
import { dateLabel, money, timeLabel, todayInSeoul } from '../src/lib/format.ts'

const compiled = Object.fromEntries(['PublishDialog', 'ReservationRequests', 'Schedule'].map((name) => [name, ts.transpileModule(readFileSync(new URL(`../src/components/owner/${name}.tsx`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText]))
const tick = () => new Promise((resolve) => setImmediate(resolve))
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : [] }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree) }
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label)
const service = { id: 'service-1', active: true, name: '네일', basePrice: 50000, durationMinutes: 60 }
const vacancy = { id: 'slot-1', storeId: 'store-1', originalServiceId: service.id, status: 'DRAFT', version: 3, availableFrom: '2099-10-18T10:00:00+09:00', availableUntil: '2099-10-18T12:00:00+09:00' }
const request = (id, slotId, name, createdAt = '2099-10-17T10:00:00+09:00') => ({ id, slotId, createdAt, status: 'PENDING', startAt: vacancy.availableFrom, endAt: '2099-10-18T11:00:00+09:00', customer: { displayName: name }, service, price: { payable: 40000 } })

function mount(name, initialProps, api = {}) {
  const slots = [], effects = []
  let cursor = 0, key = 0, props = initialProps
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const window = new EventTarget()
  const jsx = (type, props, key) => ({ type, props, key }), exports = {}
  runInContext(compiled[name], createContext({
    exports, Error, AbortController, document, window, crypto: { randomUUID: () => `key-${++key}` },
    require(module) {
      if (module === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
      if (module === 'react') return {
        useState(initial) {
          const index = cursor++
          slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
          return [slots[index].value, (value) => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
        },
        useRef: (current) => slots[cursor++] ??= { current },
        useEffect(setup, deps) {
          const index = cursor++
          if (!slots[index]?.deps.every((value, position) => Object.is(value, deps[position]))) effects.push(() => {
            slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: setup() }
          })
        },
      }
      if (module === '../Modal') return { Modal: 'Modal' }
      if (module === '../Icon') return { Icon: 'Icon' }
      if (module === './ReservationDialog') return { OwnerReservationDialog: 'OwnerReservationDialog' }
      if (module === '../../lib/format') return { dateLabel, timeLabel, money, todayInSeoul }
      if (module === '../../lib/booking') return { discountPrice }
      if (module === '../../lib/owner-api') return { vacancyPublishInput, ...api }
      throw new Error(`Unexpected import: ${module}`)
    },
  }))
  return {
    render(next = {}) {
      props = { ...props, ...next }; cursor = 0
      const tree = exports[name === 'Schedule' ? 'OwnerSchedule' : name](props)
      effects.splice(0).forEach((effect) => effect())
      return tree
    },
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
    focus: () => window.dispatchEvent(new Event('focus')),
    visibility(value) { document.visibilityState = value; document.dispatchEvent(new Event('visibilitychange')) },
  }
}

test('publishing includes the selected boolean and retries reuse keys only for unchanged conditions', async () => {
  const calls = [], published = []
  const app = mount('PublishDialog', { vacancy, services: [service], onPublished: (item) => published.push(item), onClose() {} }, {
    async publishVacancy(...args) {
      calls.push(args)
      if (calls.length < 3) throw new Error('결과 확인 실패')
      return { ...vacancy, status: 'PUBLISHED', instantBooking: args[1].instantBooking }
    },
  })
  const submit = () => nodes(app.render()).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  await submit()
  assert.equal(calls[0][1].instantBooking, true)
  assert.equal(calls[0][1].expectedVersion, 3)
  const options = nodes(app.render()).filter((node) => node.type === 'input' && node.props.name === 'booking-policy')
  assert.equal(options[0].props.checked, true)
  options[1].props.onChange()
  await submit()
  assert.equal(calls[1][1].instantBooking, false)
  assert.notEqual(calls[0][2], calls[1][2])
  await submit()
  assert.equal(calls[2][2], calls[1][2])
  assert.equal(calls[2][1], calls[1][1])
  assert.equal(published.length, 1)
  assert.equal(published[0].instantBooking, false)
  app.unmount()
})

test('owner request groups preserve application order and selection refreshes from the server result', async () => {
  const items = [request('a', 'slot-1', '첫 고객'), request('b', 'slot-2', '다른 빈자리'), request('c', 'slot-1', '다음 고객')]
  const reads = [], updates = [], conflicts = []
  let latest = items
  const app = mount('ReservationRequests', { storeId: 'store-1', refreshKey: '0', onUpdated: (item) => updates.push(item), onConflict: () => conflicts.push(true) }, {
    async readOwnerReservationRequests(...args) { reads.push(args); return latest },
  })
  app.render(); await tick()
  const groups = nodes(app.render()).filter((node) => node.type === 'article')
  assert.equal(groups.length, 2)
  assert.deepEqual(nodes(groups[0]).filter((node) => node.type === 'li').map((node) => node.key), ['a', 'c'])
  assert.deepEqual(nodes(groups[1]).filter((node) => node.type === 'li').map((node) => node.key), ['b'])
  nodes(groups[0]).find((node) => node.type === 'button').props.onClick()
  const dialog = nodes(app.render()).find((node) => node.type === 'OwnerReservationDialog')
  assert.equal(dialog.props.reservationId, 'a')
  dialog.props.onConflict()
  assert.equal(conflicts.length, 1)
  app.render({ refreshKey: '1' }); await tick()
  assert.equal(reads.length, 2)
  const confirmed = { ...items[0], status: 'CONFIRMED' }
  dialog.props.onUpdated(confirmed)
  assert.equal(updates[0], confirmed)
  assert.equal(nodes(app.render()).some((node) => node.type === 'OwnerReservationDialog'), false)
  latest = [items[1]]
  app.render({ refreshKey: '2' }); await tick()
  assert.equal(reads.length, 3)
  assert.doesNotMatch(text(app.render()), /첫 고객|다음 고객/)
  button(app.render(), '새로고침').props.onClick()
  app.render(); await tick()
  assert.equal(reads.length, 4)
  app.unmount()
})

test('request refresh cancels stale reads and reloads only when visible', async () => {
  const reads = []
  let resolveFirst
  const first = new Promise((resolve) => { resolveFirst = resolve })
  const app = mount('ReservationRequests', { storeId: 'store-1', refreshKey: '0', onUpdated() {}, onConflict() {} }, {
    readOwnerReservationRequests(...args) { reads.push(args); return reads.length === 1 ? first : Promise.resolve([]) },
  })
  app.render()
  app.render({ refreshKey: '1' }); await tick()
  assert.equal(reads[0][1].aborted, true)
  resolveFirst([request('old', 'slot-1', '이전 신청')]); await tick()
  assert.doesNotMatch(text(app.render()), /이전 신청/)
  app.visibility('hidden'); app.focus(); await tick()
  assert.equal(reads.length, 2)
  app.visibility('visible'); await tick()
  assert.equal(reads.length, 3)
  app.unmount()
})

test('pending and ended requests never occupy the confirmed timetable', () => {
  const statuses = ['PENDING', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'CANCELED', 'NO_SHOW']
  const bookings = statuses.map((status) => ({ ...request(status, 'slot-1', status), status }))
  const app = mount('Schedule', { storeId: 'store-1', bookings, day: '2099-10-18', onUpdated() {} })
  const tree = app.render()
  assert.deepEqual(nodes(tree).filter((node) => node.props.className === 'owner-booking').map((node) => node.key), ['CONFIRMED', 'COMPLETED'])
  assert.doesNotMatch(text(tree), /PENDING|REJECTED|WITHDRAWN|EXPIRED/)
  assert.match(text(tree), /CANCELED.*NO_SHOW/)
  const pendingOnly = app.render({ bookings: [bookings[0]] })
  assert.equal(nodes(pendingOnly).filter((node) => node.props.className === 'owner-booking').length, 0)
  assert.match(text(pendingOnly), /아직 확정된 예약이 없어요/)
  app.unmount()
})
