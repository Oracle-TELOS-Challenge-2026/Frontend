import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { dateLabel, timeLabel, isCalendarDate } from '../src/lib/format.ts'

const compiled = Object.fromEntries(Object.entries({ Timetable: 'components/customer/Timetable', TimetableGrid: 'components/TimetableGrid', ShopDetail: 'pages/customer/ShopDetailPage' }).map(([name, path]) => [name, ts.transpileModule(readFileSync(new URL(`../src/${path}.tsx`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText]))
const today = '2026-10-19', tomorrow = '2026-10-20'
const shop = { id: 'store-a', name: '네일 가게', image: '', category: '네일', services: [] }
const stamp = (time, date = today) => `${date}T${time}:00+09:00`
const range = (start, end) => ({ startAt: stamp(start), endAt: stamp(end) })
const timetable = (changes = {}) => ({ date: today, timezone: 'Asia/Seoul', openingHours: { closed: false, opensAt: '09:00:00', closesAt: '18:00:00' }, busyTimes: [], availableTimes: [], ...changes })
const tick = () => new Promise((resolve) => setImmediate(resolve))
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [] }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree) }
function find(tree, predicate) { const found = nodes(tree).find(predicate); assert.ok(found, 'expected rendered element'); return found }
const button = (tree, label) => find(tree, (node) => node.type === 'button' && (node.props['aria-label'] ?? text(node)) === label)
const blocks = (tree) => nodes(tree).filter((node) => node.props?.className === 'owner-booking customer-booking')
const blockedTimes = (tree) => blocks(tree).map((block) => nodes(block).filter((node) => node.type === 'time').map((node) => node.props.dateTime))
const grid = (tree) => find(tree, (node) => node.props?.className === 'owner-timetable')
const axisLabels = (tree) => nodes(tree).filter((node) => node.props?.className === 'owner-hour').map(text)

