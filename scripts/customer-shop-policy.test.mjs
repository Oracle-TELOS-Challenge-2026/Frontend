import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import * as model from '../src/model.ts'
import { readStore } from '../src/lib/customer-api.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/pages/customer/ShopDetailPage.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const date = '2099-10-20'
const today = '2099-10-19'
const tick = () => new Promise((resolve) => setImmediate(resolve))
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : []
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree)
function find(tree, predicate) { const found = nodes(tree).find(predicate); assert.ok(found, 'expected rendered element'); return found }
const button = (tree, label) => find(tree, (node) => node.type === 'button' && text(node) === label)

function mount(instantBooking, { requestedDate = date, requestedSlotId = 'vacancy-1' } = {}) {
  const slot = { id: 'vacancy-1', serviceId: 'service-1', service: '젤 네일', startsAt: `${date}T17:00:00+09:00`, price: 30000, originalPrice: 50000, instantBooking }
  const other = { ...slot, id: 'other-slot', startsAt: `${today}T12:00:00+09:00`, instantBooking: true }
  const shop = { id: 'store-1', name: '네일 가게', image: '', category: '네일', services: [], slots: requestedSlotId ? [other] : [slot] }
  const states = [], effects = [], calls = []
  let cursor = 0, changes = 0
  const jsx = (type, props, key) => ({ type, props, key }), exports = {}
  runInContext(compiled, createContext({
    exports, AbortController, Error,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useState(initial) {
          const index = cursor++
          states[index] ??= { value: typeof initial === 'function' ? initial() : initial }
          return [states[index].value, (value) => { states[index].value = typeof value === 'function' ? value(states[index].value) : value }]
        },
        useEffect(setup, deps) {
          const index = cursor++
          if (!states[index]?.deps.every((value, position) => Object.is(value, deps[position]))) effects.push(() => {
            states[index]?.cleanup?.(); states[index] = { deps, cleanup: setup() }
          })
        },
      }
      if (name === 'react-router-dom') return { Link: 'Link', useParams: () => ({ id: shop.id }), useSearchParams: () => [new URLSearchParams({ ...(requestedDate ? { date: requestedDate } : {}), ...(requestedSlotId ? { slotId: requestedSlotId } : {}), waitlistId: 'wait-1' })] }
      if (name === '../../model') return { ...model, todayInSeoul: () => today }
      if (name === '../../lib/customer-api') return {
        readStore: async (...args) => { calls.push({ name: 'readStore', args }); return shop },
        readStoreSlot: async (...args) => { assert.equal(args[1], slot.id); calls.push({ name: 'readStoreSlot', args }); return { ...slot, bookable: true } },
      }
      const child = { '../../components/Icon': 'Icon', '../../components/customer/Price': 'Price', '../../components/customer/WaitlistDialog': 'WaitlistDialog', '../../components/customer/Timetable': 'Timetable', '../../components/customer/ReservationDialog': 'ReservationDialog' }[name]
      if (child) return { [child]: child }
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function render() { cursor = 0; const tree = exports.ShopDetail({ onBookingChanged: () => { changes++ } }); effects.splice(0).forEach((effect) => effect()); return tree }
  render()
  return { render, calls, slot, changes: () => changes, unmount: () => states.forEach((state) => state.cleanup?.()) }
}

function assertStoreRead(app, expectedDate) {
  const call = app.calls.find((item) => item.name === 'readStore')
  assert.equal(call.args.length, readStore.length)
  assert.equal(call.args[0], 'store-1')
  if (readStore.length === 3) assert.equal(call.args[1], expectedDate)
  assert.ok(call.args.at(-1) instanceof AbortSignal)
}

test('manual slots show application policy and refresh their source after the dialog changes', async () => {
  const app = mount(false)
  await tick(); app.render(); await tick()
  assert.equal(app.calls.length, 2)
  assertStoreRead(app, date)
  assert.match(text(app.render()), /사장님 선택/)
  find(app.render(), (node) => node.type === 'button' && /예약 신청$/.test(text(node))).props.onClick()
  const dialog = find(app.render(), (node) => node.type === 'ReservationDialog')
  assert.equal(dialog.props.slot.id, app.slot.id)
  assert.equal(dialog.props.slot.instantBooking, false)
  assert.equal(dialog.props.waitlistId, 'wait-1')
  const previousRead = app.calls.at(-1)
  const initialReads = app.calls.length
  dialog.props.onChanged()
  assert.equal(app.changes(), 1)
  app.render(); await tick()
  assert.equal(app.calls.length, initialReads + 1)
  assert.equal(previousRead.args.at(-1).aborted, true)
  assert.equal(app.calls.at(-1).name, 'readStoreSlot')
  assert.deepEqual(app.calls.at(-1).args.slice(0, 2), previousRead.args.slice(0, 2))
  dialog.props.onClose()
  app.render(); await tick()
  assert.equal(app.calls.length, initialReads + 2)
  assert.equal(nodes(app.render()).some((node) => node.type === 'ReservationDialog'), false)
  app.unmount()
})

test('instant and legacy slots keep the immediate booking label', async () => {
  for (const policy of [true, undefined]) {
    const app = mount(policy)
    await tick(); app.render(); await tick()
    assert.match(text(app.render()), /즉시확정/)
    assert.doesNotMatch(text(app.render()), /사장님 선택|예약 신청/)
    assert.equal(app.calls.at(-1).name, 'readStoreSlot')
    button(app.render(), '이 시간 예약하기').props.onClick()
    assert.equal(find(app.render(), (node) => node.type === 'ReservationDialog').props.slot.instantBooking, policy)
    app.unmount()
  }
})

test('a notification without a date books its exact slot instead of a different daily slot', async () => {
  const app = mount(false, { requestedDate: '' })
  await tick(); app.render(); await tick()
  assertStoreRead(app, today)
  assert.equal(app.calls.at(-1).name, 'readStoreSlot')
  assert.equal(app.calls.at(-1).args[1], 'vacancy-1')
  assert.doesNotMatch(text(app.render()), /즉시확정/)
  button(app.render(), '예약 신청').props.onClick()
  const dialog = find(app.render(), (node) => node.type === 'ReservationDialog')
  assert.equal(dialog.props.slot.id, 'vacancy-1')
  assert.equal(dialog.props.slot.startsAt, `${date}T17:00:00+09:00`)
  assert.equal(dialog.props.waitlistId, 'wait-1')
  app.unmount()
})

test('unlinked store details retain the date-based policy and refresh the list after applying', async () => {
  const app = mount(false, { requestedSlotId: '' })
  await tick()
  assertStoreRead(app, date)
  assert.equal(app.calls.length, 1)
  if (readStore.length === 2) {
    assert.ok(nodes(app.render()).some((node) => node.type === 'Timetable'))
    assert.equal(nodes(app.render()).some((node) => node.type === 'button' && /예약/.test(text(node))), false)
  } else {
    assert.match(text(app.render()), /사장님 선택/)
    button(app.render(), '17:00 예약 신청').props.onClick()
    const dialog = find(app.render(), (node) => node.type === 'ReservationDialog')
    assert.equal(dialog.props.slot.id, 'vacancy-1')
    dialog.props.onChanged()
    app.render(); await tick()
    assert.equal(app.changes(), 1)
    assert.equal(app.calls.length, 2)
    assert.equal(app.calls[1].name, 'readStore')
    assert.equal(app.calls[1].args[1], date)
  }
  app.unmount()
})
