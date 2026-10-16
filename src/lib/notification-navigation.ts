import { apiId } from './backend-api.ts'
import type { CurrentUser } from './auth.ts'
import type { ChatRoom } from './chat.ts'

export function notificationClickPath(value: unknown, origin: string, metadata: Record<string, unknown> = {}): string | null {
  if (typeof value !== 'string' || /[\\\p{Cc}]/u.test(value)) return null
  try {
    const url = new URL(value, origin)
    if (url.origin !== origin || url.username || url.password) return null
    for (const key of ['notificationType', 'roomId', 'messageId', 'notificationId']) {
      if (typeof metadata[key] === 'string') url.searchParams.set(key, metadata[key])
    }
    return url.pathname + url.search + url.hash
  } catch { return null }
}

export function notificationTarget(path: string) {
  const safe = notificationClickPath(path, 'https://bintime.invalid')
  if (!safe) return null
  const url = new URL(safe, 'https://bintime.invalid')
  if (url.pathname.replace(/\/+$/, '') === '/chat' || url.searchParams.get('notificationType') === 'CHAT_MESSAGE') {
    return { kind: 'chat' as const, roomId: url.searchParams.get('roomId'), notificationId: null }
  }
  const id = url.searchParams.get('notificationId')
  try { if (id) apiId(id) } catch { return null }
  return { kind: 'notification' as const, notificationId: id }
}

export function chatNotificationDestination(roomId: string | null, rooms: ChatRoom[], user: Pick<CurrentUser, 'id' | 'ownedStoreIds'>) {
  if (!roomId) throw new Error('알림에 채팅방 정보가 없어요.')
  apiId(roomId)
  const room = rooms.find((item) => item.id === roomId)
  if (!room) throw new Error('이 계정에서 알림의 대화를 찾을 수 없어요.')
  const role = user.ownedStoreIds.includes(room.store.id) ? 'owner' : 'customer'
  if (role === 'customer' && room.customer.id !== user.id) throw new Error('이 계정으로 열 수 없는 대화예요.')
  return { role, path: `/${role}/chat/${apiId(role === 'owner' ? room.id : room.store.id)}` } as const
}
