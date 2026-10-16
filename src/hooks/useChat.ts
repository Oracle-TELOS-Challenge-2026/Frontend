import { useCallback, useEffect, useRef, useState } from 'react'
import { confirmBookingProposal, connectChatRoom, createChatRoom, fetchChatMessages, fetchChatRooms, mergeChatMessages, postBookingProposal, postChatMessage, putChatRead } from '../lib/chat.ts'
import type { ChatMessage, ChatRoom } from '../lib/chat'
import type { ChatBookingInput } from '../lib/chat-booking'
import { BackendApiError } from '../lib/backend-api.ts'

export function useChat(userId: string | null | undefined) {
  const [conversations, setConversations] = useState<ChatRoom[]>([])
  const [loadedUserId, setLoadedUserId] = useState(userId)
  const [loading, setLoading] = useState(Boolean(userId))
  const [error, setError] = useState('')
  const [activeRoom, setActiveRoom] = useState<string | null>(null)
  const [realtime, setRealtime] = useState({ connected: false, error: '' })
  const rooms = useRef<ChatRoom[]>([])
  const opening = useRef(new Map<string, Promise<ChatRoom>>())
  const roomKeys = useRef(new Map<string, string>())
  const messageLoads = useRef(new Map<string, Promise<void>>())
  const syncedSequences = useRef(new Map<string, number>())
  const reads = useRef(new Map<string, Promise<void>>())
  const connection = useRef<{ roomId: string; transport: ReturnType<typeof connectChatRoom> } | null>(null)
  const sends = useRef(new Map<string, Promise<void>>())
  const sendQueues = useRef(new Map<string, Promise<void>>())
  const sendEpoch = useRef(0)
  const session = useRef(userId)
  const hasOutgoing = conversations.some((room) => room.outgoing.length > 0)

  useEffect(() => {
    if (!hasOutgoing) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasOutgoing])

  const updateRooms = useCallback((update: (current: ChatRoom[]) => ChatRoom[]) => {
    rooms.current = update(rooms.current)
    setConversations(rooms.current)
  }, [])

  const refreshRooms = useCallback(async (signal?: AbortSignal) => {
    if (!userId) return
    try {
      const result = await fetchChatRooms(signal)
      if (signal?.aborted || session.current !== userId) return
      updateRooms((current) => result.map((room) => {
        const existing = current.find((item) => item.id === room.id)
        return existing ? {
          ...room, messages: existing.messages, messagesLoaded: existing.messagesLoaded, nextBeforeSequence: existing.nextBeforeSequence, outgoing: existing.outgoing,
          lastMessage: mergeChatMessages(existing.lastMessage ? [existing.lastMessage] : [], room.lastMessage ? [room.lastMessage] : []).at(-1) ?? null,
          lastReadSequence: Math.max(existing.lastReadSequence, room.lastReadSequence),
          peerReadSequence: existing.peerReadSequence,
          unreadCount: existing.lastReadSequence > room.lastReadSequence ? existing.unreadCount : room.unreadCount,
        } : room
      }))
      setError('')
    } catch (cause) {
      if (!signal?.aborted && session.current === userId) setError(cause instanceof Error ? cause.message : '채팅방을 불러오지 못했어요.')
    } finally {
      if (!signal?.aborted && session.current === userId) setLoading(false)
    }
  }, [userId, updateRooms])

  useEffect(() => {
    session.current = userId
    sendEpoch.current++
    sends.current.clear()
    sendQueues.current.clear()
    opening.current.clear()
    roomKeys.current.clear()
    messageLoads.current.clear()
    syncedSequences.current.clear()
    reads.current.clear()
    const controller = new AbortController()
    // Reset after account changes before accepting any response from the previous session.
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      updateRooms(() => [])
      setLoadedUserId(userId)
      setLoading(Boolean(userId))
      setError('')
      setActiveRoom(null)
      setRealtime({ connected: false, error: '' })
      void refreshRooms(controller.signal)
    })
    return () => controller.abort()
  }, [userId, refreshRooms, updateRooms])

  useEffect(() => {
    if (!userId || loading) return
    const controller = new AbortController()
    let refreshing = false
    const refresh = () => {
      if (refreshing || document.visibilityState !== 'visible') return
      refreshing = true
      void refreshRooms(controller.signal).finally(() => { refreshing = false })
    }
    const interval = window.setInterval(refresh, 5000)
    document.addEventListener('visibilitychange', refresh)
    return () => { controller.abort(); window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh) }
  }, [userId, loading, refreshRooms])

  const openShopChat = useCallback((shopId: string): Promise<ChatRoom> => {
    if (!userId) return Promise.reject(new Error('로그인 후 문의해 주세요.'))
    const existing = rooms.current.find((room) => room.store.id === shopId && room.customer.id === userId)
    if (existing) return Promise.resolve(existing)
    const pending = opening.current.get(shopId)
    if (pending) return pending
    const key = roomKeys.current.get(shopId) ?? crypto.randomUUID()
    roomKeys.current.set(shopId, key)
    const request = createChatRoom(shopId, key).then((room) => {
      if (session.current !== userId) throw new Error('로그인 계정이 변경됐어요.')
      updateRooms((current) => [room, ...current.filter((item) => item.id !== room.id)])
      return room
    }).finally(() => { if (opening.current.get(shopId) === request) opening.current.delete(shopId) })
    opening.current.set(shopId, request)
    return request
  }, [userId, updateRooms])

  const loadMessages = useCallback((roomId: string, beforeSequence?: number, refreshCached = false): Promise<void> => {
    const key = `${roomId}:${beforeSequence ?? (refreshCached ? 'cached' : 'latest')}`
    const pending = messageLoads.current.get(key)
    if (pending) return pending
    const latestSequence = refreshCached ? rooms.current.find((room) => room.id === roomId)?.messages[0]?.sequence ?? syncedSequences.current.get(roomId) : syncedSequences.current.get(roomId)
    const request = (async () => {
      let page = await fetchChatMessages(roomId, beforeSequence)
      let messages = page.items
      // Recover every missed message when returning from a hidden tab, even after more than one page.
      while (beforeSequence === undefined && latestSequence !== undefined && page.nextBeforeSequence !== null && page.items[0]?.sequence > latestSequence) {
        page = await fetchChatMessages(roomId, page.nextBeforeSequence)
        messages = mergeChatMessages(messages, page.items)
      }
      if (session.current !== userId) return
      if (beforeSequence === undefined) syncedSequences.current.set(roomId, Math.max(syncedSequences.current.get(roomId) ?? 0, messages.at(-1)?.sequence ?? 0))
      updateRooms((current) => current.map((room) => room.id === roomId ? {
        ...room, messages: mergeChatMessages(room.messages, messages), messagesLoaded: true,
        outgoing: room.outgoing.filter((item) => !messages.some((message) => message.sender.id === userId && message.clientMessageId === item.clientMessageId)),
        nextBeforeSequence: beforeSequence !== undefined || !room.messagesLoaded ? page.nextBeforeSequence : room.nextBeforeSequence,
      } : room))
    })().finally(() => { if (messageLoads.current.get(key) === request) messageLoads.current.delete(key) })
    messageLoads.current.set(key, request)
    return request
  }, [userId, updateRooms])

  const receiveMessage = useCallback((message: ChatMessage, updated = false) => {
    updateRooms((current) => current.map((room) => room.id === message.roomId ? {
      ...room, messages: mergeChatMessages(room.messages, [message]),
      outgoing: room.outgoing.filter((item) => message.sender.id !== userId || item.clientMessageId !== message.clientMessageId),
      lastMessage: mergeChatMessages(room.lastMessage ? [room.lastMessage] : [], [message]).at(-1)!,
      unreadCount: room.unreadCount + (!updated && message.sender.id !== userId && message.sequence > room.lastReadSequence && !room.messages.some((item) => item.id === message.id) && message.sequence > (room.lastMessage?.sequence ?? 0) ? 1 : 0),
    } : room))
  }, [userId, updateRooms])

  useEffect(() => {
    if (!userId || !activeRoom) return
    let active = true
    let transport: ReturnType<typeof connectChatRoom> | undefined
    // A failed initial history fetch must not prevent WebSocket from recovering the room.
    void loadMessages(activeRoom).catch(() => {}).then(() => {
      if (!active) return
      transport = connectChatRoom(activeRoom, userId, {
        sequence: () => syncedSequences.current.get(activeRoom) ?? 0,
        message: (message, updated) => {
          if (!active) return
          receiveMessage(message, updated)
          if (!updated && message.sequence === (syncedSequences.current.get(activeRoom) ?? 0) + 1) syncedSequences.current.set(activeRoom, message.sequence)
        },
        read: (readerId, sequence) => {
          if (!active) return
          updateRooms((current) => current.map((room) => room.id !== activeRoom ? room : readerId === userId ? {
            ...room, lastReadSequence: Math.max(room.lastReadSequence, sequence),
            unreadCount: room.messages.filter((message) => message.sequence > Math.max(room.lastReadSequence, sequence) && message.sender.id !== userId).length,
          } : { ...room, peerReadSequence: Math.max(room.peerReadSequence ?? 0, sequence) }))
        },
        resync: (cached) => loadMessages(activeRoom, undefined, cached),
        status: (connected, error) => { if (active) setRealtime({ connected, error }) },
      })
      connection.current = { roomId: activeRoom, transport }
    })
    return () => {
      active = false
      if (connection.current?.transport === transport) connection.current = null
      transport?.close()
    }
  }, [userId, activeRoom, loadMessages, receiveMessage, updateRooms])

  const sendMessage = useCallback((roomId: string, content: string, clientMessageId: string): Promise<void> => {
    const room = rooms.current.find((item) => item.id === roomId)
    if (!userId || !room || room.status !== 'OPEN') return Promise.reject(new Error('메시지를 보낼 수 없는 대화예요.'))
    const key = `${roomId}:${clientMessageId}`
    const existing = room.outgoing.find((item) => item.clientMessageId === clientMessageId)
    const trimmed = content.trim()
    if (existing && existing.content !== trimmed) return Promise.reject(new Error('재전송할 메시지 내용이 달라요.'))
    const inFlight = sends.current.get(key)
    if (inFlight) return inFlight
    if (room.messages.some((item) => item.sender.id === userId && item.clientMessageId === clientMessageId)) return Promise.resolve()
    if (!trimmed || trimmed.length > 2000) return Promise.reject(new Error('메시지는 1~2000자로 입력해 주세요.'))
    const outgoing = { clientMessageId, content: trimmed, createdAt: existing?.createdAt ?? new Date().toISOString(), error: '' }
    updateRooms((current) => current.map((item) => item.id === roomId ? { ...item, outgoing: existing ? item.outgoing.map((sent) => sent.clientMessageId === clientMessageId ? outgoing : sent) : [...item.outgoing, outgoing] } : item))
    const epoch = sendEpoch.current
    const currentSession = () => session.current === userId && sendEpoch.current === epoch
    // Keep rapid sends in order; the composer stays available while this room's queue drains.
    const request = (sendQueues.current.get(roomId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (!currentSession()) throw new Error('로그인 계정이 변경됐어요.')
      const socket = connection.current?.roomId === roomId ? connection.current.transport : null
      let message: ChatMessage | undefined
      try { message = await socket?.sendMessage(trimmed, clientMessageId) ?? undefined }
      catch (cause) {
        if (!(cause instanceof BackendApiError) || !['WS_DISCONNECTED', 'WS_TIMEOUT'].includes(cause.code)) throw cause
      }
      if (!currentSession()) throw new Error('로그인 계정이 변경됐어요.')
      // The same clientMessageId makes a lost socket acknowledgement safe to retry over HTTP.
      message ??= await postChatMessage(roomId, trimmed, clientMessageId)
      if (currentSession()) receiveMessage(message)
    }).catch((cause: unknown) => {
      if (currentSession()) {
        if (rooms.current.find((item) => item.id === roomId)?.messages.some((item) => item.sender.id === userId && item.clientMessageId === clientMessageId)) return
        updateRooms((current) => current.map((item) => item.id === roomId ? { ...item, outgoing: item.outgoing.map((sent) => sent.clientMessageId === clientMessageId ? { ...sent, error: cause instanceof Error ? cause.message : '전송하지 못했어요.' } : sent) } : item))
      }
      throw cause
    }).finally(() => {
      if (sends.current.get(key) === request) sends.current.delete(key)
      if (sendQueues.current.get(roomId) === request) sendQueues.current.delete(roomId)
    })
    sends.current.set(key, request)
    sendQueues.current.set(roomId, request)
    return request
  }, [userId, receiveMessage, updateRooms])

  const sendProposal = useCallback(async (roomId: string, sourceMessageId: string, serviceId: string, input: ChatBookingInput, key: string) => {
    const message = await postBookingProposal(roomId, sourceMessageId, serviceId, input, key)
    if (session.current !== userId) return
    receiveMessage(message)
    await loadMessages(roomId, undefined, true)
  }, [userId, receiveMessage, loadMessages])

  const confirmProposal = useCallback(async (roomId: string, proposalId: string, version: number, key: string) => {
    const message = await confirmBookingProposal(roomId, proposalId, version, key)
    if (session.current !== userId) return
    receiveMessage(message, true)
  }, [userId, receiveMessage])

  const readConversation = useCallback((roomId: string, sequence: number): Promise<void> => {
    const pending = reads.current.get(roomId)
    if (pending) return pending
    const request = putChatRead(roomId, sequence).then((lastReadSequence) => {
      if (session.current !== userId) return
      updateRooms((current) => current.map((room) => room.id === roomId ? {
        ...room, lastReadSequence: Math.max(room.lastReadSequence, lastReadSequence),
        unreadCount: room.messages.filter((message) => message.sequence > lastReadSequence && message.sender.id !== userId).length,
      } : room))
    }).finally(() => { if (reads.current.get(roomId) === request) reads.current.delete(roomId) })
    reads.current.set(roomId, request)
    return request
  }, [userId, updateRooms])

  return { conversations: loadedUserId === userId ? conversations : [], loading: loadedUserId !== userId || loading, error: loadedUserId === userId ? error : '', realtime, setActiveRoom, refreshRooms, openShopChat, loadMessages, sendMessage, sendProposal, confirmProposal, readConversation }
}
