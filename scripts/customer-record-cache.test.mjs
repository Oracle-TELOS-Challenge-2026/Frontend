import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import * as model from '../src/model.ts'
import { CATEGORY_LABELS } from '../src/data/categories.ts'
import { BackendApiError } from '../src/lib/backend-api.ts'

const pages = ['Waitlist', 'Reservations']
const compiled = Object.fromEntries(pages.map((page) => [page, ts.transpileModule(readFileSync(new URL(`../src/pages/customer/${page}Page.tsx`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText]))
const tick = () => new Promise((resolve) => setImmediate(resolve))
const scopes = ['UPCOMING', 'PAST', 'CANCELED']
const wait = { id: 'record-a', version: 1, status: 'ACTIVE', availability: 'WAITING', offers: [], store: { id: 'store-a', name: '저장된 가게' }, createdAt: '2099-10-19T09:00:00+09:00', conditions: { category: 'NAIL', windowStart: '2099-10-20T17:00:00+09:00', windowEnd: '2099-10-20T20:00:00+09:00' } }
const reservation = { id: 'record-a', status: 'CONFIRMED', shopId: 'store-a', shopName: '저장된 가게', service: '젤 네일', startsAt: '2099-10-20T17:00:00+09:00', endsAt: '2099-10-20T18:00:00+09:00', duration: 60, price: 30000, originalPrice: 30000, allowedActions: ['CANCEL'] }
const records = (page) => page === 'Waitlist' ? [wait] : [[reservation], [], []]
const empty = (page) => page === 'Waitlist' ? [] : [[], [], []]
const select = (page, data, scope) => page === 'Waitlist' ? data : data[scopes.indexOf(scope)]

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
  const found = elements(tree).find((node) => node.type === 'button' && (node.props['aria-label'] ?? text(node)) === name)
  assert.ok(found, `expected button: ${name}`)
  return found
}
const cards = (tree) => elements(tree).filter((node) => node.type === 'article').length
const loading = (tree) => elements(tree).some((node) => node.type === 'LoadingIndicator')

function mount({ page, id, cache = new Map(), mutate = async () => {}, read = async (_kind, scope) => select(page, records(page), scope) } = {}) {
  const slots = [], effects = [], calls = [], mutations = []
  let cursor = 0
  let props = { cache, revision: 0, refreshKey: '' }
  const jsx = (type, props, key) => ({ type, props, key })
  const exports = {}
  const invoke = (kind, scope, signal) => { calls.push({ kind, scope, signal }); return read(kind, scope, signal) }
  runInContext(compiled[page], createContext({
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
      if (name === 'react-router-dom') return { Link: 'Link', useParams: () => ({ id }), useSearchParams: () => [new URLSearchParams()] }
      if (name === '../../model') return model
      if (name === '../../data/categories') return { CATEGORY_LABELS }
      if (name === '../../lib/backend-api') return { BackendApiError }
      if (name === '../../lib/customer-api') return {
        readWaitlist: (signal) => invoke('list', undefined, signal),
        readWaitlistItem: (id, signal) => invoke('detail', id, signal),
        readReservations: (scope, signal) => invoke('list', scope, signal),
        readReservation: (id, signal) => invoke('detail', id, signal),
        cancelWaitlist: async (...args) => { mutations.push(args) },
        cancelReservation: async (...args) => { mutations.push(args); return mutate(...args) },
      }
      if (name.startsWith('../../components/')) return new Proxy({}, { get: (_, name) => name })
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function render(next = {}) {
    props = { ...props, ...next }; cursor = 0
    const tree = exports[`${page}Page`](props)
    effects.splice(0).forEach((effect) => effect())
    return tree
  }
  render()
  return { render, calls, mutations, cache, unmount: () => slots.forEach((slot) => slot?.cleanup?.()) }
}

test('initial record requests show a loader, while reloads keep the loaded records until new data arrives', async () => {
  for (const page of pages) {
    let pending = deferred()
    const app = mount({ page, read: async (_kind, scope) => select(page, await pending.promise, scope) })
    assert.equal(loading(app.render()), true, page)
    pending.resolve(records(page))
    await tick()
    assert.equal(loading(app.render()), false, page)
    assert.equal(cards(app.render()), 1, page)
    pending = deferred()
    button(app.render(), '새로고침').props.onClick()
    assert.equal(cards(app.render()), 1, page)
    assert.equal(loading(app.render()), false, page)
    pending.resolve(empty(page))
    await tick()
    assert.equal(cards(app.render()), 0, page)
    assert.equal(loading(app.render()), false, page)
    app.unmount()
  }
})

test('manual refresh replaces an unfinished automatic request and ignores its late cached records', async () => {
  for (const page of pages) {
    for (const id of [undefined, 'record-a']) {
      const previous = deferred(), latest = deferred()
      let pending = previous
      const key = id ? `detail:${id}` : 'list'
      const updated = page === 'Waitlist' ? { ...wait, status: 'CANCELED', availability: 'CLOSED' } : { ...reservation, status: 'CANCELED', allowedActions: [] }
      const updatedRecords = id ? page === 'Waitlist' ? [updated] : [[], [], [updated]] : empty(page)
      const app = mount({ page, id, cache: new Map([[key, records(page)]]), read: async (kind, scope) => {
        const data = await pending.promise
        return kind === 'detail' ? data : select(page, data, scope)
      } })
      const refresh = button(app.render(), '새로고침')
      assert.notEqual(refresh.props.disabled, true, `${page}: refresh must stay clickable during revalidation`)
      assert.equal(refresh.props['aria-busy'], true)
      const previousCalls = [...app.calls]
      pending = latest
      refresh.props.onClick(); app.render()
      assert.equal(app.calls.length, previousCalls.length * 2)
      assert.ok(previousCalls.every((call) => call.signal.aborted))
      latest.resolve(id ? updated : updatedRecords); await tick()
      assert.equal(button(app.render(), '새로고침').props['aria-busy'], false)
      assert.deepEqual(JSON.parse(JSON.stringify(app.cache.get(key))), updatedRecords)
      assert.equal(cards(app.render()), id ? 1 : 0)
      if (id) assert.match(text(app.render()), page === 'Waitlist' ? /대기 종료/ : /예약 취소/)
      previous.resolve(id ? page === 'Waitlist' ? wait : reservation : records(page)); await tick()
      assert.deepEqual(JSON.parse(JSON.stringify(app.cache.get(key))), updatedRecords)
      app.unmount()
    }
  }
})

test('pending applications stay upcoming without counting as confirmed and expose withdrawal instead of cancellation', async () => {
  let item = { ...reservation, status: 'PENDING', version: 3 }
  const app = mount({ page: 'Reservations', id: item.id, read: async () => item, mutate: async () => { item = { ...item, status: 'WITHDRAWN', allowedActions: [] } } })
  await tick()
  const before = text(app.render())
  assert.match(before, /사장님 확인 대기/)
  assert.match(before, /예약 확정 0건/)
  assert.match(before, /다가오는 예약·신청/)
  button(app.render(), '신청 철회').props.onClick()
  assert.match(text(app.render()), /빈자리 알림 대기는 유지돼요/)
  button(app.render(), '신청 철회하기').props.onClick()
  await tick(); app.render(); await tick()
  assert.equal(app.mutations[0][0].status, 'PENDING')
  assert.equal(app.mutations[0][0].version, 3)
  assert.match(text(app.render()), /취소·종료한 예약/)
  assert.match(text(app.render()), /신청 철회/)
  assert.doesNotMatch(text(app.render()), /다가오는 예약·신청/)
  app.unmount()
})

test('rejected, withdrawn and expired details render in closed records with distinct labels', async () => {
  for (const [status, label] of [['REJECTED', '신청 마감'], ['WITHDRAWN', '신청 철회'], ['EXPIRED', '신청 만료']]) {
    const app = mount({ page: 'Reservations', id: reservation.id, read: async () => ({ ...reservation, status, allowedActions: [] }) })
    await tick()
    assert.match(text(app.render()), /취소·종료한 예약/)
    assert.ok(text(app.render()).includes(label))
    assert.doesNotMatch(text(app.render()), /다가오는 예약·신청/)
    app.unmount()
  }
})

test('withdrawal conflict refreshes server state and prevents another stale action', async () => {
  let item = { ...reservation, status: 'PENDING' }
  const cache = new Map([['list', [[item], [], []]], [`detail:${item.id}`, [[item], [], []]]])
  const app = mount({ page: 'Reservations', cache, id: item.id, read: async () => item, mutate: async () => {
    item = { ...item, status: 'CONFIRMED' }
    throw new BackendApiError(409, 'VERSION_CONFLICT', '이미 선택된 신청이에요.')
  } })
  await tick()
  button(app.render(), '신청 철회').props.onClick()
  button(app.render(), '신청 철회하기').props.onClick()
  await tick()
  assert.equal(cache.has('list'), false)
  app.render(); await tick()
  assert.equal(app.calls.length, 2)
  assert.equal(button(app.render(), '신청 철회하기').props.disabled, true)
  assert.match(text(app.render()), /이미 선택된 신청이에요/)
  app.unmount()
})

test('notification revalidation retains cached records on failure and clears the error after retry', async () => {
  for (const page of pages) {
    let pending = deferred()
    const app = mount({ page, cache: new Map([['list', records(page)]]), read: async (_kind, scope) => select(page, await pending.promise, scope) })
    pending.resolve(records(page))
    await tick()
    pending = deferred()
    app.render({ revision: 1, refreshKey: 'notification-a' })
    assert.equal(cards(app.render()), 1, page)
    assert.equal(loading(app.render()), false, page)
    pending.reject(new Error('기록 조회 실패'))
    await tick()
    assert.equal(cards(app.render()), 1, page)
    assert.match(text(app.render()), /기록 조회 실패/, page)
    pending = deferred()
    button(app.render(), '다시 시도').props.onClick()
    app.render()
    pending.resolve(records(page))
    await tick()
    assert.equal(cards(app.render()), 1, page)
    assert.doesNotMatch(text(app.render()), /기록 조회 실패/, page)
    app.unmount()
  }
})

test('cached empty lists remain empty without a loader during revalidation and failed requests', async () => {
  for (const page of pages) {
    const pending = deferred()
    const app = mount({ page, cache: new Map([['list', empty(page)]]), read: async () => pending.promise })
    assert.equal(loading(app.render()), false, page)
    assert.equal(cards(app.render()), 0, page)
    assert.match(text(app.render()), page === 'Waitlist' ? /기다리는 빈자리가 없어요/ : /아직 다가오는 예약이 없어요/, page)
    pending.reject(new Error('빈 목록 갱신 실패'))
    await tick()
    assert.equal(loading(app.render()), false, page)
    assert.equal(cards(app.render()), 0, page)
    assert.match(text(app.render()), /빈 목록 갱신 실패/, page)
    app.unmount()
  }
})

test('route caches separate lists, details and accounts, and discard records that are no longer accessible', async () => {
  for (const page of pages) {
    const app = mount({ page })
    await tick()
    assert.equal(cards(app.render()), 1, page)
    app.unmount()
    const pending = deferred()
    const returned = mount({ page, cache: app.cache, read: async () => pending.promise })
    assert.equal(cards(returned.render()), 1, page)
    assert.equal(loading(returned.render()), false, page)
    returned.unmount()
    const detail = mount({ page, id: 'record-b', cache: app.cache, read: async () => pending.promise })
    assert.equal(cards(detail.render()), 0, page)
    assert.equal(loading(detail.render()), true, page)
    detail.unmount()
    const cachedDetail = mount({ page, id: 'record-a', cache: new Map([['detail:record-a', records(page)]]), read: async () => pending.promise })
    assert.equal(cards(cachedDetail.render()), 1, page)
    assert.equal(loading(cachedDetail.render()), false, page)
    cachedDetail.unmount()
    const otherAccount = mount({ page, cache: new Map(), read: async () => pending.promise })
    assert.equal(cards(otherAccount.render()), 0, page)
    assert.equal(loading(otherAccount.render()), true, page)
    otherAccount.unmount()
    for (const status of [401, 403, 404]) {
      const cache = new Map([['list', records(page)], ['detail:record-a', records(page)]])
      const denied = mount({ page, id: 'record-a', cache, read: async () => { throw new BackendApiError(status, 'NOT_ACCESSIBLE', '기록 접근 불가') } })
      assert.equal(cards(denied.render()), 1, page)
      await tick()
      assert.equal(cards(denied.render()), 0, page)
      assert.equal(loading(denied.render()), false, page)
      assert.equal(cache.has('detail:record-a'), false, page)
      assert.equal(cache.has('list'), status === 404, page)
      denied.unmount()
    }
  }
})

test('unmounted requests abort and cannot replace caches with late results or failures', async () => {
  for (const page of pages) {
    for (const reject of [false, true]) {
      const pending = deferred()
      const cached = records(page)
      const app = mount({ page, cache: new Map([['list', cached]]), read: async (_kind, scope) => select(page, await pending.promise, scope) })
      app.unmount()
      assert.ok(app.calls.every((call) => call.signal.aborted), page)
      if (reject) pending.reject(new Error('이전 화면 오류'))
      else pending.resolve(empty(page))
      await tick()
      assert.equal(app.cache.get('list'), cached, page)
    }
  }
})

test('cancelling cached records during initial revalidation invalidates cache but keeps the current view on reload failure', async () => {
  for (const page of pages) {
    const initial = deferred()
    let pending = initial
    const cache = new Map([['list', records(page)], ['detail:record-a', records(page)]])
    const app = mount({ page, cache, read: async (kind, scope) => {
      if (kind === 'detail') return wait
      return select(page, await pending.promise, scope)
    } })
    assert.equal(cards(app.render()), 1, page)
    assert.equal(loading(app.render()), false, page)
    button(app.render(), page === 'Waitlist' ? '대기 취소' : '예약 취소').props.onClick()
    pending = deferred()
    button(app.render(), page === 'Waitlist' ? '대기 취소하기' : '예약 취소하기').props.onClick()
    await tick()
    assert.equal(app.mutations.length, 1, page)
    assert.equal(cache.has('list'), false, page)
    assert.equal(cache.has('detail:record-a'), false, page)
    assert.equal(cards(app.render()), 1, page)
    assert.equal(loading(app.render()), false, page)
    assert.equal(app.calls[0].signal.aborted, true, page)
    pending.reject(new Error('취소 후 기록 조회 실패'))
    await tick()
    assert.equal(cards(app.render()), 1, page)
    assert.match(text(app.render()), /취소 후 기록 조회 실패/, page)
    initial.resolve(empty(page))
    await tick()
    assert.equal(cards(app.render()), 1, page)
    assert.equal(cache.has('list'), false, page)
    pending = deferred()
    button(app.render(), '다시 시도').props.onClick()
    app.render()
    pending.resolve(empty(page))
    await tick()
    assert.equal(cards(app.render()), 0, page)
    app.unmount()
  }
})
