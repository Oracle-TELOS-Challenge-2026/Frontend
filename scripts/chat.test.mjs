import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chatMessagePreview, confirmBookingProposal, connectChatRoom, continuesMessageGroup, createChatRoom, fetchChatMessages, fetchChatRooms, mergeChatMessages, parseChatMessage, parseChatRoom, postBookingProposal, postChatMessage, putChatRead } from '../src/lib/chat.ts'
import { useChat } from '../src/hooks/useChat.ts'

test('chat list previews keep up to 20 characters and append three dots without splitting emoji', () => {
  for (const content of ['', '안녕하세요', '가'.repeat(19), '가'.repeat(20)]) assert.equal(chatMessagePreview(content), content)
  assert.equal(chatMessagePreview('가'.repeat(21)), `${'가'.repeat(20)}...`)
  assert.equal(chatMessagePreview(`${'가'.repeat(19)}👩🏽‍💻`), `${'가'.repeat(19)}👩🏽‍💻`)
  assert.equal(chatMessagePreview(`${'가'.repeat(19)}👩🏽‍💻추가`), `${'가'.repeat(19)}👩🏽‍💻...`)
  assert.equal(chatMessagePreview(`${'가'.repeat(19)}e\u0301추가`), `${'가'.repeat(19)}e\u0301...`)
})

