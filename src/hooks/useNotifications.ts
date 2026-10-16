import { useCallback, useEffect, useRef, useState } from 'react'
import { BackendApiError } from '../lib/backend-api'
import { fetchNotifications, markNotificationRead, mergeNotifications, readNotificationStream } from '../lib/notifications'
import type { NotificationItem } from '../lib/notifications'

interface NotificationState {
  userId?: string | null
  items: NotificationItem[]
  unreadCount: number
  nextCursor: string | null
  loading: boolean
  error: string
}

const empty: NotificationState = { items: [], unreadCount: 0, nextCursor: null, loading: false, error: '' }

export function useNotifications(userId: string | null | undefined, notify: (text: string) => void) {
  const [state, setState] = useState<NotificationState>(empty)
  const [stream, setStream] = useState({ userId, connected: false, error: '' })
  const session = useRef<{ userId: string; controller: AbortController } | null>(null)
  const listRequest = useRef<AbortController | null>(null)
  const announced = useRef(new Set<string>())
  const reads = useRef(new Map<string, Promise<NotificationItem>>())
  const current = state.userId === userId ? state : { ...empty, loading: Boolean(userId) }

  const refresh = useCallback(async (cursor?: string) => {
    const active = session.current
    if (!userId || active?.userId !== userId || active.controller.signal.aborted) return
    listRequest.current?.abort()
    const controller = new AbortController()
    listRequest.current = controller
    const signal = AbortSignal.any([controller.signal, active.controller.signal])
    setState((previous) => ({ ...(previous.userId === userId ? previous : empty), userId, loading: true, error: '' }))
    try {
      const page = await fetchNotifications(cursor, signal)
      if (signal.aborted || session.current !== active) return
      setState((previous) => ({
        userId, items: mergeNotifications(cursor && previous.userId === userId ? previous.items : [], page.items), unreadCount: page.unreadCount,
        nextCursor: page.nextCursor,
        loading: false, error: '',
      }))
    } catch (cause) {
      if (!signal.aborted && session.current === active) setState((previous) => ({ ...previous, loading: false, error: cause instanceof Error ? cause.message : '알림을 불러오지 못했어요.' }))
    }
  }, [userId])

  const announce = useCallback((message: string, id?: string) => {
    if (!userId || session.current?.userId !== userId) return
    if (!id || !announced.current.has(id)) {
      if (id) announced.current.add(id)
      notify(message)
    }
    void refresh()
  }, [notify, refresh, userId])

  const markRead = useCallback((id: string): Promise<NotificationItem> => {
    const active = session.current
    if (!userId || active?.userId !== userId || active.controller.signal.aborted) return Promise.reject(new Error('로그인 후 알림을 확인해 주세요.'))
    const pending = reads.current.get(id)
    if (pending) return pending
    const request = markNotificationRead(id).then((item) => {
      if (session.current !== active || active.controller.signal.aborted) throw new Error('로그인 계정이 변경됐어요.')
      setState((previous) => ({ ...previous, items: mergeNotifications(previous.items, [item]), unreadCount: Math.max(0, previous.unreadCount - (previous.items.some((entry) => entry.id === id && !entry.readAt) ? 1 : 0)) }))
      void refresh()
      return item
    }).finally(() => { if (reads.current.get(id) === request) reads.current.delete(id) })
    reads.current.set(id, request)
    return request
  }, [refresh, userId])

  useEffect(() => {
    announced.current.clear()
    reads.current.clear()
    if (!userId) { session.current = null; return }
    const controller = new AbortController()
    const active = { userId, controller }
    session.current = active
    let cursor: string | undefined
    let retry = 3000
    let timer: ReturnType<typeof setTimeout> | undefined
    let connecting = false
    let stopped = false
    async function connect() {
      if (connecting || stopped || controller.signal.aborted) return
      clearTimeout(timer)
      connecting = true
      try {
        await readNotificationStream({
          signal: controller.signal, afterEventId: cursor,
          onOpen: () => {
            retry = 3000
            setStream({ userId, connected: true, error: '' })
            // 스트림이 열린 다음 목록을 읽어 초기 조회 사이에 생긴 알림도 놓치지 않는다.
            void refresh()
          },
          onEvent: (event) => {
            if (controller.signal.aborted) return
            if (event.type === 'session.expired') throw new BackendApiError(401, 'SESSION_EXPIRED', '로그인이 만료됐어요. 다시 로그인해 주세요.')
            cursor = event.id
            if (event.type === 'notification.created') announce([event.notification.title, event.notification.body].filter(Boolean).join(' · '), event.notification.id)
            else {
              setState((previous) => ({ ...previous, items: previous.items.map((item) => item.id === event.notificationId ? { ...item, readAt: item.readAt ?? event.readAt } : item) }))
              void refresh()
            }
          },
        })
        if (!controller.signal.aborted) setStream({ userId, connected: false, error: '실시간 알림을 다시 연결하고 있어요.' })
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof BackendApiError && (cause.status === 401 || cause.status === 403)) stopped = true
        if (cause instanceof BackendApiError && (cause.status === 410 || cause.status === 400)) cursor = undefined
        setStream({ userId, connected: false, error: cause instanceof Error ? cause.message : '실시간 알림을 다시 연결하고 있어요.' })
      } finally {
        connecting = false
        if (!controller.signal.aborted && !stopped) {
          timer = setTimeout(() => void connect(), retry)
          retry = Math.min(retry * 2, 30000)
        }
      }
    }
    function resume() { if (document.visibilityState === 'visible') { void refresh(); void connect() } }
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setState({ ...empty, userId, loading: true })
      setStream({ userId, connected: false, error: '' })
      void refresh()
      void connect()
    })
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      controller.abort()
      clearTimeout(timer)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [announce, refresh, userId])

  return {
    ...current, connected: stream.userId === userId && stream.connected, streamError: stream.userId === userId ? stream.error : '',
    refresh, loadMore: () => current.nextCursor && !current.loading ? refresh(current.nextCursor) : Promise.resolve(), markRead, announce,
  }
}
