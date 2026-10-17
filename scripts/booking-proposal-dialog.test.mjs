import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { validateChatBooking } from '../src/lib/chat-booking.ts'
import * as format from '../src/lib/format.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/owner/BookingProposalDialog.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))
const services = [
  { id: 'bleach', name: '탈색', durationMinutes: 120, basePrice: 100000, active: true },
  { id: 'cut', name: '커트', durationMinutes: 30, basePrice: 20000, active: true },
  { id: 'cut-other', name: '커트 다른 옵션', durationMinutes: 30, basePrice: 20000, active: true },
  { id: 'inactive', name: '제공 중지 시술', durationMinutes: 60, basePrice: 50000, active: false },
]

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements)
  return node?.props ? [node, ...elements(node.props.children)] : []
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('')
  if (node?.props) return text(node.props.children)
  return node == null || typeof node === 'boolean' ? '' : String(node)
}
function button(tree, name) {
  const found = elements(tree).find((node) => node.type === 'button' && text(node) === name)
  assert.ok(found, `expected button: ${name}`)
  return found
}
const field = (tree, id) => elements(tree).find((node) => node.props.id === `proposal-${id}`)
const form = (tree) => elements(tree).find((node) => node.type === 'form')

function mount({ initial, read = async () => services, send = async () => {} } = {}) {
  const slots = [], effects = [], calls = [], sent = []
  let cursor = 0, closed = 0
  const props = {
    source: { id: 'customer-message', content: '내일 17시에 머리자르고 싶어요' },
    initial: initial ?? { date: '2099-10-18', time: '17:00', serviceDescription: '커트' },
    shop: { id: 'shop', serviceId: 'bleach', service: '탈색', duration: 120, originalPrice: 100000 },
    onSend: async (...args) => { sent.push(args); await send(...args) },
    onClose: () => { closed++ },
  }
  const jsx = (type, props, key) => ({ type, props, key })
  const exports = {}
  runInContext(compiled, createContext({
    exports, Error, AbortController, crypto,
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
            slots[index]?.cleanup?.()
            slots[index] = { deps, cleanup: setup() }
          })
        },
      }
      if (name === '../Modal') return { Modal: 'Modal' }
      if (name === '../../lib/chat-booking') return { validateChatBooking }
      if (name === '../../lib/format') return format
      if (name === '../../lib/customer-api') return { readStoreServices: (...args) => { calls.push(args); return read(...args) } }
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function render() {
    cursor = 0
    const tree = exports.BookingProposalDialog(props)
    effects.splice(0).forEach((effect) => effect())
    return tree
  }
  function change(id, value) {
    const tree = render()
    field(tree, id).props.onChange({ target: { value } })
    form(tree).props.onChange()
  }
  render()
  return { render, change, calls, sent, closed: () => closed, preview: () => form(render()).props.onSubmit({ preventDefault() {} }), unmount: () => slots.forEach((slot) => slot?.cleanup?.()) }
}

test('AI request text stays distinct from the representative catalog service and nullable fields stay empty', async () => {
  for (const initial of [
    { date: '2099-10-18', time: '17:00', serviceDescription: '커트' },
    { date: null, time: '17:00', serviceDescription: '커트와 두피 케어' },
    { date: '2099-10-18', time: null, serviceDescription: null },
    { date: null, time: null, serviceDescription: null },
  ]) {
    const app = mount({ initial })
    await tick()
    const tree = app.render()
    assert.equal(field(tree, 'service').props.value, initial.serviceDescription ?? '')
    assert.equal(field(tree, 'date').props.value, initial.date ?? '')
    assert.equal(field(tree, 'time').props.value, initial.time ?? '')
    assert.equal(field(tree, 'service-id').props.value, '')
    assert.equal(field(tree, 'duration').props.value, '')
    assert.equal(field(tree, 'price').props.value, '')
    assert.equal(text(elements(tree).find((node) => node.type === 'blockquote')), '내일 17시에 머리자르고 싶어요')
    app.change('service-id', 'cut')
    assert.equal(field(app.render(), 'service').props.value, initial.serviceDescription ?? '')
    assert.equal(field(app.render(), 'duration').props.value, '30')
    assert.equal(field(app.render(), 'price').props.value, '20000')
    app.preview()
    assert.equal(button(app.render(), '예약 제안 보내기').props.disabled, initial.date === null || initial.time === null || initial.serviceDescription === null)
    app.unmount()
  }
})

