import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import * as model from '../src/model.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/customer/WaitlistDialog.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))
const original = { id: 'wait-1', version: 1, conditions: {
  storeId: null, category: 'NAIL', serviceId: null, location: { latitude: 37.5, longitude: 127 }, radiusMeters: 2000,
  maxPrice: 50000, keywords: ['네일'], windowStart: '2099-10-20T17:00:00+09:00', windowEnd: '2099-10-20T20:00:00+09:00',
} }

function mount(read) {
  const slots = [], calls = { reads: [], saves: [], saved: 0, closed: 0 }
  let cursor = 0
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  runInContext(compiled, createContext({
    exports, Error, crypto,
    FormData: class extends Map {},
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useState(initial) {
          const index = cursor++
          slots[index] ??= { value: initial }
          return [slots[index].value, (value) => { slots[index].value = value }]
        },
        useRef: (current) => slots[cursor++] ??= { current },
      }
      if (name === '../../model') return model
      if (name === '../../lib/customer-api') return {
        readWaitlistItem: async (id) => { calls.reads.push(id); return read() },
        saveWaitlist: async (...args) => { calls.saves.push(args) },
      }
      if (name === '../Modal') return { Modal: 'Modal' }
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function form() {
    cursor = 0
    return exports.WaitlistDialog({ item: original, onSaved: () => calls.saved++, onClose: () => calls.closed++ }).props.children
  }
  return { calls, form, async submit() {
    form().props.onSubmit({ preventDefault() {}, currentTarget: new Map([
      ['start', '2099-10-20T18:00'], ['end', '2099-10-20T21:00'], ['consent', 'on'],
    ]) })
    await tick()
  } }
}

test('editing a waitlist keeps its latest location and conditions and saves with its latest version', async () => {
  const latest = { ...original, version: 9, conditions: { ...original.conditions,
    location: { latitude: 35.1, longitude: 129 }, radiusMeters: 5000, maxPrice: 80000, keywords: ['젤'],
  } }
  const app = mount(async () => latest)
  await app.submit()
  assert.deepEqual(app.calls.reads, ['wait-1'])
  assert.equal(app.calls.saves.length, 1)
  const [conditions, , item] = app.calls.saves[0]
  assert.deepEqual({ ...conditions }, { ...latest.conditions, windowStart: '2099-10-20T18:00:00+09:00', windowEnd: '2099-10-20T21:00:00+09:00' })
  assert.equal(item, latest)
  assert.equal(app.calls.saved, 1)
  assert.equal(app.calls.closed, 1)
})

test('a latest-waitlist read failure leaves the form open and does not write stale conditions', async () => {
  const app = mount(async () => { throw new Error('대기 신청 조회 실패') })
  await app.submit()
  assert.deepEqual(app.calls.reads, ['wait-1'])
  assert.equal(app.calls.saves.length, 0)
  assert.equal(app.calls.saved, 0)
  assert.equal(app.calls.closed, 0)
  assert.equal(app.form().props.children.find((child) => child?.props?.role === 'alert').props.children, '대기 신청 조회 실패')
  assert.equal(app.form().props.children.at(-1).props.children.at(-1).props.disabled, false)
})
