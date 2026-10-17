import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { dateLabel, timeLabel, isCalendarDate } from '../src/lib/format.ts'

const compiled = Object.fromEntries(Object.entries({ Timetable: 'components/customer/Timetable', ShopDetail: 'pages/customer/ShopDetailPage' }).map(([name, path]) => [name, ts.transpileModule(readFileSync(new URL(`../src/${path}.tsx`, import.meta.url), 'utf8'), {
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
const rows = (tree) => nodes(tree).filter((node) => node.type === 'li').map((row) => [...nodes(row).filter((node) => node.type === 'time').map((node) => node.props.dateTime), text(find(row, (node) => node.type === 'strong'))])
const expectedRow = (start, end, status) => [new Date(stamp(start)).toISOString(), new Date(stamp(end)).toISOString(), status]

function mount({ component = 'Timetable', visibility = 'visible', requestedDate = '', requestedSlotId = '', readSlot = async () => ({ id: requestedSlotId, service: '젤 네일', startsAt: stamp('17:00'), price: 30000, originalPrice: 50000, instantBooking: false, bookable: true }), read = async () => timetable() } = {}) {
  const slots = [], effects = [], timers = new Map(), calls = []
  let cursor = 0, clock = 0, nextTimer = 0, props = { storeId: shop.id, date: today }
  const document = Object.assign(new EventTarget(), { visibilityState: visibility })
  const window = Object.assign(new EventTarget(), {
    setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay, next: clock + delay }); return id },
    clearInterval(id) { timers.delete(id) },
  })
  const jsx = (type, props, key) => ({ type, props, key }), exports = {}
  runInContext(compiled[component], createContext({
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
      if (name === '../../lib/format') return { dateLabel, timeLabel }
      if (name === '../../model') return { todayInSeoul: () => today, isCalendarDate, dateLabel, timeLabel }
      if (name === '../../lib/customer-api') return { readStore: async () => shop, readStoreSlot: readSlot, readStoreTimetable(...args) { calls.push(args); return read(...args) } }
      const child = { '../Icon': 'Icon', '../../components/Icon': 'Icon', '../../components/customer/Price': 'Price', '../../components/customer/WaitlistDialog': 'WaitlistDialog', '../../components/customer/Timetable': 'Timetable', '../../components/customer/ReservationDialog': 'ReservationDialog' }[name]
      if (child) return { [child]: child }
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
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

test('exact ranges merge adjacent states and busy reservations override available supply', async () => {
  const app = mount({ read: async () => timetable({ busyTimes: [range('10:00', '11:00'), range('11:00', '11:30')], availableTimes: [range('09:30', '10:30'), range('11:30', '12:00'), range('12:00', '12:30')] }) })
  await tick()
  assert.deepEqual(rows(app.render()), [expectedRow('09:00', '09:30', '확인 필요'), expectedRow('09:30', '10:00', '예약 가능'), expectedRow('10:00', '11:30', '예약 불가'), expectedRow('11:30', '12:30', '예약 가능'), expectedRow('12:30', '18:00', '확인 필요')])
  assert.ok(nodes(app.render()).filter((node) => node.type === 'li').every((node) => !node.props.onClick && !nodes(node).some((child) => ['button', 'input', 'a', 'Link'].includes(child.type))))
  app.unmount()
})

test('closed days show no invented hours and still display separately registered schedules', async () => {
  let data = timetable({ openingHours: { closed: true, opensAt: null, closesAt: null } })
  const app = mount({ read: async () => data })
  await tick()
  assert.deepEqual(rows(app.render()), [])
  assert.match(text(app.render()), /정기 휴무일/)
  data = { ...data, busyTimes: [range('10:00', '11:00')], availableTimes: [range('12:00', '13:00')] }
  button(app.render(), '시간표 새로고침').props.onClick(); app.render(); await tick()
  assert.deepEqual(rows(app.render()), [expectedRow('10:00', '11:00', '예약 불가'), expectedRow('11:00', '12:00', '확인 필요'), expectedRow('12:00', '13:00', '예약 가능')])
  assert.match(text(app.render()), /별도로 등록된 일정/)
  app.unmount()
})

test('the thirty-second refresh reflects canceled reservations and newly published availability', async () => {
  let data = timetable({ busyTimes: [range('10:00', '11:00')], availableTimes: [range('11:00', '12:00')] })
  const app = mount({ read: async () => data })
  await tick()
  assert.ok(rows(app.render()).some((row) => row[2] === '예약 불가'))
  data = timetable({ availableTimes: [range('10:00', '12:00')] })
  app.advance(29999); assert.equal(app.calls.length, 1)
  app.advance(1); await tick()
  assert.equal(app.calls.length, 2)
  assert.deepEqual(rows(app.render()), [expectedRow('09:00', '10:00', '확인 필요'), expectedRow('10:00', '12:00', '예약 가능'), expectedRow('12:00', '18:00', '확인 필요')])
  app.unmount()
})

test('hidden tabs pause polling, returning resumes once, and aborted responses cannot replace data', async () => {
  const requests = []
  const app = mount({ visibility: 'hidden', read: () => { const request = deferred(); requests.push(request); return request.promise } })
  app.advance(60000); assert.equal(app.calls.length, 0)
  app.visibility('visible'); app.advance(60000); app.event('focus'); app.event('online')
  assert.equal(app.calls.length, 1)
  requests[0].resolve(timetable()); await tick()
  const initial = rows(app.render())
  app.advance(30000); assert.equal(app.calls.length, 2)
  app.visibility('hidden'); assert.equal(app.calls[1][2].aborted, true)
  app.advance(60000); assert.equal(app.calls.length, 2)
  app.visibility('visible'); assert.equal(app.calls.length, 3)
  requests[1].resolve(timetable({ busyTimes: [range('09:00', '18:00')] })); await tick()
  assert.deepEqual(rows(app.render()), initial)
  app.event('focus'); assert.equal(app.calls.length, 3)
  app.unmount(); assert.equal(app.calls[2][2].aborted, true); assert.equal(app.timers.size, 0)
  requests[2].resolve(timetable({ availableTimes: [range('09:00', '18:00')] })); await tick()
  assert.deepEqual(rows(app.render()), initial)
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
  assert.deepEqual(rows(app.render()), [])
  assert.match(text(app.render()), /정기 휴무일/)
  app.unmount()
})

test('refresh errors retain prior data with a stale warning and manual refresh recovers', async () => {
  let read = async () => timetable({ busyTimes: [range('10:00', '11:00')] })
  const app = mount({ read: (...args) => read(...args) })
  await tick()
  const initial = rows(app.render())
  read = async () => { throw new Error('네트워크 오류') }
  app.advance(30000); await tick()
  assert.deepEqual(rows(app.render()), initial)
  assert.match(text(find(app.render(), (node) => node.props?.role === 'alert')), /이전 시간표.*네트워크 오류/)
  read = async () => timetable()
  button(app.render(), '시간표 새로고침').props.onClick(); app.render(); await tick()
  assert.equal(app.calls.length, 3)
  assert.deepEqual(rows(app.render()), [expectedRow('09:00', '18:00', '확인 필요')])
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

test('a selected vacancy has its own application entry without making timetable rows bookable', async () => {
  const app = mount({ component: 'ShopDetail', requestedSlotId: 'vacancy-1' })
  await tick(); app.render(); await tick()
  assert.match(text(app.render()), /사장님 선택/)
  button(app.render(), '예약 신청').props.onClick()
  assert.equal(find(app.render(), (node) => node.type === 'ReservationDialog').props.slot.instantBooking, false)
  assert.equal(find(app.render(), (node) => node.type === 'Timetable').props.onSelect, undefined)
  app.unmount()
})
