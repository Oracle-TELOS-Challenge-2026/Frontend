import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { dateLabel, timeLabel, todayInSeoul } from '../../lib/format'
import type { useChat } from '../../hooks/useChat'

export function CustomerChats({ chat, userId }: { chat: ReturnType<typeof useChat>; userId: string }) {
  const today = todayInSeoul()
  const rooms = chat.conversations.filter((room) => room.customer.id === userId).sort((a, b) => Date.parse(b.lastMessage?.createdAt ?? b.createdAt) - Date.parse(a.lastMessage?.createdAt ?? a.createdAt))
  return <div className="page">
    <p className="eyebrow">가게와 나눈 이야기</p><h1 className="page-heading">채팅</h1>
    {chat.error && <div className="form-error" role="alert"><p>{chat.error}</p><button type="button" className="account-text-button" onClick={() => void chat.refreshRooms()}>다시 조회</button></div>}
    {chat.loading && <p className="muted" role="status">대화를 불러오는 중이에요.</p>}
    <div className="owner-conversation-list">
      {rooms.map((room) => {
        const latest = room.lastMessage
        return <Link className="owner-conversation" key={room.id} to={`/customer/chat/${encodeURIComponent(room.store.id)}`}>
          <span className="owner-avatar" aria-hidden="true"><Icon name="store" size={24} /></span>
          <div className="owner-conversation-copy"><h2>{room.store.name}</h2><p>{latest?.content ?? '첫 인사를 건네보세요.'}</p></div>
          <div className="owner-conversation-meta">{latest && <time dateTime={latest.createdAt}>{todayInSeoul(new Date(latest.createdAt)) === today ? timeLabel(latest.createdAt) : dateLabel(latest.createdAt)}</time>}{room.unreadCount > 0 && <span className="owner-unread" aria-label={`읽지 않은 메시지 ${room.unreadCount}개`}>{room.unreadCount}</span>}</div>
        </Link>
      })}
      {!chat.loading && !chat.error && rooms.length === 0 && <div className="empty-state"><Icon name="chat" /><h2>아직 나눈 대화가 없어요</h2><p>가게에서 채팅 문의를 눌러 대화를 시작해 보세요.</p><Link className="button secondary" to="/customer">가게 찾기</Link></div>}
    </div>
  </div>
}
