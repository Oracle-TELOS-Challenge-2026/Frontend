import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { useChat } from '../hooks/useChat'
import type { CurrentUser } from '../lib/auth'
import { chatNotificationDestination } from '../lib/notification-navigation'
import type { Role } from '../types'

export function ChatNotificationPage({ roomId, chat, user, onSelectRole, onRefreshSession, accountError, fallback }: {
  roomId: string | null
  chat: ReturnType<typeof useChat>
  user: CurrentUser
  onSelectRole: (role: Role) => boolean
  onRefreshSession: () => Promise<void>
  accountError: string
  fallback: string
}) {
  const [checked, setChecked] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const navigate = useNavigate()
  const { refreshRooms } = chat
  useEffect(() => {
    const controller = new AbortController()
    void refreshRooms(controller.signal).then(() => { if (!controller.signal.aborted) setChecked(true) })
    return () => controller.abort()
  }, [refreshRooms, attempt])
  const result = useMemo(() => {
    if (!checked || chat.loading) return null
    if (chat.error) return { error: chat.error }
    try { return chatNotificationDestination(roomId, chat.conversations, user) }
    catch (cause) { return { error: cause instanceof Error ? cause.message : '알림의 대화를 확인하지 못했어요.' } }
  }, [checked, chat.loading, chat.error, chat.conversations, roomId, user])
  useEffect(() => {
    if (!result || 'error' in result) return
    if (onSelectRole(result.role)) navigate(result.path, { replace: true })
  }, [result, onSelectRole, navigate])
  const error = result && ('error' in result ? result.error : accountError)
  if (!error) return <div className="app-loading" role="status">알림의 대화를 확인하고 있어요…</div>
  return <div className="page empty-state"><h1>대화를 열 수 없어요</h1><p className="form-error" role="alert">{error}</p>
    <button type="button" className="button secondary" onClick={() => { setChecked(false); setAttempt((value) => value + 1) }}>다시 조회</button>
    <button type="button" className="button secondary" onClick={() => void onRefreshSession()}>로그인 상태 다시 확인</button>
    <Link className="button" to={fallback}>돌아가기</Link>
  </div>
}
