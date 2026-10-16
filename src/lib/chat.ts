import { apiId, BACKEND_API_ORIGIN, BackendApiError, mutateBackendApi, requestBackendApi } from './backend-api.ts'
import { validateChatBooking } from './chat-booking.ts'
import type { ChatBookingInput } from './chat-booking.ts'

export interface ChatBookingProposal {
  id: string
  sourceMessageId: string
  serviceId: string
  serviceDescription: string
  startAt: string
  endAt: string
  durationMinutes: number
  price: number
  status: 'PENDING' | 'CONFIRMED' | 'SUPERSEDED' | 'REVIEW_REQUIRED'
  version: number
  reservationId: string | null
  waitlistId: string | null
}

export interface ChatMessage {
  id: string
  roomId: string
  sequence: number
  sender: { id: string; role: 'CUSTOMER' | 'OWNER'; displayName: string }
  clientMessageId: string
  type: 'TEXT' | 'BOOKING_PROPOSAL'
  content: string
  createdAt: string
  bookingProposal?: ChatBookingProposal
}

export interface ChatRoom {
  id: string
  store: { id: string; name: string; imageUrl: string | null }
  customer: { id: string; displayName: string }
  status: 'OPEN' | 'READ_ONLY'
  lastMessage: ChatMessage | null
  unreadCount: number
  lastReadSequence: number
  peerReadSequence?: number
  createdAt: string
  messages: ChatMessage[]
  messagesLoaded: boolean
  nextBeforeSequence: number | null
}

function invalid(): never {
  throw new BackendApiError(0, 'INVALID_RESPONSE', '채팅 응답 형식이 올바르지 않아요. 다시 조회해 주세요.')
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== 'string') invalid()
  return value
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid()
  return value
}

function timestamp(value: unknown): string {
  const result = text(value)
  if (!Number.isFinite(Date.parse(result))) invalid()
  return result
}

function parseBookingProposal(value: unknown): ChatBookingProposal {
  const item = record(value)
  if (!['PENDING', 'CONFIRMED', 'SUPERSEDED', 'REVIEW_REQUIRED'].includes(text(item.status))) invalid()
  const durationMinutes = integer(item.durationMinutes)
  const price = integer(item.price)
  const version = integer(item.version)
  const startAt = timestamp(item.startAt)
  const endAt = timestamp(item.endAt)
  if (durationMinutes < 15 || durationMinutes > 480 || durationMinutes % 5 || price > 10000000 || !version || Date.parse(endAt) - Date.parse(startAt) !== durationMinutes * 60000) invalid()
  const reservationId = item.reservationId == null ? null : text(item.reservationId)
  if (item.status === 'CONFIRMED' && !reservationId) invalid()
  return {
    id: text(item.id), sourceMessageId: text(item.sourceMessageId), serviceId: text(item.serviceId), serviceDescription: text(item.serviceDescription),
    startAt, endAt, durationMinutes, price, status: item.status as ChatBookingProposal['status'], version, reservationId,
    waitlistId: item.waitlistId == null ? null : text(item.waitlistId),
  }
}

export function parseChatMessage(value: unknown): ChatMessage {
  const item = record(value)
  const sender = record(item.sender)
  if ((item.type !== 'TEXT' && item.type !== 'BOOKING_PROPOSAL') || !['CUSTOMER', 'OWNER'].includes(text(sender.role))) invalid()
  const sequence = integer(item.sequence)
  if (!sequence) invalid()
  return {
    id: text(item.id), roomId: text(item.roomId), sequence,
    sender: { id: text(sender.id), role: sender.role as ChatMessage['sender']['role'], displayName: text(sender.displayName) },
    clientMessageId: text(item.clientMessageId), type: item.type, content: text(item.content), createdAt: timestamp(item.createdAt),
    ...(item.type === 'BOOKING_PROPOSAL' ? { bookingProposal: parseBookingProposal(item.bookingProposal) } : {}),
  }
}

export function parseChatRoom(value: unknown): ChatRoom {
  const item = record(value)
  const store = record(item.store)
  const customer = record(item.customer)
  if (item.status !== 'OPEN' && item.status !== 'READ_ONLY') invalid()
  const lastMessage = item.lastMessage === null ? null : parseChatMessage(item.lastMessage)
  const id = text(item.id)
  if (lastMessage && lastMessage.roomId !== id) invalid()
  return {
    id, store: { id: text(store.id), name: text(store.name), imageUrl: store.imageUrl === null ? null : text(store.imageUrl) },
    customer: { id: text(customer.id), displayName: text(customer.displayName) }, status: item.status,
    lastMessage, unreadCount: integer(item.unreadCount), lastReadSequence: integer(item.lastReadSequence), createdAt: timestamp(item.createdAt),
    messages: [], messagesLoaded: false, nextBeforeSequence: null,
  }
}

