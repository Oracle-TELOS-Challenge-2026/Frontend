import { apiId, BACKEND_API_ORIGIN, BackendApiError, mutateBackendApi, requestBackendApi } from './backend-api.ts'

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  path: string
  storeId: string | null
  availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN' | 'NOT_APPLICABLE'
  instantBooking: boolean
  readAt: string | null
  createdAt: string
}

export type NotificationEvent =
  | { type: 'notification.created'; id: string; notification: NotificationItem }
  | { type: 'notification.read'; id: string; notificationId: string; readAt: string }
  | { type: 'session.expired'; id: string }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('알림 응답 형식이 올바르지 않아요.')
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('알림 응답 형식이 올바르지 않아요.')
  return value
}

function timestamp(value: unknown): string {
  const result = text(value)
  if (!Number.isFinite(Date.parse(result))) throw new Error('알림 시간이 올바르지 않아요.')
  return result
}

export function notificationPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\p{Cc}]/u.test(value)) return '/customer/waitlist'
  try {
    const url = new URL(value, 'https://bintime.invalid')
    if (url.origin === 'https://bintime.invalid' && !url.username && !url.password) return url.pathname + url.search + url.hash
  } catch { /* 잘못된 알림 링크는 대기내역으로 이동한다. */ }
  return '/customer/waitlist'
}

export function parseNotification(value: unknown): NotificationItem {
  const item = object(value)
  const id = text(item.id)
  apiId(id)
  if (!['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN', 'NOT_APPLICABLE'].includes(text(item.availability))) throw new Error('알림 상태가 올바르지 않아요.')
  const target = item.target == null ? null : object(item.target)
  const instantBooking = target?.instantBooking ?? true
  if (typeof instantBooking !== 'boolean') throw new Error('알림의 확정 방식을 확인하지 못했어요.')
  const storeId = target?.storeId == null ? null : text(target.storeId)
  if (storeId !== null) apiId(storeId)
  return {
    id, type: text(item.type), title: text(item.title), body: text(item.body), path: notificationPath(object(item.action).path),
    availability: item.availability as NotificationItem['availability'],
    instantBooking, storeId,
    readAt: item.readAt === null ? null : timestamp(item.readAt), createdAt: timestamp(item.createdAt),
  }
}

export function notificationActionLabel(item: NotificationItem) {
  if (item.type === 'VACANCY_MATCHED') return item.availability === 'UNAVAILABLE' ? null : '가게와 채팅하기'
  if (item.type === 'CHAT_MESSAGE') return '채팅 확인하기'
  if (item.type.startsWith('RESERVATION_')) return '예약 확인하기'
  return '내용 확인하기'
}

export function mergeNotifications(current: NotificationItem[], incoming: NotificationItem[]) {
  const items = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) items.set(item.id, { ...item, readAt: items.get(item.id)?.readAt ?? item.readAt })
  return [...items.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id))
}

export async function fetchNotifications(cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: '20' })
  if (cursor) query.set('cursor', cursor)
  const { data } = await requestBackendApi(`/api/v1/notifications?${query}`, { signal })
  if (!Array.isArray(data?.items) || !Number.isSafeInteger(data.unreadCount) || Number(data.unreadCount) < 0) throw new Error('알림 목록을 확인하지 못했어요.')
  const page = object(data.page)
  if (typeof page.hasNext !== 'boolean' || (page.hasNext && (typeof page.nextCursor !== 'string' || !page.nextCursor || page.nextCursor === cursor))) throw new Error('다음 알림 목록을 확인하지 못했어요.')
  return { items: data.items.map(parseNotification), unreadCount: Number(data.unreadCount), nextCursor: page.hasNext ? text(page.nextCursor) : null }
}

export async function markNotificationRead(id: string) {
  const { data } = await mutateBackendApi(`/api/v1/notifications/${apiId(id)}/read`, { method: 'PATCH', body: { read: true } })
  const result = parseNotification(data)
  if (result.id !== id || !result.readAt) throw new Error('알림 읽음 처리를 확인하지 못했어요.')
  return result
}

export function parseNotificationEvent(type: string, id: string, data: string): NotificationEvent | null {
  if (!['notification.created', 'notification.read', 'session.expired'].includes(type)) return null
  const payload = object(JSON.parse(data))
  if (type === 'session.expired') return { type, id }
  if (!id || id.length > 128 || /\p{Cc}/u.test(id)) throw new Error('실시간 알림의 위치 정보를 확인하지 못했어요.')
  if (type === 'notification.created') return { type, id, notification: parseNotification(payload.notification) }
  const notificationId = text(payload.notificationId)
  apiId(notificationId)
  return { type: 'notification.read', id, notificationId, readAt: timestamp(payload.readAt) }
}

export async function readNotificationStream({ signal, afterEventId, onOpen, onEvent }: {
  signal: AbortSignal
  afterEventId?: string
  onOpen: () => void
  onEvent: (event: NotificationEvent) => void
}) {
  const query = afterEventId ? `?${new URLSearchParams({ afterEventId })}` : ''
  const idle = new AbortController()
  const combined = AbortSignal.any([signal, idle.signal])
  let idleTimer = setTimeout(() => idle.abort(new Error('실시간 알림 응답이 없어 다시 연결해요.')), 45000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const decoder = new TextDecoder()
  let buffer = ''
  let type = ''
  let id = ''
  let data: string[] = []
  try {
    const response = await fetch(`${BACKEND_API_ORIGIN}/api/v1/notifications/stream${query}`, {
      credentials: 'include', headers: { Accept: 'text/event-stream' }, cache: 'no-store', signal: combined,
    })
    if (!response.ok) throw new BackendApiError(response.status, `HTTP_${response.status}`, response.status === 401 ? '로그인이 만료됐어요. 다시 로그인해 주세요.' : '실시간 알림을 연결하지 못했어요.')
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('실시간 알림 응답을 확인하지 못했어요.')
    reader = response.body.getReader()
    onOpen()
    while (!combined.aborted) {
      const chunk = await reader.read()
      if (chunk.done) break
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => idle.abort(new Error('실시간 알림 응답이 없어 다시 연결해요.')), 45000)
      buffer += decoder.decode(chunk.value, { stream: true })
      if (buffer.length + data.join('\n').length > 131072) throw new Error('실시간 알림이 너무 커서 다시 연결해요.')
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (!line) {
          if (data.length) {
            const event = parseNotificationEvent(type, id, data.join('\n'))
            if (event) onEvent(event)
          }
          type = ''; id = ''; data = []
        } else {
          const colon = line.indexOf(':')
          const field = colon < 0 ? line : line.slice(0, colon)
          const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
          if (field === 'event') type = value
          if (field === 'id') id = value
          if (field === 'data') data.push(value)
        }
      }
    }
  } finally { clearTimeout(idleTimer); await reader?.cancel().catch(() => {}); reader?.releaseLock() }
}
