import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { BackendApiError } from '../src/lib/backend-api.ts'
import { continuesMessageGroup } from '../src/lib/chat.ts'
import * as format from '../src/lib/format.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/pages/ChatPage.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))
const message = (id = 'request-1', content = '내일 17시에 머리자르고 싶어요', sequence = 1, role = 'CUSTOMER', type = 'TEXT') => ({
  id, roomId: 'room-1', sequence, sender: { id: role === 'CUSTOMER' ? 'customer-1' : 'owner-1', role, displayName: role },
  clientMessageId: `client-${id}`, type, content, createdAt: '2026-10-17T10:00:00+09:00',
})
const suggestion = (sourceMessageId = 'request-1', overrides = {}) => ({
  sourceMessageId, sourceContent: '내일 17시에 머리자르고 싶어요', bookingRequested: true,
  date: '2026-10-18', time: '17:00', serviceDescription: '커트', ...overrides,
})
const draft = { service: '커트', startsAt: '2026-10-18T17:00:00+09:00', duration: 30, price: 20000 }

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
const dialog = (tree) => elements(tree).find((node) => node.type === 'BookingProposalDialog')
const proposalButton = (tree) => elements(tree).find((node) => node.type === 'button' && text(node) === '예약 제안 작성')
function noSuggestion(tree) {
  assert.equal(proposalButton(tree), undefined)
  assert.equal(dialog(tree), undefined)
  assert.doesNotMatch(text(tree), /예약 요청이 보여요|예약 의사를 전달했어요/)
}