const message = (sequence = 1, sender = 'customer', createdAt = '2026-10-16T23:46:01+09:00') => ({ id: `msg-${sequence}`, roomId: 'room', sequence, sender: { id: sender, role: sender === 'customer' ? 'CUSTOMER' : 'OWNER', displayName: sender }, clientMessageId: `request-${sequence}`, type: 'TEXT', content: `메시지 ${sequence}`, createdAt })
const room = (id = 'room') => ({ id, store: { id: 'shop', name: '가게', imageUrl: null }, customer: { id: 'customer', displayName: '고객' }, status: 'OPEN', lastMessage: null, unreadCount: 0, lastReadSequence: 0, createdAt: '2026-10-16T14:00:00+09:00' })
const response = (data) => new Response(JSON.stringify({ resultType: 'SUCCESS', success: { data }, error: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const bookingMessage = (status = 'PENDING', version = 1) => ({ ...message(2, 'owner'), type: 'BOOKING_PROPOSAL', bookingProposal: { id: 'proposal', sourceMessageId: 'msg-1', serviceId: 'service', serviceDescription: '젤 네일 + 제거', startAt: '2099-10-20T14:00:00+09:00', endAt: '2099-10-20T15:30:00+09:00', durationMinutes: 90, price: 75000, status, version, reservationId: status === 'CONFIRMED' ? 'reservation' : null, waitlistId: null } })

function mockFetch(t, handler) {
  const original = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    assert.match(url, /^\/api\//)
    return handler(new URL(url, 'https://frontend-oracle.vercel.app'), options)
  }
  t.after(() => { globalThis.fetch = original })
}

function captureChat() {
  let chat
  function Capture() {
    chat = useChat('customer')
    return null
  }
  renderToStaticMarkup(createElement(Capture))
  return chat
}

test('only consecutive messages by the same sender in the same absolute minute are grouped', () => {
  const first = message()
  assert.equal(continuesMessageGroup(first, message(2, 'customer', '2026-10-16T23:46:59+09:00')), true)
  assert.equal(continuesMessageGroup(first, message(2, 'customer', '2026-10-16T14:46:59Z')), true)
  assert.equal(continuesMessageGroup(first, message(2, 'owner')), false)
  assert.equal(continuesMessageGroup(first, message(2, 'customer', '2026-10-16T23:47:00+09:00')), false)
  assert.equal(continuesMessageGroup(first, message(2, 'customer', '2026-10-17T23:46:01+09:00')), false)
  assert.equal(continuesMessageGroup(first), false)
})

test('REST response validation rejects invalid sequence, sender, dates and unrelated room messages', () => {
  assert.deepEqual(parseChatMessage(message()), message())
  assert.equal(parseChatRoom(room()).messagesLoaded, false)
  assert.throws(() => parseChatMessage({ ...message(), sequence: 0 }), /응답 형식/)
  assert.throws(() => parseChatMessage({ ...message(), sequence: Number.MAX_SAFE_INTEGER + 1 }), /응답 형식/)
  assert.throws(() => parseChatMessage({ ...message(), sender: { id: 'x', role: 'ADMIN', displayName: 'x' } }), /응답 형식/)
  assert.throws(() => parseChatMessage({ ...message(), createdAt: 'invalid' }), /응답 형식/)
  assert.throws(() => parseChatMessage({ ...message(), type: 'UNKNOWN' }), /응답 형식/)
  assert.throws(() => parseChatRoom({ ...room(), lastMessage: { ...message(), roomId: 'another-room' } }), /응답 형식/)
})

test('server booking proposal messages remain readable in history and room previews', async (t) => {
  const proposal = {
    ...message(2, 'owner'), type: 'BOOKING_PROPOSAL', content: '예약 제안: 젤 네일 + 제거',
    bookingProposal: { id: 'proposal', sourceMessageId: 'msg-1', serviceId: 'service', serviceDescription: '젤 네일 + 제거', startAt: '2026-10-20T14:00:00+09:00', endAt: '2026-10-20T15:30:00+09:00', durationMinutes: 90, price: 75000, status: 'PENDING', version: 1, reservationId: null, waitlistId: null },
  }
  mockFetch(t, (url) => response(url.pathname.endsWith('/messages')
    ? { items: [message(), proposal], page: { hasOlder: false, nextBeforeSequence: null } }
    : { items: [{ ...room(), lastMessage: proposal }], page: { hasNext: false, nextCursor: null } }))
  assert.equal((await fetchChatMessages('room')).items[1].type, 'BOOKING_PROPOSAL')
  assert.equal((await fetchChatRooms())[0].lastMessage.content, proposal.content)
  globalThis.fetch = async (url) => response(url.endsWith('/csrf') ? { csrfToken: 'token' } : proposal)
  await assert.rejects(postChatMessage('room', '일반 메시지', proposal.clientMessageId), /응답 형식/)
})

test('message page merging orders by server sequence and deduplicates replayed messages', () => {
  const existing = [message(2), message(3)]
  const updated = { ...message(3), content: 'server response' }
  assert.deepEqual(mergeChatMessages(existing, [message(1), updated]), [message(1), message(2), updated])
  assert.equal(existing.length, 2)
})

test('room lookup follows every cursor and rejects a repeated pagination cursor', async (t) => {
  const calls = []
  mockFetch(t, (url) => {
    calls.push(url.searchParams.get('cursor'))
    return response(url.searchParams.has('cursor') ? { items: [room('second')], page: { hasNext: false, nextCursor: null } } : { items: [room()], page: { hasNext: true, nextCursor: 'next page+' } })
  })
  assert.deepEqual((await fetchChatRooms()).map((item) => item.id), ['room', 'second'])
  assert.deepEqual(calls, [null, 'next page+'])
  globalThis.fetch = async () => response({ items: [room()], page: { hasNext: true, nextCursor: 'same' } })
  await assert.rejects(fetchChatRooms(), /응답 형식/)
})

test('message history uses the server sequence cursor and validates its forward progress', async (t) => {
  mockFetch(t, (url) => {
    assert.equal(url.pathname, '/api/v1/chatting/rooms/room/messages')
    assert.equal(url.searchParams.get('beforeSequence'), '10')
    return response({ items: [message(8), message(9)], page: { hasOlder: true, nextBeforeSequence: 8 } })
  })
  assert.deepEqual(await fetchChatMessages('room', 10), { items: [message(8), message(9)], nextBeforeSequence: 8 })
  globalThis.fetch = async () => response({ items: [message(8)], page: { hasOlder: true, nextBeforeSequence: 10 } })
  await assert.rejects(fetchChatMessages('room', 10), /응답 형식/)
})

test('room creation, message retry and read updates send CSRF, idempotency and server field names', async (t) => {
  const writes = []
  mockFetch(t, (url, options) => {
    if (url.pathname === '/api/v1/auth/csrf') return response({ csrfToken: 'csrf-token' })
    assert.equal(options.credentials, 'include')
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-token')
    writes.push({ path: url.pathname, method: options.method, body: JSON.parse(options.body), key: options.headers['Idempotency-Key'] })
    if (url.pathname.endsWith('/messages')) return response({ ...message(), content: '안녕하세요', clientMessageId: 'retry-key' })
    if (url.pathname.endsWith('/read')) return response({ roomId: 'room', lastReadSequence: 4, readAt: '2026-10-16T15:00:00+09:00' })
    return response(room())
  })
  await createChatRoom('shop', 'room-key')
  await postChatMessage('room', ' 안녕하세요 ', 'retry-key')
  await postChatMessage('room', ' 안녕하세요 ', 'retry-key')
  assert.equal(await putChatRead('room', 4), 4)
  assert.deepEqual(writes[0], { path: '/api/v1/chatting/rooms', method: 'POST', body: { storeId: 'shop' }, key: 'room-key' })
  assert.deepEqual(writes[1], { path: '/api/v1/chatting/rooms/room/messages', method: 'POST', body: { content: '안녕하세요', clientMessageId: 'retry-key' }, key: 'retry-key' })
  assert.deepEqual(writes[1], writes[2])
  assert.deepEqual(writes[3], { path: '/api/v1/chatting/rooms/room/read', method: 'PUT', body: { lastReadSequence: 4 }, key: undefined })
  await assert.rejects(postChatMessage('room', '  ', 'invalid'), /1~2000자/)
  await assert.rejects(postChatMessage('room', 'x'.repeat(2001), 'invalid'), /1~2000자/)
  assert.equal(writes.length, 4)
})

test('sending before a refresh cannot skip more than a page of missed messages, including an initially empty room', async (t) => {
  let history = []
  let messageRequests = 0
  mockFetch(t, (url, options) => {
    if (url.pathname.endsWith('/csrf')) return response({ csrfToken: 'token' })
    if (url.pathname.endsWith('/rooms')) return response({ items: [room()], page: { hasNext: false, nextCursor: null } })
    if (options.method === 'POST') {
      const input = JSON.parse(options.body)
      const sent = { ...message(history.length + 1), ...input }
      history.push(sent)
      return response(sent)
    }
    messageRequests++
    const older = history.filter((item) => !url.searchParams.has('beforeSequence') || item.sequence < Number(url.searchParams.get('beforeSequence')))
    const items = older.slice(-100)
    return response({ items, page: { hasOlder: older.length > items.length, nextBeforeSequence: older.length > items.length ? items[0].sequence : null } })
  })
  for (const initialCount of [0, 1]) {
    history = Array.from({ length: initialCount }, (_, index) => message(index + 1, 'owner'))
    const chat = captureChat()
    await chat.refreshRooms()
    await chat.loadMessages('room')
    history = Array.from({ length: 201 }, (_, index) => message(index + 1, 'owner'))
    await chat.sendMessage('room', '돌아왔어요', 'returned')
    messageRequests = 0
    await chat.loadMessages('room')
    assert.equal((await chat.openShopChat('shop')).messages.length, 202)
    assert.equal(messageRequests, 3)
    messageRequests = 0
    await chat.loadMessages('room')
    assert.equal(messageRequests, 1, 'a synchronized room only needs its latest page')
  }
})

test('a delayed send response cannot replace a newer last-message preview', async (t) => {
  let finishSend
  const sending = new Promise((resolve) => { finishSend = resolve })
  let lastMessage = null
  mockFetch(t, (url, options) => {
    if (url.pathname.endsWith('/csrf')) return response({ csrfToken: 'token' })
    if (url.pathname.endsWith('/rooms')) return response({ items: [{ ...room(), lastMessage }], page: { hasNext: false, nextCursor: null } })
    if (options.method === 'POST') return sending
    throw new Error(`Unexpected request: ${url}`)
  })
  const chat = captureChat()
  await chat.refreshRooms()
  const request = chat.sendMessage('room', '먼저 보낸 메시지', 'delayed')
  lastMessage = message(2, 'owner')
  await chat.refreshRooms()
  finishSend(response({ ...message(1), clientMessageId: 'delayed' }))
  await request
  assert.equal((await chat.openShopChat('shop')).lastMessage.sequence, 2)
})

test('proposal parsing and merging preserve confirmation against stale HTTP and realtime responses', () => {
  const pending = parseChatMessage(bookingMessage())
  const confirmed = parseChatMessage(bookingMessage('CONFIRMED', 2))
  assert.equal(pending.bookingProposal.price, 75000)
  assert.deepEqual(mergeChatMessages([confirmed], [pending]), [confirmed])
  assert.deepEqual(mergeChatMessages([pending], [confirmed]), [confirmed])
  assert.throws(() => parseChatMessage({ ...pending, bookingProposal: undefined }), /응답 형식/)
  assert.throws(() => parseChatMessage({ ...pending, bookingProposal: { ...pending.bookingProposal, version: 0 } }), /응답 형식/)
  assert.throws(() => parseChatMessage({ ...pending, bookingProposal: { ...pending.bookingProposal, status: 'CONFIRMED' } }), /응답 형식/)
  assert.throws(() => parseChatMessage({ ...pending, bookingProposal: { ...pending.bookingProposal, durationMinutes: 16 } }), /응답 형식/)
})

test('proposal creation and confirmation use contract fields and separate retry keys', async (t) => {
  const writes = []
  mockFetch(t, (url, options) => {
    if (url.pathname.endsWith('/csrf')) return response({ csrfToken: 'csrf' })
    assert.equal(options.headers['X-CSRF-Token'], 'csrf')
    writes.push({ path: url.pathname, body: JSON.parse(options.body), key: options.headers['Idempotency-Key'] })
    return response(bookingMessage(url.pathname.endsWith('/confirm') ? 'CONFIRMED' : 'PENDING', url.pathname.endsWith('/confirm') ? 2 : 1))
  })
  const input = { service: '젤 네일 + 제거', startsAt: '2099-10-20T14:00:00+09:00', duration: 90, price: 75000 }
  const proposal = await postBookingProposal('room', 'msg-1', 'service', input, 'create-key')
  assert.equal(proposal.bookingProposal.status, 'PENDING')
  await postBookingProposal('room', 'msg-1', 'service', input, 'create-key')
  const confirmed = await confirmBookingProposal('room', 'proposal', 1, 'confirm-key')
  assert.equal(confirmed.bookingProposal.reservationId, 'reservation')
  assert.deepEqual(writes[0], { path: '/api/v1/chatting/rooms/room/booking-proposals', body: { sourceMessageId: 'msg-1', serviceId: 'service', serviceDescription: input.service, startAt: input.startsAt, durationMinutes: 90, price: 75000 }, key: 'create-key' })
  assert.deepEqual(writes[1], writes[0])
  assert.deepEqual(writes[2], { path: '/api/v1/chatting/rooms/room/booking-proposals/proposal/confirm', body: { expectedVersion: 1 }, key: 'confirm-key' })
  await assert.rejects(postBookingProposal('room', 'msg-1', 'service', { ...input, duration: 16 }, 'invalid'), /5분 단위/)
  assert.equal(writes.length, 3)
})

test('offline polling refreshes changed proposal states older than the latest message page', async (t) => {
  let requests = 0
  const history = Array.from({ length: 202 }, (_, index) => index === 1 ? bookingMessage() : message(index + 1))
  mockFetch(t, (url) => {
    if (url.pathname.endsWith('/rooms')) return response({ items: [room()], page: { hasNext: false, nextCursor: null } })
    requests++
    const before = Number(url.searchParams.get('beforeSequence') ?? Infinity)
    const older = history.filter((item) => item.sequence < before)
    const items = older.slice(-100)
    return response({ items, page: { hasOlder: older.length > 100, nextBeforeSequence: older.length > 100 ? items[0].sequence : null } })
  })
  const chat = captureChat()
  await chat.refreshRooms()
  await chat.loadMessages('room', undefined, true)
  assert.equal(requests, 1, 'an empty cache only needs the latest history page')
  await chat.loadMessages('room', 103)
  await chat.loadMessages('room', 3)
  history[1] = bookingMessage('CONFIRMED', 2)
  await chat.loadMessages('room')
  assert.equal((await chat.openShopChat('shop')).messages[1].bookingProposal.status, 'PENDING', 'the old card is outside the latest page')
  requests = 0
  await chat.loadMessages('room', undefined, true)
  assert.equal(requests, 3)
  assert.equal((await chat.openShopChat('shop')).messages[1].bookingProposal.status, 'CONFIRMED')
  history[1] = bookingMessage('REVIEW_REQUIRED', 1)
  await chat.loadMessages('room', undefined, true)
  assert.equal((await chat.openShopChat('shop')).messages[1].bookingProposal.status, 'CONFIRMED', 'an older HTTP response cannot regress a newer card')
})

function mockSockets(t) {
  const original = globalThis.WebSocket
  const sockets = []
  class Socket {
    static OPEN = 1
    readyState = 0
    sent = []
    constructor(url, protocol) { this.url = url; this.protocol = protocol; sockets.push(this) }
    open() { this.readyState = 1; this.onopen() }
    send(data) { this.sent.push(JSON.parse(data)) }
    receive(type, payload, requestId) { this.onmessage({ data: JSON.stringify({ type, payload, requestId }) }) }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }) }
  }
  globalThis.WebSocket = Socket
  t.after(() => { globalThis.WebSocket = original })
  return sockets
}
const flushSocket = () => new Promise((resolve) => setImmediate(resolve))

