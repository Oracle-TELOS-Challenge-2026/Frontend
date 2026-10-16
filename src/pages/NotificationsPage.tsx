import { useState } from 'react'
import { Icon } from '../components/Icon'
import type { useNotifications } from '../hooks/useNotifications'
import { dateLabel, timeLabel } from '../lib/format'
import type { NotificationItem } from '../lib/notifications'

export function NotificationsPage({ notifications, onOpen }: { notifications: ReturnType<typeof useNotifications>; onOpen: (path: string) => void }) {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function open(item: NotificationItem, visit: boolean) {
    if (pending) return
    setPending(item.id)
    setError('')
    try {
      const updated = await notifications.markRead(item.id)
      if (visit && updated.availability !== 'UNAVAILABLE') onOpen(updated.path)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '알림을 확인하지 못했어요.') }
    finally { setPending(null) }
  }

  return <div className="page">
    <header className="customer-record-heading"><p className="eyebrow">새로운 소식을 모았어요</p><h1 className="page-heading">알림</h1><button className="button secondary small" disabled={notifications.loading} onClick={() => void notifications.refresh()}>새로고침</button><p className="muted">읽지 않은 알림 {notifications.unreadCount}개</p></header>
    {notifications.streamError && <p className="muted" role="status">{notifications.streamError}</p>}
    {(error || notifications.error) && <p className="form-error" role="alert">{error || notifications.error}</p>}
    {notifications.loading && !notifications.items.length ? <p role="status">알림을 불러오고 있어요…</p> : !notifications.items.length && !notifications.error ? <div className="empty-state"><Icon name="bell" size={35} /><h2>아직 받은 알림이 없어요</h2><p>조건에 맞는 빈자리가 생기면 이곳에 알려드려요.</p></div> : notifications.items.map((item) => <article className="waitlist-card" key={item.id}>
      <div className="record-status"><span className={`badge ${item.readAt ? '' : 'coral'}`}>{item.readAt ? '읽음' : '새 알림'}</span><time dateTime={item.createdAt}>{dateLabel(item.createdAt)} {timeLabel(item.createdAt)}</time></div>
      <h3>{item.title}</h3><p>{item.body}</p>
      <p className="muted">{item.availability === 'UNAVAILABLE' ? '이미 마감된 빈자리예요.' : item.availability === 'UNKNOWN' ? '현재 예약 가능 여부는 상세 화면에서 확인해 주세요.' : '빈자리 확인 후 직접 예약해 주세요.'}</p>
      <div className="customer-dialog-actions">
        {!item.readAt && <button className="button secondary small" disabled={Boolean(pending)} onClick={() => void open(item, false)}>{pending === item.id ? '확인 중…' : '읽음으로 표시'}</button>}
        {item.availability !== 'UNAVAILABLE' && <button className="button small" disabled={Boolean(pending)} onClick={() => void open(item, true)}>빈자리 확인하기</button>}
      </div>
    </article>)}
    {notifications.nextCursor && <button className="button secondary" disabled={notifications.loading} onClick={() => void notifications.loadMore()}>{notifications.loading ? '불러오는 중…' : '이전 알림 더 보기'}</button>}
  </div>
}
