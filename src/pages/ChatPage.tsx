import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { CUSTOMER_ID, DEMO_DAY, dateLabel, timeLabel } from '../model'
import type { DemoProps, Role } from '../model'

export function ChatPage(props: DemoProps & { role: Role }) {
  const { id } = useParams()
  const [message, setMessage] = useState('')
  const messagesEnd = useRef<HTMLDivElement>(null)
  const conversation = props.conversations.find((item) => props.role === 'customer' ? item.shopId === id && item.customerId === CUSTOMER_ID : item.id === id && item.shopId === props.ownerShop?.id)
  const shop = props.shops.find((item) => item.id === conversation?.shopId)
  const messageCount = conversation?.messages.length
  const conversationId = conversation?.id
  const unread = conversation?.unread ?? 0
  const { role, onReadConversation } = props
  useEffect(() => {
    if (role === 'owner' && conversationId && unread > 0) onReadConversation(conversationId)
  }, [role, conversationId, unread, onReadConversation])
  useEffect(() => { messagesEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [messageCount])
  if (!conversation || !shop) return <div className="page empty-state"><h1>대화를 찾을 수 없어요</h1><Link to={props.role === 'owner' ? '/owner/chats' : '/customer'} className="button">돌아가기</Link></div>
  const title = props.role === 'customer' ? shop.name : conversation.customerName === '나' ? '체험 고객' : conversation.customerName
  const back = props.role === 'owner' ? '/owner/chats' : `/customer/shops/${shop.id}`
  return <div className="chat-page">
    <header className="chat-heading"><Link to={back} aria-label="이전 화면" className="icon-button"><Icon name="arrow-left" /></Link><img src={shop.image} alt="" /><div><h1>{title}</h1><p>{props.role === 'customer' ? '사장님과의 대화' : shop.name}</p></div><span className="badge">데모 채팅</span></header>
    <div className="chat-demo-notice">이 대화는 체험용이에요. 실제 메시지는 전송되지 않아요.</div>
    <div className="chat-messages"><span className="chat-date">{dateLabel(DEMO_DAY)}</span>{conversation.messages.map((item) => <div className={`chat-message ${item.sender === props.role ? 'mine' : ''}`} key={item.id}>{item.sender !== props.role && <span className="chat-avatar" aria-hidden="true"><Icon name={props.role === 'customer' ? 'store' : 'user'} size={18} /></span>}<div><p>{item.body}</p><time>{timeLabel(item.sentAt)}</time></div></div>)}<div ref={messagesEnd} /></div>
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); if (message.trim()) { props.onSendMessage(conversation.id, message, props.role); setMessage('') } }}><label className="sr-only" htmlFor="chat-message">메시지</label><input id="chat-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} placeholder="메시지를 입력해 주세요" autoComplete="off" /><button type="submit" className="send-button" aria-label="메시지 보내기" disabled={!message.trim()}><Icon name="send" size={20} /></button></form>
  </div>
}