test('WebSocket authenticates, replays messages, separates state-only updates and recovers both resync modes', async (t) => {
  mockFetch(t, () => response({ csrfToken: 'csrf' }))
  const sockets = mockSockets(t)
  let sequence = 1
  const messages = [], reads = [], resyncs = []
  const { close: stop } = connectChatRoom('room', 'customer', {
    sequence: () => sequence,
    message: (item, updated) => { messages.push([item.id, updated]); if (!updated) sequence = Math.max(sequence, item.sequence) },
    read: (user, position) => reads.push([user, position]),
    resync: async (cached) => { resyncs.push(cached); if (!cached) sequence = 8 },
    status: () => {},
  })
  t.after(stop)
  await flushSocket()
  const socket = sockets[0]
  assert.equal(socket.url, '/api/v1/chatting/ws')
  assert.equal(new URL(socket.url, 'wss://frontend-oracle.vercel.app').href, 'wss://frontend-oracle.vercel.app/api/v1/chatting/ws')
  assert.equal(socket.protocol, 'bintime.chat.v1')
  socket.open()
  assert.deepEqual(socket.sent[0].payload, { csrfToken: 'csrf' })
  socket.receive('connection.ready', { userId: 'customer' })
  await flushSocket()
  assert.deepEqual(socket.sent[1].payload, { roomId: 'room', afterSequence: 1 })
  socket.receive('message.created', { message: bookingMessage() })
  socket.receive('message.updated', { message: bookingMessage('CONFIRMED', 2) })
  socket.receive('room.read.updated', { roomId: 'room', userId: 'owner', lastReadSequence: 2 })
  socket.receive('room.resync_required', { roomId: 'room', latestSequence: 8, reason: 'MESSAGE_GAP', subscriptionActive: false })
  socket.receive('room.resync_required', { roomId: 'room', latestSequence: 8, reason: 'PROPOSAL_STATE_LIMIT', subscriptionActive: true })
  await flushSocket()
  assert.deepEqual(messages, [['msg-2', false], ['msg-2', true]])
  assert.deepEqual(reads, [['owner', 2]])
  assert.deepEqual(resyncs, [false, true])
  assert.equal(socket.sent.filter((frame) => frame.type === 'room.subscribe').length, 2)
  assert.deepEqual(socket.sent.at(-1).payload, { roomId: 'room', afterSequence: 8 })
})

