import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import * as model from '../src/model.ts'
import { BackendApiError } from '../src/lib/backend-api.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/customer/ReservationDialog.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : []
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree)
function button(tree, label) { const result = nodes(tree).find((node) => node.type === 'button' && text(node) === label); assert.ok(result, label); return result }

function mount({ instantBooking = false, reserve = async () => ({ id: 'request-1', status: 'PENDING' }) } = {}) {
  const slots = [], writes = [], navigations = []
  let cursor = 0, prepares = 0, changes = 0, closed = 0
  const jsx = (type, props) => ({ type, props }), exports = {}
  runInContext(compiled, createContext({
    exports, crypto, Error,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, (value) => { slots[index].value = value }] },
        useRef: (current) => slots[cursor++] ??= { current },
      }
      if (name === 'react-router-dom') return { useNavigate: () => (path) => navigations.push(path) }
      if (name === '../../model') return model
      if (name === '../../lib/backend-api') return { BackendApiError }
      if (name === '../../lib/customer-api') return {
        prepareReservation: async () => { prepares++; return { slotId: 'vac-1', expectedPrice: 30000, expectedSlotVersion: 2, waitlistId: 'wait-1' } },
        reserveSlot: async (...args) => { writes.push(args); return reserve(...args) },
      }
      if (name === '../Modal') return { Modal: 'Modal' }
      if (name === './Price') return { Price: 'Price' }
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  return {
    writes, navigations,
    counts: () => ({ prepares, changes, closed }),
    render() { cursor = 0; return exports.ReservationDialog({ shop: { id: 'shop-1', name: '네일 가게' }, slot: { id: 'vac-1', service: '젤 네일', startsAt: '2099-10-20T17:00:00+09:00', price: 30000, originalPrice: 50000, instantBooking }, onClose: () => { closed++ }, onChanged: () => { changes++ } }) },
  }
}

test('owner-selection applications show pending without navigating to a confirmed booking', async () => {
  const app = mount()
  assert.equal(app.render().props.title, '예약 신청 확인')
  assert.match(text(app.render()), /신청만으로 시간을 선점하지 않아요/)
  button(app.render(), '예약 신청').props.onClick()
  await tick()
  assert.equal(app.render().props.title, '사장님 확인 대기')
  assert.match(text(app.render()), /아직 확정된 예약이 아니며/)
  assert.equal(app.navigations.length, 0)
  assert.equal(app.counts().changes, 1)
  button(app.render(), '예약내역 확인').props.onClick()
  assert.deepEqual(app.navigations, ['/customer/reservations/request-1'])
})

test('the response status controls success text and instant booking keeps its confirmation label', async () => {
  for (const instantBooking of [true, false]) {
    const app = mount({ instantBooking, reserve: async () => ({ id: 'confirmed-1', status: 'CONFIRMED' }) })
    button(app.render(), instantBooking === false ? '예약 신청' : '예약 확정하기').props.onClick()
    await tick()
    assert.equal(app.render().props.title, '예약 확정')
    assert.match(text(app.render()), /예약이 확정됐어요/)
  }
})

test('a failed response retries the same prepared body and key, while a conflict refreshes and stops stale retries', async () => {
  let attempts = 0
  const app = mount({ reserve: async () => { if (++attempts === 1) throw new Error('응답 유실'); return { id: 'request-1', status: 'PENDING' } } })
  button(app.render(), '예약 신청').props.onClick()
  button(app.render(), '예약 확인 중…').props.onClick()
  await tick()
  assert.equal(app.writes.length, 1)
  button(app.render(), '예약 신청').props.onClick()
  await tick()
  assert.equal(app.counts().prepares, 1)
  assert.equal(app.writes[0][0], app.writes[1][0])
  assert.equal(app.writes[0][1], app.writes[1][1])
  const conflict = mount({ reserve: async () => { throw new BackendApiError(409, 'RESERVATION_REQUEST_EXISTS', '이미 신청했어요.') } })
  button(conflict.render(), '예약 신청').props.onClick()
  await tick()
  assert.equal(button(conflict.render(), '예약 신청').props.disabled, true)
  assert.equal(conflict.counts().changes, 1)
  assert.match(text(conflict.render()), /이미 신청했어요/)
})
