import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchNotifications, markNotificationRead, mergeNotifications, notificationActionLabel, notificationPath, parseNotification, parseNotificationEvent, readNotificationStream } from '../src/lib/notifications.ts'

const notification = (overrides = {}) => ({
  id: 'noti-1', type: 'VACANCY_MATCHED', title: '빈자리 알림', body: '예약할 수 있어요.',
  action: { type: 'OPEN_SLOT', path: '/customer/shops/store-1?slotId=slot-1' },
  availability: 'AVAILABLE', readAt: null, createdAt: '2026-10-17T12:00:00+09:00', ...overrides,
})
const success = (data) => Response.json({ resultType: 'SUCCESS', success: { data }, error: null })

test('notification list uses cursor pagination and validates unread count and page boundaries', async (t) => {
  const responses = [
    success({ items: [notification({ target: { instantBooking: false } })], unreadCount: 3, page: { hasNext: true, nextCursor: 'cursor-2' } }),
    success({ items: [], unreadCount: 3, page: { hasNext: false, nextCursor: null } }),
    success({ items: [], unreadCount: -1, page: { hasNext: false } }),
    success({ items: [], unreadCount: 1, page: { hasNext: true, nextCursor: 'loop' } }),
  ]
  const fetch = t.mock.method(globalThis, 'fetch', async () => responses.shift())
  const first = await fetchNotifications()
  assert.equal(first.items[0].id, 'noti-1')
  assert.equal(first.items[0].instantBooking, false)
  assert.equal(first.nextCursor, 'cursor-2')
  assert.equal(first.unreadCount, 3)
  const last = await fetchNotifications(first.nextCursor)
  assert.equal(last.nextCursor, null)
  const [url, options] = fetch.mock.calls[1].arguments
  assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').searchParams.get('cursor'), 'cursor-2')
  assert.equal(options.credentials, 'include')
  await assert.rejects(fetchNotifications(), /알림 목록/)
  await assert.rejects(fetchNotifications('loop'), /다음 알림/)
})

test('marking notifications read sends CSRF and read=true and rejects unconfirmed writes', async (t) => {
  const responses = [success({ csrfToken: 'csrf' }), success(notification({ id: 'noti/1', readAt: '2026-10-17T12:01:00+09:00' })), success({ csrfToken: 'csrf' }), success(notification())]
  const fetch = t.mock.method(globalThis, 'fetch', async () => responses.shift())
  const read = await markNotificationRead('noti/1')
  assert.ok(read.readAt)
  const [url, options] = fetch.mock.calls[1].arguments
  assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').pathname, '/api/v1/notifications/noti%2F1/read')
  assert.equal(options.method, 'PATCH')
  assert.equal(options.headers['X-CSRF-Token'], 'csrf')
  assert.deepEqual(JSON.parse(options.body), { read: true })
  await assert.rejects(markNotificationRead('noti-1'), /읽음 처리/)
})

test('notification destinations remain in the app and invalid response data is rejected', () => {
  assert.equal(notificationPath('/customer/shops/a?slotId=s#time'), '/customer/shops/a?slotId=s#time')
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/bad\npath', null]) assert.equal(notificationPath(path), '/customer/waitlist')
  for (const value of [null, notification({ id: '' }), notification({ type: null }), notification({ createdAt: 'bad' }), notification({ readAt: 'bad' }), notification({ availability: 'OTHER' })]) assert.throws(() => parseNotification(value))
})

test('vacancy notifications preserve the published policy and validate optional boolean targets', () => {
  for (const target of [undefined, null, {}, { instantBooking: null }, { instantBooking: true }]) {
    assert.equal(parseNotification(notification({ target })).instantBooking, true)
  }
  const pending = parseNotification(notification({ target: { instantBooking: false } }))
  assert.equal(pending.instantBooking, false)
  assert.equal(notificationActionLabel(pending), '예약 신청')
  assert.equal(notificationActionLabel({ ...pending, availability: 'UNAVAILABLE' }), null)
  for (const instantBooking of ['false', 'true', 0, 1, {}, []]) {
    assert.throws(() => parseNotification(notification({ target: { instantBooking } })), /확정 방식/)
  }
  for (const target of [false, '', []]) assert.throws(() => parseNotification(notification({ target })), /응답 형식/)
})