test('WebSocket retries network closure but stops after session rejection and disposal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  mockFetch(t, () => response({ csrfToken: 'csrf' }))
  const sockets = mockSockets(t)
  const statuses = []
  const { close: stop } = connectChatRoom('room', 'customer', { sequence: () => 0, message: () => {}, read: () => {}, resync: async () => {}, status: (...value) => statuses.push(value) })
  t.after(stop)
  await flushSocket()
  sockets[0].close(1006)
  t.mock.timers.tick(1000)
  await flushSocket()
  assert.equal(sockets.length, 2)
  sockets[1].close(4401)
  t.mock.timers.tick(60000)
  await flushSocket()
  assert.equal(sockets.length, 2)
  assert.match(statuses.at(-1)[1], /다시 로그인/)
  stop()
  t.mock.timers.tick(60000)
  await flushSocket()
  assert.equal(sockets.length, 2)
})

test('retryable subscription errors reconnect after the server delay and subscribe again', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  mockFetch(t, () => response({ csrfToken: 'csrf' }))
  const sockets = mockSockets(t)
  const statuses = []
  const { close: stop } = connectChatRoom('room', 'customer', { sequence: () => 7, message: () => {}, read: () => {}, resync: async () => {}, status: (...value) => statuses.push(value) })
  t.after(stop)
  await flushSocket()
  sockets[0].open()
  sockets[0].receive('connection.ready', { userId: 'customer' })
  sockets[0].receive('error', { code: 'SERVICE_UNAVAILABLE', message: 'SERVICE_UNAVAILABLE', retryable: true, retryAfterSeconds: 5 })
  await flushSocket()
  assert.equal(sockets[0].readyState, 3)
  assert.equal(statuses.some(([connected]) => connected), false, 'authentication alone is not a subscribed connection')
  t.mock.timers.tick(4999)
  await flushSocket()
  assert.equal(sockets.length, 1)
  t.mock.timers.tick(1)
  await flushSocket()
  assert.equal(sockets.length, 2)
  sockets[1].open()
  sockets[1].receive('connection.ready', { userId: 'customer' })
  sockets[1].receive('room.subscribed', { roomId: 'room', replayThroughSequence: 7 })
  await flushSocket()
  assert.deepEqual(sockets[1].sent.at(-1).payload, { roomId: 'room', afterSequence: 7 })
  assert.deepEqual(statuses.at(-1), [true, ''])
})

