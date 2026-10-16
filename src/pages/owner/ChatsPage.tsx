import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { dateLabel, DEMO_DAY, OWNER_SHOP_ID, timeLabel } from '../../model'
import type { DemoProps } from '../../model'

export function OwnerChats({ conversations, onReadConversation }: DemoProps) {
  const chats = conversations.filter((item) => item.shopId === OWNER_SHOP_ID).sort((a, b) => Date.parse(b.messages.at(-1)?.sentAt ?? '1970-01-01') - Date.parse(a.messages.at(-1)?.sentAt ?? '1970-01-01'))
  return <div className="page owner-page">
    <p className="eyebrow">설레는 만남의 시작</p><h1 className="page-heading">고객 채팅</h1>
    <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>궁금한 시술부터 예약 이야기까지, 편하게 나눠요.</p>
    <div className="owner-conversation-list">
      {chats.map((chat) => {
        const latest = chat.messages.at(-1)
        return <Link className="owner-conversation" key={chat.id} to={`/owner/chat/${chat.id}`} onClick={() => onReadConversation(chat.id)}>
          <span className="owner-avatar" aria-hidden="true">{chat.avatar}</span>
          <div className="owner-conversation-copy"><h2>{chat.customerName === '나' ? '체험 고객' : chat.customerName}</h2><p>{latest?.body ?? '첫 인사를 건네보세요.'}</p></div>
          <div className="owner-conversation-meta">{latest && <time dateTime={latest.sentAt}>{latest.sentAt.startsWith(DEMO_DAY) ? timeLabel(latest.sentAt) : dateLabel(latest.sentAt)}</time>}{chat.unread > 0 && <span className="owner-unread" aria-label={`읽지 않은 메시지 ${chat.unread}개`}>{chat.unread}</span>}</div>
        </Link>
      })}
      {chats.length === 0 && <div className="empty-state"><Icon name="chat" /><h2>아직 나눈 대화가 없어요</h2><p>고객이 메시지를 보내면 여기에 보여드릴게요.</p></div>}
    </div>
    <p className="owner-demo-note">시연용 대화예요. 실제 고객에게 메시지가 전송되지 않아요.</p>
  </div>
}
