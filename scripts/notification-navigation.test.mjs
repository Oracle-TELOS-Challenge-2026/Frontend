import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchChatRooms, parseChatRoom } from '../src/lib/chat.ts'
import { chatNotificationDestination, notificationClickPath, notificationTarget } from '../src/lib/notification-navigation.ts'

const origin = 'https://bintime.example'
const user = { id: 'customer', ownedStoreIds: [] }
const roomResponse = { id: 'room-1', store: { id: 'store-1', name: '가게', imageUrl: null }, customer: { id: 'customer', displayName: '고객' }, status: 'OPEN', lastMessage: null, unreadCount: 1, lastReadSequence: 0, createdAt: '2026-10-17T04:00:00+09:00' }
const room = parseChatRoom(roomResponse)

test('chat clicks preserve metadata through a URL and never expose an inbox read ID', () => {
  const path = notificationClickPath('/chat?roomId=room-1', origin, {
    notificationType: 'CHAT_MESSAGE', roomId: 'room-1', messageId: 'message-1', notificationId: 'message-1',
  })
  const restored = new URL(path, origin)
  assert.equal(restored.searchParams.get('notificationType'), 'CHAT_MESSAGE')
  assert.equal(restored.searchParams.get('roomId'), 'room-1')
  assert.equal(restored.searchParams.get('messageId'), 'message-1')
  assert.deepEqual(notificationTarget(path), { kind: 'chat', roomId: 'room-1', notificationId: null })
  assert.equal(notificationTarget('/chat?roomId=room-1&notificationId=message-1').notificationId, null)
  assert.equal(notificationTarget('/customer/chat/store-1?notificationType=CHAT_MESSAGE&roomId=room-1&notificationId=message-1').notificationId, null)
  assert.equal(notificationTarget('/?notificationType=CHAT_MESSAGE&roomId=room-1&notificationId=message-1').notificationId, null)
})

test('ordinary inbox notification IDs keep their existing read path', () => {
  const path = notificationClickPath('/customer/waitlist?source=push#offer', origin, { notificationId: 'notification-1' })
  assert.deepEqual(notificationTarget(path), { kind: 'notification', notificationId: 'notification-1' })
  assert.equal(new URL(path, origin).hash, '#offer')
  assert.equal(new URL(path, origin).searchParams.get('source'), 'push')
  assert.equal(notificationTarget('/customer/waitlist?notificationId=..'), null)
})

test('external, credential-bearing and malformed notification URLs never become app destinations', () => {
  for (const path of ['https://other.example/chat?roomId=room-1', '//other.example/chat', 'https://user:pass@bintime.example/chat', '/\\other.example/chat', '/chat\n?roomId=room-1', 'javascript:alert(1)', null]) {
    assert.equal(notificationClickPath(path, origin), null, String(path))
  }
  assert.equal(notificationTarget('https://other.example/chat?roomId=room-1'), null)
  assert.equal(notificationClickPath(`${origin}/chat?roomId=room-1`, origin), '/chat?roomId=room-1')
})

test('customer chat routes use the store ID and owner routes use the room ID', () => {
  assert.deepEqual(chatNotificationDestination('room-1', [room], user), { role: 'customer', path: '/customer/chat/store-1' })
  assert.deepEqual(chatNotificationDestination('room-1', [room], { id: 'owner', ownedStoreIds: ['store-1'] }), { role: 'owner', path: '/owner/chat/room-1' })
  assert.deepEqual(chatNotificationDestination('room-1', [{ ...room, status: 'READ_ONLY' }], user), { role: 'customer', path: '/customer/chat/store-1' })
})

test('missing, invalid and unrelated rooms cannot open or create a customer chat', () => {
  for (const id of [null, '', ' ', '.', '..', '\nroom', 'r'.repeat(65)]) assert.throws(() => chatNotificationDestination(id, [room], user))
  assert.throws(() => chatNotificationDestination('missing', [room], user), /찾을 수 없어요/)
  assert.throws(() => chatNotificationDestination('room-1', [room], { id: 'unrelated', ownedStoreIds: [] }), /열 수 없는/)
  assert.throws(() => chatNotificationDestination('room-1', [{ ...room, store: { ...room.store, id: '..' } }], user))
})

test('notification entry resolves against the existing paginated authenticated chat API', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (value, options) => {
    const url = new URL(value)
    requests.push(url)
    assert.equal(options.credentials, 'include')
    assert.equal(options.method, 'GET')
    assert.equal(url.pathname, '/api/v1/chatting/rooms')
    const second = url.searchParams.get('cursor') === 'next'
    return Response.json({ resultType: 'SUCCESS', success: { data: {
      items: second ? [roomResponse] : [], page: { hasNext: !second, nextCursor: second ? null : 'next' },
    } }, error: null })
  })
  const rooms = await fetchChatRooms()
  assert.deepEqual(chatNotificationDestination('room-1', rooms, user), { role: 'customer', path: '/customer/chat/store-1' })
  assert.equal(requests.length, 2)
})

test('expired or failed chat lookups never produce a guessed destination', async (t) => {
  for (const status of [401, 403, 503]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ resultType: 'FAILURE', success: null, error: { code: `HTTP_${status}` } }, { status }))
    await assert.rejects(fetchChatRooms(), { status })
  }
})