test('permanent subscription errors close the socket without retrying', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  mockFetch(t, () => response({ csrfToken: 'csrf' }))
  const sockets = mockSockets(t)
  const statuses = []
  const { close: stop } = connectChatRoom('room', 'customer', { sequence: () => 0, message: () => {}, read: () => {}, resync: async () => {}, status: (...value) => statuses.push(value) })
  t.after(stop)
  await flushSocket()
  sockets[0].open()
  sockets[0].receive('connection.ready', { userId: 'customer' })
  sockets[0].receive('error', { code: 'ROOM_NOT_FOUND', message: 'ROOM_NOT_FOUND', retryable: false, retryAfterSeconds: null })
  await flushSocket()
  assert.equal(sockets[0].readyState, 3)
  t.mock.timers.tick(60000)
  await flushSocket()
  assert.equal(sockets.length, 1)
  assert.deepEqual(statuses.at(-1), [false, 'ROOM_NOT_FOUND'])
})

test('rapid sends appear immediately, survive room refresh and reach HTTP in order', async (t) => {
  const writes = [], completions = []
  mockFetch(t, (url, options) => {
    if (url.pathname.endsWith('/csrf')) return response({ csrfToken: 'token' })
    if (url.pathname.endsWith('/rooms')) return response({ items: [room()], page: { hasNext: false, nextCursor: null } })
    const input = JSON.parse(options.body)
    writes.push(input)
    return new Promise((resolve) => completions.push(() => resolve(response({ ...message(writes.length), ...input }))))
  })
  const chat = captureChat()
  await chat.refreshRooms()
  const first = chat.sendMessage('room', '첫 번째', 'first')
  const second = chat.sendMessage('room', '두 번째', 'second')
  assert.deepEqual((await chat.openShopChat('shop')).outgoing.map((item) => item.content), ['첫 번째', '두 번째'])
  await flushSocket()
  assert.equal(writes.length, 1, 'second send waits for the first acknowledgement')
  await chat.refreshRooms()
  assert.equal((await chat.openShopChat('shop')).outgoing.length, 2)
  completions[0]()
  await first
  await flushSocket()
  assert.equal(writes.length, 2)
  assert.deepEqual((await chat.openShopChat('shop')).outgoing.map((item) => item.content), ['두 번째'])
  completions[1]()
  await second
  const saved = await chat.openShopChat('shop')
  assert.equal(saved.outgoing.length, 0)
  assert.deepEqual(saved.messages.map((item) => item.content), ['첫 번째', '두 번째'])
})