export function continuesMessageGroup(message: ChatMessage, next?: ChatMessage): boolean {
  return next?.sender.id === message.sender.id && Math.floor(Date.parse(message.createdAt) / 60000) === Math.floor(Date.parse(next.createdAt) / 60000)
}

export function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(existing.map((item) => [item.id, item]))
  for (const item of incoming) {
    const previous = messages.get(item.id)
    // HTTP retries and replay can arrive after a newer proposal status.
    if ((previous?.bookingProposal?.version ?? 0) > (item.bookingProposal?.version ?? 0)) continue
    messages.set(item.id, item)
  }
  return [...messages.values()].sort((a, b) => a.sequence - b.sequence)
}

export async function fetchChatRooms(signal?: AbortSignal): Promise<ChatRoom[]> {
  const rooms = new Map<string, ChatRoom>()
  const seen = new Set<string>()
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({ limit: '100' })
    if (cursor) query.set('cursor', cursor)
    const { data } = await requestBackendApi(`/api/v1/chatting/rooms?${query}`, { signal })
    const result = record(data)
    const page = record(result.page)
    if (!Array.isArray(result.items) || typeof page.hasNext !== 'boolean') invalid()
    result.items.map(parseChatRoom).forEach((room) => rooms.set(room.id, room))
    cursor = page.hasNext ? text(page.nextCursor) : null
    if (cursor !== null && (!cursor || seen.has(cursor))) invalid()
    if (cursor) seen.add(cursor)
  } while (cursor)
  return [...rooms.values()]
}

export async function fetchChatMessages(roomId: string, beforeSequence?: number) {
  const query = new URLSearchParams({ limit: '100' })
  if (beforeSequence !== undefined) query.set('beforeSequence', String(beforeSequence))
  const { data } = await requestBackendApi(`/api/v1/chatting/rooms/${apiId(roomId)}/messages?${query}`)
  const result = record(data)
  const page = record(result.page)
  if (!Array.isArray(result.items) || typeof page.hasOlder !== 'boolean') invalid()
  const items = result.items.map(parseChatMessage)
  if (items.some((item) => item.roomId !== roomId || (beforeSequence !== undefined && item.sequence >= beforeSequence))) invalid()
  const nextBeforeSequence = page.hasOlder ? integer(page.nextBeforeSequence) : null
  if (nextBeforeSequence !== null && (!nextBeforeSequence || !items.length || (beforeSequence !== undefined && nextBeforeSequence >= beforeSequence))) invalid()
  return { items, nextBeforeSequence }
}

export async function createChatRoom(storeId: string, idempotencyKey: string): Promise<ChatRoom> {
  apiId(storeId)
  const { data } = await mutateBackendApi('/api/v1/chatting/rooms', { body: { storeId }, idempotencyKey })
  const room = parseChatRoom(data)
  if (room.store.id !== storeId) invalid()
  return room
}

export async function postChatMessage(roomId: string, content: string, clientMessageId: string): Promise<ChatMessage> {
  const trimmed = content.trim()
  if (!trimmed || trimmed.length > 2000) throw new Error('메시지는 1~2000자로 입력해 주세요.')
  const { data } = await mutateBackendApi(`/api/v1/chatting/rooms/${apiId(roomId)}/messages`, {
    body: { content: trimmed, clientMessageId }, idempotencyKey: clientMessageId,
  })
  const message = parseChatMessage(data)
  if (message.type !== 'TEXT' || message.roomId !== roomId || message.clientMessageId !== clientMessageId) invalid()
  return message
}

export async function putChatRead(roomId: string, lastReadSequence: number): Promise<number> {
  const { data } = await mutateBackendApi(`/api/v1/chatting/rooms/${apiId(roomId)}/read`, { method: 'PUT', body: { lastReadSequence } })
  const result = record(data)
  if (result.roomId !== roomId) invalid()
  return integer(result.lastReadSequence)
}

export async function postBookingProposal(roomId: string, sourceMessageId: string, serviceId: string, input: ChatBookingInput, idempotencyKey: string): Promise<ChatMessage> {
  const problem = validateChatBooking(input)
  if (problem) throw new Error(problem)
  apiId(sourceMessageId)
  apiId(serviceId)
  const { data } = await mutateBackendApi(`/api/v1/chatting/rooms/${apiId(roomId)}/booking-proposals`, {
    body: { sourceMessageId, serviceId, serviceDescription: input.service.trim(), startAt: input.startsAt, durationMinutes: input.duration, price: input.price }, idempotencyKey,
  })
  const message = parseChatMessage(data)
  if (message.roomId !== roomId || message.bookingProposal?.sourceMessageId !== sourceMessageId || message.bookingProposal.serviceId !== serviceId) invalid()
  return message
}

