import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { dateLabel, timeLabel, todayInSeoul } from '../../lib/format'
import type { useChat } from '../../hooks/useChat'

export function OwnerChats({ chat }: { chat: ReturnType<typeof useChat> }) {
  const { refreshRooms } = chat
  const today = todayInSeoul()
  const chats = [...chat.conversations].sort((a, b) => Date.parse(b.lastMessage?.createdAt ?? b.createdAt) - Date.parse(a.lastMessage?.createdAt ?? a.createdAt))
  return <div className="page owner-page">
    <p className="eyebrow">설레는 만남의 시작</p><h1 className="page-heading">고객 채팅</h1>
    <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>궁금한 시술부터 예약 이야기까지, 편하게 나눠요.</p>
    {chat.error && <div className="form-error" role="alert"><p>{chat.error}</p><button type="button" className="account-text-button" onClick={() => void refreshRooms()}>다시 조회</button></div>}
    {chat.loading && <p className="muted" role="status">대화를 불러오는 중이에요.</p>}
    <div className="owner-conversation-list">
      {chats.map((room) => {
        const latest = room.lastMessage
        return <Link className="owner-conversation" key={room.id} to={`/owner/chat/${encodeURIComponent(room.id)}`}>
          <span className="owner-avatar" aria-hidden="true"><Icon name="user" size={24} /></span>
          <div className="owner-conversation-copy"><h2>{room.customer.displayName}</h2><p>{latest?.content ?? '첫 인사를 건네보세요.'}</p></div>
          <div className="owner-conversation-meta">{latest && <time dateTime={latest.createdAt}>{todayInSeoul(new Date(latest.createdAt)) === today ? timeLabel(latest.createdAt) : dateLabel(latest.createdAt)}</time>}{room.unreadCount > 0 && <span className="owner-unread" aria-label={`읽지 않은 메시지 ${room.unreadCount}개`}>{room.unreadCount}</span>}</div>
        </Link>
      })}
      {!chat.loading && !chat.error && chats.length === 0 && <div className="empty-state"><Icon name="chat" /><h2>아직 나눈 대화가 없어요</h2><p>고객이 메시지를 보내면 여기에 보여드릴게요.</p></div>}
    </div>
  </div>
}