test('failed sends retain text and retry with the same identity without duplicate requests', async (t) => {
  let fail = true
  const keys = []
  mockFetch(t, (url, options) => {
    if (url.pathname.endsWith('/csrf')) return response({ csrfToken: 'token' })
    if (url.pathname.endsWith('/rooms')) return response({ items: [room()], page: { hasNext: false, nextCursor: null } })
    const input = JSON.parse(options.body)
    keys.push(input.clientMessageId)
    if (fail) throw new TypeError('network disconnected')
    return response({ ...message(), ...input })
  })
  const chat = captureChat()
  await chat.refreshRooms()
  await assert.rejects(chat.sendMessage('room', '보존할 내용', 'retry'), { code: 'NETWORK_ERROR' })
  const failed = (await chat.openShopChat('shop')).outgoing[0]
  assert.equal(failed.content, '보존할 내용')
  assert.ok(failed.error)
  fail = false
  const retry = chat.sendMessage('room', failed.content, failed.clientMessageId)
  assert.equal(chat.sendMessage('room', failed.content, failed.clientMessageId), retry)
  await retry
  await chat.sendMessage('room', failed.content, failed.clientMessageId)
  assert.deepEqual(keys, ['retry', 'retry'])
  assert.equal((await chat.openShopChat('shop')).messages.length, 1)
  assert.equal((await chat.openShopChat('shop')).outgoing.length, 0)
})