function mount({ component = 'Timetable', visibility = 'visible', requestedDate = '', requestedSlotId = '', readSlot = async () => ({ id: requestedSlotId, service: '젤 네일', startsAt: stamp('17:00'), price: 30000, originalPrice: 50000, instantBooking: false, bookable: true }), read = async () => timetable() } = {}) {
  const slots = [], effects = [], timers = new Map(), calls = []
  let cursor = 0, clock = 0, nextTimer = 0, props = { storeId: shop.id, date: today }
  const document = Object.assign(new EventTarget(), { visibilityState: visibility })
  const window = Object.assign(new EventTarget(), {
    setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay, next: clock + delay }); return id },
    clearInterval(id) { timers.delete(id) },
  })
  const jsx = (type, props, key) => typeof type === 'function' ? type(props) : ({ type, props, key }), exports = {}
  const context = {
    exports, AbortController, Error, document, window,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
      if (name === 'react') return {
        useState(initial) {
          const index = cursor++
          slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
          return [slots[index].value, (value) => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
        },
        useEffect(setup, deps) {
          const index = cursor++
          if (!slots[index]?.deps.every((value, position) => Object.is(value, deps[position]))) effects.push(() => {
            slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: setup() }
          })
        },
      }
      if (name === 'react-router-dom') return { Link: 'Link', useParams: () => ({ id: shop.id }), useSearchParams: () => [new URLSearchParams({ date: requestedDate, ...(requestedSlotId ? { slotId: requestedSlotId } : {}) })] }
      if (name === '../../lib/format' || name === '../lib/format') return { dateLabel, timeLabel }
      if (name === '../TimetableGrid') return exports
      if (name === '../../model') return { todayInSeoul: () => today, isCalendarDate, dateLabel, timeLabel }
      if (name === '../../lib/customer-api') return { readStore: async () => shop, readStoreSlot: readSlot, readStoreTimetable(...args) { calls.push(args); return read(...args) } }
      const child = { '../Icon': 'Icon', '../../components/Icon': 'Icon', '../../components/customer/Price': 'Price', '../../components/customer/WaitlistDialog': 'WaitlistDialog', '../../components/customer/Timetable': 'Timetable', '../../components/customer/ReservationDialog': 'ReservationDialog' }[name]
      if (child) return { [child]: child }
      throw new Error(`Unexpected import: ${name}`)
    },
  }
  runInContext(compiled.TimetableGrid, createContext({ ...context }))
  runInContext(compiled[component], createContext({ ...context }))
  function render(changes = {}) { props = { ...props, ...changes }; cursor = 0; const tree = exports[component](props); effects.splice(0).forEach((effect) => effect()); return tree }
  render()
  return {
    render, calls, timers, unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
    visibility(value) { document.visibilityState = value; document.dispatchEvent(new Event('visibilitychange')) },
    event(name) { window.dispatchEvent(new Event(name)) },
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

test('only busy ranges occupy the vertical timetable and available supply stays unblocked', async () => {
  const app = mount({ read: async () => timetable({ busyTimes: [range('10:00', '11:00'), range('11:00', '11:30')], availableTimes: [range('09:30', '10:30'), range('11:30', '12:00'), range('12:00', '12:30')] }) })
  await tick()
  const tree = app.render()
  assert.deepEqual(blockedTimes(tree), [[stamp('10:00'), stamp('11:00')], [stamp('11:00'), stamp('11:30')]])
  assert.equal(grid(tree).props.style.height, 648)
  assert.equal(axisLabels(tree)[0], '09:00')
  assert.equal(axisLabels(tree).at(-1), '18:00')
  assert.ok(blocks(tree).every((node) => node.type === 'div' && /예약 불가/.test(node.props['aria-label'])))
  assert.ok(nodes(grid(tree)).every((node) => !node.props.onClick && !['button', 'input', 'a', 'Link'].includes(node.type) && node.props.role !== 'button' && node.props.tabIndex === undefined))
  assert.equal(nodes(tree).some((node) => node.type === 'button' && /예약|신청/.test(text(node))), false)
  app.unmount()
})

test('public timetable blocks never expose customer or reservation metadata', async () => {
  const privateValues = ['private-reservation-123', 'private-customer-456', '비공개고객', '010-1234-9876', '비공개시술', 'private-slot-789']
  const app = mount({ read: async () => timetable({ busyTimes: [{ ...range('10:00', '11:00'), id: privateValues[0], customer: { id: privateValues[1], displayName: privateValues[2], phone: privateValues[3] }, service: { name: privateValues[4] }, slotId: privateValues[5] }] }) })
  await tick()
  const tree = app.render()
  assert.equal(blocks(tree).length, 1)
  for (const value of privateValues) assert.equal(JSON.stringify(tree).includes(value), false)
  assert.equal(blocks(tree)[0].props['aria-label'], '10:00 ~ 11:00 예약 불가')
  app.unmount()
})

test('the public axis follows exact opening minutes and remains visible without registered supply', async () => {
  let data = timetable({ openingHours: { closed: false, opensAt: '10:30', closesAt: '18:45' }, busyTimes: [range('10:45', '11:15')] })
  const app = mount({ read: async () => data })
  await tick()
  assert.equal(grid(app.render()).props.style.height, 594)
  assert.equal(axisLabels(app.render())[0], '10:30')
  assert.equal(axisLabels(app.render()).at(-1), '18:45')
  assert.equal(blocks(app.render())[0].props.style.top, 21)
  assert.equal(blocks(app.render())[0].props.style.height, 30)
  data = timetable({ openingHours: { closed: false, opensAt: '13:15', closesAt: '13:45' } })
  button(app.render(), '시간표 새로고침').props.onClick(); app.render(); await tick()
  assert.equal(grid(app.render()).props.style.height, 36)
  assert.deepEqual(axisLabels(app.render()), ['13:15', '13:45'])
  assert.deepEqual(blockedTimes(app.render()), [])
  app.unmount()
})

test('closed days show no invented hours and still display separately registered schedules', async () => {
  let data = timetable({ openingHours: { closed: true, opensAt: null, closesAt: null } })
  const app = mount({ read: async () => data })
  await tick()
  assert.deepEqual(blockedTimes(app.render()), [])
  assert.equal(nodes(app.render()).some((node) => node.props?.className === 'owner-timetable'), false)
  assert.match(text(app.render()), /정기 휴무일/)
  data = { ...data, busyTimes: [range('10:00', '11:00')], availableTimes: [range('12:00', '13:00')] }
  button(app.render(), '시간표 새로고침').props.onClick(); app.render(); await tick()
  assert.deepEqual(blockedTimes(app.render()), [[stamp('10:00'), stamp('11:00')]])
  assert.equal(grid(app.render()).props.style.height, 72)
  assert.deepEqual(axisLabels(app.render()), ['10:00', '11:00'])
  assert.match(text(app.render()), /별도로 등록된 일정/)
  app.unmount()
})

test('the thirty-second refresh removes canceled bookings and keeps published availability unblocked', async () => {
  let data = timetable({ busyTimes: [range('10:00', '11:00')], availableTimes: [range('11:00', '12:00')] })
  const app = mount({ read: async () => data })
  await tick()
  assert.equal(blocks(app.render()).length, 1)
  data = timetable({ availableTimes: [range('10:00', '12:00')] })
  app.advance(29999); assert.equal(app.calls.length, 1)
  app.advance(1); await tick()
  assert.equal(app.calls.length, 2)
  assert.deepEqual(blockedTimes(app.render()), [])
  assert.equal(grid(app.render()).props.style.height, 648)
  app.unmount()
})

test('hidden tabs pause polling, returning resumes once, and aborted responses cannot replace data', async () => {
  const requests = []
  const app = mount({ visibility: 'hidden', read: () => { const request = deferred(); requests.push(request); return request.promise } })
  app.advance(60000); assert.equal(app.calls.length, 0)
  app.visibility('visible'); app.advance(60000); app.event('focus'); app.event('online')
  assert.equal(app.calls.length, 1)
  requests[0].resolve(timetable()); await tick()
  const initial = blockedTimes(app.render())
  app.advance(30000); assert.equal(app.calls.length, 2)
  app.visibility('hidden'); assert.equal(app.calls[1][2].aborted, true)
  app.advance(60000); assert.equal(app.calls.length, 2)
  app.visibility('visible'); assert.equal(app.calls.length, 3)
  requests[1].resolve(timetable({ busyTimes: [range('09:00', '18:00')] })); await tick()
  assert.deepEqual(blockedTimes(app.render()), initial)
  app.event('focus'); assert.equal(app.calls.length, 3)
  app.unmount(); assert.equal(app.calls[2][2].aborted, true); assert.equal(app.timers.size, 0)
  requests[2].resolve(timetable({ busyTimes: [range('09:00', '18:00')] })); await tick()
  assert.deepEqual(blockedTimes(app.render()), initial)
  app.event('online'); assert.equal(app.calls.length, 3)
})

test('changing dates or stores aborts old requests and ignores their late responses', async () => {
  const requests = []
  const app = mount({ read: () => { const request = deferred(); requests.push(request); return request.promise } })
  app.render({ date: tomorrow }); app.render({ storeId: 'store-b' })
  assert.deepEqual(app.calls.map(([storeId, date]) => [storeId, date]), [[shop.id, today], [shop.id, tomorrow], ['store-b', tomorrow]])
  assert.ok(app.calls.slice(0, 2).every((call) => call[2].aborted))
  requests[2].resolve(timetable({ date: tomorrow, openingHours: { closed: true, opensAt: null, closesAt: null } })); await tick()
  for (const request of requests.slice(0, 2)) request.resolve(timetable())
  await tick()
  assert.deepEqual(blockedTimes(app.render()), [])
  assert.match(text(app.render()), /정기 휴무일/)
  app.unmount()
})

test('refresh errors retain prior data with a stale warning and manual refresh recovers', async () => {
  let read = async () => timetable({ busyTimes: [range('10:00', '11:00')] })
  const app = mount({ read: (...args) => read(...args) })
  await tick()
  const initial = blockedTimes(app.render())
  read = async () => { throw new Error('네트워크 오류') }
  app.advance(30000); await tick()
  assert.deepEqual(blockedTimes(app.render()), initial)
  assert.match(text(find(app.render(), (node) => node.props?.role === 'alert')), /이전 시간표.*네트워크 오류/)
  read = async () => timetable()
  button(app.render(), '시간표 새로고침').props.onClick(); app.render(); await tick()
  assert.equal(app.calls.length, 3)
  assert.deepEqual(blockedTimes(app.render()), [])
  assert.equal(grid(app.render()).props.style.height, 648)
  assert.equal(nodes(app.render()).some((node) => node.props?.role === 'alert'), false)
  app.unmount()
})

test('shop details are read-only and pass requested and selected dates to the timetable', async () => {
  const app = mount({ component: 'ShopDetail', requestedDate: tomorrow })
  await tick()
  const timetableNode = () => find(app.render(), (node) => node.type === 'Timetable')
  assert.equal(timetableNode().props.storeId, shop.id)
  assert.equal(timetableNode().props.date, tomorrow)
  const dateInput = () => find(app.render(), (node) => node.type === 'input' && node.props.type === 'date')
  dateInput().props.onChange({ target: { value: today } }); assert.equal(timetableNode().props.date, today)
  for (const value of ['', '2026-10-18', '2026-02-30']) { dateInput().props.onChange({ target: { value } }); assert.equal(timetableNode().props.date, today) }
  assert.equal(nodes(app.render()).some((node) => node.type === 'ReservationDialog' || node.type === 'input' && node.props.type === 'radio' || node.type === 'button' && /예약/.test(text(node))), false)
  button(app.render(), '빈자리 알림').props.onClick()
  assert.equal(find(app.render(), (node) => node.type === 'WaitlistDialog').props.date, today)
  app.unmount()
})

test('a selected vacancy has its own application entry without making the timetable bookable', async () => {
  const app = mount({ component: 'ShopDetail', requestedSlotId: 'vacancy-1' })
  await tick(); app.render(); await tick()
  assert.match(text(app.render()), /사장님 선택/)
  button(app.render(), '예약 신청').props.onClick()
  assert.equal(find(app.render(), (node) => node.type === 'ReservationDialog').props.slot.instantBooking, false)
  assert.equal(find(app.render(), (node) => node.type === 'Timetable').props.onSelect, undefined)
  app.unmount()
})
