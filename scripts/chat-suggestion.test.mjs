import assert from 'node:assert/strict'
import test from 'node:test'
import { getChatBookingSuggestion } from '../src/lib/chat-suggestion.ts'

const suggestion = (changes = {}) => ({ sourceMessageId: 'message', sourceContent: '내일 17시에 머리자르고 싶어요', bookingRequested: true, date: '2026-10-18', time: '17:00', serviceDescription: '커트', ...changes })
const response = (data) => Response.json({ resultType: 'SUCCESS', success: { data }, error: null })
const failure = (status, code) => Response.json({ resultType: 'FAILURE', success: null, error: { code } }, { status })

function mockAnalysis(t, data) {
  return t.mock.method(globalThis, 'fetch', async (url) => response(url.endsWith('/csrf') ? { csrfToken: 'csrf' } : data))
}

test('C-08 posts only persisted room/message IDs with session and fresh CSRF, without a body or idempotency key', async (t) => {
  const requests = []
  const data = suggestion({ sourceMessageId: 'message/한 글' })
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    return response(url.endsWith('/csrf') ? { csrfToken: 'csrf' } : data)
  })
  assert.deepEqual(await getChatBookingSuggestion('room/한 글', data.sourceMessageId), data)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].url, '/api/v1/auth/csrf')
  const { url, options } = requests[1]
  assert.equal(url, '/api/v1/chatting/rooms/room%2F%ED%95%9C%20%EA%B8%80/messages/message%2F%ED%95%9C%20%EA%B8%80/booking-suggestion')
  assert.equal(options.method, 'POST')
  assert.equal(options.credentials, 'include')
  assert.deepEqual(options.headers, { Accept: 'application/json', 'X-CSRF-Token': 'csrf' })
  assert.equal(options.body, undefined)
  assert.ok(options.signal instanceof AbortSignal)
})

test('server dates, raw content, and independent null fields survive without local date or intent inference', async (t) => {
  for (const data of [
    suggestion({ sourceContent: ' 내일 17시에 머리자르고 싶어요\n', date: '2020-01-01' }),
    suggestion({ sourceContent: '내일 3시 커트', time: null }),
    suggestion({ date: null }),
    suggestion({ date: null, time: null, serviceDescription: null }),
    suggestion({ date: '2028-02-29', time: '00:00' }),
    suggestion({ date: '2026-10-18', time: '23:59' }),
  ]) {
    mockAnalysis(t, data)
    assert.deepEqual(await getChatBookingSuggestion('room', 'message'), data)
  }
})

test('greetings, cancellations and rejections use the server false result with null analysis fields', async (t) => {
  for (const sourceContent of ['ㅎㅇ', '감사합니다', '예약 취소할게요', '예약 안 할게요']) {
    const data = suggestion({ sourceContent, bookingRequested: false, date: null, time: null, serviceDescription: null })
    mockAnalysis(t, data)
    assert.deepEqual(await getChatBookingSuggestion('room', 'message'), data)
  }
})

test('mismatched sources and malformed fields never become usable suggestions', async (t) => {
  const malformed = [
    { sourceMessageId: 'other' }, { sourceMessageId: null },
    { sourceContent: '' }, { sourceContent: '  ' }, { sourceContent: 'x'.repeat(2001) }, { sourceContent: null },
    { bookingRequested: 'true' }, { bookingRequested: undefined },
    ...['2027-02-29', '2026-11-31', '2026-1-01', '2026-13-01', '', undefined, 20261018].map((date) => ({ date })),
    ...['24:00', '17:60', '5:00', '17:00:00', '', undefined, 1700].map((time) => ({ time })),
    ...['', '  ', 'x'.repeat(1001), undefined, 1].map((serviceDescription) => ({ serviceDescription })),
    { bookingRequested: false },
    { bookingRequested: false, date: null, time: null },
    { bookingRequested: false, date: null, serviceDescription: null },
    { bookingRequested: false, time: null, serviceDescription: null },
  ]
  for (const changes of malformed) {
    mockAnalysis(t, suggestion(changes))
    await assert.rejects(getChatBookingSuggestion('room', 'message'), { code: 'INVALID_RESPONSE' })
  }
})

test('invalid path IDs are rejected before any request', async (t) => {
  const fetch = mockAnalysis(t, suggestion())
  for (const [roomId, messageId] of [['', 'message'], ['room', '..'], ['room', 'x'.repeat(65)], ['room', 'bad\nmessage']]) {
    await assert.rejects(getChatBookingSuggestion(roomId, messageId), { code: 'INVALID_REQUEST' })
  }
  assert.equal(fetch.mock.callCount(), 0)
})

test('authorization, missing sources, stale sources and AI failures keep their status and code without retry', async (t) => {
  for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [404, 'ROOM_NOT_FOUND'], [404, 'SOURCE_MESSAGE_NOT_FOUND'], [409, 'PROPOSAL_SOURCE_OUTDATED'], [409, 'ROOM_READ_ONLY'], [503, 'OPENAI_NOT_CONFIGURED'], [503, 'CHAT_BOOKING_ANALYSIS_UNAVAILABLE']]) {
    const fetch = t.mock.method(globalThis, 'fetch', async (url) => url.endsWith('/csrf') ? response({ csrfToken: 'csrf' }) : failure(status, code))
    await assert.rejects(getChatBookingSuggestion('room', 'message'), { status, code })
    assert.equal(fetch.mock.callCount(), 2)
  }
})

test('CSRF_INVALID refreshes the token and retries this analysis once', async (t) => {
  const tokens = []
  let tokenRequests = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/csrf')) return response({ csrfToken: `csrf-${++tokenRequests}` })
    tokens.push(options.headers['X-CSRF-Token'])
    return tokens.length === 1 ? failure(403, 'CSRF_INVALID') : response(suggestion())
  })
  assert.deepEqual(await getChatBookingSuggestion('room', 'message'), suggestion())
  assert.deepEqual(tokens, ['csrf-1', 'csrf-2'])
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => url.endsWith('/csrf') ? response({ csrfToken: 'csrf' }) : failure(403, 'CSRF_INVALID'))
  await assert.rejects(getChatBookingSuggestion('room', 'message'), { status: 403, code: 'CSRF_INVALID' })
  assert.equal(fetch.mock.callCount(), 4)
})

test('aborting during CSRF lookup prevents analysis even when a late token arrives', async (t) => {
  const controller = new AbortController()
  let finish
  const fetch = t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { finish = resolve }))
  const pending = getChatBookingSuggestion('room', 'message', controller.signal)
  controller.abort()
  finish(response({ csrfToken: 'csrf' }))
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(fetch.mock.callCount(), 1)
})

test('aborting after analysis starts prevents a late successful response from returning', async (t) => {
  const controller = new AbortController()
  let finish
  let started
  const analysisStarted = new Promise((resolve) => { started = resolve })
  t.mock.method(globalThis, 'fetch', (url) => {
    if (url.endsWith('/csrf')) return Promise.resolve(response({ csrfToken: 'csrf' }))
    started()
    return new Promise((resolve) => { finish = resolve })
  })
  const pending = getChatBookingSuggestion('room', 'message', controller.signal)
  await analysisStarted
  controller.abort()
  finish(response(suggestion()))
  await assert.rejects(pending, { name: 'AbortError' })
})