test('history acknowledgement wins over a lost send response', async (t) => {
  let loseResponse
  const delayed = new Promise((_resolve, reject) => { loseResponse = reject })
  mockFetch(t, (url, options) => {
    if (url.pathname.endsWith('/csrf')) return response({ csrfToken: 'token' })
    if (url.pathname.endsWith('/rooms')) return response({ items: [room()], page: { hasNext: false, nextCursor: null } })
    if (options.method === 'POST') return delayed
    return response({ items: [{ ...message(), content: '저장됨', clientMessageId: 'saved' }], page: { hasOlder: false, nextBeforeSequence: null } })
  })
  const chat = captureChat()
  await chat.refreshRooms()
  const sent = chat.sendMessage('room', '저장됨', 'saved')
  await flushSocket()
  await chat.loadMessages('room')
  loseResponse(new TypeError('lost acknowledgement'))
  await sent
  const saved = await chat.openShopChat('shop')
  assert.equal(saved.outgoing.length, 0)
  assert.equal(saved.messages.length, 1)
})

async function readySocket(t) {
  let csrfRequests = 0
  mockFetch(t, () => { csrfRequests++; return response({ csrfToken: 'csrf' }) })
  const sockets = mockSockets(t)
  const transport = connectChatRoom('room', 'customer', { sequence: () => 0, message: () => {}, read: () => {}, resync: async () => {}, status: () => {} })
  t.after(() => transport.close())
  assert.equal(transport.sendMessage('아직 연결 전', 'not-sent'), null)
  await flushSocket()
  const socket = sockets[0]
  socket.open()
  socket.receive('connection.ready', { userId: 'customer' })
  socket.receive('room.subscribed', { roomId: 'room', replayThroughSequence: 0 })
  await flushSocket()
  return { transport, socket, csrfRequests: () => csrfRequests }
}

test('WebSocket sends reuse authentication and resolve only their matching persisted acknowledgement', async (t) => {
  const { transport, socket, csrfRequests } = await readySocket(t)
  for (const sequence of [1, 2]) {
    const content = `메시지 ${sequence}`
    const pending = transport.sendMessage(content, `fast-${sequence}`)
    const frame = socket.sent.at(-1)
    assert.equal(frame.type, 'message.send')
    assert.deepEqual(frame.payload, { roomId: 'room', clientMessageId: `fast-${sequence}`, content })
    let settled = false
    void pending.then(() => { settled = true })
    socket.receive('message.ack', { message: { ...message(sequence), clientMessageId: `fast-${sequence}` } }, 'unrelated-request')
    await flushSocket()
    assert.equal(settled, false)
    socket.receive('message.ack', { message: { ...message(sequence), clientMessageId: `fast-${sequence}` } }, frame.requestId)
    assert.equal((await pending).sequence, sequence)
  }
  assert.equal(csrfRequests(), 1, 'no per-message HTTP or CSRF request')
})

test('message validation errors reject the send without closing the room connection', async (t) => {
  const { transport, socket } = await readySocket(t)
  const sent = transport.sendMessage('보낼 내용', 'rejected')
  const rejected = assert.rejects(sent, { code: 'ROOM_READ_ONLY' })
  socket.receive('error', { code: 'ROOM_READ_ONLY', message: '종료된 대화예요.', retryable: false }, socket.sent.at(-1).requestId)
  await rejected
  assert.equal(socket.readyState, 1)
})

test('socket loss, acknowledgement timeout and expired sessions settle pending sends distinctly', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const first = await readySocket(t)
  const lost = assert.rejects(first.transport.sendMessage('끊김', 'lost'), { code: 'WS_DISCONNECTED' })
  first.socket.close(1006)
  await lost
  first.transport.close()
  const second = await readySocket(t)
  const timeout = assert.rejects(second.transport.sendMessage('시간 초과', 'timeout'), { code: 'WS_TIMEOUT' })
  t.mock.timers.tick(5000)
  await timeout
  second.transport.close()
  const third = await readySocket(t)
  const expired = assert.rejects(third.transport.sendMessage('만료', 'expired'), { status: 401, code: 'SESSION_EXPIRED' })
  third.socket.close(4401)
  await expired
})