test('catalog loads with retry, requires an active choice, and rejects missing or inactive service IDs', async () => {
  let pending = deferred()
  const app = mount({ read: () => pending.promise })
  assert.match(text(app.render()), /등록된 시술을 불러오는 중/)
  assert.equal(button(app.render(), '제안 미리보기').props.disabled, true)
  pending.reject(new Error('시술 조회 실패'))
  await tick()
  assert.match(text(app.render()), /시술 조회 실패/)
  pending = deferred()
  button(app.render(), '시술 다시 조회').props.onClick()
  assert.match(text(app.render()), /등록된 시술을 불러오는 중/)
  assert.equal(app.calls.length, 2)
  assert.equal(app.calls[0][1].aborted, true)
  pending.resolve(services)
  await tick()
  assert.equal(app.calls[1][0], 'shop')
  const options = elements(field(app.render(), 'service-id')).filter((node) => node.type === 'option').map((node) => node.props.value)
  assert.deepEqual(options, ['', 'bleach', 'cut', 'cut-other'])
  for (const id of ['', 'inactive', 'invented-id']) {
    app.change('service-id', id)
    app.preview()
    assert.match(text(app.render()), /현재 제공 중인 시술을 선택해 주세요/)
    assert.equal(button(app.render(), '예약 제안 보내기').props.disabled, true)
    button(app.render(), '예약 제안 보내기').props.onClick()
  }
  assert.equal(app.sent.length, 0)
  app.unmount()
})

test('sending preserves edited drafts, retries the same key, and changes the key when the service ID changes', async () => {
  const app = mount({ send: async () => { throw new Error('전송 확인 실패') } })
  await tick()
  app.change('service-id', 'cut')
  app.change('service', '커트와 앞머리 정리')
  app.preview()
  button(app.render(), '예약 제안 보내기').props.onClick()
  await tick()
  assert.match(text(app.render()), /전송 확인 실패/)
  button(app.render(), '예약 제안 보내기').props.onClick()
  await tick()
  assert.equal(app.sent[0][0], 'cut')
  assert.deepEqual(JSON.parse(JSON.stringify(app.sent[0][1])), { service: '커트와 앞머리 정리', startsAt: '2099-10-18T17:00:00+09:00', duration: 30, price: 20000 })
  assert.equal(app.sent[0][2], app.sent[1][2])
  app.change('service-id', 'cut-other')
  assert.equal(button(app.render(), '예약 제안 보내기').props.disabled, true)
  app.preview()
  button(app.render(), '예약 제안 보내기').props.onClick()
  await tick()
  assert.equal(app.sent[2][0], 'cut-other')
  assert.notEqual(app.sent[2][2], app.sent[1][2])
  assert.equal(app.sent[2][1].service, '커트와 앞머리 정리')
  assert.equal(app.closed(), 0)
  app.unmount()
})

test('pending sends cannot duplicate proposals, and catalog requests abort on close', async () => {
  const pending = deferred()
  const app = mount({ send: () => pending.promise })
  await tick()
  app.change('service-id', 'cut')
  app.preview()
  const send = button(app.render(), '예약 제안 보내기')
  send.props.onClick()
  send.props.onClick()
  assert.equal(app.sent.length, 1)
  assert.equal(button(app.render(), '전송 중…').props.disabled, true)
  assert.equal(button(app.render(), '닫기').props.disabled, true)
  pending.resolve()
  await tick()
  assert.equal(app.closed(), 1)
  app.unmount()
  assert.equal(app.calls[0][1].aborted, true)
})