function mount({ messages = [message()], room: overrides = {}, role = 'owner', analyze = async (_roomId, id) => suggestion(id), send = async () => {}, load = async () => {} } = {}) {
  const slots = [], effects = [], calls = [], loads = [], proposals = [], refreshes = [], sessions = []
  const intervals = new Map()
  let cursor = 0
  let room = {
    id: 'room-1', store: { id: 'store-1', name: '매장', imageUrl: null }, customer: { id: 'customer-1', displayName: '고객' },
    status: 'OPEN', messages, lastMessage: messages.at(-1) ?? null, messagesLoaded: true, outgoing: [],
    lastReadSequence: 0, nextBeforeSequence: null, ...overrides,
  }
  const chat = {
    conversations: [room], loading: false, error: '', realtime: { connected: false, error: '' },
    setActiveRoom() {}, openShopChat: async () => room, readConversation: async () => {}, sendMessage: async () => {},
    loadMessages: async (...args) => { loads.push(args); const changes = await load(...args); if (changes) room = { ...room, ...changes } },
    refreshRooms: async (...args) => { refreshes.push(args) },
    sendProposal: async (...args) => { proposals.push(args); return send(...args) }, confirmProposal: async () => {},
  }
  const props = { chat, role, userId: role === 'owner' ? 'owner-1' : 'customer-1', ownerShop: { id: 'store-1' }, onRefreshSession: async () => { sessions.push(true) } }
  const jsx = (type, props, key) => ({ type, props, key })
  const exports = {}
  runInContext(compiled, createContext({
    exports, Error, AbortController, crypto, queueMicrotask,
    window: {
      setInterval(callback, duration) { const id = Symbol(); intervals.set(id, { callback, duration }); return id },
      clearInterval: (id) => intervals.delete(id),
    },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
      if (name === 'react') return {
        Fragment: 'Fragment',
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
      if (name === 'react-router-dom') return { Link: 'Link', useParams: () => ({ id: role === 'owner' ? 'room-1' : 'store-1' }) }
      if (name === '../lib/chat') return { continuesMessageGroup }
      if (name === '../lib/backend-api') return { BackendApiError }
      if (name === '../lib/chat-suggestion') return {
        getChatBookingSuggestion: (roomId, messageId, signal) => { calls.push({ roomId, messageId, signal }); return analyze(roomId, messageId, signal) },
      }
      if (name === '../lib/format') return format
      if (name.startsWith('../components/')) return new Proxy({}, { get: (_, name) => name })
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function render(changes = {}) {
    room = { ...room, ...changes }
    chat.conversations = [room]
    cursor = 0
    const tree = exports.ChatPage(props)
    effects.splice(0).forEach((effect) => effect())
    return tree
  }
  const updateMessages = (messages) => render({ messages, lastMessage: messages.at(-1) ?? null })
  render()
  return {
    render, updateMessages, calls, loads, proposals, refreshes, sessions,
    poll: () => intervals.forEach(({ callback, duration }) => { if (duration === 5000) callback() }),
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
  }
}

test('analyzes only the latest saved customer TEXT on opening or a new customer message', async () => {
  const first = message()
  const latest = message('request-2', '커트 하고 싶어요', 2)
  const owner = message('owner-1', '확인해 볼게요', 3, 'OWNER')
  const app = mount({ messages: [first, latest, owner] })
  await tick()
  assert.deepEqual(app.calls.map(({ roomId, messageId }) => [roomId, messageId]), [['room-1', 'request-2']])
  app.render()
  app.updateMessages([first, { ...latest }, { ...owner }])
  app.poll()
  await tick()
  app.render()
  app.updateMessages([first, latest, owner, message('owner-2', '날짜 확인 중이에요', 4, 'OWNER')])
  await tick()
  assert.equal(app.calls.length, 1)
  const next = message('request-3', 'ㅎㅇ', 5)
  app.updateMessages([first, latest, owner, next])
  await tick()
  assert.deepEqual(app.calls.map(({ messageId }) => messageId), ['request-2', 'request-3'])
  app.unmount()
})

test('does not analyze temporary outgoing messages, owner messages, proposal cards or incomplete rooms', async () => {
  for (const options of [
    { messages: [], room: { outgoing: [{ clientMessageId: 'temporary', content: '내일 커트', createdAt: '2026-10-17T10:00:00+09:00', error: '' }] } },
    { messages: [message('owner-1', '내일 커트 예약', 1, 'OWNER')] },
    { messages: [message('card-1', '내일 커트 예약', 1, 'CUSTOMER', 'BOOKING_PROPOSAL')] },
    { room: { messagesLoaded: false } },
    { room: { status: 'READ_ONLY' } },
  ]) {
    const app = mount(options)
    await tick()
    assert.equal(app.calls.length, 0)
    noSuggestion(app.render())
    app.unmount()
  }
})

test('loads older pages until the latest customer TEXT is found, then analyzes once and stops paging', async () => {
  const recent = Array.from({ length: 100 }, (_, index) => message(`owner-${index + 201}`, '확인 중이에요', index + 201, 'OWNER'))
  const previous = Array.from({ length: 100 }, (_, index) => message(`owner-${index + 101}`, '예약 안내', index + 101, 'OWNER', index % 2 ? 'TEXT' : 'BOOKING_PROPOSAL'))
  const earlier = [message('older-customer', '내일 예약', 80), message('latest-customer', '내일 17시 커트', 95), message('owner-100', '확인할게요', 100, 'OWNER')]
  const app = mount({ messages: recent, room: { nextBeforeSequence: 201 }, load: async (_room, before) => {
    if (before === 201) return { messages: [...previous, ...recent], nextBeforeSequence: 101 }
    if (before === 101) return { messages: [...earlier, ...previous, ...recent], nextBeforeSequence: 80 }
  } })
  assert.equal(app.calls.length, 0)
  assert.deepEqual(app.loads.filter((args) => args[1] !== undefined), [['room-1', 201]])
  await tick()
  noSuggestion(app.render())
  assert.equal(app.calls.length, 0)
  assert.deepEqual(app.loads.filter((args) => args[1] !== undefined), [['room-1', 201], ['room-1', 101]])
  await tick()
  app.render()
  await tick()
  assert.ok(proposalButton(app.render()))
  assert.deepEqual(app.calls.map(({ roomId, messageId }) => [roomId, messageId]), [['room-1', 'latest-customer']])
  app.poll()
  await tick()
  app.render()
  assert.equal(app.calls.length, 1)
  assert.deepEqual(app.loads.filter((args) => args[1] !== undefined), [['room-1', 201], ['room-1', 101]])
  app.unmount()
})

test('a new customer message in the room summary hides the old review until message history catches up', async () => {
  const app = mount()
  await tick()
  button(app.render(), '예약 제안 작성').props.onClick()
  assert.ok(dialog(app.render()))
  const next = message('request-2', '모레 커트', 2)
  noSuggestion(app.render({ lastMessage: next }))
  await tick()
  noSuggestion(app.render())
  assert.deepEqual(app.calls.map(({ messageId }) => messageId), ['request-1', 'request-2'])
  app.updateMessages([message(), next])
  assert.ok(proposalButton(app.render()))
  assert.equal(dialog(app.render()), undefined)
  assert.equal(app.calls.length, 2)
  app.unmount()
})

test('loading, non-booking answers and analysis failures never imply a confirmed booking intent', async () => {
  for (const role of ['owner', 'customer']) {
    for (const fails of [false, true]) {
      const pending = deferred()
      const app = mount({ role, analyze: () => pending.promise })
      noSuggestion(app.render())
      if (fails) pending.reject(new BackendApiError(503, 'CHAT_BOOKING_ANALYSIS_UNAVAILABLE', '분석을 사용할 수 없어요'))
      else pending.resolve(suggestion('request-1', { bookingRequested: false, date: null, time: null, serviceDescription: null }))
      await tick()
      const tree = app.render()
      noSuggestion(tree)
      if (fails) assert.match(text(tree), /분석을 사용할 수 없어요/)
      assert.match(text(tree), /내일 17시에 머리자르고 싶어요/)
      app.unmount()
    }
  }
})

test('opening and reopening a proposal preserves the C-08 source, nullable draft and C-06 source ID', async () => {
  const result = suggestion('request-1', { sourceContent: '서버에 저장된 원문: 커트만 원해요', date: null, time: null, serviceDescription: '커트' })
  const app = mount({ analyze: async () => result })
  await tick()
  button(app.render(), '예약 제안 작성').props.onClick()
  let review = dialog(app.render())
  assert.ok(review)
  assert.equal(review.props.source.id, result.sourceMessageId)
  assert.equal(review.props.source.content, result.sourceContent)
  assert.equal(review.props.initial.date, null)
  assert.equal(review.props.initial.time, null)
  assert.equal(review.props.initial.serviceDescription, '커트')
  review.props.onClose()
  assert.equal(dialog(app.render()), undefined)
  app.updateMessages([message(), message('owner-1', '어떤 시간 원하세요?', 2, 'OWNER')])
  button(app.render(), '예약 제안 작성').props.onClick()
  review = dialog(app.render())
  assert.equal(review.props.source.id, result.sourceMessageId)
  assert.equal(review.props.source.content, result.sourceContent)
  await review.props.onSend('catalog-cut', draft, 'proposal-key')
  assert.deepEqual(app.proposals, [['room-1', 'request-1', 'catalog-cut', draft, 'proposal-key']])
  assert.equal(app.calls.length, 1)
  app.unmount()
})

test('a new customer message immediately invalidates an open proposal without changing its captured C-06 source', async () => {
  const next = deferred()
  const app = mount({ analyze: async (_room, id) => id === 'request-1' ? suggestion() : next.promise })
  await tick()
  button(app.render(), '예약 제안 작성').props.onClick()
  const oldReview = dialog(app.render())
  assert.ok(oldReview)
  const newer = message('request-2', 'ㅎㅇ', 2)
  noSuggestion(app.updateMessages([message(), newer]))
  await oldReview.props.onSend('catalog-cut', draft, 'old-proposal-key').catch(() => {})
  assert.deepEqual(app.proposals, [['room-1', 'request-1', 'catalog-cut', draft, 'old-proposal-key']])
  next.resolve(suggestion('request-2', { sourceContent: 'ㅎㅇ', bookingRequested: false, date: null, time: null, serviceDescription: null }))
  await tick()
  noSuggestion(app.render())
  assert.equal(app.proposals.length, 1)
  app.unmount()
})

test('late analysis responses cannot revive an earlier message or replace the current source', async () => {
  const previous = deferred(), current = deferred()
  const app = mount({ analyze: (_room, id) => id === 'request-1' ? previous.promise : current.promise })
  const nextMessage = message('request-2', '모레 커트 받고 싶어요', 2)
  app.updateMessages([message(), nextMessage])
  await tick()
  assert.equal(app.calls[0].signal.aborted, true)
  current.resolve(suggestion('request-2', { sourceContent: nextMessage.content, date: '2026-10-19', time: null }))
  await tick()
  button(app.render(), '예약 제안 작성').props.onClick()
  assert.equal(dialog(app.render()).props.source.id, 'request-2')
  previous.resolve(suggestion('request-1'))
  await tick()
  const review = dialog(app.render())
  assert.equal(review.props.source.id, 'request-2')
  assert.equal(review.props.source.content, nextMessage.content)
  assert.equal(review.props.initial.date, '2026-10-19')
  assert.equal(review.props.initial.time, null)
  app.unmount()
  assert.equal(app.calls[1].signal.aborted, true)
})

test('an analysis response for a different source message never exposes the proposal action', async () => {
  const app = mount({ analyze: async () => suggestion('different-message') })
  await tick()
  noSuggestion(app.render())
  app.unmount()
})

test('analysis and proposal conflicts invalidate review and reload current messages and room state', async () => {
  for (const code of ['PROPOSAL_SOURCE_OUTDATED', 'ROOM_READ_ONLY']) {
    for (const during of ['analysis', 'proposal']) {
      const conflict = new BackendApiError(409, code, '요청 상태가 바뀌었어요')
      const pending = deferred()
      const app = mount({ analyze: during === 'analysis' ? () => pending.promise : async () => suggestion(), send: async () => { throw conflict } })
      await tick()
      const beforeLoads = app.loads.length
      const beforeRefreshes = app.refreshes.length
      if (during === 'analysis') pending.reject(conflict)
      else {
        button(app.render(), '예약 제안 작성').props.onClick()
        await dialog(app.render()).props.onSend('catalog-cut', draft, 'proposal-key').catch(() => {})
      }
      await tick()
      noSuggestion(app.render())
      assert.ok(app.loads.length > beforeLoads, `${during}: ${code} should reload messages`)
      assert.ok(app.loads.slice(beforeLoads).some((args) => args[0] === 'room-1' && args[2] === true))
      assert.ok(app.refreshes.length > beforeRefreshes, `${during}: ${code} should refresh rooms`)
      app.unmount()
    }
  }
})

test('failed analysis retries only on request and refreshes expired sessions before analyzing again', async () => {
  for (const status of [401, 403, 503]) {
    let failed = true
    const app = mount({ analyze: async (_room, id) => {
      if (failed) throw new BackendApiError(status, status === 403 ? 'CSRF_INVALID' : 'UNAVAILABLE', '분석 오류')
      return suggestion(id)
    } })
    await tick()
    noSuggestion(app.render())
    app.poll()
    await tick()
    app.render()
    assert.equal(app.calls.length, 1)
    failed = false
    button(app.render(), status === 503 ? '분석 다시 시도' : '로그인 상태 다시 확인').props.onClick()
    await tick()
    app.render()
    await tick()
    assert.ok(proposalButton(app.render()))
    assert.equal(app.calls.length, 2)
    assert.equal(app.sessions.length, status === 503 ? 0 : 1)
    app.unmount()
  }
})
