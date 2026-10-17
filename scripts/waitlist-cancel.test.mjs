import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import * as model from '../src/model.ts'
import { CATEGORY_LABELS } from '../src/data/categories.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/pages/customer/WaitlistPage.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))
const original = { id: 'wait-1', version: 1, status: 'ACTIVE', availability: 'WAITING', offers: [], createdAt: '2099-10-19T09:00:00+09:00', conditions: {
  category: 'NAIL', windowStart: '2099-10-20T17:00:00+09:00', windowEnd: '2099-10-20T20:00:00+09:00',
} }
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements)
  return node?.props ? [node, ...elements(node.props.children)] : []
}

async function mount({ read = async () => original, cancel = async () => {} } = {}) {
  const slots = [], effects = [], calls = { reads: 0, lists: 0, cancels: [] }
  let cursor = 0, key = 0
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  runInContext(compiled, createContext({
    exports, Error, AbortController, crypto: { randomUUID: () => `key-${++key}` },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
      if (name === 'react') return {
        useState(initial) {
          const index = cursor++
          slots[index] ??= { value: initial }
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
      if (name === 'react-router-dom') return { Link: 'Link', useParams: () => ({}), useSearchParams: () => [new URLSearchParams()] }
      if (name === '../../model') return model
      if (name === '../../data/categories') return { CATEGORY_LABELS }
      if (name === '../../lib/customer-api') return {
        readWaitlist: async () => { calls.lists++; return [original] },
        readWaitlistItem: async () => { calls.reads++; return read() },
        cancelWaitlist: async (...args) => { calls.cancels.push(args); await cancel(...args) },
      }
      if (name.startsWith('../../components/')) return new Proxy({}, { get: (_, name) => name })
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function render() {
    cursor = 0
    const nodes = elements(exports.WaitlistPage({}))
    effects.splice(0).forEach((effect) => effect())
    return nodes
  }
  render()
  await tick()
  render().find((node) => node.type === 'button' && node.props.children === '대기 취소').props.onClick()
  return { calls, render, async confirm() {
    render().find((node) => node.type === 'button' && node.props.children === '대기 취소하기').props.onClick()
    await tick()
  } }
}

test('cancel uses the freshly read version and keeps its request key only for retries of that version', async () => {
  let version = 2
  const app = await mount({ read: async () => ({ ...original, version }), cancel: async () => { throw new Error('전송 실패') } })
  await app.confirm()
  await app.confirm()
  version = 3
  await app.confirm()
  assert.equal(app.calls.reads, 3)
  assert.deepEqual(app.calls.cancels.map(([item]) => item.version), [2, 2, 3])
  assert.equal(app.calls.cancels[0][1], app.calls.cancels[1][1])
  assert.notEqual(app.calls.cancels[1][1], app.calls.cancels[2][1])
  assert.equal(app.render().find((node) => node.type === 'Modal').props.title, '빈자리 대기를 취소할까요?')
})

test('an already canceled wait closes and reloads without issuing another write', async () => {
  const app = await mount({ read: async () => ({ ...original, version: 4, status: 'CANCELED' }) })
  await app.confirm()
  assert.equal(app.calls.reads, 1)
  assert.equal(app.calls.cancels.length, 0)
  assert.equal(app.render().some((node) => node.type === 'Modal'), false)
  assert.equal(app.calls.lists, 2)
})

test('a latest-waitlist read failure preserves the cancel dialog and sends no mutation', async () => {
  const app = await mount({ read: async () => { throw new Error('조회 실패') } })
  await app.confirm()
  assert.equal(app.calls.cancels.length, 0)
  assert.equal(app.render().find((node) => node.props.role === 'alert').props.children, '조회 실패')
  assert.equal(app.render().find((node) => node.type === 'button' && node.props.children === '대기 취소하기').props.disabled, false)
})