export async function confirmBookingProposal(roomId: string, proposalId: string, expectedVersion: number, idempotencyKey: string): Promise<ChatMessage> {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) invalid()
  const { data } = await mutateBackendApi(`/api/v1/chatting/rooms/${apiId(roomId)}/booking-proposals/${apiId(proposalId)}/confirm`, { body: { expectedVersion }, idempotencyKey })
  const message = parseChatMessage(data)
  if (message.roomId !== roomId || message.bookingProposal?.id !== proposalId || message.bookingProposal.status !== 'CONFIRMED') invalid()
  return message
}

export function connectChatRoom(roomId: string, userId: string, handlers: {
  sequence: () => number
  message: (message: ChatMessage, updated: boolean) => void
  read: (userId: string, sequence: number) => void
  resync: (cached: boolean) => Promise<void>
  status: (connected: boolean, error: string) => void
}): () => void {
  let socket: WebSocket | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let attempts = 0
  const controller = new AbortController()
  const send = (type: string, payload: object) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type, requestId: crypto.randomUUID(), payload }))
  const subscribe = () => send('room.subscribe', { roomId, afterSequence: handlers.sequence() })
  const reconnect = (retryAfterMs = 0) => {
    if (stopped) return
    handlers.status(false, '실시간 연결을 다시 시도하고 있어요. 메시지는 주기적으로 갱신돼요.')
    const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)) * (0.8 + Math.random() * 0.2)
    retry = setTimeout(() => void connect(), Math.max(delay, retryAfterMs))
  }
  async function connect() {
    try {
      const { data } = await requestBackendApi('/api/v1/auth/csrf', { signal: controller.signal })
      const csrfToken = text(data?.csrfToken)
      if (!csrfToken.trim() || /\p{Cc}/u.test(csrfToken)) invalid()
      if (stopped) return
      const current = new WebSocket(`${BACKEND_API_ORIGIN.replace(/^http/, 'ws')}/api/v1/chatting/ws`, 'bintime.chat.v1')
      socket = current
      current.onopen = () => send('connection.authenticate', { csrfToken })
      let queue = Promise.resolve()
      let retryAfterMs = 0
      current.onmessage = ({ data: raw }) => {
        queue = queue.then(async () => {
          if (stopped || socket !== current) return
          const frame = record(JSON.parse(raw))
          const payload = record(frame.payload)
          switch (frame.type) {
            case 'connection.ready':
              if (payload.userId !== userId) invalid()
              subscribe()
              break
            case 'room.subscribed':
              if (payload.roomId !== roomId) invalid()
              attempts = 0
              handlers.status(true, '')
              break
            case 'message.created':
            case 'message.updated': {
              const message = parseChatMessage(payload.message)
              if (message.roomId !== roomId) invalid()
              if (frame.type === 'message.created' && message.sequence > handlers.sequence() + 1) await handlers.resync(false)
              handlers.message(message, frame.type === 'message.updated')
              break
            }
            case 'room.read.updated':
              if (payload.roomId !== roomId) invalid()
              handlers.read(text(payload.userId), integer(payload.lastReadSequence))
              break
            case 'room.resync_required':
              if (payload.roomId !== roomId || typeof payload.subscriptionActive !== 'boolean') invalid()
              await handlers.resync(payload.subscriptionActive)
              if (!payload.subscriptionActive && !stopped && socket === current) subscribe()
              break
            case 'error':
              if (typeof payload.retryable !== 'boolean') invalid()
              handlers.status(false, text(payload.message))
              retryAfterMs = payload.retryAfterSeconds == null ? 0 : integer(payload.retryAfterSeconds) * 1000
              // Do not retry permanent failures or overflow the browser's timer into an immediate retry.
              if (!payload.retryable || retryAfterMs > 2147483647) stopped = true
              current.close(1000, 'SERVER_ERROR')
              break
          }
        }).catch(() => {
          if (!stopped && socket === current) current.close(1000, 'RESYNC_FAILED')
        })
      }
      current.onclose = ({ code }) => {
        if (stopped || socket !== current) return
        if ([4401, 4403, 1008].includes(code)) {
          handlers.status(false, '실시간 채팅 인증이 만료됐어요. 다시 로그인해 주세요.')
          return
        }
        reconnect(retryAfterMs)
      }
      current.onerror = () => current.close()
    } catch (cause) {
      if (stopped) return
      if (cause instanceof BackendApiError && [401, 403].includes(cause.status)) handlers.status(false, cause.message)
      else reconnect()
    }
  }
  void connect()
  return () => {
    stopped = true
    controller.abort()
    clearTimeout(retry)
    socket?.close(1000, 'ROOM_LEFT')
  }
}