test('chat and reservation notifications keep their destinations and remain actionable without slot availability', () => {
  for (const [type, path, label] of [
    ['CHAT_MESSAGE', '/customer/chat/room-1', '채팅 확인하기'],
    ['CHAT_MESSAGE', '/owner/chat/room-1', '채팅 확인하기'],
    ['RESERVATION_CONFIRMED', '/owner?date=2026-10-18', '예약 확인하기'],
    ['RESERVATION_CANCELED', '/customer/reservations/res-1', '예약 확인하기'],
    ['RESERVATION_NO_SHOW', '/customer/reservations', '예약 확인하기'],
  ]) {
    const item = parseNotification(notification({ type, availability: 'NOT_APPLICABLE', action: { path } }))
    assert.equal(item.type, type)
    assert.equal(item.path, path)
    assert.equal(item.availability, 'NOT_APPLICABLE')
    assert.equal(notificationActionLabel(item), label)
    assert.equal(notificationActionLabel({ ...item, availability: 'UNAVAILABLE' }), label)
  }
  assert.equal(notificationActionLabel(parseNotification(notification())), '빈자리 확인하기')
  assert.equal(notificationActionLabel(parseNotification(notification({ availability: 'UNAVAILABLE' }))), null)
  assert.equal(notificationActionLabel(parseNotification(notification({ type: 'NEW_TYPE', availability: 'NOT_APPLICABLE' }))), '내용 확인하기')
})

test('duplicate and replayed notifications preserve read state and chronological order', () => {
  const read = parseNotification(notification({ readAt: '2026-10-17T12:01:00+09:00' }))
  const newer = parseNotification(notification({ id: 'noti-2', createdAt: '2026-10-17T12:02:00+09:00' }))
  const merged = mergeNotifications([read], [parseNotification(notification()), newer])
  assert.deepEqual(merged.map((item) => item.id), ['noti-2', 'noti-1'])
  assert.equal(merged[1].readAt, read.readAt)
  assert.equal(parseNotificationEvent('other.event', '', '{}'), null)
  assert.throws(() => parseNotificationEvent('notification.created', '', JSON.stringify({ notification: notification() })), /위치 정보/)
})

test('SSE handles fragmented UTF-8, CRLF, heartbeats, multiline JSON, and session expiry', async (t) => {
  const content = ': heartbeat\r\n\r\nretry: 3000\r\n\r\nid: evt-1\r\nevent: notification.created\r\ndata: {"notification":\r\ndata: ' + JSON.stringify(notification({ target: { instantBooking: false } })) + '}\r\n\r\nid: evt-2\nevent: notification.read\ndata: {"notificationId":"noti-1","readAt":"2026-10-17T12:01:00+09:00"}\n\nevent: session.expired\ndata: {"reason":"SESSION_EXPIRED"}\n\n'
  const bytes = new TextEncoder().encode(content)
  const body = new ReadableStream({ start(controller) { for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7)); controller.close() } })
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }))
  const events = []
  let opened = false
  await readNotificationStream({ signal: new AbortController().signal, afterEventId: 'evt/old', onOpen: () => { opened = true }, onEvent: (event) => { assert.equal(opened, true); events.push(event) } })
  assert.deepEqual(events.map((event) => event.type), ['notification.created', 'notification.read', 'session.expired'])
  assert.equal(events[0].notification.title, '빈자리 알림')
  assert.equal(events[0].notification.instantBooking, false)
  assert.equal(events[1].notificationId, 'noti-1')
  const [url, options] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/v1/notifications/stream?afterEventId=evt%2Fold')
  assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').origin, 'https://frontend-oracle.vercel.app')
  assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').searchParams.get('afterEventId'), 'evt/old')
  assert.equal(options.credentials, 'include')
  assert.equal(options.headers.Accept, 'text/event-stream')
})

test('SSE exposes expired cursors and unauthorized sessions for recovery instead of treating them as streams', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 410 }))
  const options = { signal: new AbortController().signal, onOpen: () => assert.fail('No stream opened'), onEvent: () => assert.fail('No events') }
  await assert.rejects(readNotificationStream(options), { status: 410 })
  fetch.mock.mockImplementation(async () => new Response(null, { status: 401 }))
  await assert.rejects(readNotificationStream(options), { status: 401 })
  fetch.mock.mockImplementation(async () => Response.json({}))
  await assert.rejects(readNotificationStream(options), /응답을 확인/)
})

test('SSE aborts an unresponsive connection after missed heartbeats', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })))
  const rejected = assert.rejects(readNotificationStream({ signal: new AbortController().signal, onOpen: () => {}, onEvent: () => {} }), /응답이 없어/)
  t.mock.timers.tick(45000)
  await rejected
})
