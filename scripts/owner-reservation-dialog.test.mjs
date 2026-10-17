import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { BackendApiError } from '../src/lib/backend-api.ts'
import { dateLabel, timeLabel, money } from '../src/lib/format.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/owner/ReservationDialog.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))
const reservation = { id: 'reservation-1', store: { id: 'store-1' }, status: 'CONFIRMED', version: 7, allowedActions: ['CANCEL'], startAt: '2026-10-20T10:00:00+09:00', endAt: '2026-10-20T11:00:00+09:00', customer: { displayName: '고객' }, service: { name: '네일', durationMinutes: 60 }, price: { payable: 50000 } }
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : [] }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree) }
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label)

async function mount({ status = 'CONFIRMED', read, actions = ['CANCEL'], update = async () => ({ ...reservation, status: 'CANCELED' }) } = {}) {
  const slots = [], effects = [], calls = [], updated = [], conflicts = [], reads = []
  let cursor = 0, key = 0
  const jsx = (type, props) => ({ type, props }), exports = {}
  runInContext(compiled, createContext({
    exports, Error, AbortController, crypto: { randomUUID: () => `key-${++key}` },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
      if (name === 'react') return {
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
      if (name === '../../lib/backend-api') return { BackendApiError }
      if (name === '../Modal') return { Modal: 'Modal' }
      if (name === '../../lib/format') return { dateLabel, timeLabel, money }
      if (name === '../../lib/owner-api') return {
        readOwnerReservation: async () => { reads.push(true); return read ? read() : { ...reservation, status, allowedActions: actions } },
        updateOwnerReservationStatus(...args) { calls.push(args); return update(...args) },
      }
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function render() {
    cursor = 0
    const tree = exports.OwnerReservationDialog({ storeId: 'store-1', reservationId: reservation.id, onClose() {}, onUpdated: (item) => updated.push(item), onConflict: () => conflicts.push(true) })
    effects.splice(0).forEach((effect) => effect())
    return tree
  }
  render(); await tick()
  return { render, calls, updated, reads, conflicts, unmount: () => slots.forEach((slot) => slot?.cleanup?.()) }
}

test('owner cancellation requires an allowed action and explicit confirmation', async () => {
  const unavailable = await mount({ actions: [] })
  assert.equal(button(unavailable.render(), '예약 취소'), undefined)
  unavailable.unmount()
  const app = await mount()
  button(app.render(), '예약 취소').props.onClick()
  assert.match(text(app.render()), /예약을 취소할까요/)
  assert.equal(app.calls.length, 0)
  button(app.render(), '돌아가기').props.onClick()
  assert.ok(button(app.render(), '예약 취소'))
  assert.equal(app.calls.length, 0)
  button(app.render(), '예약 취소').props.onClick()
  button(app.render(), '예약 취소 처리').props.onClick(); await tick()
  assert.equal(app.calls[0][0], 'store-1')
  assert.equal(app.calls[0][1].version, 7)
  assert.equal(app.calls[0][2], 'CANCELED')
  assert.equal(app.updated[0].status, 'CANCELED')
  app.unmount()
})

test('pending cancellation prevents duplicate writes and failed requests reuse the same key', async () => {
  let reject, fail = true
  const pending = new Promise((_, no) => { reject = no })
  const app = await mount({ update: () => fail ? pending : Promise.resolve({ ...reservation, status: 'CANCELED' }) })
  button(app.render(), '예약 취소').props.onClick()
  const confirm = button(app.render(), '예약 취소 처리')
  confirm.props.onClick(); confirm.props.onClick()
  assert.equal(app.calls.length, 1)
  assert.equal(button(app.render(), '처리 중…').props.disabled, true)
  reject(new Error('취소 결과 확인 실패')); await tick()
  assert.match(text(app.render()), /취소 결과 확인 실패/)
  assert.equal(app.updated.length, 0)
  fail = false
  button(app.render(), '예약 취소 처리').props.onClick(); await tick()
  assert.equal(app.calls.length, 2)
  assert.equal(app.calls[0][3], app.calls[1][3])
  assert.equal(app.updated.length, 1)
  app.unmount()
})

test('pending requests require explicit approval and never expose completion or no-show', async () => {
  const app = await mount({ status: 'PENDING', actions: ['APPROVE', 'REJECT'], update: async () => ({ ...reservation, status: 'CONFIRMED' }) })
  assert.match(text(app.render()), /사장님 확인 대기/)
  assert.equal(button(app.render(), '시술 완료'), undefined)
  assert.equal(button(app.render(), '노쇼 처리'), undefined)
  button(app.render(), '이 고객 선택').props.onClick()
  assert.match(text(app.render()), /같은 빈자리의 다른 신청은 마감/)
  assert.equal(app.calls.length, 0)
  button(app.render(), '예약 확정').props.onClick(); await tick()
  assert.equal(app.calls[0][2], 'CONFIRMED')
  assert.equal(app.updated[0].status, 'CONFIRMED')
  app.unmount()
})

test('approval conflicts reload current detail and notify the owner list without reporting success', async () => {
  let conflict = false
  const app = await mount({ actions: ['APPROVE', 'REJECT'], read: async () => ({ ...reservation, status: conflict ? 'EXPIRED' : 'PENDING', allowedActions: conflict ? [] : ['APPROVE', 'REJECT'] }), update: async () => { conflict = true; throw new BackendApiError(409, 'RESERVATION_REQUEST_EXPIRED', '신청 시간이 지났어요.') } })
  button(app.render(), '이 고객 선택').props.onClick()
  button(app.render(), '예약 확정').props.onClick(); await tick()
  app.render(); await tick()
  assert.equal(app.reads.length, 2)
  assert.equal(app.conflicts.length, 1)
  assert.equal(app.updated.length, 0)
  assert.match(text(app.render()), /신청 만료/)
  assert.equal(button(app.render(), '이 고객 선택'), undefined)
  app.unmount()
})
